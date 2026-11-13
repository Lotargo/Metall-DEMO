import { InfoBlock } from '@/components/ui/InfoBlock';
import type { components } from '@/api/schema';
import { formatText } from '@/utils/compactNumbers';
import { publicSourceText } from '@/utils/publicSource';

type Readiness = components['schemas']['OperationReadiness'];
type Work = components['schemas']['ReadinessWork'];
const statuses: Record<Work['status'], string> = {
  planned: 'Есть расчётное основание',
  planned_with_gaps: 'Основание с ограничениями',
  gap_declared: 'Нужны дополнительные основания',
  missing_basis: 'Недостаточно исходных данных',
  conditional: 'Условная работа',
  excluded: 'Исключённая работа',
};
const owners: Record<Work['responsible'][number], string> = {
  source_or_operator: 'уточнение исходного факта',
  technology_role: 'технологическая проработка',
  reference_support: 'поиск применимого справочного основания',
  implementation: 'уточнение способа расчёта',
};
const results: Record<components['schemas']['CalculationGap']['affected_results'][number], string> = {
  geometry: 'геометрия', time: 'время', loads: 'нагрузки', material_balance: 'баланс материала',
  stock_fit: 'пригодность заготовки', production_acceptance: 'производственная пригодность',
};

export function CompactWorkReadiness({ value, initialBasisOnly = false }: { value: Readiness; initialBasisOnly?: boolean }) {
  const works = value.works.filter(work => work.status !== 'planned' || work.issues.length > 0 || work.gaps.length > 0);
  if (!works.length && !value.issues.length && value.status !== 'legacy_unknown' && !value.reference_only) return null;
  return <InfoBlock title={<>Открытые расчётные основания{value.missing_basis_indices.length > 0 ? ` · без основания: ${value.missing_basis_indices.length}` : ''}</>}>

    <div className="mt-3 space-y-3">
      {initialBasisOnly && <p className="text-muted">Основания детализации приведены для проверки. Полнота времени и стоимости отражена в итогах операции.</p>}
      {value.reference_only && <p className="text-muted">Основания прежнего расчёта: влияние изменения количества ещё не разрешено.</p>}
      {value.status === 'legacy_unknown' && <p>Состав работ для этого расчёта не уточнён.</p>}
      {value.issues.includes('EMPTY_WORK_COMPOSITION') && <p>Состав расчётных работ ещё не подготовлен.</p>}
      {value.issues.includes('COMPLETE_CLAIM_HAS_UNRESOLVED_INPUTS') && <p>{initialBasisOnly ? 'В исходной детализации полнота была заявлена при недостающих основаниях времени.' : 'Заявленная полнота требует проверки: у выбранных работ остались недостающие основания времени.'}</p>}
    <div className="operation-work-list">{works.map(work => <article key={work.work_index} className="operation-work">
        <h4>{formatText(work.description)}</h4><p className="text-muted">{statuses[work.status]}</p>
        {work.responsible.length > 0 && <p className="mt-2">{initialBasisOnly ? 'В исходной детализации требовалось' : 'Дальше'}: {work.responsible.map(owner => owners[owner]).join('; ')}.</p>}
        {work.issues.includes('AVAILABLE_METHOD_NEEDS_SCOPE_EXPLANATION') && <p className="mt-1 text-muted">Метод доступен. Нужно уточнить границы его применения к этой работе.</p>}
        {work.issues.includes('GAP_METHOD_WORK_MISMATCH') && <p className="mt-1 text-muted">Указанный метод относится к другому виду работ.</p>}
        {work.gaps.length > 0 && <p className="mt-2 text-muted">{initialBasisOnly ? 'Исходные пробелы затрагивали' : 'Пробелы затрагивают'}: {[...new Set(work.gaps.flatMap(gap => gap.affected_results))].map(result => results[result]).join(', ')}.</p>}
        <ul className="mt-2 space-y-3 text-xs text-muted">{work.gaps.map((gap, index) => <li key={index}>
          <p>{publicSourceText(gap.reason, 'Применимость расчёта требует уточнения')}</p>
          <p>Ограничивает: {gap.affected_results.map(result => results[result]).join(', ')}.</p>
          {gap.source && <p>{publicSourceText(gap.source, 'Основание расчёта сохранено')}</p>}
        </li>)}</ul>
        {work.gaps.length === 0 && !work.basis_refs.length && <p className="mt-2 text-xs text-muted">Отдельный источник не передан.</p>}
      </article>)}</div>
    </div>
  </InfoBlock>;
}
