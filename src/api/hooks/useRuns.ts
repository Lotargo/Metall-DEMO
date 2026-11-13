import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { getOperatorProfile } from '@/utils/storage';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function recognitionRunId(value: unknown): string {
  if (!isRecord(value)) throw new Error('Recognition response is not an object');
  const nestedRun = isRecord(value.run) ? value.run : null;
  const id = value.run_id ?? value.id ?? nestedRun?.id;
  if (typeof id !== 'string' || !id) throw new Error('Recognition response has no run ID');
  return id;
}

export function useRuns(projectId?: string | null) {
  return useQuery({
    queryKey: ['runs', { projectId }],
    enabled: !!projectId,
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/api/v1/runs', {
        signal,
        params: {
          query: { project_id: projectId || undefined, roots_only: true, limit: 500 },
        },
      });
      if (error) throw new Error(String(error));
      return data;
    },
  });
}

export function useArchivedRun(runId: string) {
  return useQuery({
    queryKey: ['runs', runId, 'archive'],
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.GET('/api/v1/runs/{run_id}/archive', {
        signal,
        params: { path: { run_id: runId } },
      });
      if (!data) throw new Error('Не удалось открыть архивный запуск.');
      return data;
    },
  });
}

export function useRunSnapshot(runId: string | undefined, poll = true) {
  return useQuery({
    queryKey: ['runs', runId, 'snapshot'],
    queryFn: async () => {
      if (!runId) throw new Error('Run ID required');
      const { data, error } = await apiClient.GET('/api/v1/runs/{run_id}', {
        params: { path: { run_id: runId } },
      });
      if (error) throw new Error(String(error));
      return data;
    },
    enabled: !!runId,
    refetchInterval: (query) => {
      const status = query.state.data?.run?.status;
      if (poll && (status === 'running' || status === 'queued')) {
        return 1500;
      }
      return false;
    },
  });
}

export function useProviders() {
  return useQuery({
    queryKey: ['providers'],
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/api/v1/providers');
      if (error) throw new Error(String(error));
      return data;
    },
    staleTime: 60000,
  });
}

export function useStartRecognition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      file,
      projectId,
      modelId,
      launchOptions,
      quantity,
    }: {
      file: File;
      projectId: string;
      modelId?: string;
      launchOptions?: { verification_enabled: boolean; auto_resolve_questions: boolean };
      quantity?: number;
    }) => {
      const operator = getOperatorProfile();
      const operatorVal = operator.id || encodeURIComponent(operator.name || 'operator');
      const formData = new FormData();
      formData.append('source', file);
      formData.append('project_id', projectId);
      formData.append('document_id', file.name.replace(/\.[^/.]+$/, '') || 'drawing');
      if (quantity !== undefined) {
        formData.append('quantity', String(quantity));
      }
      if (modelId) {
        formData.append('provider_profile', modelId);
      }
      if (launchOptions) {
        formData.append('verification_enabled', String(launchOptions.verification_enabled));
        formData.append('auto_resolve_questions', String(launchOptions.auto_resolve_questions));
      }

      // NOTE: async queue endpoint (202 + run_id). Recognition runs in
      // BackgroundTasks; progress arrives via SSE on the run workspace page.
      const response = await fetch('/api/v1/runs/recognition/start', {
        method: 'POST',
        headers: {
          'X-Operator': operatorVal,
        },
        body: formData,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || `Upload failed: ${response.statusText}`);
      }

      const result: unknown = await response.json();
      return { run_id: recognitionRunId(result) };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['runs', { projectId: variables.projectId }] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useCancelRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      runId,
      reason,
      scope,
    }: {
      runId: string;
      reason?: string;
      scope?: 'self' | 'family';
    }) => {
      const params = scope === 'family' ? '?scope=family' : '';
      const response = await fetch(`/api/v1/runs/${runId}/cancel${params}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: reason || 'Отменено оператором' }),
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || 'Не удалось отменить запуск');
      }
      return response.json();
    },
    onSuccess: (_, { runId }) => {
      queryClient.invalidateQueries({ queryKey: ['runs', runId] });
      queryClient.invalidateQueries({ queryKey: ['runs'] });
    },
  });
}
