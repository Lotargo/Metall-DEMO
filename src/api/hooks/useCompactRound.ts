import { replaceEqualDeep, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export function keepNewestCompactRevision(previous: unknown, next: unknown) {
  const revision = (value: unknown) => (value as { revision?: number } | null)?.revision;
  const previousRevision = revision(previous);
  const nextRevision = revision(next);
  if (previousRevision !== undefined && nextRevision !== undefined && previousRevision > nextRevision) {
    return previous;
  }
  return replaceEqualDeep(previous, next);
}

export function useCompactRound(runId: string | undefined, fallbackPolling = false) {
  return useQuery({
    queryKey: ['compact-round', runId],
    enabled: !!runId,
    structuralSharing: keepNewestCompactRevision,
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/api/v1/runs/{run_id}/compact-round', {
        signal,
        params: { path: { run_id: runId! } },
      });
      if (error) throw new Error(typeof error === 'string' ? error : JSON.stringify(error));
      return data ?? null;
    },
    refetchInterval: query => fallbackPolling && ['reading', 'checking', 'resolving', 'preliminary', 'detailing'].includes(query.state.data?.status ?? '') ? 1500 : false,
  });
}

export function useCompactReadiness(runId: string, revision: number, enabled: boolean) {
  return useQuery({
    queryKey: ['compact-readiness', runId, revision],
    enabled,
    retry: false,
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/api/v1/runs/{run_id}/compact-round/calculation-readiness', {
        params: { path: { run_id: runId } },
      });
      if (error) throw new Error('Не удалось проверить расчётные основания.');
      return data ?? null;
    },
  });
}

export function useCompactFullRoute(runId: string, revision: number, enabled: boolean) {
  return useQuery({
    queryKey: ['compact-full-route', runId, revision],
    enabled,
    retry: false,
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/api/v1/runs/{run_id}/compact-round/full-route', {
        signal,
        params: { path: { run_id: runId } },
      });
      if (!data || !Array.isArray(data.rows)) throw new Error(typeof error?.detail === 'string' ? error.detail : 'Не удалось получить полный маршрут.');
      return data;
    },
  });
}
