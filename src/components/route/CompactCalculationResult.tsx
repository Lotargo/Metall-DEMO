import { asRecord as record, finiteNonnegative, formatNumber as numeric, formatText as text } from '@/utils/compactNumbers';
import { estimateOperatorText } from './estimateOperatorText';
import { publicSourceText } from '@/utils/publicSource';
import './compact-calculation-result.css';

const th = 'py-2 pr-4 text-left text-xs font-medium text-muted';
const td = 'py-2 pr-4 align-top text-sm tabular-nums';
const units: Record<string, string> = { mm: 'мм', 'm/min': 'м/мин', 'mm/min': 'мм/мин', 'mm/rev': 'мм/об', 'rev/min': 'об/мин', deg: '°', '1': '', 'N/mm2': 'Н/мм²', 'cm2/min': 'см²/мин', min: 'мин' };
const methodLabels: Record<string, string> = {
  'forming.round.bend/1': 'Гибка круглого прутка',
  'manufacturing.feature.feed-estimate/1': 'Обработка типовой геометрии',
  'finishing.surface.norm/1': 'Поверхностный процесс по выбранной норме',
  'turning.longitudinal.constant-n/1': 'Продольное точение', 'turning.facing.constant-n/1': 'Торцовка',
  'sawing.round.area-rate/1': 'Отрезка круглого проката', 'turning.boring.constant-n/1': 'Расточка',
  'drilling.axial.constant-n/1': 'Осевое сверление', 'turning.grooving.constant-n/1': 'Радиальная канавка',
  'turning.thread.constant-n/1': 'Нарезание резьбы резцом',
  'turning.profile.constant-n/1': 'Наружный профиль с радиусами',
  'slotting.internal-keyway.stroke-rate/1': 'Долбление внутреннего паза',
};
const cycleLabels: Record<string, string> = {
  'turning.inclined-cycle.constant-n/1': 'Точение наклонного профиля',
  'drilling.centering.constant-n/1': 'Центрование',
  'drilling.axial-cycle.constant-n/1': 'Цикл осевого сверления',
  'tapping.blind.rigid-sync/1': 'Синхронное метчикование',
  'milling.slot.straight/1': 'Фрезерование продольного паза',
  'grinding.external-cylinder.traverse/1': 'Наружное круглое шлифование',
};
const operandLabels: Record<string, string> = {
  diameter_mm: 'Диаметр', initial_diameter_mm: 'Исходный диаметр', outer_diameter_mm: 'Наружный диаметр', inner_diameter_mm: 'Внутренний диаметр',
  initial_bore_diameter_mm: 'Исходный диаметр отверстия', final_bore_diameter_mm: 'Диаметр отверстия после прохода',
  radial_depth_mm: 'Радиальная глубина', axial_depth_mm: 'Осевой слой', cut_length_mm: 'Длина контакта', contact_length_mm: 'Длина контакта',
  depth_mm: 'Глубина', full_depth_mm: 'Глубина полного диаметра', full_thread_depth_mm: 'Глубина полной резьбы',
  feed_travel_mm: 'Рабочий путь', material_depth_mm: 'Глубина или толщина материала', tip_angle_deg: 'Угол вершины сверла', breakthrough_extra_mm: 'Дополнительный выход сверла',
  kerf_mm: 'Ширина пропила', tool_width_mm: 'Ширина инструмента', newly_removed_width_mm: 'Новая обрабатываемая ширина',
  thread_pitch_mm: 'Шаг резьбы', nominal_diameter_mm: 'Номинальный диаметр резьбы', return_travel_mm: 'Путь возврата', return_feed_mm_per_min: 'Скорость возврата',
  cutting_speed_m_per_min: 'Скорость резания', feed_mm_per_rev: 'Подача на оборот', spindle_rpm: 'Частота вращения', reference_diameter_mm: 'Опорный диаметр режима',
  entering_angle_deg: 'Главный угол в плане', rake_angle_deg: 'Передний угол', efficiency_ratio: 'КПД', kc11_n_per_mm2: 'Коэффициент удельной силы', mc: 'Показатель модели силы',
  band_speed_m_per_min: 'Скорость полотна', area_rate_cm2_per_min: 'Площадная производительность',
  approach_feed_mm_per_min: 'Подача подвода', retract_feed_mm_per_min: 'Подача вывода', dwell_min: 'Длительность выдержки',
  peck_step_mm: 'Шаг углубления', retract_clearance_mm: 'Зазор вывода', reentry_clearance_mm: 'Зазор повторного входа',
  forward_rpm: 'Обороты прямого хода', reverse_rpm: 'Обороты обратного хода', reversal_time_min: 'Время реверса',
};
const timeMetrics: [string, string, string][] = [
  ['developed_length_mm', 'Длина развёртки', 'мм'],
  ['double_strokes', 'Двойные ходы', 'шт.'], ['double_strokes_per_min', 'Частота двойных ходов', 'дв.ход/мин'], ['stroke_length_mm', 'Ход долбяка', 'мм'],
  ['cut_time_min', 'Время резания', 'мин'], ['feed_time_min', 'Время рабочего хода', 'мин'], ['return_time_min', 'Время возврата', 'мин'], ['cycle_time_min', 'Время хода с возвратом', 'мин'],
  ['feed_travel_mm', 'Рабочий путь', 'мм'],
  ['spindle_rpm', 'Частота вращения', 'об/мин'], ['feed_mm_per_min', 'Минутная подача', 'мм/мин'], ['cutting_speed_m_per_min', 'Скорость резания', 'м/мин'],
];
const engineeringMetrics: [string, string, string][] = [
  ['material_volume_mm3', 'Объём прутка при гибке', 'мм³'], ['added_volume_mm3', 'Добавленный материал покрытия', 'мм³'],
  ['removed_volume_mm3', 'Снятый объём', 'мм³'], ['section_area_mm2', 'Площадь реза', 'мм²'],
  ['removal_rate_cm3_per_min', 'Объёмная производительность', 'см³/мин'], ['average_removal_rate_cm3_per_min', 'Средняя производительность рабочего хода', 'см³/мин'],
  ['tangential_force_n', 'Тангенциальная сила', 'Н'], ['net_cutting_power_kw', 'Мощность резания', 'кВт'], ['drive_power_kw', 'Мощность привода', 'кВт'], ['cutting_torque_nm', 'Момент резания', 'Н·м'],
  ['engaged_net_cutting_power_kw', 'Мощность при полном контакте', 'кВт'], ['engaged_cutting_torque_nm', 'Момент при полном контакте', 'Н·м'],
];
function metricValue(value: unknown): string {
  const metric = record(value);
  if (metric.state === 'known') return numeric(metric.value);
  if (metric.state === 'unsupported') return 'Метод не рассчитывает';
  if (metric.state === 'invalid') return 'Противоречивые данные';
  if (metric.state === 'not_applicable') return 'Не требуется';
  return 'Недостаточно данных';
}

function isSavedCycle(value: unknown): boolean {
  return typeof record(value).cycle_id === 'string';
}

export function cycleEndLabel(frame: unknown): string | null {
  if (typeof frame !== 'string') return null;
  const parts = frame.split(':');
  const left = parts.includes('left-end');
  const right = parts.includes('right-end');
  if (left === right) return null;
  return left ? 'Левый торец' : 'Правый торец';
}

function uniqueText(values: unknown[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.trim() !== ''))];
}

function operatorNotes(values: unknown[]): string[] {
  return uniqueText(uniqueText(values).map(value => estimateOperatorText(publicSourceText(value, ''))));
}

function cycleReasons(cycle: Record<string, unknown>, request: Record<string, unknown>, response: Record<string, unknown>): string[] {
  const issues = Array.isArray(response.issues) ? response.issues.map(record) : [];
  const missing = uniqueText(issues.flatMap(issue => issue.code === 'missing-input' && Array.isArray(issue.input_paths) ? issue.input_paths : []))
    .flatMap(path => {
      const [, group, field] = path.split('/');
      return record(record(request[group])[field]).origin === 'unknown' ? [operandLabels[field] ?? 'Дополнительные параметры цикла'] : [];
    });
  const gaps = Array.isArray(cycle.gaps) ? cycle.gaps : [];
  const missingReason = missing.length > 0 ? `Не определены входы: ${[...new Set(missing)].join(', ')}.` : null;
  return operatorNotes([cycle.error, missingReason, ...gaps, ...issues.map(issue => issue.message)]);
}

export function CompactPassTables({ detail }: { detail: Record<string, unknown> }) {
  const passes = Array.isArray(detail.passes) ? detail.passes : [];
  const calculations = Array.isArray(detail.calculations) ? detail.calculations.filter(value => !isSavedCycle(value)) : [];
  if (!passes.length) return null;
  return <section className="calculation-passes" aria-label="Расчётные проходы">
    <h4 className="font-semibold">Расчётные проходы</h4>
    {passes.map((raw, index) => {
    const pass = record(raw), calculation = record(calculations[index]), response = record(calculation.response);
    const result = record(response.metrics);
    const availableTimeMetrics = timeMetrics.filter(([key]) => result[key] != null);
    const availableEngineeringMetrics = engineeringMetrics.filter(([key]) => result[key] != null);
    const input = Object.entries(record(pass.operands)).filter(([, value]) => value != null);
    const timeCandidates = [
      ['Время хода с возвратом', result.cycle_time_min],
      ['Время рабочего хода', result.feed_time_min],
      ['Время резания', result.cut_time_min],
    ] as const;
    const time = timeCandidates.find(([, value]) => record(value).state === 'known' && finiteNonnegative(record(value).value) !== null)
      ?? timeCandidates.find(([, value]) => value != null);
    const timeText = time && record(time[1]).state === 'invalid' ? metricValue(time[1]) : calculation.error ? 'Не рассчитано' : time ? metricValue(time[1]) : 'Не определено';
    const headline = [time?.[1], result.feed_travel_mm, result.spindle_rpm, result.feed_mm_per_min];
    const extraMetrics = [...availableTimeMetrics, ...availableEngineeringMetrics].filter(([key]) => !headline.includes(result[key]));
    return <section key={index} className="calculation-pass" aria-label={`Проход ${index + 1}`}>
      <header><h4>Проход {index + 1} · {methodLabels[String(pass.method)] ?? 'Расчётный проход'}{pass.pass_purpose === 'spring' ? ' · зачистной ход' : ''}</h4>
        {pass.description != null && <p className="text-muted">{text(pass.description)}</p>}
      </header>
      <dl className="calculation-metrics">
        <div><dt>{time?.[0] ?? 'Время'}, мин</dt><dd>{timeText}</dd></div>
        <div><dt>Рабочий путь, мм</dt><dd>{result.feed_travel_mm ? metricValue(result.feed_travel_mm) : 'Не определён'}</dd></div>
        <div><dt>Обороты, об/мин</dt><dd>{result.spindle_rpm ? metricValue(result.spindle_rpm) : 'Не определены'}</dd></div>
        <div><dt>Подача, мм/мин</dt><dd>{result.feed_mm_per_min ? metricValue(result.feed_mm_per_min) : 'Не определена'}</dd></div>
      </dl>
      {Boolean(calculation.error) && <div className="text-warning"><p>Время прохода пока неизвестно.</p>{operatorNotes([calculation.error]).map(reason => <p key={reason}>{reason}</p>)}</div>}
      {input.length > 0 && <div className="overflow-x-auto"><table className="w-full"><caption className="text-left font-medium">Параметры и основания прохода {index + 1}</caption><thead><tr><th className={th}>Параметр</th><th className={th}>Значение</th><th className={th}>Основание</th></tr></thead><tbody>{input.map(([key, rawNumber]) => {
          const number = record(rawNumber);
          return <tr key={key} className="border-b border-line"><th scope="row" className={`${td} text-left font-normal`}>{operandLabels[key] ?? 'Дополнительный параметр'}</th><td className={td}>{numeric(number.value)} {units[String(number.unit)] ?? text(number.unit)}</td><td className={`${td} min-w-40 text-pretty`}>{number.basis === 'assumption' ? 'Допущение. ' : number.basis === 'unknown' ? 'Не определено. ' : 'По источнику. '}{operatorNotes([number.source])[0]}</td></tr>;
        })}</tbody></table></div>}
      {extraMetrics.length > 0 && <div className="overflow-x-auto"><table className="w-full"><caption className="text-left font-medium">Дополнительные результаты прохода {index + 1}</caption><thead><tr><th>Показатель</th><th>Значение</th></tr></thead><tbody>{extraMetrics.map(([key, label, unit]) => <tr key={key}><th scope="row">{label}, {unit}</th><td className="tabular-nums">{metricValue(result[key])}</td></tr>)}</tbody></table></div>}
    </section>;
  })}</section>;
}

export function CompactCycleTable({ detail }: { detail: Record<string, unknown> }) {
  const cycles = Array.isArray(detail.calculations) ? detail.calculations.filter(isSavedCycle).map(record) : [];
  const works = Array.isArray(detail.works) ? detail.works : [];
  if (!cycles.length) return null;

  return <div className="max-w-full min-w-0 overflow-x-auto" tabIndex={0}>
    <table className="w-full text-sm">
      <caption className="text-left font-medium">Расчётные циклы</caption>
      <thead><tr>
        <th scope="col">Цикл и работа</th><th scope="col">Кратность на деталь</th>
        <th scope="col">Время движений на деталь, мин</th><th scope="col">Основания</th>
      </tr></thead>
      <tbody>{cycles.map(cycle => {
        const work = record(typeof cycle.work_index === 'number' ? works[cycle.work_index] : null);
        const method = text(cycle.method_id ?? record(cycle.request).method);
        const end = cycleEndLabel(cycle.frame_ref);
        const request = record(cycle.request);
        const response = record(cycle.response);
        const minutes = finiteNonnegative(cycle.minutes);
        const quote = record(cycle.commercial_time);
        const quotedMinutes = quote.state === 'estimated' ? finiteNonnegative(quote.cycle_minutes_per_part) : null;
        const reasons = cycleReasons(cycle, request, response);
        let quoteSource = null;
        if (quotedMinutes !== null) {
          quoteSource = method === 'tapping.blind.rigid-sync/1'
            ? 'Оценка по норме синхронного подвода и отвода. При неизвестном времени реверса добавляется его оценка.'
            : `Оценочная скорость ${numeric(quote.rapid_mm_per_min)} мм/мин и ${numeric(quote.ramp_seconds)} с на разгон и торможение движения.`;
        }
        const sources = operatorNotes([record(cycle.regime).source, record(request.strategy).source, work.source, quoteSource]);
        const extraReasons = minutes === null ? reasons.slice(1) : reasons;
        const status = response.outcome === 'invalid' ? 'Расчёт отклонён'
          : response.outcome === 'not_applicable' ? 'Цикл не требуется'
          : minutes !== null && cycle.complete !== true ? 'Известная часть времени'
          : null;
        return <tr key={String(cycle.cycle_id)}>
          <th scope="row" className="pr-4 align-top text-left font-normal">
            <p>{cycleLabels[method] ?? methodLabels[method] ?? 'Расчётный цикл'}{end && ` · ${end}`}</p>
            {typeof work.description === 'string' && <p className="mt-1 text-muted">{text(work.description)}</p>}
          </th>
          <td className={td}>{numeric(cycle.repetitions)}</td>
          <td className={td}>
            <p>{numeric(minutes)}</p>
            {status && <p className="mt-1 text-xs text-muted">{status}</p>}
            {quotedMinutes !== null && <p className="mt-1">Оценка цикла для сметы · {numeric(quotedMinutes)} мин</p>}
            {response.conditional === true && <p className="mt-1 text-xs text-muted">Условный расчёт</p>}
            {response.demonstration === true && <p className="mt-1 text-xs text-muted">Демонстрационный расчёт</p>}
            {minutes === null && <p className="mt-1 text-muted">{reasons[0] ?? 'Причина не указана в сохранённом результате.'}</p>}
          </td>
          <td className="align-top">
            {sources.length || extraReasons.length ? <div className="calculation-notes">

              <div className="mt-2 space-y-2 break-words">
                {sources.length > 0 && <ul className="space-y-1">{sources.map(source => <li key={source}>{source}</li>)}</ul>}
                {extraReasons.length > 0 && <ul className="space-y-1">{extraReasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
              </div>
            </div> : <span className="text-muted">Источник не указан</span>}
          </td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}

export { CompactMaterialEvidence } from './CompactMaterialEvidence';
