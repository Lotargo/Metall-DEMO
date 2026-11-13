import type { components } from '@/api/schema';
import { formatNumber } from '@/utils/compactNumbers';
import { estimatePriceText } from './CompactEstimatePriceTable';

type Table = components['schemas']['CompactEstimateTable'];
type Form = components['schemas']['CompactEstimateForm'];

export function EstimatePrintDocument({ table, form, order }: { table: Table; form?: Form | null; order: boolean }) {
  const scope = order && table.order ? table.order : table.per_piece;
  const count = scope.sections.reduce((total, section) => total + section.rows.length, 0);
  const condensed = count > 55;
  let number = 0;
  return <article className="estimate-paper" aria-label="Печатная форма сметы">
    <header className="estimate-paper-heading">
      <h1>Смета производственных работ{form && ` № ${form.number}`}</h1>
      {form && <p>от {new Date(`${form.document_date}T00:00:00`).toLocaleDateString('ru-RU')}</p>}
    </header>
    <dl className="estimate-paper-meta">
      <div><dt>Деталь</dt><dd>{table.part_name || 'Не определено'}</dd></div>
      <div><dt>Обозначение</dt><dd>{table.designation || 'Не определено'}</dd></div>
      <div><dt>Объём</dt><dd>{order && table.order ? `${formatNumber(table.order.quantity)} шт. в заказе` : 'На одну деталь'}</dd></div>
      <div><dt>Валюта</dt><dd>{table.currencies.join(', ')}</dd></div>
    </dl>
    <table className="estimate-paper-table">
      <thead><tr><th>№</th><th>Наименование работ</th><th>Ед.</th><th>Количество</th><th>Цена за ед.</th><th>Сумма</th></tr></thead>
      {scope.sections.map(section => <tbody key={section.id}>
        <tr className="estimate-paper-group"><th colSpan={6}>{section.title}</th></tr>
        {condensed ? <>
          {section.subtotals.map((total, i) => <tr key={i}>
            <td>{++number}</td><th scope="row">Работы раздела · {section.rows.filter(row => row.amount != null && row.currency === total.currency && row.demonstration === total.demonstration).length} позиций{total.demonstration ? ' · расчётный образец' : ''}</th>
            <td>компл.</td><td>1</td><td>{estimatePriceText(total.amount, total.currency)}</td><td>{estimatePriceText(total.amount, total.currency)}</td>
          </tr>)}
          {section.rows.some(row => row.amount == null) && <tr><td>—</td><td>Работы без установленной цены · {section.rows.filter(row => row.amount == null).length}</td><td colSpan={4}>Не оценены</td></tr>}
        </> : section.rows.map(row => <tr key={row.key}>
          <td>{++number}</td><th scope="row">{row.title}{row.demonstration && ' · расчётный образец'}</th><td>{row.unit}</td>
          <td>{formatNumber(row.quantity, 8)}</td><td>{estimatePriceText(row.unit_price, row.currency, 8)}</td><td>{estimatePriceText(row.amount, row.currency)}</td>
        </tr>)}
        <tr className="estimate-paper-subtotal"><th colSpan={5}>{section.status === 'complete' ? 'Итого по разделу' : 'Оценено по разделу'}</th>
          <td>{section.subtotals.length ? section.subtotals.map((sum, i) => <div key={i}>{estimatePriceText(sum.amount, sum.currency)}{sum.demonstration && ' · образец'}</div>) : 'Не оценено'}</td>
        </tr>
      </tbody>)}
    </table>
    <section className="estimate-paper-total" aria-label="Итог печатной формы">
      <h2>{scope.status === 'complete' ? 'Итого по смете' : 'Подытог оценённых работ'}</h2>
      <div>{scope.totals.length ? scope.totals.map((sum, i) => <p key={i}>{estimatePriceText(sum.amount, sum.currency)}{sum.demonstration && ' · расчётный образец'}</p>) : 'Не определено'}</div>
    </section>
    {scope.status !== 'complete' && <p className="estimate-paper-open">Полная стоимость не определена. Неоценённые работы в подытог не входят.</p>}
    {scope.reserve_open && <p className="estimate-paper-open">Резерв требует решения.</p>}
    <footer className="estimate-paper-signatures"><span>Составил: ____________________</span><span>Проверил: ____________________</span></footer>
  </article>;
}
