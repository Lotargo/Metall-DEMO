import { InfoBlock } from '@/components/ui/InfoBlock';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { keepNewestCompactRevision } from '@/api/hooks/useCompactRound';
import type { components } from '@/api/schema';
import { Button } from '@/components/ui/Button';
import { groupClarifications, type ClarificationGroup } from '@/utils/clarificationGroups';
import { asRecord, formatNumber } from '@/utils/compactNumbers';
import { stockChoiceView } from './CompactStockChoice';
import { CompactClarificationTaskForm } from './CompactClarificationTaskForm';
import { CompactClarificationTaskContext, purposeLabels, type ClarificationPanel, type NumericFactTarget, type QueueCounts } from './CompactClarificationTaskContext';
import './CompactClarifications.css';
import { estimateOperatorText } from './estimateOperatorText';
import { publicSourceText, publicSourceUrl } from '@/utils/publicSource';

type State = components['schemas']['CompactState'];
type Response = components['schemas']['CompactClarificationResponse'];
type Draft = { answer: string; revision: number; question: string; questionIds: string[] };
const fields = 'mt-2 w-full rounded-md border border-control bg-surface px-3 py-2 text-sm text-ink';
const scopeLabel = (scope: string, index: number | null) => scope === 'reading' ? 'Данные чертежа' : scope === 'operation' ? `Операция ${(index ?? 0) + 1}` : 'Предварительный маршрут';
const idsOf = (group: ClarificationGroup) => group.sources.map(source => source.id);
const sameIds = (left: string[], right: string[]) => left.length === right.length && left.every(id => right.includes(id));
const responseText = (response: Response) => response.status === 'skipped' ? `Пропущено — неизвестность сохранена.${response.answer ? ` Комментарий: ${estimateOperatorText(publicSourceText(response.answer, '')) ?? ''}` : ''}` : estimateOperatorText(publicSourceText(response.resolution?.decision ?? response.answer, '')) ?? 'Необходимо уточнить содержание ответа.';
const sameSavedResponse = (left: Response, right: Response) => left.answer === right.answer && left.status === right.status && left.agent_basis === right.agent_basis && JSON.stringify(left.resolution) === JSON.stringify(right.resolution) && JSON.stringify(left.sources) === JSON.stringify(right.sources);

function OperatorSource({ source }: { source: string }) {
  const match = source.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);
  const plain = match ? null : source.match(/https?:\/\/[^\s<>]+/);
  const url = match?.[2] ?? plain?.[0].replace(/[.,;:]+$/, '');
  const publicUrl = publicSourceUrl(url);
  const label = publicSourceText(match?.[1] ?? source, publicUrl ? 'Открыть публикацию' : 'Сведения источника сохранены');
  if (!publicUrl) return <>{label}</>;
  return <a className="text-accent underline" href={publicUrl} target="_blank" rel="noopener noreferrer">{label}</a>;
}

function ResponseConditions({ response }: { response: Response }) {
  const resolution = response.resolution;
  return <>
    {resolution && (resolution.assumptions.length > 0 || resolution.production_checks.length > 0 || resolution.remaining_unknowns.length > 0) && <InfoBlock className="text-sm" data-agent-conditions title="Условия, проверки и неизвестные">

      <div className="mt-3 space-y-2 rounded-md border border-line bg-surface p-3">
        {!!resolution.assumptions.length && <div><p className="font-medium">{resolution.action === 'estimate_scenario' ? 'Принято для расчёта' : 'Инженерные условия'}</p><ul className="list-disc space-y-1 pl-4">{resolution.assumptions.map((text, index) => <li key={index}>{estimateOperatorText(publicSourceText(text, ''))}</li>)}</ul></div>}
        {!!resolution.production_checks.length && <div><p className="font-medium">Проверить перед производством</p><ul className="list-disc space-y-1 pl-4">{resolution.production_checks.map((text, index) => <li key={index}>{estimateOperatorText(publicSourceText(text, ''))}</li>)}</ul></div>}
        {!!resolution.remaining_unknowns.length && <div><p className="font-medium">Оставшиеся неизвестные</p><ul className="list-disc space-y-1 pl-4">{resolution.remaining_unknowns.map((text, index) => <li key={index}>{estimateOperatorText(publicSourceText(text, ''))}</li>)}</ul></div>}
      </div>
    </InfoBlock>}
    {response.sources?.some(source => source.trim()) && <InfoBlock className="text-xs text-muted" data-answer-sources title="Источники ответа">

      <ul className="mt-3 space-y-1">{[...new Set(response.sources.filter(source => source.trim()))].map(source => <li key={source} className="break-words whitespace-pre-wrap"><OperatorSource source={source} /></li>)}</ul>
    </InfoBlock>}
  </>;
}
const countedNoun = (count: number, one: string, few: string, many: string) => count % 100 >= 11 && count % 100 <= 14 ? many : count % 10 === 1 ? one : count % 10 >= 2 && count % 10 <= 4 ? few : many;

export function CompactClarifications({ runId, state, disabled, onSaved, onOpenCountChange, onQueueCountsChange, onOpenContext, onEditNumericFact }: {
  runId: string; state: State; disabled: boolean; onSaved: () => void; onOpenCountChange: (count: number | null) => void;
  onQueueCountsChange?: (counts: QueueCounts) => void;
  onOpenContext?: (panel: ClarificationPanel, operationIndex?: number) => void;
  onEditNumericFact?: (target: NumericFactTarget) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [selection, setSelection] = useState<Record<string, Draft>>({});
  const [bulkAnswer, setBulkAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const answerFields = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['compact-clarifications', runId],
    structuralSharing: keepNewestCompactRevision,
    queryFn: async ({ signal }) => {
      const result = await apiClient.GET('/api/v1/runs/{run_id}/compact-round/clarifications', { signal, params: { path: { run_id: runId } } });
      if (result.error || !result.data) throw new Error('Не удалось загрузить сохранённые уточнения.');
      return result.data;
    },
  });
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ['compact-clarifications', runId], exact: true });
  }, [queryClient, runId, state.revision]);
  const questions = query.data?.questions ?? [];
  const previousRoute = query.data?.previous_route;
  const previousGroups = previousRoute ? groupClarifications(previousRoute.questions, previousRoute.tasks) : [];
  const responses = query.data?.responses ?? [];
  const groups = groupClarifications(questions, query.data?.tasks ?? []);
  const tasks = query.data?.tasks ?? [];
  const assignedSourceCount = new Set(tasks.flatMap(task => task.question_ids)).size;
  const hasStockTask = tasks.some(task => task.definition.action === 'review_stock');
  const selectedStockDiameter = stockChoiceView(state).diameter;
  const activeIds = new Set(questions.map(question => question.id));
  const groupIds = new Set(groups.map(group => group.id));
  const responseIds = new Set(responses.filter(response => response.status !== 'unresolved').map(response => response.id));
  const unanswered = groups.filter(group => group.sources.some(source => !responseIds.has(source.id)));
  const answered = groups.filter(group => group.sources.every(source => responseIds.has(source.id)));
  const conditionalCount = answered.filter(group => responses.some(response => idsOf(group).includes(response.id) && response.resolution?.action === 'proceed_with_conditions')).length;
  const openCount = query.data ? unanswered.length : null;
  useEffect(() => { onOpenCountChange(openCount); }, [onOpenCountChange, openCount]);
  const taskCount = unanswered.filter(group => !!group.task).length;
  const unclassifiedCount = unanswered.filter(group => !group.task).reduce((sum, group) => sum + group.sources.filter(source => !responseIds.has(source.id)).length, 0);
  useEffect(() => { if (query.data) onQueueCountsChange?.({ tasks: taskCount, unclassified: unclassifiedCount, sources: query.data.questions.length }); }, [onQueueCountsChange, query.data, taskCount, unclassifiedCount]);
  const previous = responses.filter(response => !activeIds.has(response.id));
  const revision = query.data?.revision ?? state.revision;
  const locked = disabled || busy || !query.data || !!state.calculation_pending || revision !== state.revision;
  const selected = Object.values(selection);
  const selectedIds = selected.flatMap(item => item.questionIds);
  const selectionCurrent = Object.entries(selection).every(([id, item]) => {
    const group = groups.find(candidate => candidate.id === id);
    return group && sameIds(item.questionIds, idsOf(group));
  });
  const selectionStale = selected.some(item => item.revision !== revision) || !selectionCurrent;
  const selectedHasDrafts = Object.keys(selection).some(id => !!drafts[id]);
  const discard = (id: string) => setDrafts(current => { const next = { ...current }; delete next[id]; return next; });
  const snapshot = (group: ClarificationGroup, answer = ''): Draft => ({ answer, revision, question: group.question, questionIds: idsOf(group) });

  async function save(questionIds: string[], status: 'answered' | 'skipped', answer: string, expectedRevision: number, draftId?: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await apiClient.POST('/api/v1/runs/{run_id}/compact-round/clarifications/batch', {
        params: { path: { run_id: runId } },
        body: { expected_revision: expectedRevision, question_ids: questionIds, status, answer },
      });
      if (result.error) throw new Error(typeof result.error === 'object' && result.error !== null && 'detail' in result.error ? String(result.error.detail) : 'Не удалось сохранить уточнение. Обновите данные и проверьте редакцию.');
      if (draftId) discard(draftId);
      else { setSelection({}); setBulkAnswer(''); }
      setNotice(status === 'answered' ? 'Ответ сохранён. Численные данные не изменены.' : 'Пропуск сохранён. Недостающие сведения остаются неизвестными.');
      await query.refetch();
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось сохранить уточнение.'); }
    finally { setBusy(false); }
  }

  function renderQuestion(group: ClarificationGroup) {
    const saved = responses.filter(response => idsOf(group).includes(response.id));
    const commonResponse = saved.length && saved.every(response => sameSavedResponse(response, saved[0])) ? saved[0] : undefined;
    const draft = drafts[group.id];
    const stale = !!draft && (draft.revision !== revision || !sameIds(draft.questionIds, idsOf(group)));
    const labelId = `clarification-${group.id}`;
    const sourceQuestions = [...new Set(group.sources.map(source => source.question))].filter(question => question !== group.question);
    const complete = group.sources.every(source => responseIds.has(source.id));
    const resolvedByAgent = complete && commonResponse?.status === 'answered' && !!commonResponse.resolution;
    const taskContext = group.task && <CompactClarificationTaskContext task={group.task} disabled={locked} onOpenContext={onOpenContext} onEditNumericFact={onEditNumericFact} onRecordEvidence={() => answerFields.current[group.id]?.focus()} />;
    const status = !saved.length ? 'Не решено' : commonResponse?.status === 'unresolved' ? 'Требует уточнения' : !complete ? 'Частично решено'
      : !commonResponse ? 'Решения различаются' : commonResponse.status === 'skipped' ? 'Пропущено' : commonResponse.resolution?.action === 'estimate_scenario' ? 'Решено для сметы' : commonResponse.resolution?.action === 'proceed_with_conditions' ? 'Рабочее решение с условиями' : 'Ответ сохранён';
    const former: Response[][] = [];
    for (const response of previous.filter(item => group.sources.some(source => source.question === item.question))) {
      const sameDecision = former.find(items => items[0].question === response.question && sameSavedResponse(items[0], response));
      if (sameDecision) sameDecision.push(response);
      else former.push([response]);
    }
    return <tr key={group.id} data-question-id={group.task ? undefined : group.id} data-task-id={group.task?.id} data-task-purpose={group.task?.definition.purpose} data-source-question-ids={idsOf(group).join(' ')} aria-labelledby={labelId}>
      <td className="compact-clarifications__select" data-label="Выбор">
        <input type="checkbox" aria-label={`Выбрать вопрос: ${estimateOperatorText(group.question) ?? 'Требуется уточнение чертежа'}`} checked={!!selection[group.id]} disabled={locked} onChange={event => setSelection(current => {
          const next = { ...current };
          if (event.target.checked) next[group.id] = snapshot(group);
          else delete next[group.id];
          return next;
        })} />
      </td>
      <td data-label="Вопрос и влияние">
        <div className="space-y-3">
        <div><p className="mb-1 text-xs text-muted">{group.task ? purposeLabels[group.task.definition.purpose] : 'Назначение и влияние не заданы'}</p><h4 id={labelId} className="font-medium whitespace-pre-wrap">{estimateOperatorText(group.question) ?? 'Требуется уточнение чертежа'}</h4></div>
        {sourceQuestions.map(question => <p key={question} className="whitespace-pre-wrap">{estimateOperatorText(question) ?? 'Требуется уточнение чертежа'}</p>)}
        {!resolvedByAgent && taskContext}
        <InfoBlock className="text-xs text-muted" title="Основания задачи">
        {resolvedByAgent && <div className="mt-3 space-y-2"><p className="font-medium">Влияние до сохранения решения</p>{taskContext}</div>}
        {group.task && <div className="mt-3 space-y-2"><p className="whitespace-pre-wrap">{publicSourceText(group.task.definition.basis, 'Основание вопроса сохранено')}</p><ul className="space-y-1">{group.task.definition.dependencies.map((dependency, index) => <li key={index}>{publicSourceText(dependency.source, dependency.source?.trim() ? 'Основание зависимости сохранено' : 'Источник не указан')}</li>)}</ul></div>}
        <ul className="mt-3 space-y-3">{group.sources.map(source => <li key={source.id} data-source-question-id={source.id}><p>{scopeLabel(source.scope, source.operation_index)}</p>{group.task && source.question.trim() !== group.question.trim() && !sourceQuestions.includes(source.question) && <p className="mt-1 whitespace-pre-wrap">{estimateOperatorText(source.question) ?? 'Требуется уточнение чертежа'}</p>}</li>)}</ul>
        </InfoBlock>
        </div>
      </td>
      <td data-label="Ответ или комментарий">
        <div className="space-y-3">
        {!!saved.length && !commonResponse && <div className="space-y-2 text-sm"><p className="font-medium">Сохранённые решения различаются</p><ul className="space-y-2">{saved.map(response => <li key={response.id} className="space-y-2 whitespace-pre-wrap"><p>{scopeLabel(response.scope, response.operation_index)}: {responseText(response)}</p><ResponseConditions response={response} /></li>)}</ul></div>}
        {(draft || commonResponse) && <p className="text-xs text-muted">{draft ? 'Черновик ответа' : commonResponse?.actor === 'agent:clarifications' ? 'Ответ агента' : commonResponse?.status === 'skipped' ? 'Комментарий к пропуску' : 'Сохранённый ответ'}</p>}
        {commonResponse?.resolution && !draft && <div className="space-y-2 text-sm" data-agent-decision>
          <p className="font-medium">Решение</p>
          <p className="whitespace-pre-wrap text-pretty">{estimateOperatorText(publicSourceText(commonResponse.resolution.decision, ''))}</p>
          {commonResponse.resolution.action === 'proceed_with_conditions' && <p className="text-xs text-muted">Выбран рабочий способ. Оставшиеся неизвестные факты не подтверждены.</p>}
        </div>}
        {commonResponse?.agent_basis && <p className="text-xs text-muted">{({ drawing: 'Подтверждено чертежом', reference: 'Справочный источник', assumption: commonResponse.resolution?.action === 'estimate_scenario' ? 'Сметное допущение' : 'Инженерное решение', unknown: 'Сведения не установлены' })[commonResponse.agent_basis]}</p>}
        <label htmlFor={`${labelId}-answer`} className="sr-only">Ответ или пояснение к пропуску: {estimateOperatorText(group.question) ?? 'Требуется уточнение чертежа'}</label>
        <textarea ref={element => { answerFields.current[group.id] = element; }} id={`${labelId}-answer`} aria-label={`Ответ: ${estimateOperatorText(group.question) ?? 'Требуется уточнение чертежа'}`} aria-describedby={`${labelId}-help`} className={fields} rows={4} disabled={locked} value={draft?.answer ?? estimateOperatorText(publicSourceText(commonResponse?.answer ?? '', '')) ?? ''} onChange={event => setDrafts(current => ({ ...current, [group.id]: { ...(current[group.id] ?? snapshot(group)), answer: event.target.value } }))} />
        <p id={`${labelId}-help`} className="sr-only">Решение сохранится для всех источников этой строки. Для ответа нужен текст; пропустить можно без пояснения.</p>
        {commonResponse && <ResponseConditions response={commonResponse} />}
      {!!former.length && <InfoBlock className="text-sm" title={<>Прежние решения · {former.length}</>}><div className="mt-3 space-y-3 rounded-md border border-line p-3">
        <ul className="space-y-3">{former.map(items => <li key={`${items[0].id}-${items[0].saved_revision}`} className="space-y-2"><p className="whitespace-pre-wrap">{responseText(items[0])}</p>
          <ResponseConditions response={items[0]} />
          {group.task && <p className="text-xs text-muted">Только для совпадающего исходного вопроса: {items[0].question}</p>}
          <ul className="space-y-1 text-xs text-muted">{items.map(response => <li key={`${response.id}-${response.saved_revision}`}>{scopeLabel(response.scope, response.operation_index)}</li>)}</ul>
          {items[0].resolution?.action === 'proceed_with_conditions' ? <p className="text-xs text-muted">Условное решение требует проверки применимости к текущим данным и нового исследования вопроса.</p> : items[0].status !== 'unresolved' && <Button variant="outline" size="sm" disabled={locked || !!draft} onClick={() => save(group.sources.filter(source => source.question === items[0].question).map(source => source.id), items[0].status === 'skipped' ? 'skipped' : 'answered', items[0].answer, revision, group.id)}>Применить прежнее решение</Button>}
        </li>)}</ul>
        <p className="text-xs text-muted">Применение — только после проверки. При наличии черновика сначала сохраните или отмените его.</p>
      </div></InfoBlock>}
        </div>
      </td>
      <td data-label="Статус и действия">
      <div className="space-y-3">
      <p className="font-medium">{status}</p>
      {commonResponse?.status === 'skipped' && <p className="text-sm text-muted">Неизвестность сохранена.</p>}
      {!!saved.length && saved.length < group.sources.length && <p className="text-xs text-muted">Решение сохранено для {saved.length} из {group.sources.length} источников. Новые источники требуют явного решения.</p>}
      {draft && <p className="text-sm text-warning">Есть несохранённый ответ</p>}
      {stale && <div className="space-y-2 text-sm text-warning"><p>Данные обновились. Черновик сохранён; проверьте его применимость к текущему вопросу.</p><Button variant="outline" size="sm" disabled={locked} onClick={() => setDrafts(current => ({ ...current, [group.id]: snapshot(group, current[group.id].answer) }))}>Ответ проверен для текущей редакции</Button></div>}
      <div className="flex flex-wrap gap-2">
        {(!complete || draft) && <Button size="sm" disabled={locked || stale || !draft?.answer.trim()} onClick={() => save(idsOf(group), 'answered', draft?.answer ?? '', draft?.revision ?? revision, group.id)}>{group.task?.definition.purpose === 'engineering_proposal' ? 'Сохранить комментарий' : 'Сохранить ответ'}</Button>}
        {!(commonResponse?.status === 'skipped' && complete && !draft) && <Button variant="outline" size="sm" disabled={locked || stale} onClick={() => save(idsOf(group), 'skipped', draft?.answer ?? commonResponse?.answer ?? '', draft?.revision ?? revision, group.id)}>Пропустить</Button>}
        {draft && <Button variant="ghost" size="sm" disabled={busy} onClick={() => discard(group.id)}>Отменить правку ответа</Button>}
      </div>
      </div>
      </td>
    </tr>;
  }

  return <div className="space-y-5">
    {asRecord(state.stock.service_result).status === 'infeasible' && (hasStockTask
      ? <div className="flex flex-wrap items-center gap-x-2 text-sm"><p className="text-warning">Подбор{selectedStockDiameter != null ? ` Ø${formatNumber(selectedStockDiameter)} мм` : ' выбранной заготовки'} не пройден.</p>{onOpenContext && <button type="button" className="text-accent underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60" disabled={locked} onClick={() => onOpenContext('stock')}>Проверить выбор заготовки</button>}</div>
      : <div className="space-y-2 rounded-md border border-line p-3 text-sm text-warning"><p>Подбор выбранной заготовки{selectedStockDiameter != null ? ` Ø${formatNumber(selectedStockDiameter)} мм` : ''} не пройден. Назначение задачи или пропуск вопроса не подтверждает её пригодность.</p>{onOpenContext && <Button variant="outline" size="sm" disabled={locked} onClick={() => onOpenContext('stock')}>Проверить выбор заготовки</Button>}</div>)}
    {query.isPending && <p role="status" className="text-sm text-muted">Загрузка уточнений…</p>}
    {query.error && <div role="alert" className="space-y-2 text-sm text-danger"><p>{publicSourceText(query.error.message, 'Не удалось получить уточнения.')}</p><Button variant="outline" size="sm" onClick={() => query.refetch()}>Повторить загрузку уточнений</Button></div>}
    {error && <p role="alert" className="text-sm text-danger">{publicSourceText(error, 'Не удалось сохранить ответ. Обновите данные.')}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {!!selected.length && <section aria-label="Общее решение для выбранных вопросов" className="space-y-3 rounded-md border border-line p-3">
      <h3 className="font-semibold">Выбрано вопросов: {selected.length}</h3>
      <ul className="list-disc pl-5 text-sm">{selected.map(item => <li key={item.question}>{item.question}</li>)}</ul>
      <label className="block text-sm">Общий ответ или пояснение к пропуску<textarea aria-label="Общий ответ для выбранных вопросов" aria-describedby="compact-bulk-help" className={fields} rows={3} disabled={locked} value={bulkAnswer} onChange={event => setBulkAnswer(event.target.value)} /></label>
      <p id="compact-bulk-help" className="text-xs text-muted">Общее решение сохранится сразу для всех выбранных вопросов. Для ответа нужен текст; пропустить можно без пояснения.</p>
      {selectionStale && <div className="space-y-2 text-sm text-warning"><p>{selectionCurrent ? 'Данные обновились. Проверьте выбранные вопросы перед сохранением общего решения.' : 'Основания выбранных вопросов изменились. Текст общего ответа сохранён; снимите выбор и выберите актуальные вопросы.'}</p>{selectionCurrent && <Button variant="outline" size="sm" disabled={locked} onClick={() => setSelection(current => Object.fromEntries(Object.entries(current).map(([id, item]) => [id, { ...item, revision }])))}>Выбор проверен для текущей редакции</Button>}</div>}
      {selectedHasDrafts && <p className="text-sm text-warning">У выбранных вопросов есть отдельные черновики. Сначала сохраните или отмените их.</p>}
      <div className="flex flex-wrap gap-2"><Button size="sm" disabled={locked || selectionStale || selectedHasDrafts || !bulkAnswer.trim()} onClick={() => save(selectedIds, 'answered', bulkAnswer, revision)}>Сохранить общий ответ</Button><Button variant="outline" size="sm" disabled={locked || selectionStale || selectedHasDrafts} onClick={() => save(selectedIds, 'skipped', bulkAnswer, revision)}>Пропустить выбранные</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => setSelection({})}>Снять выбор</Button></div>
      <CompactClarificationTaskForm runId={runId} questionIds={selectedIds} revision={revision} disabled={locked || selectedHasDrafts} selectionStale={selectionStale} onBusyChange={setBusy} onSaved={() => { setSelection({}); setNotice('Назначение задачи сохранено. Исходные вопросы, факты и расчёт не изменены.'); void query.refetch(); onSaved(); }} />
    </section>}
    {query.data && <section aria-label="Рабочие уточнения" className="space-y-4">
      <div className="flex flex-wrap justify-between gap-2 text-sm"><p className="font-semibold">Открытые задачи · {taskCount}{unclassifiedCount > 0 ? ` · без назначения: ${unclassifiedCount}` : ''}</p><p className="text-muted">Сохранённых решений: {answered.length}{conditionalCount > 0 ? ` · с условиями: ${conditionalCount}` : ''}</p></div>
      {!!groups.length && <div className="compact-clarifications__table-wrap"><table className="compact-clarifications__table" aria-label="Вопросы, ответы и решения">
        <colgroup><col className="compact-clarifications__selection-column" /><col className="compact-clarifications__question-column" /><col className="compact-clarifications__answer-column" /><col className="compact-clarifications__status-column" /></colgroup>
        <thead><tr><th scope="col"><span className="sr-only">Выбор</span></th><th scope="col">Вопрос и влияние</th><th scope="col">Ответ или комментарий</th><th scope="col">Статус и действия</th></tr></thead>
        <tbody>{[...unanswered, ...answered].map(renderQuestion)}</tbody>
      </table></div>}
      {!!unclassifiedCount && <p data-unclassified-questions className="text-sm text-muted">Для {unclassifiedCount} исходных вопросов назначение и влияние не заданы. Это исходные формулировки прежнего результата. По тексту нельзя определить влияние или адресата. Можно явно связать выбранные вопросы в задачу; до этого их зависимые результаты сохраняют прежние ограничения.</p>}
      {!unanswered.length && <p className="text-sm text-muted">{questions.length ? 'Для всех текущих вопросов сохранён ответ, рабочее решение или явный пропуск. Условия применения и оставшиеся неизвестные сохранены в решениях.' : 'В текущих данных вопросы не сформулированы.'}</p>}
    </section>}
    {previousRoute && previousGroups.length > 0 && <section className="compact-workspace-card space-y-3" aria-labelledby="previous-route-questions">
      <h3 id="previous-route-questions" className="font-semibold">Вопросы прежней карты · редакция {previousRoute.route_revision} · {previousGroups.length}</h3>
      <p className="text-sm text-muted">Справка для подготовки новой карты. Ответы на действующие вопросы сохраняются в разделе «Рабочие уточнения».</p>
      <ol className="space-y-3 pl-5 text-sm list-decimal">
        {previousGroups.map(group => <li key={group.id}>
          <p className="font-medium whitespace-pre-wrap">{estimateOperatorText(group.question) ?? 'Требуется уточнение чертежа'}</p>
          <ul className="mt-1 space-y-1 text-muted">
            {group.sources.map(source => <li key={source.id} className="whitespace-pre-wrap">
              {scopeLabel(source.scope, source.operation_index)}{source.question !== group.question && ` · ${source.question}`}
            </li>)}
          </ul>
        </li>)}
      </ol>
    </section>}
    {questions.length > assignedSourceCount && <p className="text-sm text-warning">Без адресного назначения: {questions.length - assignedSourceCount} {countedNoun(questions.length - assignedSourceCount, 'вопрос', 'вопроса', 'вопросов')}.</p>}
    {query.data && Object.entries(drafts).filter(([id]) => !groupIds.has(id)).map(([id, draft]) => <section key={id} className="space-y-2 border border-line p-3 text-sm"><h3 className="font-medium">Несохранённый ответ к прежнему вопросу</h3><p>{draft.question}</p><p className="whitespace-pre-wrap">{draft.answer}</p><p className="text-muted">Основание вопроса изменилось. Этот ответ не применяется к новой редакции.</p><Button variant="outline" size="sm" onClick={() => discard(id)}>Удалить прежний черновик</Button></section>)}
  </div>;
}
