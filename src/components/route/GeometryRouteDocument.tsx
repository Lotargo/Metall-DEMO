import type { VolumeState } from '@/api/hooks/useVolumeRound';
import { Link } from 'react-router-dom';
import { Download, Printer } from 'lucide-react';
import { EngineeringText } from '@/components/ui/EngineeringText';
import { routeSections, rangeText } from './geometryDocuments';

export function RouteSections({ state }: { state: VolumeState }) {
  const sections = routeSections(state.operations_markdown ?? '');
  return sections.length ? <ol className="geometry-route-sections" aria-label="Последовательность работ">{sections.map((section, i) => <li key={i} id={`route-section-${i + 1}`}>
    <span className="engineering-card-number" aria-hidden="true">{i + 1}</span><div className="min-w-0"><div className="geometry-route-title"><EngineeringText value={section.title} /></div><EngineeringText value={section.body} /></div>
  </li>)}</ol> : <p role="status">Технология ещё не подготовлена.</p>;
}
export function GeometryRouteDocument({ state }: { state: VolumeState }) {
  const sections = routeSections(state.operations_markdown ?? '');
  return <div className="geometry-document-workspace">
    <div className="document-toolbar"><h2>Полный маршрут изготовления</h2>{sections.length > 0 && <Link className="ui-button ui-button--outline ui-button--size-sm" to={`/runs/${state.run_id}/route/print`}><Printer size={16} aria-hidden="true" />Печатная форма маршрута</Link>}{state.artifacts.rough_step && <a className="ui-button ui-button--outline ui-button--size-sm" href={`/api/v1/artifacts/${encodeURIComponent(state.artifacts.rough_step)}?download=true`}><Download size={16} aria-hidden="true" />Скачать черновую модель</a>}</div>
    {state.results_stale && <p className="document-notice">Маршрут относится к прежней модели и требует обновления.</p>}
    <div className="document-sheet">
      {sections.length > 1 && <nav className="geometry-route-navigation" aria-label="Разделы маршрута">{sections.map((section, i) => <a key={i} href={`#route-section-${i + 1}`}><span>{String(i + 1).padStart(2, '0')}</span><EngineeringText value={section.title} /></a>)}</nav>}
      <div className="document-panel"><RouteSections state={state} /></div>
    </div>
    {!!state.time_estimate?.groups.length && <section className="document-sheet"><div className="document-panel"><h3 className="document-section-title">Время по группам работ</h3><p className="document-help">Группы объединяют работы маршрута. Наладка учитывается один раз на партию.</p><div className="table-wrap"><table className="geometry-work-table"><thead><tr><th scope="col">Группа работ</th><th scope="col">На деталь, мин</th><th scope="col">Наладка партии, мин</th></tr></thead><tbody>{state.time_estimate.groups.map((group, i) => <tr key={i}><th scope="row"><EngineeringText value={group.name} /></th><td>{rangeText(group.per_piece_minutes)}</td><td>{rangeText(group.setup_per_batch_minutes)}</td></tr>)}</tbody></table></div></div></section>}
  </div>;
}
