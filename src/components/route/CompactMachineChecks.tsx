import { InfoBlock } from '@/components/ui/InfoBlock';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { equipmentRequest, type MachineRegistry, type ParameterId } from '@/api/machineExchange';
import { asRecord, formatText } from '@/utils/compactNumbers';
import { estimateOperatorText } from './estimateOperatorText';
import { publicSourceText } from '@/utils/publicSource';

const states: Record<string, string> = {
  compatible: 'Совместимо по требованию',
  incompatible: 'Несовместимо',
  unverified: 'Не проверено',
  not_applicable: 'Не требуется',
};
const processTitles: Record<string, string> = {
  method: 'Поддержка метода',
  equipment_class: 'Класс оборудования',
  equipment_features: 'Оснащение',
  cycle_regime: 'Режим цикла',
  cut_piece_length_mm: 'Длина отрезаемой детали',
  local_travel_x_mm: 'Локальный размах вдоль паза',
  local_travel_y_mm: 'Локальный размах поперёк паза',
  local_travel_z_mm: 'Локальный ход по глубине',
  local_feed_mm_per_min: 'Компонента подачи в локальной системе',
};
const conditionTitles: Record<string, string> = {
  axis: 'Ось', gear: 'Передача', mounting: 'Установ и закрепление',
  configuration: 'Комплектация', cut_angle_deg: 'Угол реза, °', material_grade: 'Материал',
  load_definition: 'Вид нагрузки', duty: 'Режим нагрузки', spindle_rpm: 'Рабочие обороты',
  spindle_rpm_lower: 'Обороты от', spindle_rpm_upper: 'Обороты до',
  local_axis: 'Локальное направление', alignment_source: 'Основание ориентации',
};
const units: Record<string, string> = {
  mm: 'мм', kg: 'кг', rpm: 'об/мин', 'mm/min': 'мм/мин', 'mm/rev': 'мм/об',
  'm/min': 'м/мин', kW: 'кВт', 'N*m': 'Н·м', N: 'Н', deg: '°',
};
const reasons: Record<string, string> = {
  'The operation requirement is unknown': 'Не определено требование операции.',
  'The required capacity boundary is unknown': 'В карточке нет нужной границы.',
  'Requirement exceeds a documented boundary': 'Предел станка недостаточен.',
  'Requirement fits this documented boundary': 'Требование в пределах указанной границы.',
  'Requirement interval crosses the boundary or has an unknown relevant end': 'Интервал требования пересекает предел или имеет неизвестную границу.',
  'Machine characteristic is unknown, assumed, or uses a different unit': 'Нет применимого значения в требуемой единице.',
  'Requirement fits a documented range or exact available step; no rounding was applied': 'Требование входит в записанный диапазон или совпадает со ступенью.',
  'Requirement fits the documented upper boundary; the operating range or steps are unknown': 'Верхний предел достаточен. Рабочий диапазон или ступени неизвестны.',
  'Requirement is not available in the documented complete ranges/steps': 'Требование за пределами заданных диапазонов или ступеней.',
  'Available range/step coverage is incomplete': 'Рабочий диапазон или набор ступеней указан частично.',
  'Only bounds are known; continuous control or the actual discrete steps are not published': 'Известны границы. Плавная регулировка и фактические ступени не подтверждены.',
  'Requirement is covered by the documented union of ranges; gear selection remains explicit': 'Диапазоны покрывают требование. Нужен выбор передачи.',
  'Method is listed in this passport projection; actual tooling is separate': 'Метод указан в карточке. Оснастка проверяется отдельно.',
  'No applicable method evidence is published in this projection': 'В карточке не подтверждена поддержка метода.',
  'Published source conditions give conflicting capacity outcomes': 'Условия в карточке дают противоречивые результаты.',
  'A documented numeric machine limit is unavailable': 'Численный предел не указан.',
  'Conflicting source variants require review': 'Нужно сверить противоречащие друг другу значения.',
  'External source contents have not been verified': 'Внешний источник не проверен.',
  'This source scope has no applicable comparison adapter': 'Для указанных условий автоматическая проверка недоступна.',
};

function reasonText(value: unknown) {
  const raw = String(value ?? '');
  const condition = /^Required source condition is missing or differs: (.+)$/.exec(raw)?.[1];
  if (condition) return `Не совпадает или неизвестно условие «${conditionTitles[condition] ?? condition}».`;
  return reasons[raw] ?? estimateOperatorText(publicSourceText(raw, 'Условие требует уточнения'));
}

function sourceText(value: unknown) {
  const raw = String(value ?? '');
  if (raw.startsWith('Go cycle evidence:')) return 'Расчёт движений цикла';
  if (raw.startsWith('Go calculation evidence:')) return 'Расчёт прохода';
  if (raw === 'Selected stock snapshot') return 'Выбранная заготовка';
  if (raw === 'Longest local axial leg') return 'Наибольший осевой ход прохода';
  return estimateOperatorText(publicSourceText(raw, ''));
}

function valueText(fact: Record<string, unknown>) {
  const unit = units[String(fact.unit)] ?? String(fact.unit ?? '');
  const number = (value: unknown) => String(value).replace('.', ',');
  if (fact.value != null) return `${number(fact.value)} ${unit}`.trim();
  const lower = fact.lower == null ? null : number(fact.lower);
  const upper = fact.upper == null ? null : number(fact.upper);
  if (lower === null && upper === null) return 'Не определено';
  if (lower === null) return `${fact.upper_inclusive === false ? '<' : '≤'} ${upper} ${unit}`;
  if (upper === null) return `${fact.lower_inclusive === false ? '>' : '≥'} ${lower} ${unit}`;
  return `${fact.lower_inclusive === false ? '(' : '['}${lower}; ${upper}${fact.upper_inclusive === false ? ')' : ']'} ${unit}`;
}

function CheckValue({ value }: { value: unknown }) {
  const fact = asRecord(value);
  const conditions = Object.entries(asRecord(fact.conditions))
    .filter(([key]) => conditionTitles[key])
    .map(([key, val]) => `${conditionTitles[key]} · ${publicSourceText(val, 'Не уточнено')}`);
  const origin = [fact.basis === 'assumption' ? 'Допущение' : null, sourceText(fact.source)]
    .filter(Boolean).join(' · ');
  const limitations = Array.isArray(fact.limitations) ? fact.limitations.map(reasonText).filter(Boolean) : [];
  return <div className="space-y-1">
    <p className="tabular-nums">{valueText(fact)}</p>
    {conditions.length > 0 && <p className="text-xs text-muted">{conditions.join(', ')}</p>}
    {origin && <p className="break-words text-xs text-muted">{origin}</p>}
    {limitations.length > 0 && <p className="text-xs text-muted">{limitations.join(' ')}</p>}
  </div>;
}

function operationChecks(detail: Record<string, unknown>) {
  const cycles = (Array.isArray(detail.calculations) ? detail.calculations : [])
    .map(asRecord).filter(cycle => typeof cycle.cycle_id === 'string');
  const saved = Array.isArray(detail.machine_checks) ? detail.machine_checks.map(asRecord) : [];
  const checks = saved.length > 0 ? saved : cycles.flatMap(cycle => Array.isArray(cycle.equipment_checks)
    ? cycle.equipment_checks.map(check => ({ ...asRecord(check), cycle_id: cycle.cycle_id }) as Record<string, unknown>) : []);
  return checks.map(check => {
    const cycleIndex = cycles.findIndex(cycle => cycle.cycle_id === check.cycle_id);
    const workIndex = cycleIndex >= 0 ? cycles[cycleIndex].work_index : check.work_index;
    const work = typeof workIndex === 'number' && Array.isArray(detail.works)
      ? asRecord(detail.works[workIndex]).description : null;
    const context = [
      cycleIndex >= 0 ? `Цикл ${cycleIndex + 1}` : null,
      typeof check.pass_index === 'number' ? `Проход ${check.pass_index + 1}` : null,
      typeof work === 'string' ? formatText(work) : null,
    ].filter(Boolean).join(' · ');
    return { check, context };
  });
}

function parameterTarget(key: string, facts: [string, unknown][], available: unknown) {
  if (!facts.length) return key;
  if (!available) return facts.length === 1 && facts[0][0] === key ? key : null;
  const actual = asRecord(available);
  const actualConditions = Object.entries(asRecord(actual.conditions));
  const matches = facts.filter(([, value]) => {
    const candidate = asRecord(value);
    const conditions = asRecord(candidate.conditions);
    return ['unit', 'basis', 'source', 'locator', 'raw', 'value', 'lower', 'upper', 'lower_inclusive', 'upper_inclusive']
      .every(field => candidate[field] === actual[field])
      && actualConditions.length === Object.keys(conditions).length
      && actualConditions.every(([condition, setting]) => conditions[condition] === setting);
  });
  if (matches.length !== 1) return null;
  const factId = matches[0][0];
  const variant = asRecord(actual.conditions).selection === 'discrete_step' ? factId.replace(/\.step_\d+$/, '') : factId;
  return variant === key ? key + '.base' : variant;
}

export function CompactMachineChecks({ detail }: { detail: Record<string, unknown> }) {
  const checks = operationChecks(detail);
  const basis = asRecord(detail.machine_basis);
  const facts = asRecord(basis.characteristics);
  const machine = basis.machine_id ?? detail.machine_id;
  const registry = useQuery({
    queryKey: ['machine-parameter-registry'],
    queryFn: () => equipmentRequest<MachineRegistry>('exchange/registry'),
    enabled: checks.length > 0,
    staleTime: Infinity,
  }).data;
  if (!checks.length && !machine) return null;
  const configuration = typeof basis.configuration === 'string' && basis.configuration !== 'unverified'
    && /[а-яё\s]/iu.test(basis.configuration) ? publicSourceText(basis.configuration, '') : '';
  const count = checks.filter(({ check }) => check.state === 'incompatible').length;
  const unknown = checks.filter(({ check }) => check.state === 'unverified').length;
  const checked = checks.filter(({ check }) => check.state === 'compatible').length;

  function cardLink(field?: string) {
    const params = new URLSearchParams({ machine: String(machine) });
    if (field) params.set('field', field);
    if (typeof basis.passport_version === 'string') params.set('version', basis.passport_version);
    return `/equipment?${params}`;
  }

  return <InfoBlock title={<>Проверка требований к станку{checks.length > 0 && ` · несовместимо ${count} · не проверено ${unknown} · совместимо ${checked}`}</>}>

    <div className="mt-3 space-y-2">
      {configuration && <p className="text-muted">{configuration}</p>}
      {typeof machine === 'string' && <Link to={cardLink()} className="text-accent underline">Текущая карточка станка</Link>}
      {checks.length === 0 ? <p>В этой редакции нет сохранённых проверок пределов.</p> :
        <div className="max-w-full min-w-0 overflow-x-auto" tabIndex={0} aria-label="Результаты проверки пределов станка">
          <table className="w-full">
            <thead><tr>
              <th scope="col">Показатель</th><th scope="col">Требование перехода</th>
              <th scope="col">Предел по снимку карточки</th><th scope="col">Результат</th>
            </tr></thead>
            <tbody>{checks.map(({ check, context }, index) => {
              const kind = String(check.kind);
              const key = kind === 'cut_piece_length_mm' ? 'minimum_cut_piece_length_mm' : kind;
              const parameter = registry?.parameters[key as ParameterId];
              const title = processTitles[kind] ?? parameter?.title ?? 'Требование операции';
              const scopedFacts = Object.entries(facts).filter(([id]) => id === key || id.startsWith(key + '.'));
              const candidates = !check.available && check.requirement ? scopedFacts : [];
              const target = parameter ? parameterTarget(key, scopedFacts, check.available) : null;
              return <tr key={index}>
                <th scope="row" className="min-w-36 text-left font-normal">
                  {target && typeof machine === 'string' ? <Link to={cardLink(target)} className="text-accent underline">{title}</Link> : title}
                  {context && <p className="mt-1 text-xs text-muted">{context}</p>}
                </th>
                <td>{check.requirement ? <CheckValue value={check.requirement} /> : 'Технологическое условие'}</td>
                <td>{check.available ? <CheckValue value={check.available} /> :
                  candidates.length > 0 ? <InfoBlock title={<>Паспортные значения ({candidates.length})</>}>

                    <ul className="mt-1 space-y-2">{candidates.map(([id, value]) =>
                      <li key={id}><CheckValue value={value} /></li>
                    )}</ul>
                  </InfoBlock> : check.requirement ? 'Не определён' : 'Числовой предел не требуется'}</td>
                <td className="min-w-40">
                  <p className={check.state === 'incompatible' ? 'font-medium text-warning' : 'font-medium'}>{states[String(check.state)] ?? states.unverified}</p>
                  <p className="mt-1 text-xs text-muted">{reasonText(check.reason)}</p>
                </td>
              </tr>;
            })}</tbody>
          </table>
        </div>}
      {checked > 0 && <p className="text-muted">Итог каждой строки относится к указанному требованию. Пригодность установа и оснастки требует своих оснований.</p>}
    </div>
  </InfoBlock>;
}
