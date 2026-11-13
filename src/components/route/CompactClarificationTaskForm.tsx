import { InfoBlock } from '@/components/ui/InfoBlock';
import { useState, type FormEvent } from 'react';
import { apiClient } from '@/api/client';
import type { components } from '@/api/schema';
import { Button } from '@/components/ui/Button';
import { purposeLabels } from './CompactClarificationTaskContext';
import { publicSourceText } from '@/utils/publicSource';
import { PublicSourceInput } from './PublicSourceInput';

type Definition = components['schemas']['ClarificationTaskDefinition-Input'];
type Dependency = components['schemas']['ClarificationDependency-Input'];
type DependencyDraft = { result: Dependency['result'] | ''; operation: string; explanation: string; source: string };
const emptyDependency = (): DependencyDraft => ({ result: '', operation: '', explanation: '', source: '' });
const field = 'mt-1 w-full rounded-md border border-control bg-surface px-3 py-2 text-sm text-ink';
const sameIds = (left: string[], right: string[]) => left.length === right.length && left.every(id => right.includes(id));

export function CompactClarificationTaskForm({ runId, questionIds, revision, disabled, selectionStale, onBusyChange, onSaved }: {
  runId: string; questionIds: string[]; revision: number; disabled: boolean; selectionStale: boolean;
  onBusyChange: (busy: boolean) => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState<Definition['purpose'] | ''>('');
  const [action, setAction] = useState<Definition['action'] | ''>('');
  const [basis, setBasis] = useState('');
  const [proposal, setProposal] = useState('');
  const [target, setTarget] = useState<NonNullable<Definition['numeric_target']> | ''>('');
  const [dependencies, setDependencies] = useState<DependencyDraft[]>([emptyDependency()]);
  const [reviewed, setReviewed] = useState({ revision, ids: questionIds });
  const [started, setStarted] = useState(false);
  const [error, setError] = useState('');
  const [posting, setPosting] = useState(false);
  const stale = selectionStale || started && (reviewed.revision !== revision || !sameIds(reviewed.ids, questionIds));
  const beginEditing = () => {
    if (!started) {
      setReviewed({ revision, ids: [...questionIds] });
      setStarted(true);
    }
  };
  const canTarget = purpose === 'fact' && action === 'edit_passport';
  const complete = !!title.trim() && !!purpose && !!action && !!basis.trim()
    && (purpose !== 'engineering_proposal' || !!proposal.trim())
    && dependencies.every(item => item.result && item.explanation.trim() && item.source.trim()
      && (item.operation === '' ? item.result !== 'operation_calculation' : /^[1-9]\d*$/.test(item.operation)));
  const updateDependency = (index: number, update: Partial<DependencyDraft>) => setDependencies(current => current.map((item, position) => position === index ? { ...item, ...update } : item));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!complete || stale || disabled) return;
    setError(''); setPosting(true); onBusyChange(true);
    try {
      const result = await apiClient.POST('/api/v1/runs/{run_id}/compact-round/clarifications/tasks', {
        params: { path: { run_id: runId } },
        body: { expected_revision: reviewed.revision, assignments: [{ question_ids: reviewed.ids, definition: {
          title: title.trim(), purpose: purpose as Definition['purpose'], action: action as Definition['action'], basis: basis.trim(),
          proposal: purpose === 'engineering_proposal' ? proposal.trim() : '', numeric_target: canTarget && target ? target : null,
          dependencies: dependencies.map(item => ({ result: item.result as Dependency['result'], operation_index: item.operation ? Number(item.operation) - 1 : null, explanation: item.explanation.trim(), source: item.source.trim() })),
        } }] },
      });
      if (result.error) throw new Error(typeof result.error === 'object' && result.error !== null && 'detail' in result.error ? String(result.error.detail) : 'Не удалось сохранить назначение задачи.');
      onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось сохранить назначение задачи.'); }
    finally { setPosting(false); onBusyChange(false); }
  }

  return <InfoBlock className="border-t border-line pt-3 text-sm" title="Назначение задачи">
    <form className="mt-3 space-y-3" onSubmit={submit} onFocusCapture={beginEditing} onChangeCapture={beginEditing} aria-label="Назначение задачи уточнений">
      <p className="text-xs text-muted">Исходные вопросы сохранятся со всеми источниками. Назначение и влияние задаются явно; аннотация не меняет паспорт, маршрут и расчёт.</p>
      <label className="block">Название задачи<input aria-label="Название задачи" className={field} required disabled={disabled || posting} value={title} onChange={event => setTitle(event.target.value)} /></label>
      <label className="block">Назначение задачи<select aria-label="Назначение задачи" className={field} required disabled={disabled || posting} value={purpose} onChange={event => setPurpose(event.target.value as Definition['purpose'])}><option value="">Выберите назначение</option>{Object.entries(purposeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="block">Действие задачи<select aria-label="Действие задачи" className={field} required disabled={disabled || posting} value={action} onChange={event => setAction(event.target.value as Definition['action'])}><option value="">Выберите действие</option><option value="edit_passport">Открыть правку факта паспорта</option><option value="review_stock">Перейти к выбору заготовки</option><option value="review_route">Открыть предварительный маршрут</option><option value="review_operation">Открыть зависимую операцию</option><option value="record_evidence">Сохранить подтверждающие сведения</option></select></label>
      <label className="block">Основание задачи<textarea aria-label="Основание задачи" className={field} rows={2} required disabled={disabled || posting} value={basis} onChange={event => setBasis(event.target.value)} /></label>
      {purpose === 'engineering_proposal' && <label className="block">Предложенный вариант<textarea aria-label="Предложенный вариант" className={field} rows={3} required disabled={disabled || posting} value={proposal} onChange={event => setProposal(event.target.value)} /></label>}
      {canTarget && <label className="block">Численное поле паспорта<select aria-label="Численное поле паспорта" className={field} disabled={disabled || posting} value={target} onChange={event => setTarget(event.target.value as NonNullable<Definition['numeric_target']>)}><option value="">Общая правка паспорта без привязки к числу</option><option value="diameter_mm">Максимальный диаметр</option><option value="diameter_upper_deviation_mm">Верхнее отклонение диаметра</option><option value="length_mm">Длина детали</option><option value="length_upper_deviation_mm">Верхнее отклонение длины</option><option value="prescribed_diameter_mm">Назначенный на чертеже диаметр</option></select></label>}
      {dependencies.map((dependency, index) => <fieldset key={index} className="space-y-2 border border-line p-3"><legend className="px-1">Зависимость {index + 1}</legend>
        <label className="block">Зависимый результат {index + 1}<select aria-label={`Зависимый результат ${index + 1}`} className={field} required disabled={disabled || posting} value={dependency.result} onChange={event => updateDependency(index, { result: event.target.value as Dependency['result'] })}><option value="">Выберите результат</option><option value="stock_selection">Подбор заготовки</option><option value="preliminary_route">Предварительный маршрут</option><option value="operation_calculation">Расчёт операции</option><option value="production_acceptance">Производственная приёмка</option></select></label>
        <label className="block">Номер операции {index + 1}<input aria-label={`Номер операции ${index + 1}`} className={field} type="number" min="1" step="1" required={dependency.result === 'operation_calculation'} disabled={disabled || posting} value={dependency.operation} onChange={event => updateDependency(index, { operation: event.target.value })} /><span className="text-xs text-muted">Заполняется только при известной связи с существующей операцией.</span></label>
        <label className="block">Влияние на результат {index + 1}<textarea aria-label={`Влияние на результат ${index + 1}`} className={field} rows={2} required disabled={disabled || posting} value={dependency.explanation} onChange={event => updateDependency(index, { explanation: event.target.value })} /></label>
        <label className="block">Источник зависимости {index + 1}<PublicSourceInput aria-label={`Источник зависимости ${index + 1}`} className={field} required disabled={disabled || posting} value={dependency.source} onChange={event => updateDependency(index, { source: event.target.value })} /></label>
        {dependencies.length > 1 && <Button type="button" variant="ghost" size="sm" disabled={disabled || posting} onClick={() => setDependencies(current => current.filter((_, position) => position !== index))}>Удалить зависимость {index + 1}</Button>}
      </fieldset>)}
      <Button type="button" variant="outline" size="sm" disabled={disabled || posting} onClick={() => setDependencies(current => [...current, emptyDependency()])}>Добавить зависимость</Button>
      {stale && <div className="space-y-2 text-warning"><p>Данные или выбор вопросов изменились. Черновик назначения сохранён; проверьте его применимость.</p><Button type="button" variant="outline" size="sm" disabled={disabled || posting || selectionStale} onClick={() => setReviewed({ revision, ids: questionIds })}>Назначение проверено для текущего выбора</Button></div>}
      {error && <p role="alert" id="clarification-task-assignment-error" className="text-danger">{publicSourceText(error, 'Не удалось сохранить уточнение. Проверьте заполнение полей.')}</p>}
      <p className="text-xs text-muted">Для сохранения нужны название, назначение, действие, основание и хотя бы одна обоснованная зависимость.</p>
      <Button type="submit" aria-describedby={error ? 'clarification-task-assignment-error' : undefined} disabled={disabled || posting || stale || !complete}>Сохранить назначение задачи</Button>
    </form>
  </InfoBlock>;
}
