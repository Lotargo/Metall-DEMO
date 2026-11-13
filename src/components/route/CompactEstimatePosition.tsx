import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import type { components } from '@/api/schema';
import { formatNumber } from '@/utils/compactNumbers';
import { publicSourceText } from '@/utils/publicSource';
import { PublicSourceInput } from './PublicSourceInput';

type State = components['schemas']['CompactState'];
type Position = components['schemas']['CompactEstimatePosition'];
type Operation = { index: number; title: string };

const inputClass = 'w-full rounded-md border border-control bg-surface px-3 py-2';
const moneyFormat = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rubles = (value: string) => `${moneyFormat.format(Number(value))} ₽`;
const moneyPattern = '[0-9]{1,7}([.,][0-9]{1,2})?';

function PositionForm({ value, runId, enabled, operations, initial, focusSummary }: {
  value: State; runId: string; enabled: boolean; operations: Operation[]; initial?: Position; focusSummary: (revision: number) => void;
}) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const field = (name: string) => String(fields.get(name) ?? '').trim();
    const decimal = (name: string) => field(name).replace(',', '.');
    const scope = field('scope');
    const priceSource = field('price_source');
    if (!scope || !priceSource) {
      setError('Укажите объём работ и основание цены.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data, error } = await apiClient.PUT('/api/v1/runs/{run_id}/compact-round/estimate-position', {
        params: { path: { run_id: runId } },
        body: {
          expected_revision: value.revision,
          position: {
            operation_index: Number(field('operation_index')),
            scope,
            quantity: Number(field('quantity')),
            unit_price_rub: decimal('unit_price_rub'),
            price_source: priceSource,
            reserve_rub: decimal('reserve_rub') || null,
          },
        },
      });
      if (error || !data) {
        throw new Error(typeof error === 'object' && error && 'detail' in error && typeof error.detail === 'string'
          ? error.detail : 'Проверьте поля позиции и повторите сохранение.');
      }
      if (data.estimate_position) focusSummary(data.estimate_position.saved_revision);
      client.setQueryData<State>(['compact-round', runId], current =>
        current && current.revision > data.revision ? current : data);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Позицию не удалось сохранить.');
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={event => void save(event)} aria-label="Условия позиции сметы" aria-busy={busy}>
    <fieldset disabled={!enabled || busy} className="space-y-3">
      <legend className="font-medium">{initial ? 'Изменить условия' : 'Задать условия'}</legend>
      <div className="space-y-1">
        <label htmlFor="estimate-position-operation" className="block">Операция</label>
        <select id="estimate-position-operation" name="operation_index" required defaultValue={initial?.operation_index ?? ''} className={inputClass}>
          <option value="">Выберите операцию</option>
          {operations.map(({ index, title }) => <option key={index} value={index}>{index + 1}. {title}</option>)}
        </select>
      </div>
      <label className="block space-y-1">
        <span>Объём работ в цене</span>
        <textarea name="scope" required rows={2} maxLength={1000} defaultValue={initial?.scope}
          className={inputClass} aria-describedby="estimate-position-scope-hint" />
      </label>
      <p id="estimate-position-scope-hint" className="text-xs text-muted">Укажите конкретные работы, границы цены и кто предоставляет материал.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span>Количество деталей для позиции</span>
          <input name="quantity" type="number" min={1} max={1000000} step={1} required
            defaultValue={initial?.quantity ?? value.quantity ?? ''} className={inputClass} />
        </label>
        <label className="block space-y-1">
          <span>Цена за деталь, ₽</span>
          <input name="unit_price_rub" inputMode="decimal" required pattern={moneyPattern}
            title="До семи цифр до запятой и до двух после неё" defaultValue={initial?.unit_price_rub} className={inputClass} />
        </label>
      </div>
      <label className="block space-y-1">
        <span>Основание цены</span>
        <PublicSourceInput name="price_source" required maxLength={300} defaultValue={initial?.price_source} className={inputClass} />
      </label>
      <label className="block space-y-1">
        <span>Резерв на позицию, ₽</span>
        <input name="reserve_rub" inputMode="decimal" pattern={moneyPattern}
          title="До семи цифр до запятой и до двух после неё" defaultValue={initial?.reserve_rub ?? ''}
          className={inputClass} aria-describedby="estimate-position-reserve-hint" />
      </label>
      <p id="estimate-position-reserve-hint" className="text-xs text-muted">Сумма на весь объём позиции. Пустое поле оставляет резерв открытым. Ноль фиксирует решение считать без резерва.</p>
      <button type="submit" className="primary-action" disabled={!enabled || busy}>{busy ? 'Сохранение…' : 'Сохранить позицию'}</button>
    </fieldset>
    {error && <p role="alert" className="passport-error">{publicSourceText(error, 'Не удалось сохранить позицию. Проверьте исходные значения.')}</p>}
  </form>;
}

export function CompactEstimatePosition({ value, runId, enabled }: { value: State; runId: string; enabled: boolean }) {
  const summary = useRef<HTMLTableElement>(null);
  const focusRevision = useRef<number | null>(null);
  const saved = value.estimate_position;
  const savedRevision = saved?.saved_revision;
  useEffect(() => {
    if (focusRevision.current === savedRevision) {
      summary.current?.focus();
      focusRevision.current = null;
    }
  }, [savedRevision]);

  function focusSummary(revision: number) {
    if (revision === savedRevision) summary.current?.focus();
    else focusRevision.current = revision;
  }

  const indexes = new Set(value.details.map(detail => detail.operation_index));
  const operations = value.route?.operations.flatMap((operation, index) => indexes.has(index)
    ? [{ index, title: operation.title }] : []) ?? [];
  if (operations.length === 0 && !saved) return null;
  const stale = saved && (saved.reading_revision !== value.reading_revision || saved.route_revision !== value.route_revision
    || saved.drawing_designation !== value.reading?.designation.text
    || !operations.some(operation => operation.index === saved.operation_index && operation.title === saved.operation_title));
  const canSave = enabled && Boolean(value.reading) && operations.length > 0;
  const initial = stale ? undefined : saved ?? undefined;

  return <section className="space-y-3" aria-label="Черновик сметы на одну позицию">
    <h3 className="font-medium text-balance">Черновик сметы на одну позицию</h3>
    <p className="text-sm text-muted text-pretty">Ручная цена относится к указанному объёму. Расчёт всего маршрута, инженерное время и применимость станка ведутся отдельно.</p>
    {saved && <>
      {stale && <p role="status" className="text-sm text-warning">Позиция относится к прежней редакции. Для текущих данных задайте условия заново.</p>}
      <table ref={summary} tabIndex={-1} className="estimate-summary-table">
        <caption className="sr-only">{stale ? 'Позиция прежней редакции' : 'Сохранённая позиция сметы'}</caption>
        <tbody>
          <tr><th scope="row">Деталь</th><td>{saved.drawing_designation || 'Обозначение не определено'}</td></tr>
          <tr><th scope="row">Операция и объём</th><td><p>{saved.operation_title}</p><p className="whitespace-pre-wrap break-words">{saved.scope}</p></td></tr>
          <tr><th scope="row">Количество и цена за деталь</th><td className="tabular-nums">{formatNumber(saved.quantity, 0)} шт. × {rubles(saved.unit_price_rub)}<p className="break-words text-xs text-muted">{publicSourceText(saved.price_source, 'Основание цены сохранено')}</p></td></tr>
          <tr><th scope="row">Подытог по позиции</th><td className="tabular-nums">{rubles(saved.subtotal_rub)}</td></tr>
          <tr><th scope="row">Резерв</th><td className="tabular-nums">{saved.reserve_rub == null ? 'Требует решения' : rubles(saved.reserve_rub)}</td></tr>
          <tr><th scope="row">Итог по позиции</th><td className="tabular-nums">{saved.total_rub == null ? 'Требует решения по резерву' : rubles(saved.total_rub)}</td></tr>
        </tbody>
      </table>
    </>}
    {!canSave && <p className="text-sm text-muted">Сохранение доступно после получения применимых результатов операции.</p>}
    {operations.length > 0 && <PositionForm key={`${runId}:${value.reading_revision}:${value.route_revision}:${initial?.saved_revision}`}
      value={value} runId={runId} enabled={canSave} operations={operations} initial={initial}
      focusSummary={focusSummary} />}
  </section>;
}
