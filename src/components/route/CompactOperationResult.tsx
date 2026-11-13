import { InfoBlock } from '@/components/ui/InfoBlock';
import type { ReactNode } from 'react';
import { CompactCycleTable, CompactPassTables } from '@/components/route/CompactCalculationResult';
import { CompactMachineChecks } from '@/components/route/CompactMachineChecks';
import { asRecord, finiteNonnegative, formatNumber, formatText } from '@/utils/compactNumbers';
import { isDemonstrationPrice } from '@/utils/priceEvidence';
import type { components } from '@/api/schema';
import { CompactWorkReadiness } from '@/components/route/CompactWorkReadiness';
import { publicSourceText } from '@/utils/publicSource';

type Readiness = components['schemas']['OperationReadiness'];
function uniqueStrings(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string' && !!item.trim()))] : [];
}
function timeGapSummary(readiness: Readiness | undefined): string | null {
  if (!readiness || readiness.reference_only) return null;
  const kinds = new Set(readiness.works.filter(work => work.selection === 'required').flatMap(work => work.gaps.filter(gap => gap.affected_results.includes('time')).map(gap => gap.kind)));
  const labels = { source_fact: 'исходные данные', technology_decision: 'технологическая проработка', reference_data: 'применимые справочные данные', unsupported_method: 'поддержка и применимость расчётного метода' };
  return kinds.size > 0 ? `Для полного расчёта времени требуют уточнения: ${[...kinds].map(kind => labels[kind]).join(', ')}.` : null;
}
export function commonOperationLimitations(details: unknown[]): string[] {
  const counts = new Map<string, number>();
  for (const raw of details) for (const item of uniqueStrings(asRecord(raw).limitations)) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts].filter(([, count]) => count > 1 && count === details.length).map(([item]) => item);
}
export function operationTimeView(detail: Record<string, unknown>) {
  const machineTime = finiteNonnegative(detail.known_machine_minutes_per_part);
  const motions = (Array.isArray(detail.time_work_results) ? detail.time_work_results.map(asRecord) : []).filter(row => row.machine_regime_source && finiteNonnegative(asRecord(row.minutes).value) !== null);
  const cardRegimes = asRecord(detail.calculation_evidence).machine_working_regimes;
  return { machineTime, batchTime: finiteNonnegative(detail.batch_minutes), motions, cardTime: (machineTime !== null && Array.isArray(cardRegimes) && cardRegimes.length > 0) || motions.length > 0 };
}

function OperationExecutionMethods({ selection, works }: { selection: Record<string, unknown>; works: Record<string, unknown>[] }) {
  const methods = (value: unknown) => {
    if (!Array.isArray(value)) return [];
    return [...new Map(value.map(asRecord).filter(method => typeof method.title === 'string')
      .map(method => [JSON.stringify([method.work_index, method.execution_method_id]), method])).values()];
  };
  const selected = methods(selection.execution_methods);
  const alternatives = (Array.isArray(selection.candidates) ? selection.candidates.map(asRecord) : [])
    .flatMap(candidate => methods(candidate.alternative_execution_methods).map(method => ({ candidate, method })));
  const row = (method: Record<string, unknown>, candidate?: Record<string, unknown>) => {
    const work = typeof method.work_index === 'number' ? works[method.work_index]?.description : null;
    const machine = candidate?.machine_title;
    const limitations = uniqueStrings(method.limitations);
    return <li key={JSON.stringify([candidate?.machine_id, method.work_index, method.execution_method_id])}>
      <p className="break-words">{[machine, work, method.title].filter(Boolean).map(formatText).join(' · ')}</p>
      {method.gcode_state === 'not_applicable' && <p className="text-muted">G-code не применимо. Результат оформляется технологической картой.</p>}
      {method.gcode_state === 'unverified' && <p className="text-muted">Возможность выдачи G-code не подтверждена.</p>}
      {limitations.map(limitation => <p key={limitation} className="text-muted">{publicSourceText(limitation, 'Применимость требует уточнения')}</p>)}
    </li>;
  };
  return <>
    {selected.length > 0 && <div className="space-y-2">
      <h4 className="font-medium">Выбранные способы выполнения</h4>
      <ul className="space-y-2">{selected.map(method => row(method))}</ul>
    </div>}
    {alternatives.length > 0 && <InfoBlock title="Другие способы по паспортам">

      <p className="mt-2 text-muted">Для этих способов нужно уточнить технологию и оснастку.</p>
      <ul className="mt-2 space-y-2">{alternatives.map(({ candidate, method }) => row(method, candidate))}</ul>
    </InfoBlock>}
  </>;
}

export function CompactOperationResult({ detail, title, sharedLimitations, operationIndex, referenceOnly = false, readiness, children, overview }: {
  detail: Record<string, unknown>; title: string; sharedLimitations: string[]; operationIndex?: number; referenceOnly?: boolean; readiness?: Readiness; children?: ReactNode; overview?: ReactNode;
}) {
  const uncovered = uniqueStrings(detail.uncovered_work);
  const selection = asRecord(asRecord(detail.calculation_evidence).machine_selection);
  const selectionReason = selection.state === 'unknown' && typeof selection.reason === 'string' ? selection.reason : null;
  const limitations = uniqueStrings(detail.limitations).filter(item => item !== selectionReason && !sharedLimitations.includes(item));
  const works = Array.isArray(detail.works) ? detail.works.map(asRecord) : [];
  const { machineTime, batchTime, motions, cardTime } = operationTimeView(detail);
  const cost = asRecord(detail.cost);
  const incomplete = machineTime === null || detail.calculation_complete !== true;
  const calculationState = !incomplete ? 'Рассчитано' : machineTime !== null || motions.length > 0 ? 'Частично' : 'Время не определено';
  const reason = incomplete ? (!cardTime && timeGapSummary(readiness)) || 'Полное время не определено; расчётные основания сохранены ниже.' : null;
  const operationTitle = formatText(title);
  return <section id={operationIndex === undefined ? undefined : `compact-operation-${operationIndex}`} tabIndex={-1} className="space-y-4 border-t border-line py-5 text-sm" aria-label={operationTitle}>
    <h3 className="font-semibold">{operationIndex === undefined ? '' : `${operationIndex + 1}. `}{operationTitle}</h3>
    {overview ?? <div className="max-w-full min-w-0 overflow-x-auto" tabIndex={0}><table className="w-full"><caption className="sr-only">Результат операции {operationIndex === undefined ? operationTitle : operationIndex + 1}</caption><thead><tr><th>Оборудование</th><th>{referenceOnly ? 'Прежнее время, мин/дет.' : 'Машинное время, мин/дет.'}</th><th>Время на партию, мин</th><th>Стоимость операции</th><th>Полнота расчёта</th></tr></thead><tbody><tr>
      <td>{detail.machine_title ? formatText(detail.machine_title) : 'Не назначено'}</td><td className="tabular-nums">{formatNumber(machineTime)}</td><td className="tabular-nums">{formatNumber(batchTime)}</td><td className="tabular-nums">{!isDemonstrationPrice(cost) && finiteNonnegative(cost.amount) !== null ? `${formatNumber(cost.amount, 2)} ${formatText(cost.currency)}` : 'Не определена'}</td><td>{calculationState}</td>
    </tr></tbody></table></div>}
    {detail.equipment_state === 'incompatible' && <p className="text-warning">Станок не соответствует известным требованиям операции. Требуется другой вариант оборудования.</p>}
    {selectionReason && <p className="text-muted">{formatText(selectionReason)}</p>}
    {detail.machine_id != null && detail.equipment_state === 'unverified' && !selectionReason && <p className="text-muted">Выбор оборудования предварительный; часть характеристик не проверена.</p>}
    <OperationExecutionMethods selection={selection} works={works} />
    <CompactMachineChecks detail={detail} />
    {detail.stock_incompatible === true && <p className="text-warning">Выбранная заготовка не обеспечивает известные требования операции.</p>}
    {reason && !overview && <p className="text-muted">{reason}</p>}
    {works.length > 0 && <section className="operation-work-list" aria-label="Состав работ">
      <h4 className="font-semibold">Состав работ</h4>
      {works.map((work, index) => {
        return <article className="operation-work" key={index}>
          <h4>{formatText(work.description)}</h4>
          {work.selection === 'excluded' && <p className="text-xs text-muted">Исключено из операции</p>}
          {work.selection === 'conditional' && <p className="text-xs text-warning">Условная работа</p>}
          {work.reason != null && work.reason !== '' && <p className="operation-work-source">{publicSourceText(work.reason, 'Требует уточнения')}</p>}
          {work.source != null && work.source !== '' && <p className="operation-work-source">{publicSourceText(work.source, 'Основание работы сохранено')}</p>}
        </article>;
      })}
    </section>}

    {motions.length > 0 && <div className="max-w-full min-w-0 overflow-x-auto" tabIndex={0}><table className="w-full"><caption className="text-left font-medium">Отдельно рассчитанные движения</caption><thead><tr><th>Рабочее движение</th><th>Время, мин</th><th>Относится к</th></tr></thead><tbody>{motions.map((row, index) => <tr key={index}><th scope="row" className="font-normal whitespace-pre-wrap">{formatText(asRecord(row.input).description)}</th><td className="tabular-nums">{formatNumber(asRecord(row.minutes).value)}</td><td>{asRecord(row.input).frequency === 'per_batch' ? 'Партии' : 'Детали'}</td></tr>)}</tbody></table></div>}
    <CompactPassTables detail={detail} />
    <CompactCycleTable detail={detail} />
    {children}
    {readiness && <CompactWorkReadiness value={readiness} initialBasisOnly={cardTime || Boolean(overview)} />}
    {(uncovered.length > 0 || limitations.length > 0 || cardTime) && <InfoBlock title="Открытые вопросы и ограничения операции"><div className="mt-3 space-y-3">
      {cardTime && <p className="text-muted">Использованы рабочие режимы из карточки станка. Исходные замечания детализации сохранены; численные результаты показаны выше.</p>}
      <div className="max-w-full min-w-0 overflow-x-auto" tabIndex={0}><table className="w-full"><thead><tr><th>Раздел</th><th>Условие или вопрос</th></tr></thead><tbody>{uncovered.map(item => <tr key={`work-${item}`}><th scope="row">Неоценённая работа</th><td className="whitespace-pre-wrap">{publicSourceText(item, 'Работа требует уточнения')}</td></tr>)}{limitations.map(item => <tr key={`limit-${item}`}><th scope="row">Ограничение</th><td className="whitespace-pre-wrap">{publicSourceText(item, 'Применимость требует уточнения')}</td></tr>)}</tbody></table></div>
    </div></InfoBlock>}
    {['work_plan', 'tooling', 'control', 'input_state', 'output_state'].some(key => typeof detail[key] === 'string' && detail[key]) && <InfoBlock title="Технологические условия">
      <dl className="operation-description">{(['work_plan', 'tooling', 'control', 'input_state', 'output_state'] as const).map((key, index) => typeof detail[key] === 'string' && detail[key] ? <div key={key}><dt>{['Переходы', 'Оснастка', 'Контроль', 'До операции', 'После операции'][index]}</dt><dd>{publicSourceText(detail[key], 'Не определено')}</dd></div> : null)}</dl>
    </InfoBlock>}
  </section>;
}
