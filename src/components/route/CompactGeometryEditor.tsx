import { InfoBlock } from '@/components/ui/InfoBlock';
import { useRef, useState } from 'react';
import type { components } from '@/api/schema';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { passportExplanation } from '@/utils/compactDrawingEvidence';
import { publicSourceText } from '@/utils/publicSource';

type State = components['schemas']['CompactState'];
type Correction = components['schemas']['CompactGeometryCorrection'];

const decimal = /^\+?\d+(?:[.,]\d+)?$/;
const depthRoles: Record<string, string> = {
  thread_depth: 'Глубина резьбы',
  cylindrical_depth: 'От входа до конца цилиндрического участка',
  tip_depth: 'От входа до вершины конического дна',
};

export function CompactGeometryEditor({ state, busy, unavailable, onSave, pageCount }: {
  state: State;
  busy: boolean;
  unavailable: string | null;
  onSave: (correction: Correction) => Promise<boolean>;
  pageCount?: number;
}) {
  const [draft, setDraft] = useState<(Omit<Correction, 'value'> & { value: string }) | null>(null);
  const selector = useRef<HTMLSelectElement>(null);
  const measurements = state.geometry?.snapshot.measurements ?? [];
  const elements = state.geometry?.snapshot.elements ?? [];
  const candidates = measurements.flatMap(measurement => {
    const row = state.reading?.dimensions[measurement.row_index];
    const owner = elements.find(element => element.id === measurement.element_ids[0]);
    return row && decimal.test(row.text.trim()) && measurement.element_ids.length === 1
      && measurements.filter(item => item.row_index === measurement.row_index).length === 1
      && measurement.applicability === 'nominal' && measurement.unit === 'mm'
      && measurement.role in depthRoles && owner?.kind === 'end_hole' && owner.side
      && owner.links.some(link => link.role === measurement.role && link.measurement_id === measurement.id && link.status === 'confirmed')
      && measurement.value != null ? [{ measurement, row, owner }] : [];
  });
  const active = candidates.find(item => item.measurement.id === draft?.measurement_id);
  const disabled = busy || unavailable !== null;
  const stale = draft !== null && draft.expected_revision !== state.revision;
  const amount = draft?.value.trim() ?? '';
  const invalidAmount = amount !== '' && (!decimal.test(amount) || !/[1-9]/.test(amount));

  function choose(measurementId: string) {
    const selected = candidates.find(item => item.measurement.id === measurementId);
    setDraft(selected ? {
      expected_revision: state.revision,
      measurement_id: measurementId,
      value: selected.row.text.trim(),
      source: '',
      reason: '',
    } : null);
  }

  function clear() {
    setDraft(null);
    selector.current?.focus();
  }

  async function save() {
    if (!draft || !active || stale || disabled || !amount || invalidAmount || !draft.source.trim() || !draft.reason.trim()) return;
    const saved = await onSave({
      ...draft,
      value: amount.replace(',', '.'),
      source: draft.source.trim(),
      reason: draft.reason.trim(),
    });
    if (saved) clear();
  }

  if (!candidates.length && !state.geometry_issue && !draft) return null;

  return <section aria-labelledby="compact-geometry-heading" className="compact-workspace-card space-y-3 text-sm">
    <h3 id="compact-geometry-heading" className="font-semibold">Геометрические связи</h3>
    {state.geometry_issue && <div className="space-y-2 rounded-md bg-warning-soft p-3">
      <p role="status">Проверьте геометрические связи по чертежу. Часть размеров и их привязок может требовать уточнения.</p>
      <InfoBlock className="text-xs" title="Техническая причина">
        <p className="mt-2 whitespace-pre-wrap break-words">{state.geometry_issue}</p>
      </InfoBlock>
    </div>}
    {(candidates.length > 0 || draft) && <InfoBlock className="rounded-md border border-line p-3" title="Размер и геометрические связи">

      <div className="mt-3 space-y-3">
        <p className="text-muted">Выберите строку, если требуется исправить размер уже привязанного элемента. Сохранение обновит размер и зависимые связи. Построение карты запускается отдельно.</p>
        {unavailable && <p className="text-muted">{unavailable}</p>}
        <Select ref={selector} label="Размер для правки" value={active?.measurement.id ?? ''}
          onChange={event => choose(event.target.value)} disabled={disabled}
          options={[{ value: '', label: 'Выберите размер' }, ...candidates.map(({ measurement, row }) => ({
            value: measurement.id,
            label: `${measurement.row_index + 1}. ${row.kind} (${row.text})`,
          }))]} />
        {stale && <p role="alert" className="text-warning">Данные обновились. Сбросьте черновик и выберите размер в новой редакции.</p>}
        {draft && active && <form className="space-y-3" onSubmit={event => { event.preventDefault(); void save(); }}>
          <p><strong>Строка {active.measurement.row_index + 1} · {active.row.kind} · {active.row.text} мм</strong></p>
          <p>{depthRoles[active.measurement.role]} · {active.owner.side === 'left' ? 'Левый торец' : 'Правый торец'}</p>
          <p>{passportExplanation(publicSourceText(active.owner.source, ''), pageCount)}</p>
          {active.owner.links.filter(link => link.status !== 'confirmed' && link.reason).map(link =>
            <p key={link.role} className="text-muted">{passportExplanation(publicSourceText(link.reason, ''), pageCount)}</p>)}
          <Input label="Новый размер, мм"
            value={draft.value} inputMode="decimal" onChange={event => setDraft({ ...draft, value: event.target.value })}
            disabled={disabled || stale} required error={invalidAmount ? 'Введите положительное число.' : undefined} />
          <Input label="Точный адрес на чертеже" value={draft.source}
            onChange={event => setDraft({ ...draft, source: event.target.value })}
            required pattern={'.*\\S.*'} disabled={disabled || stale} helperText="Укажите лист, вид или разрез и место размерной надписи." />
          <Input label="Причина правки" value={draft.reason}
            onChange={event => setDraft({ ...draft, reason: event.target.value })}
            required pattern={'.*\\S.*'} disabled={disabled || stale} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" loading={busy} disabled={disabled || stale || invalidAmount}>Сохранить связь</Button>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={clear}>Сбросить черновик</Button>
          </div>
        </form>}
        {draft && !active && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={clear}>Сбросить черновик</Button>}
      </div>
    </InfoBlock>}
  </section>;
}
