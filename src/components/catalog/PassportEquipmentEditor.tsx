import { useId, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { equipmentRequest, type ExchangeView, type MachineRegistry, type MachineRate, type MachineFile, type MachineParameter } from '@/api/machineExchange';
import { getOperatorProfile } from '@/utils/storage';
import { publicSourceText } from '@/utils/publicSource';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { shortMachineFields } from './machineCardFields';
import { operatorParameter, parameterInputs } from './equipmentParameterDraft';
import { equipmentConditions } from './equipmentLibrary';

export function PassportEquipmentEditor({ machineId, onSaved }: { machineId: string; onSaved: (id: string) => void }) {
  const query = useQuery({ queryKey: ['equipment-passport-editor', machineId], queryFn: async () => {
    const [view, registry, rate] = await Promise.all([
      equipmentRequest<ExchangeView>(`passports/${encodeURIComponent(machineId)}/exchange`),
      equipmentRequest<MachineRegistry>('exchange/registry'),
      equipmentRequest<MachineRate>(`passports/${encodeURIComponent(machineId)}/hourly-rate`),
    ]);
    return { view, registry, rate };
  } });
  if (!query.data) return <div className="equipment-message"><p role={query.isError ? 'alert' : 'status'}>{query.isError ? 'Не удалось загрузить параметры оборудования.' : 'Загрузка параметров…'}</p>{query.isError && <Button variant="outline" onClick={() => void query.refetch()}>Повторить загрузку</Button>}</div>;
  return <PassportForm key={`${machineId}:${query.data.view.passport_version}:${query.data.rate.version}`} {...query.data} onSaved={onSaved} />;
}
function effectiveParameters(configuration: MachineFile['configurations'][number]) {
  return configuration.parameters.map(parameter => configuration.operator_parameters?.find(value => value.parameter_id === parameter.parameter_id && value.variant_id === parameter.variant_id) ?? parameter);
}
const groups = [{ id: 'geometry', label: 'Рабочая зона' }, { id: 'kinematics', label: 'Скорости и подачи' }, { id: 'tooling', label: 'Оснастка' }, { id: 'load', label: 'Мощность и нагрузка' }, { id: 'accuracy', label: 'Точность' }];
const unitNames: Record<string,string> = { mm: 'мм', rpm: 'об/мин', 'mm/rev': 'мм/об', 'mm/min': 'мм/мин', 'm/min': 'м/мин', kW: 'кВт', kg: 'кг', deg: '°' };
function PassportForm({ view, registry, rate, onSaved }: { view: ExchangeView; registry: MachineRegistry; rate: MachineRate; onSaved: (id: string) => void }) {
  const id = useId();
  const [title, setTitle] = useState(view.package.machine.title), [price, setPrice] = useState(rate.terms.hourly_rate ?? '');
  const [configurationIndex, setConfigurationIndex] = useState(String(Math.max(0, view.package.configurations.findIndex(item => item.configuration_id === view.configuration_id))));
  const initialConfiguration = view.configuration_id ?? (view.package.configurations.length === 1 ? view.package.configurations[0].configuration_id : null);
  const [activeConfiguration, setActiveConfiguration] = useState(initialConfiguration);
  const [group, setGroup] = useState('geometry');
  const [edits, setEdits] = useState<Record<string,[string,string,string]>>({});
  const [extra, setExtra] = useState<string[]>([]), [choosing, setChoosing] = useState(false);
  const [error, setError] = useState(''), [invalid, setInvalid] = useState(''), [busy, setBusy] = useState(false);
  const configuration = view.package.configurations[Number(configurationIndex)];
  const parameters = configuration ? effectiveParameters(configuration) : [];
  const preferred = shortMachineFields[view.package.machine.equipment_class] ?? [];
  const rowKey = (index: number, parameter: MachineParameter) => `${index}:${parameter.parameter_id}:${parameter.variant_id}`;
  const visible = (parameter: MachineParameter) => parameter.facts.length > 0 || preferred.includes(parameter.parameter_id) || extra.includes(parameter.parameter_id);
  const dirty = Object.keys(edits).length > 0 || title !== view.package.machine.title || price !== (rate.terms.hourly_rate ?? '') || activeConfiguration !== initialConfiguration;
  async function save(event: FormEvent) {
    event.preventDefault(); setError(''); setInvalid(''); setBusy(true);
    try {
      const draft = structuredClone(view.package); draft.machine.title = title;
      draft.configurations = draft.configurations.map((item,index) => {
        const overrides = [...(item.operator_parameters ?? [])];
        for (const parameter of effectiveParameters(item)) {
          const key = rowKey(index,parameter), values = edits[key];
          if (!values) continue;
          let next: MachineParameter;
          try { next = operatorParameter(parameter, values); } catch (reason) { setInvalid(key); throw Object.assign(new Error(`${registry.parameters[parameter.parameter_id].title}: ${reason instanceof Error ? reason.message : 'проверьте числа'}`), { cause: reason }); }
          const position = overrides.findIndex(value => value.parameter_id === parameter.parameter_id && value.variant_id === parameter.variant_id);
          if (position < 0) overrides.push(next); else overrides[position] = next;
        }
        return { ...item, operator_parameters: overrides };
      });
      if (price.trim() && (!Number.isFinite(Number(price)) || Number(price) < 0)) throw new Error('Стоимость часа должна быть неотрицательным числом.');
      const profile = getOperatorProfile();
      const response = await fetch(`/api/v1/equipment-configurator/passports/${encodeURIComponent(draft.machine.machine_id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Operator': profile.id || 'operator' }, body: JSON.stringify({ package: draft, expected_revision: view.catalog_revision, expected_rate_version: rate.version, hourly_rate: price.trim() || null, configuration_id: activeConfiguration }) });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.detail === 'string' ? publicSourceText(result.detail, 'Не удалось сохранить оборудование.') : 'Проверьте числовые значения и границы диапазонов.');
      await onSaved(draft.machine.machine_id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось сохранить оборудование.'); }
    finally { setBusy(false); }
  }
  return <form className="equipment-editor-form" onSubmit={event => void save(event)}>
    <div className="equipment-editor-heading"><h3>{view.package.machine.title}</h3><Button type="submit" loading={busy} disabled={!dirty}>Сохранить оборудование</Button></div>
    {error && <p id={`${id}-error`} role="alert" className="equipment-form-error">{error}</p>}
    <div className="table-wrap"><table className="equipment-column-table equipment-main-fields"><thead><tr><th scope="col">Название</th><th scope="col">Стоимость часа, ₽/ч</th></tr></thead><tbody><tr><td><input className="ui-input" aria-label="Название оборудования" required value={title} onChange={event => setTitle(event.target.value)} /></td><td><input className="ui-input" aria-label="Стоимость часа работы, ₽/ч" type="number" step="any" min="0" value={price} onChange={event => setPrice(event.target.value)} /></td></tr></tbody></table></div>
    {view.package.configurations.length > 1 && <Tabs id={`${id}-configurations`} aria-label="Исполнение оборудования" items={view.package.configurations.map((item,index) => ({ id: String(index), label: item.description || `Исполнение ${index + 1}` }))} activeId={configurationIndex} onChange={setConfigurationIndex} />}
    {configuration && <section role={view.package.configurations.length > 1 ? 'tabpanel' : undefined} id={`${id}-configurations-panel-${configurationIndex}`} aria-labelledby={view.package.configurations.length > 1 ? `${id}-configurations-tab-${configurationIndex}` : undefined}><label className="equipment-use-configuration"><input type="radio" name={`${id}-active-configuration`} checked={activeConfiguration === configuration.configuration_id} onChange={() => setActiveConfiguration(configuration.configuration_id)} />Использовать это исполнение в расчёте</label>
      <Tabs id={`${id}-groups`} aria-label="Группы характеристик" items={groups.filter(item => parameters.some(parameter => registry.parameters[parameter.parameter_id].group === item.id))} activeId={group} onChange={setGroup} />
      <div role="tabpanel" id={`${id}-groups-panel-${group}`} aria-labelledby={`${id}-groups-tab-${group}`} tabIndex={0} className="table-wrap"><table className="equipment-column-table equipment-passport-editor"><thead><tr><th scope="col">Параметр</th><th scope="col">Значение / ступени</th><th scope="col">От</th><th scope="col">До</th><th scope="col">Ед.</th></tr></thead><tbody>{parameters.filter(parameter => visible(parameter) && registry.parameters[parameter.parameter_id].group === group).map(parameter => {
        const key = rowKey(Number(configurationIndex),parameter), definition = registry.parameters[parameter.parameter_id];
        const values = edits[key] ?? parameterInputs(parameter);
        return <tr key={key}><th scope="row">{definition.title}{equipmentConditions(parameter.facts[0]?.conditions) && <small>{equipmentConditions(parameter.facts[0]?.conditions)}</small>}</th>{values.map((value,index) => <td key={index}><input className="ui-input" inputMode="decimal" aria-label={`${definition.title}: ${['значение','от','до'][index]}`} aria-invalid={invalid === key} aria-describedby={invalid === key ? `${id}-error` : undefined} value={value} onChange={event => { const next: [string,string,string] = [...values]; next[index] = event.target.value; setEdits(current => ({ ...current, [key]: next })); }} /></td>)}<td>{unitNames[parameter.unit] ?? parameter.unit}</td></tr>;
      })}</tbody></table></div>
      <Button type="button" size="sm" variant="outline" aria-expanded={choosing} onClick={() => setChoosing(value => !value)}>Добавить параметр</Button>
      {choosing && <div className="equipment-parameter-picker" role="group" aria-label="Доступные параметры">{parameters.filter(parameter => !visible(parameter)).map(parameter => <Button key={parameter.parameter_id} type="button" size="sm" variant="outline" onClick={() => { setExtra(values => [...values,parameter.parameter_id]); setGroup(registry.parameters[parameter.parameter_id].group); setChoosing(false); }}>{registry.parameters[parameter.parameter_id].title}</Button>)}</div>}
    </section>}
    <div className="equipment-editor-footer"><Button type="submit" loading={busy} disabled={!dirty}>Сохранить оборудование</Button></div>
  </form>;
}
