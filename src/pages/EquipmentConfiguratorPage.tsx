import { InfoBlock } from '@/components/ui/InfoBlock';
import { useId, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save, ExternalLink } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiClient } from '@/api/client';
import { useCompactRound } from '@/api/hooks/useCompactRound';
import { CommonLaborRates } from '@/components/route/CommonLaborRates';
import { Button } from '@/components/ui/Button';
import type { components } from '@/api/schema';
import { compactPanelLink, configuratorRatesLink } from '@/utils/calculationSettingsLinks';
import { publicSourceText, publicSourceUrl } from '@/utils/publicSource';
import './equipment-configurator.css';

type View = components['schemas']['ConfiguratorView'];
type Equipment = components['schemas']['EquipmentConfiguration-Output'];
type Operation = components['schemas']['ConfiguredOperation-Output'];
const queryKey = ['equipment-configurator'];
function counted(value: number, words: [string, string, string]) {
  const form = new Intl.PluralRules('ru').select(value);
  return `${value} ${words[form === 'one' ? 0 : form === 'few' ? 1 : 2]}`;
}
const classes: Record<string, string> = {
  lathe: 'Токарные', bandsaw: 'Ленточнопильные', drill: 'Сверлильные', mill: 'Фрезерные', grinder: 'Шлифовальные',
  slotter: 'Долбёжные',
  bender: 'Гибочные', process_station: 'Нормы специальных процессов',
};

export function EquipmentConfiguratorPage() {
  const [params] = useSearchParams();
  const rates = params.get('section') === 'rates';
  const runId = params.get('run') || undefined;
  const run = useCompactRound(rates ? runId : undefined, true);
  const equipmentLink = `/equipment-configurator${runId ? `?${new URLSearchParams({ run: runId })}` : ''}`;
  const query = useQuery({ queryKey, enabled: !rates, queryFn: async () => {
    const result = await apiClient.GET('/api/v1/equipment-configurator');
    if (!result.data) throw new Error('Не удалось загрузить конфигуратор оборудования');
    return result.data;
  } });
  const [selected, select] = useState<string>();
  const [newClass, setNewClass] = useState('lathe');
  const [notice, setNotice] = useState('');
  const view = query.data;
  const create = selected === 'new';
  const current = view && (create
    ? view.references.find(e => e.machine.equipment_class === newClass)
    : view.catalog.equipment.find(e => e.machine.machine_id === selected) ?? view.catalog.equipment[0]);
  return <div className="content equipment-configurator">
    <section className="workspace-card" aria-labelledby="configurator-title">
      <header className="workspace-card-header">
        <div><h2 id="configurator-title">Конфигуратор оборудования</h2>
          <p>{rates ? 'Общие ставки ручных работ, контроля и оборудования. Сохранённые сметы сохраняют выбранные тарифы.'
            : 'Название станка — его профиль. Паспорт задаёт ограничения, операции — инструмент и рабочие настройки расчёта.'}</p></div>
        {!rates && <Button type="button" onClick={() => select('new')} disabled={!view}>
          <Plus size={16} aria-hidden="true" /> Добавить оборудование
        </Button>}
        {rates && runId && <Link className="secondary-action" to={compactPanelLink(runId, 'estimate')}>Вернуться к смете</Link>}
      </header>
      <nav className="page-section-nav page-section-nav--inset flex flex-wrap gap-2 border-t border-line px-6 py-3" aria-label="Разделы конфигуратора">
        <Link className={rates ? 'secondary-action' : 'primary-action'} to={equipmentLink} aria-current={!rates ? 'page' : undefined}>Оборудование</Link>
        <Link className={rates ? 'primary-action' : 'secondary-action'} to={configuratorRatesLink(runId)} aria-current={rates ? 'page' : undefined}>Ставки работ и ОТК</Link>
      </nav>
      <div hidden={!rates} className="border-t border-line p-5 text-sm sm:p-6">
        {rates && runId && run.isPending && <p role="status">Загрузка расчёта детали…</p>}
        {rates && runId && (run.isError || run.data === null) && <div className="space-y-2" role="alert">
          <p>Не удалось прочитать расчёт детали. Общие ставки доступны для настройки.</p>
          <Button type="button" variant="secondary" onClick={() => void run.refetch()}>Обновить данные детали</Button>
        </div>}
        <CommonLaborRates key={runId ?? 'global'} state={run.isError ? null : run.data} reload={run.refetch} active={rates} />
      </div>
      <div hidden={rates}>
      {notice && <p className="configurator-message configurator-success" role="status">{notice}</p>}
      {query.isPending && <p className="configurator-message" role="status">Загрузка профилей оборудования…</p>}
      {query.isError && <div className="configurator-message" role="alert"><p>{publicSourceText(query.error.message, 'Не удалось загрузить оборудование.')}</p>
        <Button type="button" variant="secondary" onClick={() => void query.refetch()}>Повторить загрузку</Button></div>}
      {view && current && <div className="configurator-layout">
        <nav className="configurator-list" aria-label="Профили оборудования">
          {Object.entries(classes).map(([key, title]) => <div key={key}>
            <h3>{title}</h3>
            {view.catalog.equipment.filter(e => e.machine.equipment_class === key).map(e => <button
              type="button" key={e.machine.machine_id} aria-current={!create && current.machine.machine_id === e.machine.machine_id ? 'page' : undefined}
              onClick={() => select(e.machine.machine_id)}>
              <strong>{e.machine.title}</strong><small>{counted(e.operations.length, ['операция','операции','операций'])} · {e.enabled ? 'В расчёте' : 'Отключён'}</small>
            </button>)}
          </div>)}
        </nav>
        <div className="configurator-editor">
          {create && <label className="configurator-template">Шаблон нового оборудования
            <select name="equipment-template" className="ui-select" value={newClass} onChange={event => setNewClass(event.target.value)}>
              {Object.entries(classes).map(([key, title]) => <option key={key} value={key}>{title}</option>)}
            </select></label>}
          <EquipmentEditor key={`${current.machine.machine_id}:${view.catalog.revision}:${create}`} view={view} initial={current} create={create} onSaved={id => { select(id); setNotice('Профиль сохранён и доступен для новых расчётов.'); }} />
        </div>
      </div>}
      </div>
    </section>
  </div>;
}

function EquipmentEditor({ view, initial, create, onSaved }: { view: View; initial: Equipment; create: boolean; onSaved: (id: string) => void }) {
  const id = useId();
  const client = useQueryClient();
  const [draft, setDraft] = useState<Equipment>(() => ({ ...structuredClone(initial), reference: create ? false : initial.reference,
    machine: { ...initial.machine, title: create ? `${initial.machine.title} — новый` : initial.machine.title } }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [editedText, setEditedText] = useState<Set<string>>(() => new Set());
  const dirty = create || JSON.stringify(draft) !== JSON.stringify(initial);
  function change(update: Partial<Equipment>) { setSaved(false); setError(''); setDraft(value => ({ ...value, ...update })); }
  function markTextEdited(name: string) { setEditedText(current => new Set(current).add(name)); }
  function displayedText(name: string, value: string, fallback: string) {
    return editedText.has(name) || !value.trim() ? value : publicSourceText(value, fallback);
  }
  function operationChange(index: number, update: Partial<Operation>) {
    change({ operations: draft.operations.map((operation, i) => i === index ? { ...operation, ...update } : operation) });
  }
  function machineNumberChange(key: string, value: string) {
    change({ machine: { ...draft.machine, [key]: value },
      operations: key === 'disc_rpm' ? draft.operations.map(operation => ({ ...operation, parameters: { ...operation.parameters, '/regime/disc_rpm': value } })) : draft.operations });
  }
  function numberField(name: string, value: string | number | null | undefined, onChange: (value: string) => void) {
    const field = view.fields[name.split('/').at(-1) ?? name];
    return <label className="configurator-field" key={name}>
      <span>{publicSourceText(field?.title, 'Дополнительный параметр')} <small>{field?.unit}</small></span>
      <input name={name} type="number" className="ui-input" step="any" min="0" required value={value ?? ''} onChange={event => onChange(event.target.value)} />
    </label>;
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const equipment = { ...draft, reference: dirty ? false : draft.reference };
      const body = { expected_revision: view.catalog.revision, equipment };
      const result = create
        ? await apiClient.POST('/api/v1/equipment-configurator', { params: { header: { 'X-Operator': 'operator' } }, body })
        : await apiClient.PUT('/api/v1/equipment-configurator/{machine_id}', { params: { header: { 'X-Operator': 'operator' }, path: { machine_id: draft.machine.machine_id } }, body });
      if (!result.data) {
        const detail = (result.error as { detail?: unknown })?.detail;
        throw new Error(typeof detail === 'string' ? detail : 'Проверьте заполнение всех полей и допустимость значений.');
      }
      const selected = create ? result.data.equipment.at(-1)!.machine.machine_id : draft.machine.machine_id;
      client.setQueryData(queryKey, { ...view, catalog: result.data });
      onSaved(selected); setSaved(true);
    } catch (error) { setError(error instanceof Error ? error.message : 'Не удалось сохранить профиль'); }
    finally { setBusy(false); }
  }
  const sourceUrl = publicSourceUrl(draft.machine.source.match(/https?:\/\/[^\s]+/)?.[0]);
  return <form onSubmit={event => void submit(event)}>
    <div className="configurator-form-heading"><div>
      <h3>{create ? 'Новый профиль оборудования' : initial.machine.title}</h3>
      <p>{initial.reference ? 'Эталон заполнения' : 'Профиль оборудования'} · {counted(draft.operations.length, ['операция','операции','операций'])}</p>
    </div>
      <Button type="submit" disabled={busy || !dirty}><Save size={15} aria-hidden="true" />{busy ? 'Сохранение…' : 'Сохранить профиль'}</Button>
    </div>
    <label className="configurator-text-field" htmlFor={`${id}-title`}>Название станка / профиля
      <input id={`${id}-title`} name="machine-title" className="ui-input" required value={draft.machine.title} onChange={event => change({ machine: { ...draft.machine, title: event.target.value } })} />
    </label>
    <label className="configurator-checkbox"><input type="checkbox" name="enabled" checked={draft.enabled} onChange={event => change({ enabled: event.target.checked })} />Использовать при детализации и расчёте новых операций</label>
    {saved && <p role="status" className="configurator-success">Профиль сохранён.</p>}
    {error && <p role="alert" className="configurator-error">{publicSourceText(error, 'Не удалось сохранить профиль оборудования. Проверьте введённые значения.')}</p>}
    <fieldset><legend>Паспортные ограничения</legend>
      <div className="configurator-fields">
        {view.class_fields[draft.machine.equipment_class].map(key => key === 'double_stroke_rates_per_min'
          ? <label className="configurator-field" key={key}><span>{view.fields[key].title} <small>{view.fields[key].unit}</small></span>
              <input name={key} className="ui-input" required value={draft.machine.double_stroke_rates_per_min?.join(', ') ?? ''} onChange={event => change({ machine: { ...draft.machine, double_stroke_rates_per_min: event.target.value.split(',').map(v => v.trim()) } })} /></label>
          : numberField(key, draft.machine[key as keyof typeof draft.machine] as string | null,
            value => machineNumberChange(key, value)))}
      </div>
      <label className="configurator-text-field">Основание паспортных значений
        <textarea name="machine-source" className="ui-input" required rows={3} value={displayedText('machine-source', draft.machine.source, 'Основание паспортных значений не уточнено')} onChange={event => {
          markTextEdited('machine-source'); change({ machine: { ...draft.machine, source: event.target.value } });
        }} />
      </label>
      {sourceUrl && <a className="configurator-source" href={sourceUrl} target="_blank" rel="noreferrer">Открыть документацию <ExternalLink size={13} aria-hidden="true" /></a>}
      {draft.machine.equipment_class !== 'process_station' && <label className="configurator-text-field">Характер регулировки скорости
        <select name="speed-basis" className="ui-select" value={draft.speed_basis} onChange={event => change({ speed_basis: event.target.value as Equipment['speed_basis'] })}>
          <option value="continuous">Плавная регулировка в опубликованных пределах</option>
          <option value="bounds">Известны пределы; доступные ступени проверяются отдельно</option>
          <option value="fixed">Фиксированная паспортная скорость</option>
        </select>
      </label>}
      <label className="configurator-text-field">Условия применения
        <textarea name="machine-notes" className="ui-input" required rows={3} value={displayedText('machine-notes', draft.notes, 'Условия применения требуют уточнения')} onChange={event => {
          markTextEdited('machine-notes'); change({ notes: event.target.value });
        }} />
      </label>
    </fieldset>
    <fieldset><legend>Общие нормы времени</legend>
      <p>Выбранные нормы предприятия. Вспомогательное время учитывается один раз на операцию, подготовка — один раз на группу установов.</p>
      <div className="configurator-fields">
        {(['auxiliary', 'setup'] as const).map(key => <label key={key} className="configurator-field"><span>{key === 'auxiliary' ? 'Вспомогательное время, мин/операцию' : 'Подготовка, мин/группу установов'}</span>
          <input type="number" name={key} className="ui-input" required min="0" step="any" value={draft[key].minutes} onChange={event => change({ [key]: { ...draft[key], minutes: event.target.value } })} />
        </label>)}
      </div>
      {(['auxiliary', 'setup'] as const).map(key => <label key={key} className="configurator-text-field">Основание {key === 'auxiliary' ? 'вспомогательной нормы' : 'подготовки'}
        <textarea name={`${key}-source`} className="ui-input" required rows={2} value={displayedText(`${key}-source`, draft[key].source, 'Основание нормы не уточнено')} onChange={event => {
          markTextEdited(`${key}-source`); change({ [key]: { ...draft[key], source: event.target.value } });
        }} />
      </label>)}
    </fieldset>
    <h3 className="configurator-operations-heading">Операции и рабочие настройки</h3>
    <p className="configurator-explanation">Эталонные режимы — заполненный расчётный пример. Они не подтверждают стойкость инструмента и достижение допусков конкретной детали.</p>
    {draft.operations.map((operation, index) => <InfoBlock className="configurator-operation" key={operation.template_id} title={<>{publicSourceText(operation.title, 'Операция')}<small>{counted(Object.keys(operation.parameters).length + Object.keys(operation.geometry_defaults).length, ['параметр','параметра','параметров'])}</small></>}>

      <div className="configurator-operation-body">
        <label className="configurator-text-field">Инструмент<input name={`tool-${index}`} className="ui-input" required value={operation.tool} onChange={event => operationChange(index, { tool: event.target.value })} /></label>
        <label className="configurator-text-field">Материал и условия<input name={`material-${index}`} className="ui-input" required value={operation.material_scope} onChange={event => operationChange(index, { material_scope: event.target.value })} /></label>
        <div className="configurator-fields">
          {draft.machine.equipment_class === 'bender' && <p className="text-sm text-muted">Рабочие обороты диска задаются в паспорте выше.</p>}
          {(['parameters', 'geometry_defaults'] as const).flatMap(section => Object.entries(operation[section]).filter(([path]) => draft.machine.equipment_class !== 'bender' || path !== '/regime/disc_rpm').map(([path, value]) => numberField(path, value, next => operationChange(index, { [section]: { ...operation[section], [path]: next } }))))}
        </div>
        <label className="configurator-text-field">Основание выбранных настроек<textarea name={`operation-source-${index}`} className="ui-input" required rows={2} value={displayedText(`operation-source-${index}`, operation.source, 'Основание выбранных настроек не уточнено')} onChange={event => {
          markTextEdited(`operation-source-${index}`); operationChange(index, { source: event.target.value });
        }} /></label>
      </div>
    </InfoBlock>)}
    <div className="configurator-form-footer"><p>Сохранённые настройки используются в новых расчётах. Ранее сохранённые результаты сохраняют свои исходные параметры.</p>
      <Button type="submit" disabled={busy || !dirty}>{busy ? 'Сохранение…' : 'Сохранить профиль'}</Button>
    </div>
  </form>;
}
