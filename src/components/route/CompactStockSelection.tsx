import { InfoBlock } from '@/components/ui/InfoBlock';
import { useId, useState, type ReactNode } from 'react';
import type { components } from '@/api/schema';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { passportExplanation } from '@/utils/compactDrawingEvidence';
import { asRecord, finiteNonnegative, formatNumber, formatText } from '@/utils/compactNumbers';
import { publicSourceText } from '@/utils/publicSource';

type Reading = components['schemas']['CompactReading-Output'];
const fieldClass = 'w-full rounded-md border border-control bg-surface px-3 py-2 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';
const forms: Record<string, string> = {
  round_bar: 'Сплошной круг', round_tube: 'Круглая труба', profile_tube: 'Профильная труба',
  square_bar: 'Квадрат', hex_bar: 'Шестигранник', sheet: 'Лист', forging: 'Поковка', casting: 'Отливка', other: 'Другая форма',
};
const parameters: Record<string, string> = {
  'stock.nominal_diameter': 'Назначенный диаметр проката', 'stock.outer_diameter': 'Наружный диаметр заготовки',
  'stock.wall_thickness': 'Толщина стенки', 'stock.length': 'Длина заготовки на чертеже', 'stock.width': 'Ширина заготовки',
  'stock.thickness': 'Толщина заготовки', 'stock.side': 'Сторона квадрата', 'stock.across_flats': 'Размер под ключ',
  'part.envelope.diameter.nominal': 'Диаметр детали', 'part.envelope.diameter.upper_deviation': 'Верхнее отклонение диаметра',
  'part.envelope.length.nominal': 'Длина детали', 'part.envelope.length.upper_deviation': 'Верхнее отклонение длины',
};
const roundParameterIds = new Set([
  'stock.nominal_diameter', 'part.envelope.diameter.nominal', 'part.envelope.diameter.upper_deviation',
  'part.envelope.length.nominal', 'part.envelope.length.upper_deviation',
]);
const unitLabel = (unit: string) => ({ mm: 'мм', kg: 'кг', deg: '°', percent: '%' })[unit] ?? unit;

export const stockMissingLabels: Record<string, string> = {
  ...parameters, quantity: 'Количество деталей', 'quantity.value': 'Количество деталей',
  'stock_recognition.form': 'Форма заготовки', 'calculation_inputs': 'Расчётные входы подбора',
  'calculation_inputs.norms_snapshot': 'Редакция нормативных данных',
  'calculation_inputs.cutting_profile_ref': 'Условия отрезки',
  'calculation_inputs.allowed_supply_lengths_mm': 'Допустимые длины поставки',
};

export function isRoundReading(reading: Reading) {
  if (reading.stock_prescription_status === 'absent' && reading.stock_form_proposal?.form === 'round_bar' && reading.scope !== 'unsupported') return true;
  return reading.stock_recognition
    ? reading.stock_recognition.status === 'identified' && reading.stock_recognition.form === 'round_bar'
    : reading.scope === 'solid_round';
}

export function updateRoundReading(reading: Reading, key: 'diameter_mm' | 'diameter_upper_deviation_mm' | 'length_mm' | 'length_upper_deviation_mm' | 'prescribed_diameter_mm', raw: string): Reading {
  const ids = { diameter_mm: 'part.envelope.diameter.nominal', diameter_upper_deviation_mm: 'part.envelope.diameter.upper_deviation', length_mm: 'part.envelope.length.nominal', length_upper_deviation_mm: 'part.envelope.length.upper_deviation', prescribed_diameter_mm: 'stock.nominal_diameter' };
  const value = raw.trim() === '' ? null : raw.replace(',', '.');
  const id = ids[key], previous = reading.recognized_parameters?.[id];
  const assignment = key === 'prescribed_diameter_mm';
  if (assignment && value === (reading.round_basis[key] ?? previous?.value ?? null)) return reading;
  return { ...reading, round_basis: { ...reading.round_basis, source: assignment ? reading.round_basis.source : 'Правка оператора', [key]: value },
    ...(assignment && value !== null ? {
      stock_prescription_status: 'present' as const, stock_form_proposal: null,
      stock_recognition: reading.stock_recognition?.form === 'round_bar' ? reading.stock_recognition
        : { status: 'identified' as const, form: 'round_bar', candidates: [], raw_text: reading.stock_recognition?.raw_text ?? '', source: 'Правка оператора' },
    } : {}),
    ...(previous || assignment ? { recognized_parameters: { ...reading.recognized_parameters, [id]: {
      ...previous, unit: previous?.unit ?? 'mm', value, basis: value === null ? 'unknown' : 'manual', source: 'Правка оператора',
    } } } : {}),
  };
}

export function CompactStockRecognition({ reading, onChange, section = 'all', pageCount, actions }: {
  reading: Reading; onChange?: (value: Reading) => void; section?: 'all' | 'stock' | 'part'; pageCount?: number; actions?: ReactNode;
}) {
  const formId = useId(), addParameterId = useId();
  const [newParameter, setNewParameter] = useState('stock.outer_diameter');
  const recognition = reading.stock_recognition;
  const editable = !!onChange;
  const isRound = isRoundReading(reading);
  const entries = Object.entries(reading.recognized_parameters ?? {}).filter(([id]) => (!isRound || !roundParameterIds.has(id)) && (section === 'all' || id.startsWith(`${section}.`)));
  const assigned = reading.recognized_parameters?.['stock.nominal_diameter'];
  const assignedDiameter = reading.round_basis.prescribed_diameter_mm ?? assigned?.value;
  const drawingMaterial = reading.material.text.trim();
  const hasDrawingMaterial = drawingMaterial && !/^(?:`?unknown`?|не (?:указан[ао]?|определ[её]н[ао]?|прочитан[ао]?)|—|-)\.?$/iu.test(drawingMaterial);
  const isPart = section === 'part';
  const choice = recognition?.status === 'identified' ? recognition.form ?? 'unknown' : recognition?.status ?? (isRound ? 'round_bar' : 'unknown');
  const changeForm = (form: string) => {
    const status = form === 'unknown' || form === 'ambiguous' ? form : 'identified';
    onChange?.({ ...reading, scope: status !== 'identified' ? 'uncertain' : form === 'round_bar' ? 'solid_round' : 'unsupported',
      stock_prescription_status: status === 'identified' ? 'present' : 'unknown', stock_form_proposal: null,
      scope_reason: 'Форма заготовки уточнена оператором',
      stock_recognition: {
        status, form: status === 'identified' ? form : null,
        candidates: status === 'ambiguous' ? recognition?.candidates ?? [] : [],
        raw_text: recognition?.raw_text ?? '', source: 'Правка оператора',
      },
    });
  };
  const updateParameter = (id: string, value: string) => {
    const previous = reading.recognized_parameters?.[id];
    if (!previous) return;
    onChange?.({ ...reading, recognized_parameters: { ...reading.recognized_parameters,
      [id]: { ...previous, value: value.trim() === '' ? null : value.replace(',', '.'), basis: value.trim() === '' ? 'unknown' : 'manual', source: 'Правка оператора' },
    } });
  };
  const addParameter = () => {
    if (reading.recognized_parameters?.[newParameter]) return;
    onChange?.({ ...reading, recognized_parameters: { ...reading.recognized_parameters,
      [newParameter]: { value: null, unit: 'mm', raw_text: '', source: 'Правка оператора', basis: 'unknown', explanation: '' },
    } });
  };
  if (isPart && !entries.length) return null;
  return <section className={isPart ? 'compact-workspace-card space-y-3' : 'space-y-3'} aria-labelledby={isPart ? 'compact-part-parameters-heading' : 'compact-stock-form-heading'}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 id={isPart ? 'compact-part-parameters-heading' : 'compact-stock-form-heading'} className="font-semibold">{isPart ? 'Распознанные параметры детали' : 'Форма и параметры заготовки'}</h3>
      {!editable && actions}
    </div>
    {isPart ? null : editable ? <>
      <div><label htmlFor={formId} className="block text-sm">Форма заготовки</label><select id={formId} className={`${fieldClass} mt-1`} value={choice} onChange={event => changeForm(event.target.value)}>
        <option value="unknown">Не определена</option><option value="ambiguous">Несколько возможных форм</option>
        {Object.entries(forms).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        {choice !== 'unknown' && choice !== 'ambiguous' && !forms[choice] && <option value={choice}>{recognition?.raw_text || 'Другая сохранённая форма'}</option>}
      </select></div>
      {recognition && <Input label="Обозначение заготовки на чертеже" value={recognition.raw_text} onChange={event => onChange?.({ ...reading, stock_recognition: { ...recognition, raw_text: event.target.value, source: 'Правка оператора' } })} />}
      {recognition?.status === 'ambiguous' && <p className="text-sm text-muted">Варианты: {(recognition.candidates ?? []).map(form => forms[form] ?? form).join(', ') || 'Не указаны'}. Выберите форму после уточнения источника.</p>}
    </> : <>
      <p className="text-sm">{recognition?.status === 'identified' ? forms[recognition.form ?? ''] || recognition.raw_text || 'Другая сохранённая форма'
        : recognition?.status === 'ambiguous' ? `Форма требует уточнения: ${(recognition.candidates ?? []).map(form => forms[form] ?? form).join(', ') || 'варианты не указаны'}`
          : reading.stock_prescription_status === 'absent' ? 'Назначение заготовки на чертеже отсутствует.' : !recognition && reading.scope === 'solid_round' ? 'Сплошной круг (сохранённое чтение)' : 'Форма заготовки не определена.'}</p>
      {recognition?.raw_text && <p className="text-sm">На чертеже: {recognition.raw_text}</p>}
      {isRound && assignedDiameter != null && <p className="text-sm">
        {assigned?.basis === 'manual' ? 'Назначено оператором' : 'Назначено на чертеже'} · Ø{formatNumber(assignedDiameter)} мм
      </p>}
      <p className="text-sm text-muted break-words">{passportExplanation(publicSourceText(recognition?.source || reading.scope_reason, ''), pageCount)}</p>
    </>}
    {!isPart && <p className="text-sm">{hasDrawingMaterial
      ? <>Материал на чертеже · <strong>{drawingMaterial}</strong></>
      : 'Марка стали на чертеже не указана'}</p>}
    {!isPart && !isRound && <p className="text-sm text-muted">Распознанные параметры сохраняются. Автоматический подбор сейчас доступен для сплошного круглого проката.</p>}
    {entries.length > 0 && <table className="w-full text-sm">
      <thead><tr className="text-left"><th scope="col">Параметр</th><th scope="col">Значение</th><th scope="col">Пояснение</th></tr></thead>
      <tbody>{entries.map(([id, parameter], index) => {
      const label = parameters[id] ?? (parameter.raw_text || `Параметр заготовки ${index + 1}`);
      return <tr key={id} className="border-b border-line align-top">
        <th scope="row" className="py-2 pr-3 text-left font-medium">{label}</th>
        <td className="py-2 pr-3">{editable ? <Input label={`${label}, ${unitLabel(parameter.unit) || 'единица не задана'}`} inputMode="decimal" value={parameter.value ?? ''} onChange={event => updateParameter(id, event.target.value)} error={parameter.value && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(parameter.value) ? 'Введите число или оставьте поле пустым.' : undefined} helperText="Пустое поле означает, что значение неизвестно." />
          : parameter.value == null ? 'Не определено' : `${formatNumber(parameter.value)} ${unitLabel(parameter.unit)}`}</td>
        <td className="py-2 break-words">{[...new Set([parameter.raw_text, passportExplanation(publicSourceText(parameter.source, ''), pageCount), publicSourceText(parameter.explanation, '')].filter(Boolean))].map(item => <p key={item}>{formatText(item)}</p>)}</td>
      </tr>;
    })}</tbody></table>}
    {editable && !isPart && <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-0 flex-1"><label htmlFor={addParameterId} className="text-sm">Параметр для добавления</label><select id={addParameterId} className={`${fieldClass} mt-1`} value={newParameter} onChange={event => setNewParameter(event.target.value)}>
        {Object.entries(parameters).filter(([id]) => id.startsWith('stock.') && (!isRound || !roundParameterIds.has(id))).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select></div>
      <Button variant="outline" size="sm" disabled={!!reading.recognized_parameters?.[newParameter]} onClick={addParameter}>Добавить параметр</Button>
      {reading.recognized_parameters?.[newParameter] && <p className="w-full text-xs text-muted">Этот параметр уже добавлен.</p>}
    </div>}
    {editable && actions}
  </section>;
}

export function CompactStockBatch({ result, quantity, supplyLength, supplyMass }: {
  result: unknown; quantity?: unknown; supplyLength?: unknown; supplyMass?: unknown;
}) {
  const response = asRecord(result);
  if (Object.keys(response).length === 0) return null;
  const batch = asRecord(response.batch_plan);
  const balance = asRecord(response.material_balance);
  const groups = Array.isArray(batch.groups) ? batch.groups.map(asRecord) : [];
  const nominalLength = finiteNonnegative(supplyLength);
  const nominalMass = finiteNonnegative(supplyMass);
  const massPerMm = nominalLength && nominalMass !== null ? nominalMass / nominalLength : null;
  const massForLength = (value: unknown) => {
    const length = finiteNonnegative(value);
    return length === null || massPerMm === null ? null : length * massPerMm;
  };
  const purchaseMass = massForLength(batch.purchase_length_mm);
  const missing = Array.isArray(response.missing_inputs) ? response.missing_inputs.map(String) : [];
  const quantityMissing = quantity === null || missing.includes('quantity') || missing.includes('quantity.value');
  const otherMissing = [...new Set(missing.filter(id => id !== 'quantity' && id !== 'quantity.value').map(id => stockMissingLabels[id] ?? 'Дополнительные условия подбора'))];
  const balanceRows: [string, unknown][] = [
    ['Доступная длина с учётом недостачи поставки', balance.available_length_mm],
    ['Заготовки с резервом допуска отрезки', balance.allocated_piece_length_mm],
    ['Отделительный пропил', balance.separation_kerf_mm],
    ['Торцевая обрезка прутков', balance.head_trim_body_mm],
    ['Пропил торцевой обрезки', balance.head_trim_kerf_mm],
    ['Остаток прутков после раскладки', balance.layout_remnants_mm],
  ];
  return <section className="mt-4 space-y-3" aria-labelledby="compact-stock-batch-heading">
    <h3 id="compact-stock-batch-heading" className="font-medium">Поставка на партию</h3>
    {groups.length > 0 ? <>
      <p className="text-sm">Деталей: {formatNumber(batch.quantity, 0)}. Прутков: {formatNumber(batch.bars_count, 0)}. Закупаемая длина: {formatNumber(batch.purchase_length_mm)} мм.</p>
      <p className="text-sm">Номинальная масса закупки, оценка · {purchaseMass === null ? 'Не определена' : `${formatNumber(purchaseMass)} кг`}</p>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Группы прутков в закупке"><table className="w-full text-sm"><thead><tr>{['Длина прутка, мм', 'Масса прутка, кг', 'Прутков', 'Мест на прутке', 'Назначено отрезков', 'Остаток с прутка, мм'].map(label => <th key={label} scope="col" className="py-2 pr-4 text-left text-xs font-medium text-muted">{label}</th>)}</tr></thead>
        <tbody>{groups.map((group, index) => <tr key={String(group.group_id ?? index)} className="border-b border-line">
          {[group.supply_nominal_length_mm, massForLength(group.supply_nominal_length_mm), group.bar_count, group.capacity_per_bar, group.allocated_pieces_per_bar, group.remnant_per_bar_mm].map((value, cell) => <td key={cell} className="py-2 pr-4 tabular-nums">{formatNumber(value)}</td>)}
        </tr>)}</tbody></table></div>
      {Object.keys(balance).length > 0 && <table className="w-full text-sm">
        <caption className="text-left font-medium">Баланс длины партии</caption>
        <thead><tr><th scope="col">Составляющая</th><th scope="col">Длина, мм</th></tr></thead>
        <tbody>{balanceRows.map(([label, length]) => <tr key={label}><th scope="row">{label}</th><td className="tabular-nums">{formatNumber(length)}</td></tr>)}</tbody>
      </table>}
      {groups.some(group => group.remnant_status === 'undetermined') && <p className="text-sm text-muted">Пригодность остатков для повторного использования не определена.</p>}
    </> : <p className="text-sm text-muted">{response.status === 'unsupported'
      ? 'Для этой формы расчёт поставки пока не поддерживается.'
      : quantityMissing ? 'Укажите количество деталей для расчёта прутков и остатков партии.'
        : response.status === 'infeasible' ? 'Поставка на партию не рассчитана: выбранная заготовка не прошла проверку пригодности.'
          : 'Поставка на партию пока не рассчитана.'}</p>}
    {otherMissing.length > 0 && <p className="text-sm text-muted">Для расчёта нужны: {otherMissing.join('; ')}. Основания и исходные обозначения доступны ниже.</p>}
  </section>;
}

export function CompactCuttingEvents({ result, error }: { result: unknown; error?: unknown }) {
  const response = asRecord(result);
  const hasResponse = Object.keys(response).length > 0;
  const failed = Boolean(error) || (hasResponse && !['complete', 'partial'].includes(String(response.outcome)));
  const calculated = asRecord(response.events);
  const cutEvents = Array.isArray(calculated.cut_event_groups) ? calculated.cut_event_groups.map(asRecord) : [];
  const handlingEvents = Array.isArray(calculated.handling_events) ? calculated.handling_events.map(asRecord) : [];
  const events = failed ? [] : [...cutEvents, ...handlingEvents];
  const eventNames: Record<string, string> = { separation: 'Отделительные резы', head_trim: 'Начальные подрезные резы', bar_load: 'Загрузки прутка', piece_feed: 'Подачи отрезков', clamp: 'Зажимы' };
  const issues = Array.isArray(response.issues) ? response.issues.map(asRecord).filter(issue => typeof issue.message === 'string') : [];
  const errorRecord = asRecord(error);
  const diagnostic = error instanceof Error ? error.message : typeof error === 'string' ? error
    : typeof errorRecord.detail === 'string' ? errorRecord.detail : typeof errorRecord.message === 'string' ? errorRecord.message
      : error ? 'Для расчёта отрезки нужно проверить исходные условия.' : '';
  return <section className="space-y-3 border-t border-line pt-4" aria-labelledby="compact-cutting-events-heading">
    <h2 id="compact-cutting-events-heading" className="font-semibold">Отрезка партии</h2>
    {events.length > 0 ? <>
      <ul className="space-y-1 text-sm">{events.map((event, index) => {
        const count = typeof event.count === 'number' && Number.isSafeInteger(event.count) && event.count >= 0 && event.count_basis !== 'unknown' ? event.count : null;
        return <li key={String(event.event_id ?? index)}>{eventNames[String(event.kind)] ?? 'Событие отрезки'}: {formatNumber(count, 0)}</li>;
      })}</ul>
      {(response.outcome === 'partial' || !Array.isArray(calculated.cut_event_groups) || !Array.isArray(calculated.handling_events)) && <p className="text-sm text-muted">Расчёт отрезки неполон: часть событий не определена.</p>}
      {response.conditional === true && <p className="text-sm text-warning">Оценка отрезки использует принятые допущения.</p>}
    </> : <p className="text-sm text-muted">{failed ? 'Отрезка партии не определена: расчёт не выполнен.' : hasResponse ? 'Отрезка партии не определена: недостаточно данных для событий отрезки.' : 'Отрезка партии не определена: отдельный расчёт ещё не получен.'}</p>}
    {(issues.length > 0 || diagnostic) && <InfoBlock className="text-sm text-muted" title="Основания расчёта отрезки">
      {diagnostic && <p className="mt-2 whitespace-pre-wrap break-words">{publicSourceText(diagnostic, 'Исходные условия расчёта требуют проверки')}</p>}
      {issues.length > 0 && <ul className="mt-2 space-y-2">{issues.map((issue, index) => <li key={index} className="whitespace-pre-wrap break-words">{publicSourceText(issue.message, 'Условия отрезки требуют уточнения')}</li>)}</ul>}
    </InfoBlock>}
  </section>;
}
