import type { CadRouteState } from '@/api/hooks/useCadRoute';
import { createWorkSender, type WorkInput } from './orchestratorWork';

export type CadContinuationResponse = {
  task_id: string; run_id: string; status: string; action: 'continue';
  message: string; replayed: boolean;
};

export function canContinueCadCalculation(state: CadRouteState): boolean {
  const model = state.route.models.at(-1);
  const decision = state.route.decision;
  return state.route.phase === 'accepted' &&
    ['failed', 'interrupted'].includes(state.downstream?.status ?? '') &&
    !!model && !!decision?.step_sha256 &&
    model.revision === decision.accepted_revision && model.step_sha256 === decision.step_sha256 &&
    !Object.values(state.jobs ?? {}).some(job =>
      ['correct', 'continue', 'recalculate'].includes(job.action) && ['queued', 'running'].includes(job.status));
}

export function createCadContinuationController(fetcher: typeof fetch = fetch, uuid = () => crypto.randomUUID()) {
  const send = createWorkSender(fetcher, uuid);
  const completed = new Map<string, CadContinuationResponse>();
  let pending: { key: string; promise: Promise<CadContinuationResponse> } | undefined;
  return {
    submit(state: CadRouteState, actor: string): Promise<CadContinuationResponse> {
      if (!canContinueCadCalculation(state)) {
        return Promise.reject(new Error('Расчёт сейчас недоступен для продолжения. Обновите данные.'));
      }
      const model = state.route.models.at(-1)!;
      const input: WorkInput = {
        run_id: state.route.run_id, action: 'continue', expected_revision: state.route.revision,
        model_revision: model.revision, step_sha256: model.step_sha256,
      };
      const key = JSON.stringify([input, actor]);
      if (pending) return pending.key === key ? pending.promise :
        Promise.reject(new Error('Дождитесь ответа на предыдущее продолжение.'));
      const receipt = completed.get(key);
      if (receipt) return Promise.resolve(receipt);
      const promise = send(input, actor).then(value => {
        const result = value as CadContinuationResponse;
        completed.set(key, result);
        return result;
      }).finally(() => { pending = undefined; });
      pending = { key, promise };
      return promise;
    },
  };
}
