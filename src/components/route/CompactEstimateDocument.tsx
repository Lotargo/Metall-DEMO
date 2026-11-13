import { InfoBlock } from '@/components/ui/InfoBlock';
import type { components } from '@/api/schema';
import { formatNumber } from '@/utils/compactNumbers';
import { publicSourceText, publicSourceUrl } from '@/utils/publicSource';

type EstimateForm = components['schemas']['CompactEstimateForm'];
type Item = EstimateForm['rows'][number];

export function estimateFormKey(runId: string, revision: number) {
  return ['compact-estimate-form', runId, revision];
}

const sections = [['materials', 'Материалы'], ['works', 'Работы']] as const;
const statusLabels = { complete: 'Полный расчёт', partial: 'Частичный расчёт', unknown: 'Стоимость не определена' };
const basisLabels: Record<string, string> = { source: 'По источнику', estimate: 'Ориентир', mock: 'Демонстрационные цены', unknown: 'Основание не определено' };
const money = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function currencyLabel(value: string | null | undefined) {
  return value === 'RUB' ? '₽' : value ?? '';
}

function amount(value: string | number | null | undefined, currency?: string | null) {
  if (value == null) return 'Не оценено';
  const suffix = currencyLabel(currency);
  const formatted = money.format(Number(value));
  return suffix ? `${formatted} ${suffix}` : formatted;
}

function rowQuantity(row: Item) {
  return row.quantity == null ? 'Не определено' : formatNumber(row.quantity, 6);
}

export function CompactEstimateDocument({ form }: { form: EstimateForm }) {
  const currencies = [...new Set([...form.totals.map(total => total.currency), ...form.rows.map(row => row.currency)].filter(Boolean))];
  const commercialTotals = form.commercial_totals ?? [];
  const demonstration = !commercialTotals.length && form.totals.length === 1 && form.totals[0].price_basis === 'mock' ? form.totals[0] : null;
  const headlines = commercialTotals.length ? commercialTotals : demonstration ? [demonstration] : [];
  const date = form.document_date.split('-').reverse().join('.');
  const hasMaterials = form.rows.some(row => row.section === 'materials');
  return <article className="estimate-document space-y-4" aria-label="Форма сметы">
    <header className="space-y-1">
      <h3 className="text-base font-semibold">Смета № {form.number}</h3>
      <p className="text-ink-secondary">{date} · {statusLabels[form.status]}{currencies.length > 0 && ` · ${currencies.join(', ')}`}</p>
      <p className="break-words">{form.designation || 'Обозначение не определено'} · Редакция чтения {form.drawing_revision ?? 'не определена'} · Партия {form.quantity == null ? 'не определена' : `${formatNumber(form.quantity)} шт.`}</p>
      <p className="text-muted">Трудоёмкость ×{formatNumber(form.labor_coefficient, 6)} · Надбавка ×{formatNumber(form.processing_markup_coefficient, 6)}</p>
      {headlines.length > 0 && <dl className="space-y-1 border-t border-line pt-2 font-semibold tabular-nums">
        {headlines.map(total => {
          const complete = form.status === 'complete' && total.total != null;
          const label = demonstration ? complete ? 'Демонстрационный итог' : 'Демонстрационный подытог' : complete ? 'Итог партии' : 'Подытог';
          return <div key={total.currency} className="flex flex-wrap gap-x-3">
            <dt>{label}</dt><dd>{amount(complete ? total.total : total.subtotal, total.currency)}</dd>
          </div>;
        })}
      </dl>}
    </header>
    <table className="estimate-document-table w-full text-left">
      <caption className="sr-only">Материалы и работы сметы</caption>
      <thead><tr className="border-b border-line text-ink-secondary">
        <th scope="col">№</th><th scope="col">Позиция</th>
        <th scope="col" className="estimate-context-column">Ед.</th>
        <th scope="col" className="estimate-context-column text-right">Количество</th>
        <th scope="col" className="estimate-context-column text-right">Цена за ед.</th>
        <th scope="col" className="text-right">Сумма</th>
      </tr></thead>
      {sections.map(([section, label]) => {
        const rows = form.rows.filter(row => row.section === section);
        if (!rows.length) return null;
        return <tbody key={section}>
          <tr className="bg-surface-muted"><th className="estimate-group-title" scope="rowgroup" colSpan={6}>{label}</th></tr>
          {rows.map(row => <tr key={row.number} className="border-b border-line">
            <td className="text-muted tabular-nums">{row.number}</td>
            <th scope="row" className="font-medium">{row.title}
              {row.price_basis === 'mock' && row.status === 'priced' && <span className="block text-xs font-normal text-muted">Демонстрационная цена</span>}
              <div className="estimate-context-compact mt-1 space-y-0.5 text-xs font-normal text-ink-secondary">
                {row.quantity != null && <p>{rowQuantity(row)}{row.unit && ` ${row.unit}`}</p>}
                {row.unit_price != null && <p>{amount(row.unit_price, row.currency)} за ед.</p>}
              </div>
            </th>
            <td className="estimate-context-column">{row.unit || 'Не определена'}</td>
            <td className="estimate-context-column text-right tabular-nums">{rowQuantity(row)}</td>
            <td className="estimate-context-column text-right tabular-nums">{amount(row.unit_price, row.currency)}</td>
            <td className={`text-right tabular-nums ${row.status === 'unestimated' ? 'font-medium text-warning' : ''}`}>{amount(row.amount, row.currency)}</td>
          </tr>)}
        </tbody>;
      })}
    </table>
    {form.totals.map(total => {
      const commercial = (total.price_basis === 'source' || total.price_basis === 'estimate') && commercialTotals.some(item => item.currency === total.currency);
      const showBasisAmount = total !== demonstration && (!commercial || form.totals.filter(item => item.currency === total.currency && ['source', 'estimate'].includes(item.price_basis)).length > 1);
      const basisLabel = basisLabels[total.price_basis] ?? total.price_basis;
      return <section key={`${total.currency}-${total.price_basis}`} className="space-y-2" aria-label={`Итоги · ${total.currency} · ${basisLabel}`}>
        {(form.totals.length > 1 || !commercial) && <h4 className="font-semibold">{basisLabel} · {total.currency}</h4>}
        <dl className="space-y-1 tabular-nums">
          {([
            ['Материалы', total.materials], ['Работы', total.works], ['Коммерческая надбавка', total.markup],
            ['Резерв', total.reserve],
          ] as const).map(([label, value]) => value != null && (label !== 'Материалы' || hasMaterials) && <div key={label} className="flex flex-wrap justify-between gap-x-2"><dt>{label}</dt><dd>{amount(value, total.currency)}</dd></div>)}
          {showBasisAmount && <div className="flex flex-wrap justify-between gap-x-2 border-t border-line pt-1">
            <dt>{total.total != null && form.status === 'complete' ? 'Итог по основанию' : 'Подытог по основанию'}</dt>
            <dd>{amount(form.status === 'complete' ? total.total ?? total.subtotal : total.subtotal, total.currency)}</dd>
          </div>}
        </dl>
      </section>;
    })}
    {form.rows.some(row => row.source) && <InfoBlock className="space-y-2 border-t border-line pt-2 text-sm" title="Основания цен">

      <ul className="list-disc space-y-1 pl-5">{form.rows.filter(row => row.source).map(row => {
        const url = publicSourceUrl(row.source);
        const label = publicSourceText(row.source, 'Основание цены сохранено');
        return <li key={row.number} className="break-words">{row.number}. {row.title} · {url ? <a className="text-accent underline" href={url}>{label}</a> : label}</li>;
      })}</ul>
    </InfoBlock>}
    <p className="text-xs text-muted">Редакция формы {form.form_version}</p>
  </article>;
}
