import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import type { components } from '@/api/schema';
import { keepNewestCompactRevision } from './useCompactRound';

export type QuestionAgentJob = components['schemas']['CompactQuestionAgentJob'];
export const questionAgentActive = (job: QuestionAgentJob) => ['queued', 'running', 'publishing'].includes(job.status);

export function useCompactClarifications(runId: string) {
  return useQuery({
    queryKey: ['compact-clarifications', runId],
    structuralSharing: keepNewestCompactRevision,
    queryFn: async ({ signal }) => {
      const result = await apiClient.GET('/api/v1/runs/{run_id}/compact-round/clarifications', { signal, params: { path: { run_id: runId } } });
      if (result.error || !result.data) throw new Error('Не удалось загрузить сохранённые уточнения.');
      return result.data;
    },
    refetchInterval: query => query.state.data?.agent_jobs.some(questionAgentActive) ? 1000 : false,
  });
}
