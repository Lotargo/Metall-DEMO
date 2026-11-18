import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, PanelRightClose, PanelRightOpen, Paperclip, Send, Square, X } from 'lucide-react';
import { useOrchestrator, type ChatFile, type ChatMessage } from '@/api/hooks/useOrchestrator';
import { attachmentError, chatScope, chatStageLabel, clearSubmittedDraft, createChatSender, emptyChatDraft, visibleChatMessages, type ChatDraft } from '@/utils/orchestratorChat';
import { getOperatorProfile } from '@/utils/storage';
import { Button } from '@/components/ui/Button';
import { EngineeringText } from '@/components/ui/EngineeringText';
import { OrchestratorWork } from './OrchestratorWork';
import { operatorText } from '@/components/route/geometryPresentation';
import './orchestrator.css';
import { issueClarificationEvent, type IssueClarification } from '@/utils/issueClarification';

function Files({ files }: { files: ChatFile[] }) {
  return !!files.length && <ul className="orchestrator-files">{files.map(file => <li key={file.id}><a href={file.url} target="_blank" rel="noreferrer">{file.name}</a></li>)}</ul>;
}
function Message({ value }: { value: ChatMessage }) {
  return <article className={`orchestrator-message is-${value.role}`}>
    <p className="orchestrator-speaker">{value.role === 'user' ? 'Вы' : 'Оркестратор'}</p>
    <EngineeringText value={value.text} sanitize={value.role !== 'user'} /><Files files={value.files} />
  </article>;
}

function initialOpen() {
  try { const saved = localStorage.getItem('metall_orchestrator_open'); if (saved !== null) return saved === 'true'; } catch { /* Storage can be unavailable. */ }
  return window.innerWidth > 900;
}

export function OrchestratorSidebar() {
  const location = useLocation();
  const scope = chatScope(location.pathname, location.search);
  const query = useOrchestrator(scope);
  const cache = useQueryClient();
  const [open, setOpen] = useState(initialOpen);
  const [drafts, setDrafts] = useState<Record<string, ChatDraft>>({});
  const [issueTargets, setIssueTargets] = useState<Record<string, IssueClarification | undefined>>({});
  const issueTarget = issueTargets[scope.key];
  const draftKey = issueTarget ? `${scope.key}:issue:${issueTarget.id}:${issueTarget.step_sha256}` : scope.key;
  const [localError, setLocalError] = useState('');
  const draft = drafts[draftKey] ?? { ...emptyChatDraft(), ...(issueTarget ? { issue: issueTarget } : {}) };
  const input = useRef<HTMLInputElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const history = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  useEffect(() => {
    const clarify = (event: Event) => {
      const issue = (event as CustomEvent<IssueClarification>).detail;
      if (!issue || issue.runId !== scope.runId) return;
      setIssueTargets(previous => ({ ...previous, [scope.key]: issue }));
      setOpen(true);
      try { localStorage.setItem('metall_orchestrator_open', 'true'); } catch { /* Opening remains usable. */ }
      requestAnimationFrame(() => composer.current?.focus());
    };
    window.addEventListener(issueClarificationEvent, clarify);
    return () => window.removeEventListener(issueClarificationEvent, clarify);
  }, [scope.key, scope.runId]);
  useEffect(() => { atBottom.current = true; }, [scope.key]);
  useEffect(() => { if (atBottom.current && history.current) history.current.scrollTop = history.current.scrollHeight; }, [scope.key, query.data?.chat?.revision]);
  const sender = useRef<ReturnType<typeof createChatSender> | null>(null);
  if (!sender.current) sender.current = createChatSender();
  const send = useMutation({
    retry: false,
    mutationFn: ({ scope: selected, draft: sent, intent }: { scope: typeof scope; draft: ChatDraft; draftKey: string; intent: 'message' | 'correct' }) => {
      const actor = getOperatorProfile();
      return sender.current!.send(selected, sent, actor.id || encodeURIComponent(actor.name || 'operator'), intent);
    },
    onSuccess: (_value, sent) => {
      setDrafts(previous => ({ ...previous, [sent.draftKey]: clearSubmittedDraft(previous[sent.draftKey] ?? sent.draft, sent.draft) }));
    },
    onSettled: (_data, _error, sent) => { void cache.invalidateQueries({ queryKey: ['orchestrator', sent.scope.key] }); },
  });
  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/v1/orchestrator/requests/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
      if (!response.ok) throw new Error('Не удалось отменить ход чата.');
    },
    onSettled: () => { void cache.invalidateQueries({ queryKey: ['orchestrator', scope.key] }); },
  });
  const updateDraft = (patch: Partial<ChatDraft>) => setDrafts(previous => ({ ...previous, [draftKey]: { ...(previous[draftKey] ?? draft), ...patch } }));
  const sendDraft = (intent: 'message' | 'correct') => {
    setLocalError('');
    if (query.active || send.isPending || !query.data?.availability.enabled || query.data.scope.key !== scope.key) return;
    send.mutate({ scope, draft, draftKey, intent });
  };
  const submit = (event: FormEvent) => { event.preventDefault(); sendDraft('message'); };
  const toggle = () => {
    setOpen(!open);
    try { localStorage.setItem('metall_orchestrator_open', String(!open)); } catch { /* Folding remains usable. */ }
    if (!open) { void query.refetch(); requestAnimationFrame(() => composer.current?.focus()); }
  };
  const turns = query.data?.chat?.projection.turns ?? [];
  const requests = query.data?.requests ?? [];
  const nativeRequests = new Set(turns.flatMap(turn => turn.messages.map(m => m.request_id).filter(Boolean)));
  return <aside className="orchestrator-sidebar" data-open={open} aria-label="Чат оркестратора">
    <header className="orchestrator-header">
      {open && <div><h2><MessageSquare size={16} aria-hidden="true" />Оркестратор</h2><p>Помощь с текущей работой</p></div>}
      <button type="button" className="orchestrator-toggle" onClick={toggle} aria-expanded={open} aria-controls="orchestrator-body" aria-label={open ? 'Свернуть чат оркестратора' : 'Открыть чат оркестратора'} title={open ? 'Свернуть чат' : 'Открыть чат'}>{open ? <PanelRightClose size={19} aria-hidden="true" /> : <PanelRightOpen size={19} aria-hidden="true" />}</button>
    </header>
    <div id="orchestrator-body" className="orchestrator-body" hidden={!open}>
      <div className="orchestrator-context">
        <strong>{query.data?.scope.kind === 'run' ? 'Запуск: ' : query.data?.scope.kind === 'project' ? 'Проект: ' : ''}{query.data?.scope.title ?? (scope.runId ? 'Текущая работа' : scope.projectId ? 'Текущий проект' : 'Работа не выбрана')}</strong>
        {query.data?.context.run && <span>Этап: {chatStageLabel(query.data.context.cad?.phase === 'downstream' ? query.data.context.run.current_stage ?? 'downstream' : query.data.context.cad?.phase ?? query.data.context.run.current_stage ?? query.data.context.run.status)}</span>}
        {query.data?.context.cad?.model && <span>Модель: версия {query.data.context.cad.model.revision}</span>}
      </div>
      <div ref={history} className="orchestrator-history" role="log" aria-label="Переписка" aria-live="polite" aria-relevant="additions" onScroll={() => { const node = history.current; if (node) atBottom.current = node.scrollHeight - node.clientHeight - node.scrollTop < 70; }}>
        {query.isPending && <p role="status">Получаем историю…</p>}
        {query.error && <div role="alert"><p>{query.error.message}</p><Button size="sm" variant="outline" onClick={() => void query.refetch()}>Повторить загрузку</Button></div>}
        {!turns.length && !requests.length && !query.isPending && <p className="orchestrator-empty">{query.data?.availability.reason}</p>}
        {turns.map(turn => <section key={turn.id}>
          {visibleChatMessages(turn).map(message => <Message key={message.id} value={message} />)}
        </section>)}
        {requests.filter(request => !nativeRequests.has(request.id)).map(request => <Message key={request.id} value={{ id: request.id, role: 'user', text: request.text, files: request.files }} />)}
        {requests.filter(request => request.error).map(request => <p role="alert" className="orchestrator-error" key={request.id}>{operatorText(request.error)}</p>)}
      </div>
      {scope.runId && query.data?.context.cad && <OrchestratorWork key={scope.runId} runId={scope.runId} phase={query.data.context.cad.phase} model={query.data.context.cad.model} jobs={query.data.context.cad.jobs ?? []} accepted={!!query.data.context.cad.decision} enabled={query.data.availability.enabled} />}
      {query.data?.availability.enabled && <><div className="orchestrator-status" role="status" aria-live="polite">{query.active ? query.active.cancel_requested ? 'Останавливаем ход…' : query.active.status === 'queued' ? 'Сообщение в очереди' : 'Готовлю ответ…' : 'Готов к вопросу'}{query.active && <Button size="xs" variant="outline" disabled={cancel.isPending || query.active.cancel_requested} onClick={() => cancel.mutate(query.active!.id)} icon={<Square size={12} aria-hidden="true" />}>Остановить ответ</Button>}</div>
      <form className="orchestrator-composer" onSubmit={submit}>
        {issueTarget && <div className="orchestrator-issue-target">
          <div><strong>Уточнение: {issueTarget.title}</strong><button type="button" aria-label="Вернуться к обычному вопросу" onClick={() => { setIssueTargets(previous => ({ ...previous, [scope.key]: undefined })); requestAnimationFrame(() => composer.current?.focus()); }}><X size={15} aria-hidden="true" /></button></div>
          <div className="orchestrator-issue-images">{issueTarget.crops.map((crop, index) => <a key={index} href={crop.url} target="_blank" rel="noreferrer" aria-label={`Открыть фрагмент: ${crop.caption}`}><img src={crop.url} alt={crop.caption} /></a>)}</div>
          <p id="orchestrator-issue-hint">Уточните этот пункт. Можно вставить скриншот или приложить файл. Не знаете ответа — напишите, и агент найдёт решение.</p>
        </div>}
        <label className="sr-only" htmlFor="orchestrator-message">Сообщение оркестратору</label>
        <textarea id="orchestrator-message" ref={composer} value={draft.text} maxLength={20000} placeholder={issueTarget ? 'Уточнение по выбранному пункту…' : 'Спросите о текущей работе…'} onChange={event => updateDraft({ text: event.target.value })} aria-describedby={issueTarget ? 'orchestrator-issue-hint orchestrator-attachment-help' : 'orchestrator-attachment-help'} onPaste={event => {
          const pasted = Array.from(event.clipboardData.files);
          if (!pasted.length) return;
          event.preventDefault();
          const files = [...draft.files, ...pasted];
          const error = attachmentError(files); setLocalError(error ?? '');
          if (!error) updateDraft({ files });
        }} rows={3} />
        {!!draft.files.length && <ul className="orchestrator-pending-files">{draft.files.map((file, index) => <li key={`${file.name}-${index}`}><span>{file.name}</span><button type="button" aria-label={`Убрать вложение ${file.name}`} onClick={() => updateDraft({ files: draft.files.filter((_, i) => i !== index) })}><X size={13} aria-hidden="true" /></button></li>)}</ul>}
        <input ref={input} hidden type="file" multiple accept=".step,.stp,.pdf,.png,.jpg,.jpeg,.webp" onChange={event => {
          const files = [...draft.files, ...Array.from(event.target.files ?? [])];
          const error = attachmentError(files); setLocalError(error ?? '');
          if (!error) updateDraft({ files }); event.target.value = '';
        }} />
        <div className="orchestrator-composer-actions"><Button type="button" variant="ghost" size="sm" onClick={() => input.current?.click()} icon={<Paperclip size={16} aria-hidden="true" />}>Файлы</Button><Button type="submit" size="sm" loading={send.isPending} disabled={!!query.active || !query.data?.availability.enabled || (!draft.text.trim() && !draft.files.length)} icon={<Send size={14} aria-hidden="true" />}>Отправить</Button></div>
        {scope.runId && !issueTarget && query.data?.context.cad?.model && (draft.text.trim() || draft.files.length > 0) && <Button type="button" size="sm" variant="outline" disabled={!!query.active || send.isPending || !query.data.availability.enabled || (!draft.text.trim() && !draft.files.length) || ['cancelled', 'cad', 'reviewing', 'queued'].includes(query.data.context.cad.phase)} aria-describedby="orchestrator-correction-help" onClick={() => sendDraft('correct')}>Исправить модель</Button>}
        <p id="orchestrator-correction-help" className="sr-only">Текст и вложения будут переданы для исправления текущей модели. Новая версия потребует принятия.</p>
        <p id="orchestrator-attachment-help" className="sr-only">STEP/STP, PDF, PNG, JPEG, WebP · до 8 файлов и 50 МиБ</p>
        {!query.data?.availability.enabled && query.data && <p role="status">{query.data.availability.reason}</p>}
        {(localError || send.error || cancel.error) && <p role="alert" className="orchestrator-error">{localError || send.error?.message || cancel.error?.message}</p>}
      </form></>}
    </div>
  </aside>;
}
