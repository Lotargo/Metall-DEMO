export type WorkJob = {
  id: string; action: string; status: string; source_request_id?: string | null;
  request_id?: string;
  model_revision?: number | null; published_revision?: number; cancel_requested: boolean;
  user_message?: string; error?: string; message?: string; note?: string;
  response?: string;
};
export type WorkInput = {
  run_id: string; action: 'start' | 'correct' | 'cancel' | 'continue' | 'recalculate';
  task_id?: string; expected_revision?: number; model_revision?: number; step_sha256?: string; quantity?: number;
};
export function workLabel(job: WorkJob) {
  const names: Record<string, string> = { start: 'Подготовка модели', review: 'Автономный просмотр', correct: 'Исправление модели', cancel: 'Отмена', continue: 'Продолжение', recalculate: 'Пересчёт' };
  const statuses: Record<string, string> = { queued: 'в очереди', running: 'выполняется', completed: 'завершено', cancelled: 'отменено', failed: 'ошибка', interrupted: 'прервано', stale: 'нужна актуальная версия', no_change: 'модель не изменена', waiting_executor: 'ожидает подключения расчёта' };
  return `${names[job.action] ?? job.action} · ${job.cancel_requested && job.status === 'running' ? 'останавливается' : statuses[job.status] ?? job.status}`;
}
export function createWorkSender(fetcher: typeof fetch = fetch, uuid = () => crypto.randomUUID()) {
  const attempts = new Map<string, string>();
  const pending = new Map<string, Promise<unknown>>();
  return (input: WorkInput, actor: string): Promise<unknown> => {
    const key = JSON.stringify([input, actor]);
    const active = pending.get(key);
    if (active) return active;
    const id = attempts.get(key) ?? uuid();
    attempts.set(key, id);
    const promise = (async () => {
      const response = await fetcher('/api/v1/orchestrator/commands', { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Operator': actor },
        body: JSON.stringify({ ...input, request_id: id }) });
      const result: unknown = await response.json();
      if (!response.ok) {
        if (response.status < 500) attempts.delete(key);
        throw new Error(typeof (result as { detail?: unknown })?.detail === 'string' ? (result as { detail: string }).detail : 'Не удалось выполнить команду.');
      }
      attempts.delete(key);
      return result;
    })().finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  };
}
