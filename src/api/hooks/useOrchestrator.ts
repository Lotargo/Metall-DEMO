import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { scopeQuery, type ChatScope } from '@/utils/orchestratorChat';
import type { WorkJob } from '@/utils/orchestratorWork';

export type ChatFile = { id: string; name: string; url: string };
export type ChatMessage = { id: string; role: string; text: string; request_id?: string; phase?: string; files: ChatFile[] };
export type ChatRequest = { id: string; status: string; run_id: string; native_turn_id?: string; text: string; files: ChatFile[]; error?: string; cancel_requested: boolean; choice: { model_id: string; reasoning_effort: string } };
export type ChatState = {
  scope: { key: string; title: string; kind: string; run_id?: string; project_id?: string };
  availability: { enabled: boolean; reason: string }; choice: { model_id: string; reasoning_effort: string } | null;
  chat: { id: string; revision: number; native_thread_id: string | null; projection: { turns: { id: string; status?: string; messages: ChatMessage[]; tools: { id: string; label: string; status: string }[] }[] } } | null;
  requests: ChatRequest[];
  context: { run: { status: string; current_stage: string } | null; cad?: { phase: string; revision: number; model?: { revision: number; step_sha256: string }; jobs?: WorkJob[]; decision?: unknown; results_stale?: unknown } };
};
export function useOrchestrator(scope: ChatScope) {
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ['orchestrator', scope.key],
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/v1/orchestrator/chat?${scopeQuery(scope)}`, { signal });
      if (!response.ok) throw new Error('Не удалось получить историю и контекст чата.');
      return await response.json() as ChatState;
    },
    refetchInterval: state => state.state.data?.requests.some(r => ['queued', 'running'].includes(r.status)) ? 1500 : 5000,
  });
  const active = query.data?.requests.find(r => ['queued', 'running'].includes(r.status));
  const cadRevision = query.data?.context.cad?.revision;
  const workState = query.data?.context.cad?.jobs?.map(job => `${job.id}:${job.status}:${job.cancel_requested}`).join('|');
  useEffect(() => {
    if (!scope.runId || cadRevision === undefined) return;
    void cache.invalidateQueries({ queryKey: ['cad-route', scope.runId] });
    void cache.invalidateQueries({ queryKey: ['volume-round', scope.runId] });
    void cache.invalidateQueries({ queryKey: ['runs'] });
  }, [scope.runId, cadRevision, workState, cache]);
  useEffect(() => {
    if (!active?.run_id) return;
    const source = new EventSource(`/api/v1/runs/${encodeURIComponent(active.run_id)}/events/stream`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      if (timer) return;
      timer = setTimeout(() => { timer = undefined; void cache.invalidateQueries({ queryKey: ['orchestrator', scope.key] }); }, 200);
    };
    source.addEventListener('trace', update);
    return () => { source.close(); if (timer) clearTimeout(timer); };
  }, [active?.run_id, scope.key, cache]);
  return { ...query, active };
}
