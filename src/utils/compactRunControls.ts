import type { components } from '@/api/schema';

type State = components['schemas']['CompactState'];

export function compactProgressStatus(saved: State['status'], savedRevision: number, eventStatus: State['status'] | undefined, eventRevision: number) {
  if (saved === 'cancelled' || eventStatus === 'cancelled') return 'cancelled';
  return eventStatus && eventRevision >= savedRevision ? eventStatus : saved;
}

export function canCancelCompactRun(status: string, calculationPending = false) {
  return status !== 'cancelled' && (calculationPending || ['reading', 'checking', 'resolving', 'preliminary', 'detailing', 'review'].includes(status));
}

export function compactReviewTab(state: Pick<State, 'stock_proposal' | 'reading' | 'route'>, openQuestions: number | null) {
  if (state.stock_proposal) return 'stock';
  const hasQuestions = openQuestions === null
    ? !!(state.reading?.questions.length || state.route?.questions.length || state.route?.operations.some(operation => operation.questions.length))
    : openQuestions > 0;
  if (hasQuestions) return 'questions';
  return state.route ? 'preliminary' : 'passport';
}

export function preserveCompactCancellation(previous: unknown, next: unknown) {
  const before = previous as Partial<State> | null;
  const after = next as Partial<State> | null;
  return !!before?.source_run_id && before.source_run_id === after?.source_run_id && before.status === 'cancelled';
}
