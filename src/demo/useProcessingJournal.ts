import { processingLogRows, type ProcessingEvent } from '@/utils/processingLogs';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { demoAsset } from './config';
const emptyEvents: ProcessingEvent[] = [];
// The example is complete, so no product event subscription is opened.
export function useProcessingJournal(_runId: string) {
  const query = useQuery({ queryKey: ['demo-events'], staleTime: Infinity, queryFn: async () => {
    const response = await fetch(demoAsset('demo/events.json'));
    if (!response.ok) throw new Error('Не удалось прочитать сохранённые этапы.');
    return response.json() as Promise<ProcessingEvent[]>;
  } });
  const events = query.data ?? emptyEvents;
  const rows = useMemo(() => processingLogRows([], events), [events]);
  return { rows, events, stage: undefined as string | undefined, startedAt: undefined as string | undefined,
    connection: 'connected' as 'connecting' | 'connected' | 'error', retry() { /* No live connection. */ } };
}
export type ProcessingJournal = ReturnType<typeof useProcessingJournal>;
