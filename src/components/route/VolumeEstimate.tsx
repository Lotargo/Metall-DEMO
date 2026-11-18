import { useContext, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { PlanningAssumption, Range, VolumeState } from '@/api/hooks/useVolumeRound';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EngineeringPrintContext, EngineeringText } from '@/components/ui/EngineeringText';
import { operatorText, formatNumber as number, timeIssueMessages } from './geometryPresentation';
import { assessedCostLabel, costRow, estimateStatus, estimateTimeLabel, estimateTotals, oncePerRunLabel, rangeText as range } from './geometryDocuments';

const sameText = (a: string, b?: string) => operatorText(a, '').trim().toLocaleLowerCase() === operatorText(b, '').trim().toLocaleLowerCase();

export function PlanningAssumptions({ items, title = 'Что принято для предварительного расчёта', collapsible = false }: { items: PlanningAssumption[]; title?: string; collapsible?: boolean }) {
  const print = useContext(EngineeringPrintContext);
  if (!items.length) return null;
  const list = <ul className="calculation-basis-list">{items.map((item, i) => <li className="calculation-assumption" key={i}>
      <h4 className="font-semibold">{operatorText(item.subject)}</h4>
      <dl>
        {item.missing && <div><dt>{item.reason_kind === 'conflict' ? 'Противоречие' : 'Что неизвестно'}</dt><dd><EngineeringText value={item.missing} /></dd></div>}
        {item.adopted && <div><dt>Принято</dt><dd><EngineeringText value={item.adopted} /></dd></div>}
        {item.basis && ![item.missing, item.adopted, item.affects].some(text => sameText(item.basis!, text)) && <div><dt>Основание</dt><dd><EngineeringText value={item.basis} /></dd></div>}
        {item.affects && <div><dt>Влияние на расчёт</dt><dd><EngineeringText value={item.affects} /></dd></div>}
      </dl>
    </li>)}</ul>;
  if (collapsible && !print) return <details className="calculation-retained"><summary>{title}</summary>{list}</details>;
  return <section className="space-y-3" aria-label={title}><h3 className="document-section-title">{title}</h3>{list}</section>;
}
export function EstimateSummary({ state }: { state: VolumeState }) {
  const { cost, time } = estimateTotals(state);
  return <dl className="document-metrics geometry-document-metrics">
    <div><dt>{cost.assessedOnly ? assessedCostLabel : state.quantity === 1 ? 'Стоимость работ на 1 деталь' : 'Стоимость работ партии'}</dt><dd>{range(cost.batch)}{cost.batch && <span> ₽</span>}</dd><small>{state.quantity} шт. · без материала</small></div>
    {state.quantity > 1 && <div><dt>Стоимость работ в среднем на деталь</dt><dd>{range(cost.perPiece)}{cost.perPiece && <span> ₽</span>}</dd><small>{cost.assessedOnly ? 'Стоимость оценённых работ' : 'Стоимость работ'}</small></div>}
    <div><dt>{estimateTimeLabel(state.quantity, time.assessedOnly)}</dt><dd>{range(time.batch)}{time.batch && <span> мин</span>}</dd></div>
    {state.quantity > 1 && <div><dt>{time.assessedOnly ? 'Оценённое время в среднем на деталь' : 'Время в среднем на деталь'}</dt><dd>{range(time.perPiece)}{time.perPiece && <span> мин</span>}</dd></div>}
  </dl>;
}

function WorkRange({ full, known }: { full?: Range; known?: Range }) {
  return <td>{range(full ?? known)}{!full && known && <small>Оценённая часть</small>}</td>;
}

export function EstimateWorkTable({ state }: { state: VolumeState }) {
  return <div className="table-wrap"><table className="geometry-work-table geometry-estimate-table"><caption className="sr-only">Время и стоимость по группам работ</caption>
    <thead><tr><th scope="col">Группа работ и оборудование</th><th scope="col">На деталь, мин</th><th scope="col">Разово, мин</th><th scope="col">Ставка, ₽/ч</th><th scope="col">За {state.quantity} шт., ₽</th></tr></thead>
    <tbody>{state.time_estimate?.groups.map((group, i) => {
      const cost = costRow(state, group.name, i);
      const rate = cost?.rate;
      return <tr key={i}><th scope="row"><strong>{operatorText(group.name)}</strong>{group.equipment && <small>{operatorText(group.equipment)}</small>}</th><WorkRange full={group.per_piece_minutes} known={group.known_per_piece_minutes} /><WorkRange full={group.setup_per_batch_minutes} known={group.known_setup_per_batch_minutes} /><td>{rate ? number(Number(rate.hourly_rate)) : '—'}{rate?.scenario && ' · MOCK'}{cost?.rate_issue && <small>{operatorText(cost.rate_issue)}</small>}</td><WorkRange full={cost?.batch_rub} known={cost?.known_batch_rub} /></tr>;
    })}</tbody>
  </table></div>;
}
export function EstimateTimeNote({ quantity }: { quantity: number }) {
  return <p className="document-help">Итоговое время = обработка одной детали × {quantity} + разовые работы и общие циклы.</p>;
}
export function EstimateConditions({ state, section = 'all' }: { state: VolumeState; section?: 'all' | 'assumptions' | 'excluded' | 'groups' }) {
  const time = state.time_estimate;
  if (!time) return null;
  const assumptions = state.calculation_basis?.assumptions;
  const notes = [...new Set([...time.conditions, ...(time.scenario_limitations ?? []), ...time.unestimated_work, ...timeIssueMessages(time)])];
  return <div className="space-y-5">{(section === 'all' || section === 'assumptions') && <PlanningAssumptions items={assumptions?.current ?? time.planning_assumptions ?? []} />}
    {(section === 'all' || section === 'excluded') && !!time.excluded_work?.length && <section><h3 className="document-section-title">Не учтено в этой оценке</h3><ul className="calculation-basis-list">{time.excluded_work.map((item, i) => <li key={i} className="calculation-basis-item">{typeof item === 'string' ? <EngineeringText value={item} /> : <><h4 className="font-semibold">{operatorText(item.work)}</h4><EngineeringText value={item.reason} />{item.requirement && <EngineeringText value={item.requirement} literalMarkers />}{item.source && <p className="engineering-card-source">{operatorText(item.source)}</p>}{item.retained_work && <div><p className="geometry-condition-label">Учтено</p><EngineeringText value={item.retained_work} /></div>}</>}</li>)}</ul></section>}
    {(section === 'all' || section === 'groups') && !!time.groups.length && <section><h3 className="document-section-title">Основания времени и ставки</h3><ol className="engineering-cards">{time.groups.map((group, i) => {
      const rate = costRow(state, group.name, i)?.rate;
      const assumptions = [...new Set(group.assumptions ?? [])].filter(text => !sameText(text, group.basis));
      return <li key={i} className="engineering-card"><span className="engineering-card-number" aria-hidden="true">{i + 1}</span><div className="engineering-card-copy"><h4 className="font-semibold">{operatorText(group.name)}</h4>{group.basis && <EngineeringText value={group.basis} />}{assumptions.map((text, j) => <EngineeringText key={j} value={text} />)}{rate && <p className="engineering-card-source">Расчётная ставка: {number(Number(rate.hourly_rate))} ₽/ч.</p>}</div></li>;
    })}</ol></section>}
    {(section === 'all' || section === 'assumptions') && notes.length > 0 && <section><h3 className="document-section-title">Дополнительные условия</h3><ul className="calculation-basis-notes">{notes.map((text, i) => <li key={i}><EngineeringText value={text} /></li>)}</ul></section>}
    {(section === 'all' || section === 'assumptions') && !!assumptions?.retained.length && <PlanningAssumptions items={assumptions.retained} title="Открытые замечания прошлых расчётов" collapsible />}
  </div>;
}
export function EstimateNotices({ state }: { state: VolumeState }) {
  const time = state.time_estimate, cost = state.cost_estimate;
  return <div className="document-notices">
    {state.quantity_basis === 'one_piece_scenario' && <p>Количество заказа не задано. Показан сценарий одной детали.</p>}
    {time?.basis_quantity != null && time.basis_quantity !== state.quantity && <p>Основания оценки сохранены для партии {time.basis_quantity} шт. Время пересчитано арифметически; условия организации партии требуют проверки.</p>}
    {!!time?.scenario_limitations?.length && <p>Итог относится к условному варианту изготовления. Открытые требования и условия его применения приведены в основаниях расчёта.</p>}
    {time?.estimated_machine_cycles && <p>В итог включены оценочные машинные циклы. Их длительности и источники приведены в основаниях расчёта.</p>}
    {(time?.status === 'partial' || cost?.status === 'partial') && <p>Неоценённые работы и части работ указаны в таблице и основаниях расчёта.</p>}
    <p>{cost?.rows.some(row => row.rate?.scenario) ? cost.condition : 'Стоимость материала не включена. Использованы сохранённые расчётные ставки.'} Время не откалибровано по фактическому производству.</p>
  </div>;
}
export function VolumeEstimate({ state, editable }: { state: VolumeState; editable: boolean }) {
  const client = useQueryClient();
  const [quantity, setQuantity] = useState(String(state.quantity));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { time } = estimateTotals(state);
  async function saveQuantity(event: FormEvent) {
    event.preventDefault();
    const next = Number(quantity);
    if (!Number.isSafeInteger(next) || next < 1) { setError('Введите целое количество от 1.'); return; }
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/v1/runs/${encodeURIComponent(state.run_id)}/volume-round/quantity`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expected_revision: state.revision, quantity: next }),
      });
      const value = await response.json() as VolumeState & { detail?: string };
      if (!response.ok) throw new Error(value.detail || 'Не удалось пересчитать количество.');
      client.setQueryData(['volume-round', state.run_id], value);
      void client.invalidateQueries({ queryKey: ['cad-route', state.run_id] });
      void client.invalidateQueries({ queryKey: ['orchestrator', `run:${state.run_id}`] });
    } catch (reason) { setError(operatorText(reason instanceof Error ? reason.message : '', 'Не удалось сохранить количество.')); }
    finally { setBusy(false); }
  }
  if (!state.time_estimate) return <p role="status">Оценка появится после завершения расчёта. Ход обработки доступен в шапке.</p>;
  return <div className="geometry-document-workspace">
    <div className="document-toolbar"><h2>Смета на изготовление</h2><Link className="ui-button ui-button--outline ui-button--size-sm" to={`/runs/${state.run_id}/estimate/print`}><Printer size={16} aria-hidden="true" />Печатная форма сметы</Link></div>
    <p className="document-notice" role="status">{estimateStatus(state)}</p><EstimateSummary state={state} />
    <div className="document-sheet"><div className="document-panel space-y-5">
      <form onSubmit={saveQuantity} className="volume-quantity-form"><Input label="Количество деталей в партии" type="number" min={1} step={1} value={quantity} onChange={event => setQuantity(event.target.value)} disabled={!editable || busy} error={error} /><Button type="submit" variant="outline" loading={busy} disabled={!editable}>Пересчитать количество</Button></form>
      <section><h3 className="document-section-title">Работы и стоимость</h3><EstimateWorkTable state={state} /></section>
      <dl className="geometry-time-breakdown"><div><dt>{time.assessedOnly ? 'Оценённое время обработки детали' : 'Обработка одной детали'}</dt><dd>{range(time.processing, 'мин')}</dd></div><div><dt>{oncePerRunLabel}{time.assessedOnly && ' · оценённое время'}</dt><dd>{range(time.setup, 'мин')}</dd></div></dl>
      <EstimateTimeNote quantity={state.quantity} />
      <EstimateNotices state={state} />
      <div><Link className="ui-button ui-button--outline ui-button--size-sm" to={`/runs/${state.run_id}?tab=basis`}>Основания расчёта</Link>{!!state.time_estimate.excluded_work?.length && <p className="document-help">Есть работы за пределами оценки: {state.time_estimate.excluded_work.length}. Подробности — во вкладке «Основания расчёта».</p>}</div>
    </div></div>
  </div>;
}
