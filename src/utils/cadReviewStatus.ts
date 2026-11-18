import type { CadRouteState } from '@/api/hooks/useCadRoute';

/** Queued automatic review must not invite a manual acceptance. A stopped review can. */
export function awaitingAutomaticReview(state?: CadRouteState): boolean {
  if (!state || state.route.phase !== 'awaiting_review' || state.route.mode !== 'automatic' || (state.route.review_count ?? 0) !== 0) return false;
  if (state.review && ['failed', 'cancelled', 'interrupted'].includes(state.review.status)) return false;
  return !Object.values(state.jobs ?? {}).some(job => job.action === 'review' && ['failed', 'cancelled', 'interrupted'].includes(job.status));
}
