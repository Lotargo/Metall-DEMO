import { InfoBlock } from '@/components/ui/InfoBlock';
import { useState } from 'react';
import type { MachineRegistry, MachineWorkingRegime } from '@/api/machineExchange';
import { formatText } from '@/utils/compactNumbers';

const units: Record<string, string> = { 'm/min': 'м/мин', 'rev/min': 'об/мин', 'mm/rev': 'мм/об', 'mm/min': 'мм/мин', 'cm2/min': 'см²/мин', mm: 'мм', deg: '°', min: 'мин', '1': 'шт.' };
const source = 'Введено вручную для предварительного расчёта по карточке станка';
const conditionNames: Record<string, string> = {
  material_state: 'Состояние материала', section: 'Сечение', diameter_mm: 'Диаметр, мм',
  blade: 'Полотно', blade_tpi: 'Шаг зубьев, TPI', coolant: 'СОЖ', blade_break_in: 'Приработка полотна',
};
const materialStates: Record<string, string> = {
  normalised_or_annealed: 'после нормализации или отжига',
  solution_annealed: 'после отжига на твёрдый раствор',
};
const sectionNames: Record<string, string> = { solid_round: 'сплошной круг', single_solid_round: 'сплошной круг' };
const coolantNames: Record<string, string> = { wet: 'с охлаждением', dry: 'без охлаждения', flood: 'подача поливом' };

function materialState(value: string) {
  return materialStates[value] ?? (/^test(?:-|$)/i.test(value) ? 'условия проверочного расчёта' : formatText(value));
}

function conditionValue(key: string, value: string) {
  if (key === 'material_state') return materialState(value);
  if (key === 'section') return sectionNames[value] ?? formatText(value);
  if (key === 'coolant') return coolantNames[value] ?? formatText(value);
  if (key === 'blade_break_in' && value === 'done') return 'выполнена';
  return formatText(value);
}

export function MachineWorkingRegimes({ regimes, registry, save, onError }: {
  regimes: MachineWorkingRegime[];
  registry: MachineRegistry['working_regimes'];
  save: (values: MachineWorkingRegime[]) => void;
  onError: (message: string) => void;
}) {
  const [method, setMethod] = useState<MachineWorkingRegime['method_id'] | ''>('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  function change(next: MachineWorkingRegime[], nextErrors = errors) {
    save(next);
    onError(Object.values(nextErrors)[0] ?? (next.some(r => !Object.keys(r.parameters).length) ? 'Заполните хотя бы один параметр рабочего режима или удалите пустой режим.' : ''));
  }
  function edit(index: number, key: string, raw: string) {
    const id = `${index}:${key}`;
    setDrafts(previous => ({ ...previous, [id]: raw }));
    const text = raw.trim().replace(',', '.');
    const nextErrors = { ...errors }; delete nextErrors[id];
    const value = Number(text);
    if (text && (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) || !Number.isFinite(value) || (key !== 'rake_angle_deg' && value <= 0) || (key === 'entering_angle_deg' && value > 180))) {
      nextErrors[id] = 'Укажите допустимое число для рабочего режима.'; setErrors(nextErrors); onError(nextErrors[id]); return;
    }
    const row = regimes[index];
    const parameters = { ...row.parameters };
    if (!text) delete parameters[key];
    else parameters[key] = { value: text, lower: null, upper: null, lower_inclusive: true, upper_inclusive: true, unit: registry.parameters[key].unit, raw: '', source, locator: '', standard: '', conditions: {}, limitations: [], basis: 'assumption' };
    setErrors(nextErrors);
    change(regimes.map((old, i) => i === index ? { ...old, parameters } : old), nextErrors);
  }
  return <InfoBlock className="machine-data-extra" title={<>Рабочие режимы для предварительного расчёта · {regimes.length}</>}>

    <div className="machine-data-extra-content">
      <p className="passport-count">Рабочие значения учитываются в предварительном расчёте при совпадении условий. Паспортные пределы указаны отдельно.</p>
      {regimes.map((regime, index) => {
        const applicability = Object.entries(regime.applicability ?? {});
        const readOnly = registry.methods[regime.method_id].requires_cycle_scope || applicability.length > 0;
        return <fieldset className="machine-field-form" key={index}>
        <legend>{registry.methods[regime.method_id].title}</legend>
        {registry.methods[regime.method_id].requires_cycle_scope && <p className="passport-count">Состояние материала — {materialState(regime.cycle_material_state)}. Инструмент — {formatText(regime.cycle_tool)}{regime.cycle_secondary_tool ? ` и ${formatText(regime.cycle_secondary_tool)}` : ''}.</p>}
        {applicability.length > 0 && <p className="passport-count">Условия применения · {applicability.map(([key, value]) => `${conditionNames[key] ?? 'Дополнительное условие'} — ${conditionValue(key, value)}`).join(' · ')}</p>}
        {readOnly && <p className="passport-count">Для изменения режима загрузите структурированный паспорт.</p>}
        <label>Материал режима<input aria-label={`Материал режима ${index + 1}`} value={regime.material_grade} readOnly={readOnly} placeholder="Любой материал — предварительная оценка" onChange={e => change(regimes.map((old, i) => i === index ? { ...old, material_grade: e.target.value.trim() } : old))} /></label>
        <table className="machine-parameter-table"><thead><tr><th scope="col">Параметр</th><th scope="col">Значение</th></tr></thead><tbody>{registry.methods[regime.method_id].parameters.map(key => {
          const definition = registry.parameters[key]; const id = `${index}:${key}`;
          return <tr key={key}><th scope="row">{definition.title}</th><td><div className="machine-value-cell"><div className="machine-number-fields"><input inputMode="decimal" aria-label={`${definition.title} · режим ${index + 1}`} aria-invalid={Boolean(errors[id])} value={drafts[id] ?? regime.parameters[key]?.value ?? ''} readOnly={readOnly} placeholder="Не указано" onChange={e => edit(index, key, e.target.value)} /></div><span className="machine-value-unit">{units[definition.unit] ?? definition.unit}</span></div></td></tr>;
        })}</tbody></table>
        <button type="button" className="secondary-action" onClick={() => { setDrafts({}); setErrors({}); change(regimes.filter((_, i) => i !== index), {}); }}>Удалить режим {index + 1}</button>
        </fieldset>;
      })}
      <div className="machine-data-grid"><label>Новый рабочий режим<select aria-label="Новый рабочий режим" value={method} onChange={e => setMethod(e.target.value as typeof method)}><option value="">Выберите обработку</option>{Object.entries(registry.methods).filter(([, entry]) => !entry.requires_cycle_scope).map(([id, entry]) => <option key={id} value={id} disabled={regimes.some(r => r.method_id === id && !r.material_grade)}>{entry.title}</option>)}</select></label><button type="button" className="secondary-action" disabled={!method} onClick={() => { if (method) change([...regimes, { method_id: method, material_grade: '', description: 'Ориентировочный рабочий режим', cycle_tool: '', cycle_secondary_tool: '', cycle_material_state: '', parameters: {} }]); setMethod(''); }}>Добавить рабочий режим</button></div>
    </div>
  </InfoBlock>;
}
