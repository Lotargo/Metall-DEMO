import { InfoBlock } from '@/components/ui/InfoBlock';
import React, { useEffect, useId, useRef, useState } from 'react';
import type { MachineFact, MachineParameter, MachineRegistry } from '@/api/machineExchange';

const unitLabels: Record<string, string> = { mm: 'мм', kg: 'кг', rpm: 'об/мин', 'mm/min': 'мм/мин', 'mm/rev': 'мм/об', 'm/min': 'м/мин', 'm/s': 'м/с', kW: 'кВт', 'N*m': 'Н·м', N: 'Н', deg: '°', '1': 'шт.' };
const shapeLabels: Partial<Record<MachineParameter['representation'], string>> = { maximum: 'до', minimum: 'от', continuous_range: 'Диапазон', discrete_steps: 'Ступени', bounds_only: 'Границы' };
const inputShapes = { scalar: 'Одно значение', maximum: 'Максимум', minimum: 'Минимум', continuous_range: 'Диапазон', discrete_steps: 'Ступени', bounds_only: 'Только известные границы' } as const;
const manualSource = 'Ручной ввод в карточке станка';

function values(parameter: MachineParameter): [string, string] {
  if (parameter.representation === 'discrete_steps') return [parameter.facts.map(f => f.value).join('; '), ''];
  const fact = parameter.facts[0];
  if (['continuous_range', 'bounds_only'].includes(parameter.representation)) return [fact?.lower ?? '', fact?.upper ?? ''];
  return [fact?.value ?? fact?.upper ?? fact?.lower ?? '', ''];
}

function initialShape(parameter: MachineParameter, comparison: string): MachineParameter['representation'] {
  if (parameter.representation !== 'unknown') return parameter.representation;
  return comparison === 'maximum' ? 'maximum' : 'scalar';
}

function number(text: string) {
  const value = text.trim();
  if (!value) return null;
  if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(value)) throw new Error('Введите число. Ступени разделяются «;».');
  return value.replace(',', '.');
}

export function MachineParameterRow({ parameter, reference, definition, scope, hidden, targeted, purpose, evidence, save, onError, advanced }: {
  parameter: MachineParameter;
  reference?: MachineParameter;
  definition: MachineRegistry['parameters'][MachineParameter['parameter_id']];
  scope: string;
  hidden: boolean;
  targeted?: boolean;
  purpose?: string;
  evidence?: React.ReactNode;
  save: (parameter: MachineParameter) => void;
  onError: (message: string) => void;
  advanced: React.ReactNode;
}) {
  const detailId = useId();
  const rowRef = useRef<HTMLTableRowElement>(null);
  const [text, setText] = useState(values(parameter));
  const [shape, setShape] = useState(initialShape(parameter.representation === 'unknown' && reference ? reference : parameter, definition.comparison));
  const [error, setError] = useState('');
  const title = definition.title + (scope ? ` · ${scope}` : '');
  const range = ['continuous_range', 'bounds_only'].includes(shape);
  const unavailable = shape === 'not_applicable';
  useEffect(() => {
    if (targeted && !hidden) {
      rowRef.current?.focus({ preventScroll: true });
      rowRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [targeted, hidden]);
  function reportError(message: string) { setError(message); onError(message); }
  function edit(index: number, value: string) {
    const next: [string, string] = [...text];
    next[index] = value;
    setText(next);
    try {
      const numbers = shape === 'discrete_steps'
        ? next[0].split(/[;\n]/).filter(v => v.trim()).map(number)
        : next.map(number);
      if (!numbers.some(v => v !== null)) {
        save({ ...parameter, representation: 'unknown', facts: [], set_complete: false, reason: 'Сведения не указаны' });
      } else {
        if (shape === 'continuous_range' && numbers.some(v => v === null)) throw new Error('Укажите обе границы диапазона.');
        const first = parameter.facts[0] ?? reference?.facts[0];
        const fact: MachineFact = { value: null, lower: null, upper: null, lower_inclusive: first?.lower_inclusive ?? true, upper_inclusive: first?.upper_inclusive ?? true, unit: parameter.unit, raw: '', source: manualSource, locator: '', standard: '', basis: 'assumption', limitations: [], document_id: null, conditions: Object.fromEntries(Object.entries(first?.conditions ?? {}).filter(([key]) => !['selection', 'set_complete'].includes(key))) };
        const facts = shape === 'discrete_steps' ? numbers.map(value => ({ ...fact, value }))
          : range ? [{ ...fact, lower: numbers[0], upper: numbers[1] }]
          : [{ ...fact, value: shape === 'scalar' ? numbers[0] : null, lower: shape === 'minimum' ? numbers[0] : null, upper: shape === 'maximum' ? numbers[0] : null }];
        const originalValues = values(parameter);
        if (shape !== parameter.representation || numbers.join(';') !== (shape === 'discrete_steps' ? originalValues[0].split(';').map(v => number(v)) : originalValues.map(number)).join(';')) {
          save({ ...parameter, representation: shape, facts, set_complete: false, reason: manualSource });
        }
      }
      reportError('');
    } catch (error) { reportError(error instanceof Error ? error.message : 'Проверьте число'); }
  }
  function changeShape(next: MachineParameter['representation']) {
    setShape(next);
    setText(['', '']);
    if (parameter.representation !== 'unknown') {
      save({ ...parameter, representation: 'unknown', facts: [], set_complete: false, reason: 'Сведения не указаны' });
    }
    reportError('');
  }
  const referenceText = reference ? values(reference).filter(Boolean).join(' — ') : '';
  const unit = unitLabels[parameter.unit] ?? parameter.unit;
  const description = [purpose && `${detailId}-purpose`, error && `${detailId}-error`].filter(Boolean).join(' ');
  const field = (index: number, label: string) => shape === 'discrete_steps' ? <textarea
    className="ui-input machine-step-values" rows={1} aria-label={label} aria-invalid={Boolean(error)} aria-describedby={description || undefined}
    value={text[index]} onChange={e => edit(index, e.target.value)}
  /> : <input className="ui-input"
    aria-label={label} aria-invalid={Boolean(error)} aria-describedby={description || undefined}
    inputMode="decimal"
    value={text[index]} placeholder={range ? (index === 0 ? 'от' : 'до') : 'Не указано'}
    onChange={e => edit(index, e.target.value)}
  />;
  return <>
    <tr ref={rowRef} tabIndex={targeted ? -1 : undefined} data-parameter={parameter.parameter_id} data-requested={targeted || undefined} hidden={hidden}>
      <th scope="row">
        {title} <span className="machine-value-unit">{unit}</span>
        {purpose && <p id={`${detailId}-purpose`} className="machine-table-hint">{purpose}</p>}
        {evidence}
      </th>
      <td className="machine-reference-value">
        {referenceText ? <>{reference && ['maximum', 'minimum'].includes(reference.representation) && `${shapeLabels[reference.representation]} `}{referenceText}</> : 'Неизвестно'}
      </td>
      <td>
        <div className="machine-value-cell">
          {unavailable ? <span className="machine-value-empty">Не относится</span> : <>
            {shapeLabels[shape] && <span className="machine-value-shape">{shapeLabels[shape]}</span>}
            <div className={`machine-number-fields${range ? ' is-range' : ''}`}>
              {field(0, range ? `${title}: нижняя граница` : title)}
              {range && <><span aria-hidden="true">—</span>{field(1, `${title}: верхняя граница`)}</>}
            </div>
          </>}
          {!unavailable && <label className="machine-format-field">Формат ввода<select className="ui-select ui-select--native" aria-label={`Формат ввода: ${title}`} value={shape} onChange={e => changeShape(e.target.value as typeof shape)}>
            {Object.entries(inputShapes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>}
          {text.some(Boolean) && <p className="machine-table-hint">Смена формата очистит введённые значения.</p>}
        </div>
        {error && <span id={`${detailId}-error`} role="alert" className="machine-value-error">{error}</span>}
      </td>
    </tr>
    <tr id={detailId} className="machine-parameter-details" hidden={hidden}>
      <td colSpan={3}><InfoBlock title={<>Паспортные данные · {title}</>}>{advanced}</InfoBlock></td>
    </tr>
  </>;
}
