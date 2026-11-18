export type ChatScope = { key: string; runId?: string; projectId?: string };
import type { IssueClarification } from './issueClarification';
import { geometryStageLabel } from './geometryProgress';
export type ChatDraft = { text: string; files: File[]; issue?: IssueClarification };
export const emptyChatDraft = (): ChatDraft => ({ text: '', files: [] });
export function visibleChatMessages<T extends { role: string; phase?: string; files?: unknown[] }>(turn: { status?: string; messages: T[] }): T[] {
  return turn.status === 'completed' && turn.messages.some(message => message.role === 'assistant' && message.phase === 'final_answer')
    ? turn.messages.filter(message => message.role !== 'assistant' || message.phase !== 'commentary' || !!message.files?.length)
    : turn.messages;
}
export function chatStageLabel(stage: string) {
  const names: Record<string, string> = { queued: 'В очереди', cad: 'Подготовка модели', awaiting_review: 'Проверка модели', model_review: 'Проверка модели', correcting: 'Исправление модели', reviewing: 'Агентский просмотр', accepted: 'Модель принята', downstream: 'Продолжение расчёта', cad_route_continuation: 'Продолжение в очереди', completed: 'Завершено', done: 'Завершено', failed: 'Ошибка', error: 'Ошибка', cancelled: 'Отменено', reading: 'Чтение чертежа', checking: 'Проверка данных', preliminary: 'Предварительная карта', detailing: 'Детализация', time: 'Оценка времени', estimate: 'Смета', passport: 'Паспорт' };
  const detail: Record<string, string> = { measure: 'Измерение принятого STEP', stock: 'Нормативный подбор заготовки', technology: 'Технология и черновое тело', calculation_stopped: 'Расчёт остановлен', model_review_agent: 'Автономный просмотр модели' };
  return geometryStageLabel(stage) ?? detail[stage] ?? names[stage] ?? 'В обработке';
}
export function chatScope(pathname: string, search = ''): ChatScope {
  const runId = /^\/runs\/([^/]+)/.exec(pathname)?.[1] ?? new URLSearchParams(search).get('run_id');
  if (runId) return { key: `run:${runId}`, runId };
  const projectId = /^\/projects\/([^/]+)/.exec(pathname)?.[1];
  return projectId ? { key: `project:${projectId}`, projectId } : { key: 'workspace' };
}
export function scopeQuery(scope: ChatScope) {
  return new URLSearchParams(scope.runId ? { run_id: scope.runId } : scope.projectId ? { project_id: scope.projectId } : {}).toString();
}
export function attachmentError(files: File[]): string | null {
  if (files.length > 8) return 'Можно приложить до 8 файлов.';
  if (files.some(file => !/\.(step|stp|pdf|png|jpe?g|webp)$/i.test(file.name))) return 'Приложите STEP/STP, PDF, PNG, JPEG или WebP.';
  if (files.some(file => file.size === 0) || files.reduce((sum, f) => sum + f.size, 0) > 50 * 1024 * 1024) return 'Нужны непустые файлы, суммарно до 50 МиБ.';
  return null;
}
export function clearSubmittedDraft(current: ChatDraft, sent: ChatDraft) {
  return current.text === sent.text && current.files === sent.files && current.issue === sent.issue ? { ...emptyChatDraft(), ...(current.issue ? { issue: current.issue } : {}) } : current;
}
export function chatLink(href: string): string | null {
  return /^https?:\/\//i.test(href) || /^\/api\/v1\/(?:artifacts|runs)\//.test(href) || /^\/runs\//.test(href) ? href : null;
}
export function createChatSender(fetcher: typeof fetch = fetch, uuid = () => crypto.randomUUID()) {
  const fileIds = new WeakMap<File, number>();
  const attempts = new Map<string, { key: string; id: string }>();
  let counter = 0;
  let pending: { key: string; promise: Promise<unknown> } | undefined;
  return {
    send(scope: ChatScope, draft: ChatDraft, actor: string, intent: 'message' | 'correct' = 'message'): Promise<unknown> {
      const error = attachmentError(draft.files);
      if (error || (!draft.text.trim() && !draft.files.length)) return Promise.reject(new Error(error ?? 'Напишите сообщение или приложите файл.'));
      const ids = draft.files.map(file => { if (!fileIds.has(file)) fileIds.set(file, ++counter); return fileIds.get(file); });
      const key = JSON.stringify([scope.key, actor, draft.text, ids, intent, draft.issue?.id, draft.issue?.step_sha256]);
      if (pending) return pending.key === key ? pending.promise : Promise.reject(new Error('Дождитесь отправки предыдущего сообщения.'));
      let attempt = attempts.get(scope.key);
      if (attempt?.key !== key) { attempt = { key, id: uuid() }; attempts.set(scope.key, attempt); }
      const form = new FormData();
      form.append('request_id', attempt.id); form.append('message', draft.text);
      if (intent !== 'message') form.append('intent', intent);
      if (scope.runId) form.append('run_id', scope.runId);
      if (scope.projectId) form.append('project_id', scope.projectId);
      if (draft.issue) {
        form.append('issue_id', draft.issue.id);
        form.append('issue_model_revision', String(draft.issue.revision));
        form.append('issue_step_sha256', draft.issue.step_sha256);
      }
      draft.files.forEach(file => form.append('files', file));
      const promise = (async () => {
        const response = await fetcher('/api/v1/orchestrator/messages', { method: 'POST', headers: { 'X-Operator': actor }, body: form });
        if (!response.ok) {
          const body = await response.json().catch(() => null) as { detail?: unknown } | null;
          if (response.status === 409) attempts.delete(scope.key);
          throw new Error(typeof body?.detail === 'string' ? body.detail : 'Не удалось отправить сообщение.');
        }
        const result: unknown = await response.json();
        attempts.delete(scope.key);
        return result;
      })().finally(() => { pending = undefined; });
      pending = { key, promise };
      return promise;
    },
  };
}
