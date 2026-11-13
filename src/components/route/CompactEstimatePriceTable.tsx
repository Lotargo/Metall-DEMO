import { useState } from 'react';
import type { components } from '@/api/schema';
import { Button } from '@/components/ui/Button';
import { formatNumber } from '@/utils/compactNumbers';
import { estimateOperatorText } from './estimateOperatorText';
import { Link } from 'react-router-dom';
import { runDocumentLink } from '@/utils/runDocumentLinks';

type Table = components['schemas']['CompactEstimateTable'];
type Form = components['schemas']['CompactEstimateForm'];
type Sum = components['schemas']['PriceTableSum'];

export function estimatePriceText(value: string | null, currency: string | null, precision = 2) {
  if (value == null || currency == null) return '—';
  const formatter = new Intl.NumberFormat('ru-RU', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: precision });
  const [coefficient, exponent = '0'] = value.toLowerCase().split('e');
  const decimals = (coefficient.split('.')[1]?.length ?? 0) - Number(exponent);
  if (precision > 2 && decimals > precision) {
    const symbol = formatter.formatToParts(0).find(part => part.type === 'currency')?.value ?? currency;
    return `${value.replace('.', ',')}\u00a0${symbol}`;
  }
  return formatter.format(Number(value));
}
const amount = estimatePriceText;

function PriceSums({ totals }: { totals: Sum[] }) {
  if (!totals.length) return <span className="text-muted">—</span>;
  return <>{totals.map(total => <p key={`${total.currency}-${total.demonstration}`} className="tabular-nums">
    {amount(total.amount, total.currency)}{total.demonstration && ' · демонстрационная цена'}
  </p>)}</>;
}

export function CompactEstimatePriceTable({ table, form, runId, showOrder: selectedScope, onScopeChange }: { table: Table; form?: Form | null; runId?: string; showOrder?: boolean; onScopeChange?: (order: boolean) => void }) {
  const [localScope, setLocalScope] = useState(Boolean(table.order));
  const showOrder = selectedScope ?? localScope;
  function setShowOrder(order: boolean) { setLocalScope(order); onScopeChange?.(order); }
  const scope = showOrder && table.order ? table.order : table.per_piece;
  const rows = scope.sections.flatMap(section => section.rows);
  const conditions = [...new Set(rows.flatMap(row => row.reason ? estimateOperatorText(row.reason) ?? [] : []))];
  let number = 0;
  return <article className="space-y-4" aria-label="Таблица сметы">
    <header className="space-y-1">
      <h3 className="font-semibold">Смета производственных работ{form && ` № ${form.number} от ${new Date(`${form.document_date}T00:00:00`).toLocaleDateString('ru-RU')}`}</h3>
      <p>{[table.part_name, table.designation].filter(Boolean).join(' · ') || 'Деталь'}</p>
      <p className="text-muted">{showOrder && table.order ? `Заказ · ${formatNumber(table.order.quantity)} шт.` : 'На одну деталь'} · {table.currencies.join(', ')}</p>
      {table.order ? <div className="flex flex-wrap gap-2 pt-2 print:hidden" role="group" aria-label="Объём сметы">
        <Button size="sm" variant={showOrder ? 'outline' : 'secondary'} aria-pressed={!showOrder} onClick={() => setShowOrder(false)}>На одну деталь</Button>
        <Button size="sm" variant={showOrder ? 'secondary' : 'outline'} aria-pressed={showOrder} onClick={() => setShowOrder(true)}>На заказ · {formatNumber(table.order.quantity)} шт.</Button>
      </div> : <p className="text-sm text-muted">Количество заказа не задано. Наладка на партию показана отдельно и на деталь не распределена.</p>}
    </header>
    <div className="estimate-table-scroll" tabIndex={0} role="region" aria-label="Смета производственных работ">
      <table className="estimate-document-table estimate-price-table w-full text-left">
        <caption className="sr-only">Номер, наименование работ, единица, количество, цена и сумма</caption>
        <colgroup><col className="estimate-number-track" /><col /><col className="estimate-unit-track" /><col className="estimate-quantity-track" /><col className="estimate-price-track" /><col className="estimate-amount-track" /></colgroup>
        <thead><tr className="border-b border-line">
          <th scope="col">№</th><th scope="col">Наименование работ</th><th scope="col">Ед.</th>
          <th scope="col" className="text-right">Количество</th><th scope="col" className="text-right">Цена за ед.</th><th scope="col" className="text-right">Сумма</th>
        </tr></thead>
        {scope.sections.map(section => <tbody key={section.id}>
          <tr className="bg-surface-muted"><th scope="rowgroup" colSpan={6} className="estimate-group-title">{section.title}</th></tr>
          {section.rows.map(row => <tr key={row.key} className="border-b border-line">
            <td className="tabular-nums text-muted">{++number}</td>
            <th scope="row" className="font-medium">{row.operation_number != null && <span className="text-muted">Операция {row.operation_number} · </span>}{row.title}
              {runId && row.operation_number != null && <Link className="estimate-operation-link document-screen-only" to={runDocumentLink(runId, 'route', `compact-operation-${row.operation_number - 1}`)}>Открыть операцию</Link>}
              {row.amount == null && <p className="mt-1 text-xs font-normal text-muted">{estimateOperatorText(row.reason ?? '') || (row.minutes == null ? 'Трудоёмкость не определена' : 'Не задана расчётная ставка')}</p>}
              {row.amount != null && estimateOperatorText(row.reason ?? '') && <p className="mt-1 text-xs font-normal text-muted">{estimateOperatorText(row.reason ?? '')}</p>}
            </th>
            <td>{row.unit || '—'}</td><td className="text-right tabular-nums">{row.quantity == null ? '—' : formatNumber(row.quantity, 4)}</td>
            <td className="text-right tabular-nums">{amount(row.unit_price, row.currency, 8)}</td>
            <td className="text-right tabular-nums">{amount(row.amount, row.currency)}</td>
          </tr>)}
          <tr className="font-medium"><th scope="row" colSpan={5}>{section.status === 'complete' ? 'Итого по разделу' : section.status === 'unknown' ? 'Не оценено по разделу' : 'Оценено по разделу'}</th><td className="text-right"><PriceSums totals={section.subtotals} /></td></tr>
        </tbody>)}
      </table>
    </div>
    <section className="flex flex-wrap justify-between gap-3 border-t border-line pt-3" aria-label="Итог сметы">
      <div><h3 className="font-semibold">{scope.status === 'complete' ? 'Итого по смете' : 'Подытог оценённых работ'}</h3>
        {(scope.status !== 'complete' || scope.reserve_open) && <p className="text-xs text-muted">{scope.status !== 'complete' && 'Открытые работы в подытог не входят.'}{scope.reserve_open && ' Резерв не определён.'}</p>}
      </div><div className="text-right font-semibold"><PriceSums totals={scope.totals} /></div>
    </section>
    <section className="space-y-1 text-xs text-muted" aria-label="Условия сметы">
      <p>Ручные работы, наладка и ОТК могут содержать ориентировочное время. Пригодность оборудования проверяется отдельно от расчётной ставки.</p>
      {conditions.slice(0, 5).map(condition => <p key={condition}>{condition}</p>)}
      {conditions.length > 5 && <p>Остальные открытые условия указаны у работ и в полном маршруте.</p>}
    </section>
  </article>;
}
