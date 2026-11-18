import type { CadRouteState } from '@/api/hooks/useCadRoute';

export type ModelApprovalRequest = {
  request_id: string; expected_revision: number; model_revision: number; step_sha256: string;
};
export type ModelApprovalResponse = { state: CadRouteState; replayed: boolean };

export class ModelApprovalError extends Error {
  constructor(message: string, public readonly status?: number) { super(message); }
}

export function mergeCadRouteState(previous: CadRouteState | undefined | null, next: CadRouteState | null) {
  if (!next) return previous ?? null;
  if (!previous || previous.route.run_id !== next.route.run_id) return next;
  if (next.route.phase === 'cancelled') return next;
  if (previous.route.phase === 'cancelled') return previous;
  if (previous.sequence > next.sequence) return previous;
  if (['failed', 'completed'].includes(previous.route.phase) && next.route.phase !== previous.route.phase) {
    const correction = next.sequence > previous.sequence && next.route.revision > previous.route.revision &&
      Object.values(next.jobs ?? {}).some(job => job.action === 'correct' && ['running', 'completed'].includes(job.status));
    if (!correction) return previous;
  }
  return previous.sequence > next.sequence ? previous : next;
}

export function shouldPollCadRoute(state: CadRouteState | null | undefined) {
  return !!state && (!['completed', 'failed', 'cancelled'].includes(state.route.phase) ||
    Object.values(state.jobs ?? {}).some(job => ['queued', 'running'].includes(job.status)));
}

export function cadPreviewMatches(data: unknown, sha256: string): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const value = data as Record<string, unknown>;
  return value.type === 'cad-preview-ready' && value.step_sha256 === sha256;
}

export function createCadApprovalController(fetcher: typeof fetch = fetch, newId = () => crypto.randomUUID()) {
  let attempt: { key: string; body: ModelApprovalRequest; result?: ModelApprovalResponse } | undefined;
  let pending: { key: string; promise: Promise<ModelApprovalResponse> } | undefined;
  return {
    submit(state: CadRouteState, actor: string): Promise<ModelApprovalResponse> {
      const model = state.route.models.at(-1);
      if (!model || !state.viewer_ready || state.route.phase !== 'awaiting_review') {
        return Promise.reject(new ModelApprovalError('Модель сейчас недоступна для подтверждения. Обновите данные.'));
      }
      const key = JSON.stringify([state.route.run_id, state.route.revision, model.revision, model.step_sha256, actor]);
      if (pending) return pending.key === key ? pending.promise : Promise.reject(new ModelApprovalError('Дождитесь ответа на предыдущее подтверждение.'));
      if (attempt?.key !== key) attempt = { key, body: {
        request_id: newId(), expected_revision: state.route.revision,
        model_revision: model.revision, step_sha256: model.step_sha256,
      } };
      if (attempt.result) return Promise.resolve(attempt.result);
      const current = attempt;
      const promise = (async () => {
        const response = await fetcher(`/api/v1/runs/${encodeURIComponent(state.route.run_id)}/cad-route/approve`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Operator': actor },
          body: JSON.stringify(current.body),
        });
        if (!response.ok) {
          const error = await response.json().catch(() => null) as { detail?: unknown } | null;
          if (response.status === 409) attempt = undefined;
          throw new ModelApprovalError(typeof error?.detail === 'string' ? error.detail : 'Не удалось подтвердить модель. Повторите запрос.', response.status);
        }
        current.result = await response.json() as ModelApprovalResponse;
        return current.result;
      })().finally(() => { pending = undefined; });
      pending = { key, promise };
      return promise;
    },
  };
}
