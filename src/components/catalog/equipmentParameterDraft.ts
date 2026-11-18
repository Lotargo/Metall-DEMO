import type { MachineParameter, MachineFact } from '@/api/machineExchange';

export function parameterInputs(parameter: MachineParameter): [string,string,string] {
  if (parameter.representation === 'discrete_steps') return [parameter.facts.map(fact => fact.value).join('; '),'',''];
  const fact = parameter.facts[0];
  return [fact?.value ?? '', fact?.lower ?? '', fact?.upper ?? ''];
}
export function operatorParameter(parameter: MachineParameter, input: [string,string,string]): MachineParameter {
  const parse = (value: string) => {
    const normalized = value.trim().replace(',','.');
    if (!normalized || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized) || !Number.isFinite(Number(normalized))) throw new Error('Введите конечное число.');
    return normalized;
  };
  const [value, lower, upper] = input.map(text => text.trim());
  if (!value && !lower && !upper) return { ...parameter, representation: 'unknown', facts: [], set_complete: false, reason: 'Значение не указано' };
  if (value && (lower || upper)) throw new Error('Укажите значение либо границы диапазона.');
  if (lower && upper && Number(parse(lower)) > Number(parse(upper))) throw new Error('Нижняя граница больше верхней.');
  const base: MachineFact = { value: null, lower: null, upper: null, lower_inclusive: true, upper_inclusive: true,
    unit: parameter.unit, raw: '', source: 'Задано в конфигураторе', locator: '', standard: '', basis: 'assumption', limitations: [], document_id: null,
    conditions: Object.fromEntries(Object.entries(parameter.facts[0]?.conditions ?? {}).filter(([key]) => !['selection','set_complete'].includes(key))),
  };
  let representation: MachineParameter['representation'];
  let facts: MachineFact[];
  if (value.includes(';')) {
    representation = 'discrete_steps'; facts = value.split(';').filter(text => text.trim()).map(text => ({ ...base, value: parse(text) }));
    if (!facts.length) throw new Error('Укажите числовые ступени через «;».');
  } else if (value) { representation = 'scalar'; facts = [{ ...base, value: parse(value) }]; }
  else {
    representation = lower && upper ? parameter.representation === 'continuous_range' ? 'continuous_range' : 'bounds_only' : lower ? 'minimum' : 'maximum';
    facts = [{ ...base, lower: lower ? parse(lower) : null, upper: upper ? parse(upper) : null }];
  }
  return { ...parameter, representation, facts, set_complete: false, reason: 'Задано в конфигураторе' };
}
