import { useId, useState } from 'react';
import type { components } from '@/api/schema';
import { apiClient } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { asRecord } from '@/utils/compactNumbers';
import { publicSourceText } from '@/utils/publicSource';

type State = components['schemas']['CompactState'];
type Impact = 'review_required' | 'independent' | 'dependent';

export function CompactQuantityEditor({ runId, state, disabled = false, onSaved }: {
  runId: string; state: State; disabled?: boolean; onSaved: (state: State) => void;
}) {
  const impactId = useId();
  const [editing, setEditing] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [impact, setImpact] = useState<Impact>('review_required');
  const [comment, setComment] = useState('');
  const [revision, setRevision] = useState(state.revision);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const review = asRecord(asRecord(state).quantity_review);
  const valid = quantity.trim() === '' || (/^[1-9]\d*$/.test(quantity.trim()) && Number.isSafeInteger(Number(quantity)));
  const changed = quantity.trim() !== (state.quantity?.toString() ?? '')
    || (!!review.impact && impact !== review.impact) || !!comment.trim();
  const stale = revision !== state.revision;

  async function save() {
    if (!valid || stale || !changed || busy) return;
    setBusy(true); setError('');
    try {
      const result = await apiClient.POST('/api/v1/runs/{run_id}/compact-round/quantity', {
        params: { path: { run_id: runId } },
        body: { expected_revision: revision, quantity: quantity.trim() === '' ? null : Number(quantity), impact, comment },
      });
      if (result.error || !result.data) {
        const detail = asRecord(result.error).detail;
        throw new Error(typeof detail === 'string' ? detail : 'Не удалось сохранить количество. Обновите состояние и повторите действие.');
      }
      onSaved(result.data); setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить количество.');
    } finally { setBusy(false); }
  }

  return <section aria-label="Количество деталей" className="space-y-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p>Количество деталей: {state.quantity == null ? 'не определено' : `${state.quantity} шт.`}</p>
      {!editing && <Button size="sm" variant="outline" disabled={disabled} onClick={() => {
        setQuantity(state.quantity?.toString() ?? ''); setRevision(state.revision);
        setImpact(review.impact === 'independent' || review.impact === 'dependent' ? review.impact : 'review_required'); setComment(''); setError(''); setEditing(true);
      }}>Изменить количество</Button>}
    </div>
    {editing && <form className="space-y-3 rounded-md border border-line p-3" onSubmit={event => { event.preventDefault(); void save(); }}>
      <Input label="Количество деталей в партии" type="number" min={1} step={1} value={quantity}
        onChange={event => setQuantity(event.target.value)} disabled={busy || disabled}
        error={!valid ? 'Введите целое положительное число или оставьте поле пустым.' : undefined}
        helperText="Пустое поле сохраняет неизвестное количество. Размеры и исходное чтение не меняются." />
      <div className="space-y-1"><label htmlFor={impactId}>Влияние количества на технологию</label>
        <select id={impactId} className="w-full rounded-md border border-control bg-surface px-3 py-2 text-sm text-ink" value={impact}
          onChange={event => setImpact(event.target.value as Impact)} disabled={busy || disabled}>
          <option value="review_required">Ещё не проверено</option>
          <option value="independent">Не меняет карту, оборудование и установы</option>
          <option value="dependent">Нужна новая карта, оборудование или установы</option>
        </select>
      </div>
      <p className="text-xs text-muted">{impact === 'independent'
        ? 'Это явное решение сохранить инженерные входы. Доступные результаты на партию пересчитаются без моделей; прежнее подтверждение детализации снимется.'
        : impact === 'dependent' ? 'Прежняя карта и результаты останутся для сравнения. Новая карта запускается отдельной командой.'
          : 'Результаты на одну деталь сохранятся. Зависимые суммы партии не будут выданы за актуальные до проверки влияния количества.'}</p>
      <Input label="Пояснение к изменению количества (необязательно)" value={comment} onChange={event => setComment(event.target.value)} disabled={busy || disabled} />
      {stale && <p role="alert" className="text-warning">Данные обновились после начала правки. Черновик сохранён; закройте форму и откройте её по новой редакции.</p>}
      {error && <p role="alert" className="text-danger">{publicSourceText(error, 'Не удалось сохранить количество. Проверьте исходное значение.')}</p>}
      <div className="flex flex-wrap gap-2"><Button type="submit" size="sm" loading={busy} disabled={disabled || !valid || stale || !changed}>Сохранить количество</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setEditing(false)}>Отмена</Button></div>
    </form>}
    {!editing && !!review.impact && <p className="text-muted">{review.impact === 'independent'
      ? 'Количество обновлено без изменения карты, оборудования и установов по явному решению оператора. Прежние инженерные основания сохранены.'
      : review.impact === 'dependent' ? 'Прежняя карта и результаты сохранены для сравнения. Изменение количества требует новой предварительной карты.'
        : 'Результаты на одну деталь сохранены. Влияние количества на карту, оборудование и установы ещё не проверено; суммы партии ограничены.'}</p>}
  </section>;
}
