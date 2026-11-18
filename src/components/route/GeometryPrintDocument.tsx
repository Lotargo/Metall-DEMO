import { Link } from 'react-router-dom';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import type { VolumeState } from '@/api/hooks/useVolumeRound';
import { Button } from '@/components/ui/Button';
import { EngineeringPrintContext, EngineeringText } from '@/components/ui/EngineeringText';
import { EstimateConditions, EstimateNotices, EstimateTimeNote, EstimateWorkTable } from './VolumeEstimate';
import { RouteSections } from './GeometryRouteDocument';
import { assessedCostLabel, estimateStatus, estimateTimeLabel, estimateTotals, oncePerRunLabel, rangeText } from './geometryDocuments';
import { CalculationBasisSections } from './CalculationBasisSections';
import { formatNumber, materialLabel, operatorText } from './geometryPresentation';
import { demoPrintFile } from '@/demo/config';
import './run-documents.css';
import './geometry-documents.css';

type Document = 'route' | 'estimate' | 'basis';
const names = { route: 'Маршрут изготовления', estimate: 'Смета на изготовление', basis: 'Основания расчёта' };
export function GeometryPrintDocument({ state, document }: { state: VolumeState; document: Document }) {
  const ready = document === 'route' ? !!state.operations_markdown : document === 'basis' ? !!state.calculation_basis || !!state.time_estimate : !!state.time_estimate;
  const { cost, time } = estimateTotals(state);
  const pdf = demoPrintFile(state.run_id, document);
  return <article className="run-document-page geometry-print-page">
    <div className="document-toolbar document-screen-only"><Link className="ui-button ui-button--outline ui-button--size-sm" to={`/runs/${state.run_id}?tab=${document}`}><ArrowLeft size={16} aria-hidden="true" />К рабочему пространству</Link><nav className="geometry-print-navigation" aria-label="Печатные документы">{(['route', 'estimate', 'basis'] as const).map(item => <Link key={item} to={`/runs/${state.run_id}/${item}/print`} aria-current={document === item ? 'page' : undefined}>{item === 'route' ? 'Маршрут' : item === 'estimate' ? 'Смета' : names.basis}</Link>)}</nav><div className="calculation-basis-actions">{ready && pdf && <a className="ui-button ui-button--outline ui-button--size-sm" href={pdf} download><Download size={16} aria-hidden="true" />Скачать PDF</a>}<Button icon={<Printer size={16} aria-hidden="true" />} disabled={!ready} onClick={() => window.print()}>Печать</Button></div></div>
    {!ready ? <p role="status">Документ ещё не подготовлен. Сохранённые данные доступны в рабочем пространстве.</p> : <EngineeringPrintContext.Provider value><div className="estimate-paper geometry-paper">
      <header className="estimate-paper-heading"><h1>{names[document]}</h1><p>{document === 'route' ? state.results_stale ? 'Требует обновления после изменения модели' : 'По принятому предварительному сценарию' : estimateStatus(state)}</p></header>
      <dl className="estimate-paper-meta"><div className="geometry-paper-detail"><dt>Деталь:</dt><dd>{operatorText(state.title || state.filename)}</dd></div><div><dt>Количество в расчёте</dt><dd>{state.quantity} шт.</dd></div>
        {state.passport?.drawing_designation && <div><dt>Обозначение:</dt><dd>{operatorText(state.passport.drawing_designation)}</dd></div>}
        {state.passport?.material != null && <div><dt>Материал:</dt><dd>{materialLabel(state.passport.material)}</dd></div>}
        {state.stock && <div><dt>Заготовка:</dt><dd>Ø{formatNumber(state.stock.diameter_mm)} × {formatNumber(state.stock.cut_length_mm)} мм</dd></div>}
        {state.model_revision != null && <div><dt>Модель:</dt><dd>Версия {state.model_revision}</dd></div>}
      </dl>
      {document === 'route' ? <><RouteSections state={state} />{state.time_estimate && <section className="geometry-paper-totals"><h2>Время изготовления партии</h2><p>{rangeText(state.time_estimate.totals.batch_minutes)} мин · наладка учитывается один раз на партию</p></section>}</> : document === 'basis' ? <>{state.time_estimate?.scope && <section className="geometry-paper-scope"><h2>Область оценки</h2><EngineeringText value={state.time_estimate.scope} /></section>}<CalculationBasisSections state={state} /><EstimateConditions state={state} section="assumptions" /><EstimateConditions state={state} section="excluded" />{!state.calculation_basis && <EstimateConditions state={state} section="groups" />}</> : <>
        <h2 className="geometry-print-section">Работы и оборудование</h2><EstimateWorkTable state={state} />
        <h2 className="geometry-print-section">Итоговая калькуляция</h2><table className="geometry-paper-calculation"><thead><tr><th scope="col">Показатель</th><th scope="col">Значение</th></tr></thead><tbody>
          <tr><th scope="row">{time.assessedOnly ? 'Оценённое время обработки детали' : 'Обработка одной детали'}</th><td>{rangeText(time.processing, 'мин')}</td></tr>
          <tr><th scope="row">{oncePerRunLabel}{time.assessedOnly && ' · оценённое время'}</th><td>{rangeText(time.setup, 'мин')}</td></tr>
          <tr><th scope="row">{estimateTimeLabel(state.quantity, time.assessedOnly)}</th><td>{rangeText(time.batch, 'мин')}</td></tr>
          {state.quantity > 1 && <tr><th scope="row">{cost.assessedOnly ? 'Оценённые работы в среднем на деталь' : 'Стоимость работ в среднем на деталь'}</th><td>{rangeText(cost.perPiece, '₽')}</td></tr>}
          <tr className="geometry-print-total"><th scope="row">{cost.assessedOnly ? assessedCostLabel : 'Стоимость работ'} · {state.quantity} шт.</th><td>{rangeText(cost.batch, '₽')}</td></tr>
        </tbody></table><EstimateTimeNote quantity={state.quantity} /><EstimateNotices state={state} />
        <p className="document-help">Принятые условия и исключённые работы приведены в отдельном документе «Основания расчёта».{state.time_estimate?.excluded_work?.length ? ` Работ за пределами оценки: ${state.time_estimate.excluded_work.length}.` : ''}</p>
      </>}
      <div className="geometry-print-signatures"><span>Составил: ____________________</span><span>Проверил: ____________________</span></div>
    </div></EngineeringPrintContext.Provider>}
  </article>;
}
