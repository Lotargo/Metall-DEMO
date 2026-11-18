import { useId, useState, type FormEvent } from 'react';
import { Save } from 'lucide-react';
import type { ConfiguredEquipment, EquipmentLibrary } from '@/api/hooks/useEquipmentLibrary';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { publicSourceText } from '@/utils/publicSource';
import { getOperatorProfile } from '@/utils/storage';
import { equipmentUnit } from './equipmentLibrary';

export function EquipmentEditor({ view, initial, create, onSaved }: {
  view: EquipmentLibrary; initial: ConfiguredEquipment; create: boolean; onSaved: (id: string) => void;
}) {
  const id = useId();
  const [expectedRevision] = useState(view.catalog.revision);
  const [draft, setDraft] = useState<ConfiguredEquipment>(() => {
    const value = structuredClone(initial);
    if (create) {
      value.machine.title = ''; value.reference = false; value.hourly_rate = null; value.notes = '';
      value.machine.source = 'Ручной ввод'; value.machine.basis = 'assumption';
      for (const key of Object.keys(value.machine)) {
        if (!['machine_id','equipment_class','title','source','basis'].includes(key)) Object.assign(value.machine, { [key]: null });
      }
      value.cam_setup = null;
      value.operations = value.operations.map(item => ({ ...item, cam_tool: null }));
      value.speed_basis = value.machine.equipment_class === 'process_station' ? 'not_applicable' : 'bounds';
    }
    return value;
  });
  const [operationIndex, setOperationIndex] = useState('0');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const operations = draft.operations.slice(0,view.time_operation_limit);
  const operation = operations[Number(operationIndex)];
  const dirty = create || JSON.stringify(draft) !== JSON.stringify(initial);
  const change = (update: Partial<ConfiguredEquipment>) => { setDraft(value => ({ ...value, ...update })); setError(''); };
  const machineNumber = (key: string, value: string) => change({ machine: { ...draft.machine, [key]: value || null, source: 'Задано в конфигураторе', basis: 'assumption' },
    ...(key === 'disc_rpm' ? { operations: draft.operations.map(item => ({ ...item, parameters: { ...item.parameters, '/regime/disc_rpm': value } })) } : {}) });
  const numberRow = (key: string, value: string | number | null | undefined, save: (value: string) => void, title?: string, unit?: string, required = true) => {
    const field = view.fields[key.split('/').at(-1) ?? key];
    const label = title ?? field?.title ?? 'Параметр';
    return <tr key={key}><th scope="row"><label htmlFor={`${id}-${key}`}>{label}</label></th><td><input id={`${id}-${key}`} aria-label={label} type="number" step="any" min="0" required={required} className="ui-input" value={value ?? ''} onChange={event => save(event.target.value)} /></td><td>{equipmentUnit(unit ?? field?.unit ?? '')}</td></tr>;
  };
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const profile = getOperatorProfile();
      const response = await fetch(`/api/v1/equipment-configurator${create ? '' : `/${encodeURIComponent(draft.machine.machine_id)}`}`, {
        method: create ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json', 'X-Operator': profile.id || 'operator' },
        body: JSON.stringify({ expected_revision: expectedRevision, equipment: { ...draft, reference: false } }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(response.status === 409 ? publicSourceText(result.detail, 'Каталог изменился. Обновите данные перед сохранением.') : 'Проверьте числовые поля, название и рабочие настройки.');
      await onSaved(create ? result.equipment.at(-1).machine.machine_id : draft.machine.machine_id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось сохранить оборудование.'); }
    finally { setBusy(false); }
  }
  function operationChange(update: Partial<typeof operation>) {
    change({ operations: draft.operations.map((item, i) => i === Number(operationIndex) ? { ...item, ...update, source: 'Задано в конфигураторе' } : item) });
  }
  return <form onSubmit={event => void submit(event)} className="equipment-editor-form">
    <div className="equipment-editor-heading"><h3>{create ? 'Новое оборудование' : initial.machine.title}</h3><Button type="submit" loading={busy} disabled={!dirty} icon={<Save size={16} aria-hidden="true" />}>Сохранить оборудование</Button></div>
    {error && <p className="equipment-form-error" role="alert">{error}</p>}
    <div className="table-wrap"><table className="equipment-column-table equipment-main-fields"><thead><tr><th scope="col">Название</th><th scope="col">Стоимость часа, ₽/ч</th><th scope="col">Использовать в расчёте</th></tr></thead><tbody><tr><td><input className="ui-input" aria-label="Название оборудования" required value={draft.machine.title} onChange={event => change({ machine: { ...draft.machine, title: event.target.value } })} /></td><td><input className="ui-input" aria-label="Стоимость часа работы, ₽/ч" type="number" min="0" step="any" value={draft.hourly_rate ?? ''} onChange={event => change({ hourly_rate: event.target.value || null })} /></td><td><input type="checkbox" aria-label="Использовать оборудование в расчёте" checked={draft.enabled} onChange={event => change({ enabled: event.target.checked })} /></td></tr></tbody></table></div>
    {!!view.class_fields[draft.machine.equipment_class].length && <section><h4>Характеристики оборудования</h4><div className="table-wrap"><table className="equipment-column-table"><thead><tr><th scope="col">Параметр</th><th scope="col">Значение</th><th scope="col">Ед.</th></tr></thead><tbody>{view.class_fields[draft.machine.equipment_class].map(key => key === 'double_stroke_rates_per_min' ? <tr key={key}><th scope="row">{view.fields[key].title}</th><td><input className="ui-input" aria-label={`${view.fields[key].title}; ступени через точку с запятой`} placeholder="10; 20; 30" required value={draft.machine.double_stroke_rates_per_min?.join('; ') ?? ''} onChange={event => change({ machine: { ...draft.machine, double_stroke_rates_per_min: event.target.value.split(';').map(value => value.trim().replace(',','.')), source: 'Задано в конфигураторе', basis: 'assumption' } })} /></td><td>дв. ход/мин</td></tr> : numberRow(key, draft.machine[key as keyof typeof draft.machine] as string | null, value => machineNumber(key, value)))}</tbody></table></div></section>}
    <section><h4>Ориентиры времени</h4><div className="table-wrap"><table className="equipment-column-table"><thead><tr><th scope="col">Норма</th><th scope="col">Значение</th><th scope="col">Ед.</th></tr></thead><tbody>{(['auxiliary','setup'] as const).map(key => numberRow(key, draft[key].minutes, value => change({ [key]: { ...draft[key], minutes: value, source: 'Задано в конфигураторе' } }), key === 'setup' ? 'Наладка группы установов' : 'Вспомогательное время операции', 'мин'))}</tbody></table></div></section>
    <section><h4>Режимы для оценки времени</h4><Tabs id={`${id}-operations`} aria-label="Вид обработки" items={operations.map((item,i) => ({ id: String(i), label: item.title }))} activeId={operationIndex} onChange={setOperationIndex} />
      {operation && <div role="tabpanel" id={`${id}-operations-panel-${operationIndex}`} aria-labelledby={`${id}-operations-tab-${operationIndex}`} tabIndex={0}>
        {view.time_operation_fields.includes('material_scope') && <div className="table-wrap"><table className="equipment-column-table"><thead><tr><th scope="col">Материал обработки</th></tr></thead><tbody><tr><td><input className="ui-input" aria-label={`Материал обработки: ${operation.title}`} required value={operation.material_scope} onChange={event => operationChange({ material_scope: event.target.value })} /></td></tr></tbody></table></div>}
        <div className="table-wrap"><table className="equipment-column-table"><thead><tr><th scope="col">Параметр</th><th scope="col">Значение</th><th scope="col">Ед.</th></tr></thead><tbody>{(['parameters','geometry_defaults'] as const).filter(section => view.time_operation_fields.includes(section)).flatMap(section => Object.entries(operation[section]).filter(([key]) => draft.machine.equipment_class !== 'bender' || key !== '/regime/disc_rpm').map(([key,value]) => numberRow(key, value, next => operationChange({ [section]: { ...operation[section], [key]: next } }))))}</tbody></table></div>
      </div>}
    </section>
    <div className="equipment-editor-footer"><Button type="submit" loading={busy} disabled={!dirty}>Сохранить оборудование</Button></div>
  </form>;
}
