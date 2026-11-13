import { InfoBlock } from '@/components/ui/InfoBlock';
import type { ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Printer, RefreshCw, SlidersHorizontal } from 'lucide-react';
import type { components } from '@/api/schema';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { formatNumber } from '@/utils/compactNumbers';
import { runDocumentLink } from '@/utils/runDocumentLinks';
import { CompactStockResult } from './CompactStockResult';
import { stockChoiceView } from './CompactStockChoice';
import { CompactEstimatePriceTable } from './CompactEstimatePriceTable';

type State = components['schemas']['CompactState'];
type Table = components['schemas']['CompactEstimateTable'];
type Form = components['schemas']['CompactEstimateForm'];
const sections = [
  { id: 'main', label: 'Основное' }, { id: 'stock', label: 'Заготовка и расход' },
  { id: 'works', label: 'Работы' }, { id: 'rates', label: 'Ставки и наценка' },
  { id: 'extras', label: 'Нормы и резерв' }, { id: 'totals', label: 'Итоги' },
];
const rubles = (amount: string, currency: string) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency }).format(Number(amount));
function Totals({ totals }: { totals?: components['schemas']['PriceTableSum'][] }) {
  return totals?.length ? <>{totals.map((item, i) => <span key={i}>{rubles(item.amount, item.currency)}{item.demonstration && ' · образец'}</span>)}</> : <>Не определено</>;
}

export function EstimateDocumentWorkspace({ runId, value, form, table, notices, quantityEditor, rates, works, extras, summary, busy, canSave, dirty, onSave, onRefresh, retryTable }: {
  runId: string; value: State; form?: Form | null; table?: Table | null; notices: ReactNode; quantityEditor?: ReactNode;
  rates: ReactNode; works: ReactNode; extras: ReactNode; summary: ReactNode;
  busy: boolean; canSave: boolean; dirty: boolean; onSave: () => void; onRefresh: () => void; retryTable?: ReactNode;
}) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const section = sections.some(item => item.id === params.get('section')) ? params.get('section')! : 'main';
  const showOrder = params.get('basis') !== 'piece' && !!table?.order;
  function choose(id: string) { setParams(current => { const next = new URLSearchParams(current); next.set('section', id); return next; }); }
  const time = value.time_estimate;
  return <section className="estimate-document-workspace compact-cost-estimate">
    <div className="document-toolbar document-screen-only">
      <Button icon={<RefreshCw size={16} />} disabled={!canSave} loading={busy} onClick={onSave}>Пересчитать и сохранить</Button>
      <Button variant="outline" icon={<Printer size={16} />} disabled={!table || dirty || !!value.calculation_pending}
        onClick={() => navigate(`${runDocumentLink(runId, 'estimate')}/print?basis=${showOrder ? 'order' : 'piece'}`)}>Печатная форма</Button>
      <Button variant="outline" icon={<SlidersHorizontal size={16} />} onClick={() => choose('rates')}>Ставки и наценка</Button>
      <Button variant="ghost" onClick={onRefresh}>Обновить</Button>
      <span className="document-state">{dirty ? 'Есть несохранённая надбавка' : value.cost_estimate ? 'Сохранённая смета' : 'Смета ещё не рассчитана'}</span>
    </div>
    <div className="document-metrics document-screen-only">
      <div><span>{table?.per_piece.status === 'complete' ? 'Стоимость на деталь' : 'Оценено на деталь'}</span><strong><Totals totals={table?.per_piece.totals} /></strong><small>По сохранённым условиям</small></div>
      <div><span>{table?.order?.status === 'complete' ? 'Стоимость заказа' : 'Оценено на заказ'}</span><strong><Totals totals={table?.order?.totals} /></strong><small>{value.quantity == null ? 'Количество не задано' : `${formatNumber(value.quantity)} шт. в заказе`}</small></div>
      <div><span>{time?.full_batch_minutes == null ? 'Известное время заказа' : 'Время заказа'}</span><strong>{formatNumber(time?.full_batch_minutes ?? time?.known_batch_minutes)} <small>мин</small></strong><small>{time?.full_batch_minutes == null ? 'Полная оценка пока открыта' : 'Включая работы на партию'}</small></div>
      <div><span>Операции маршрута</span><strong>{value.route?.operations.length ?? value.details.length}</strong><small>{table ? `${table.per_piece.sections.flatMap(item => item.rows).length} позиций в смете` : 'Позиции появятся после расчёта'}</small></div>
    </div>
    <div className="document-notices document-screen-only">{notices}</div>
    <div className="document-sheet">
      <Tabs id="estimate-document-tabs" aria-label="Разделы сметы" layout="wrap" items={sections} activeId={section} onChange={choose} />
      <section className="document-panel space-y-5" id="estimate-document-tabs-panel-main" role="tabpanel" aria-labelledby="estimate-document-tabs-tab-main" tabIndex={0} data-estimate-panel="main" hidden={section !== 'main'} aria-label="Основное">
        <div><h2 className="document-section-title">Реквизиты сметы</h2><p className="document-help">Документ составляется по сохранённому маршруту и расчётам детали.</p></div>
        <dl className="document-fields">
          {[
            ['Номер документа', form?.number ?? 'Появится при подготовке печати'],
            ['Дата', form ? new Date(`${form.document_date}T00:00:00`).toLocaleDateString('ru-RU') : 'Не задана'],
            ['Деталь', value.reading?.part_name.text || 'Не определено'],
            ['Обозначение', value.reading?.designation.text || 'Не определено'],
            ['Материал по чертежу', value.reading?.material.text || 'Не определено'],
            ['Маршрут', value.route_revision == null ? 'Ещё не составлен' : `Редакция ${value.route_revision}`],
          ].map(([label, text]) => <div key={label}><dt>{label}</dt><dd>{text}</dd></div>)}
        </dl>
        {quantityEditor}
        <Link className="secondary-action" to={runDocumentLink(runId, 'route')}>Открыть полный маршрут</Link>
      </section>
      <section className="document-panel space-y-5" id="estimate-document-tabs-panel-stock" role="tabpanel" aria-labelledby="estimate-document-tabs-tab-stock" tabIndex={0} data-estimate-panel="stock" hidden={section !== 'stock'} aria-label="Заготовка и расход">
        <h2 className="document-section-title">Заготовка и расход материала</h2>
        <p className="document-help">Стоимость прутка не включается в цену производственных работ. Здесь показаны размеры, расход и остатки.</p>
        <CompactStockResult state={value} geometry={stockChoiceView(value).geometry} showCalculationDetails
          onOpenRoute={() => navigate(runDocumentLink(runId, 'route', 'compact-stock-route-evidence'))} />
      </section>
      <section className="document-panel space-y-5" id="estimate-document-tabs-panel-works" role="tabpanel" aria-labelledby="estimate-document-tabs-tab-works" tabIndex={0} data-estimate-panel="works" hidden={section !== 'works'} aria-label="Работы">{works}</section>
      <section className="document-panel space-y-5" id="estimate-document-tabs-panel-rates" role="tabpanel" aria-labelledby="estimate-document-tabs-tab-rates" tabIndex={0} data-estimate-panel="rates" hidden={section !== 'rates'} aria-label="Ставки и наценка">{rates}</section>
      <section className="document-panel space-y-5" id="estimate-document-tabs-panel-extras" role="tabpanel" aria-labelledby="estimate-document-tabs-tab-extras" tabIndex={0} data-estimate-panel="extras" hidden={section !== 'extras'} aria-label="Нормы и резерв">{extras}</section>
      <section className="document-panel space-y-6" id="estimate-document-tabs-panel-totals" role="tabpanel" aria-labelledby="estimate-document-tabs-tab-totals" tabIndex={0} data-estimate-panel="totals" hidden={section !== 'totals'} aria-label="Итоги">
        <h2 className="document-section-title">Итоговая смета</h2>
        {table ? <CompactEstimatePriceTable table={table} form={form} runId={runId} showOrder={showOrder} onScopeChange={order => {
          setParams(current => { const next = new URLSearchParams(current); next.set('basis', order ? 'order' : 'piece'); return next; });
        }} /> : <div role="status">Сохранённая таблица сметы пока недоступна.{retryTable}</div>}
        <InfoBlock className="document-calculation-breakdown" title="Калькуляция и полнота расчёта"><div className="mt-4">{summary}</div></InfoBlock>
      </section>
    </div>
  </section>;
}
