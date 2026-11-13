import { InfoBlock } from '@/components/ui/InfoBlock';
import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Modal } from '@/components/ui/Modal';
import { equipmentRequest, type EquipmentCatalog, type ExchangePreview, type ExchangeView, type HistoryItem, type MachineFact, type MachineFeature, type MachineFile, type MachineParameter, type MachineRegistry, type ParameterId } from '@/api/machineExchange';
import { MachineParameterRow } from './MachineParameterRow';
import { MachineHourlyRate } from './MachineHourlyRate';
import { machineFieldPurpose, shortMachineFields } from './machineCardFields';
import { publicSourceText, publicSourceUrl } from '@/utils/publicSource';
import './machine-data.css';

const kinds: Record<MachineParameter['representation'], string> = { unknown: 'Неизвестно', not_applicable: 'Не относится', scalar: 'Одно значение', maximum: 'Максимум', minimum: 'Минимум', continuous_range: 'Непрерывный диапазон', discrete_steps: 'Дискретные ступени', bounds_only: 'Только известные границы' };
const classes: Record<MachineFile['machine']['equipment_class'], string> = { lathe: 'Токарный', bandsaw: 'Ленточнопильный', drill: 'Сверлильный', mill: 'Фрезерный', grinder: 'Шлифовальный', generic: 'Другое оборудование' };
const groups: Record<string, string> = { geometry: 'Рабочая зона и зажим', kinematics: 'Обороты, подачи и перемещения', tooling: 'Инструмент и оснастка', load: 'Мощность и нагрузка', accuracy: 'Точность' };
const features: Record<MachineFeature['feature_id'], string> = { coolant: 'СОЖ', chuck: 'Патрон', centers: 'Центры', tailstock: 'Задняя бабка', steady_rest: 'Люнет', bar_support: 'Опоры длинномера', automatic_tool_change: 'Автоматическая смена инструмента' };
const featureState: Record<MachineFeature['state'], string> = { unknown: 'Неизвестно', supported: 'Предусмотрено', unsupported: 'Не предусмотрено' };
const methods: Record<string, string> = { 'turning.longitudinal.constant-n/1': 'Продольное точение', 'turning.facing.constant-n/1': 'Торцевание', 'sawing.round.area-rate/1': 'Прямая отрезка круга', 'turning.boring.constant-n/1': 'Цилиндрическая расточка', 'drilling.axial.constant-n/1': 'Осевое сверление', 'turning.grooving.constant-n/1': 'Радиальная канавка', 'turning.thread.constant-n/1': 'Наружная резьба резцом' };
type MachineConfiguration = MachineFile['configurations'][number];
type ControlType = NonNullable<MachineConfiguration['control_type']>;
const controlTypes: Record<ControlType, string> = { manual: 'Ручное', cnc: 'ЧПУ', unknown: 'Неизвестно' };
const operations = { drilling: 'Сверление', tapping: 'Нарезание резьбы метчиком' };
const motions = { mechanical: 'Механическая', manual: 'Ручная', programmed: 'Программная', unknown: 'Неизвестно', not_required: 'Не требуется' };
const synchronization = { rigid: 'Жёсткая', not_required: 'Не требуется', unknown: 'Неизвестно' };
const conditionTitles: Record<string, string> = { axis: 'Ось', gear: 'Передача', mounting: 'Установка и закрепление', configuration: 'Комплектация', cut_angle_deg: 'Угол реза, °', section: 'Форма сечения', material_grade: 'Материал', tool_configuration: 'Инструмент', load_definition: 'Определение нагрузки', duty: 'Длительность нагрузки', spindle_rpm: 'Рабочие обороты', spindle_rpm_lower: 'Нижние обороты области', spindle_rpm_upper: 'Верхние обороты области', meaning: 'Пояснение', conversion: 'Пересчёт единиц' };
const errorText = (error: unknown) => publicSourceText(error instanceof Error ? error.message : '', 'Не удалось выполнить действие');

function documentTitle({ uri, revision, scope }: MachineFile['documents'][number]) {
  const fallback = scope === 'model' ? 'Паспорт модели оборудования' : scope === 'installed_unit' ? 'Паспорт установленного станка' : 'Документ оборудования';
  const title = /(?:^[a-z]+:|[/\\]|\.(?:txt|docx?|rtf|html?)\b)/i.test(uri) ? fallback : publicSourceText(uri, fallback);
  const edition = /^[\da-f-]{12,}$/i.test(revision.trim()) ? '' : publicSourceText(revision, '');
  return `${title} · ${!edition || /^unknown$/i.test(edition) ? 'редакция не определена' : `редакция ${edition}`}`;
}

const documentLink = publicSourceUrl;

function sourceLocator(value: string): string {
  return publicSourceText(value, '').replace(/\b(?:lines?|paragraph):\s*\d+(?:\s*[-–:]\s*\d+)?/gi, '').trim();
}

function changeValue(value: string): string {
  if (['{', '['].includes(value.trimStart().charAt(0))) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed) && parsed.every(item => ['string', 'number', 'boolean'].includes(typeof item))) {
        return parsed.map(item => typeof item === 'boolean' ? item ? 'да' : 'нет' : publicSourceText(item, 'Не указано')).join('; ') || 'Нет значений';
      }
      return 'Сведения обновлены';
    } catch { /* Literal technical notation is retained below. */ }
  }
  return publicSourceText(`Значение: ${value}`, 'Не указано').replace(/^Значение:\s*/, '') || 'Не указано';
}

function evidenceQuote(value: string): string {
  if (!value.trim()) return '';
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === 'object') return Array.isArray(parsed) ? changeValue(value) : '';
  } catch { /* Drawing and passport quotations are ordinary text. */ }
  return publicSourceText(`Фрагмент: ${value}`, '').replace(/^Фрагмент:\s*/, '');
}

function ExecutionMethods({ configuration, documents }: { configuration: MachineConfiguration; documents: MachineFile['documents'] }) {
  const control = configuration.control_type ?? 'unknown';
  const executionMethods = configuration.execution_methods ?? [];
  if (!executionMethods.length && control === 'unknown') return null;
  const gcode = control === 'manual'
    ? 'Не применимо. Результат оформляется технологической картой.'
    : control === 'cnc' ? 'Требуются данные стойки, постпроцессора и наладки.' : 'Неизвестно';
  return <section className="machine-parameter-group" aria-label="Способы обработки">
    <h4>Способы обработки</h4>
    <dl className="machine-execution-facts">
      <div><dt>Тип управления</dt><dd>{controlTypes[control]}</dd></div>
      <div><dt>G-code</dt><dd>{gcode}</dd></div>
    </dl>
    {!executionMethods.length && <p className="machine-table-hint">Способы для этой комплектации пока не указаны.</p>}
    {executionMethods.map(method => {
      const document = documents.find(item => item.document_id === method.document_id);
      return <InfoBlock key={method.execution_method_id} className="machine-data-row" title={<>{publicSourceText(method.title, 'Способ обработки')}</>}>

        <dl className="machine-execution-facts">
          <div><dt>Паспортная операция</dt><dd>{operations[method.operation]}{!document && ' · источник не установлен'}{document?.inline_text === null && ' · текст источника не проверен'}</dd></div>
          <div><dt>Подача</dt><dd>{motions[method.feed_type]}</dd></div>
          <div><dt>Синхронизация</dt><dd>{synchronization[method.synchronization]}</dd></div>
          <div><dt>Реверс</dt><dd>{motions[method.reversal]}</dd></div>
          <div><dt>Возврат</dt><dd>{motions[method.return_motion]}</dd></div>
          {document && <div><dt>Паспортное основание</dt><dd>{documentLink(document.uri) ? <a href={documentLink(document.uri)} target="_blank" rel="noreferrer">{documentTitle(document)}</a> : documentTitle(document)}{sourceLocator(method.locator) && ` · ${sourceLocator(method.locator)}`}</dd></div>}
        </dl>
        {method.limitations.length > 0 && <ul className="machine-execution-limits">
          {method.limitations.map((limitation, index) => <li key={index}>{publicSourceText(limitation, 'Условия применения требуют проверки.')}</li>)}
        </ul>}
      </InfoBlock>;
    })}
  </section>;
}

function scopeLabel(parameter: MachineParameter) {
  const c = parameter.facts[0]?.conditions ?? {};
  return [c.cut_angle_deg !== undefined ? `${c.cut_angle_deg}°` : '', c.gear ? `передача ${c.gear}` : '', c.axis ? `ось ${c.axis}` : ''].filter(Boolean).join(' · ');
}

function ParameterEvidence({ parameter, entered, documents }: {
  parameter: MachineParameter;
  entered?: MachineParameter;
  documents: MachineFile['documents'];
}) {
  const facts = [...parameter.facts, ...(entered?.facts ?? [])];
  const sources = [...new Map(facts.map(fact => [
    JSON.stringify([fact.document_id, fact.source, fact.locator, fact.raw, fact.conditions, fact.basis]),
    fact,
  ])).entries()];
  if (sources.length === 0) return null;
  return <InfoBlock className="machine-field-evidence" title="Паспортное основание и условия">

    {sources.map(([key, fact]) => {
      const source = documents.find(document => document.document_id === fact.document_id);
      const label = source ? documentTitle(source) : publicSourceText(fact.source, 'Основание не установлено');
      const link = source ? documentLink(source.uri) : undefined;
      const quote = evidenceQuote(fact.raw);
      const conditions = Object.entries(fact.conditions).filter(([key]) => !['selection', 'set_complete'].includes(key));
      return <div key={key}>
        <p>{link
          ? <a href={link} target="_blank" rel="noreferrer">{label}</a>
          : label}</p>
        {sourceLocator(fact.locator) && <p>{sourceLocator(fact.locator)}</p>}
        {fact.standard && <p>{publicSourceText(fact.standard, 'Нормативное основание уточняется.')}</p>}
        {quote && <p>{quote}</p>}
        {fact.basis === 'assumption' && <p>Оценочное допущение.</p>}
        {source?.inline_text === null && <p>Текст источника не проверен.</p>}
        {conditions.map(([name, value]) => <p key={name}>{conditionTitles[name] ?? 'Условие применения'} · {publicSourceText(value, 'Условия не уточнены')}</p>)}
        {fact.limitations.map((limitation, index) => <p key={`limit-${index}`}>{publicSourceText(limitation, 'Условия применения требуют проверки.')}</p>)}
      </div>;
    })}
  </InfoBlock>;
}

function canonicalNumber(value: string) {
  const text = value.trim();
  if (!text) return null;
  if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(text)) throw new Error('Введите число. Для ступеней используйте разделитель «;».');
  return text.replace(',', '.');
}

function newFact(unit: string): MachineFact {
  return { value: null, lower: null, upper: null, lower_inclusive: true, upper_inclusive: true, unit, raw: '', source: '', locator: '', standard: '', conditions: {}, basis: 'unknown', limitations: [], document_id: null };
}

function SourceFields({ data, documentId, locator, raw, onDocument, onLocator, onRaw }: { data: MachineFile; documentId: string; locator: string; raw: string; onDocument: (value: string) => void; onLocator: (value: string) => void; onRaw: (value: string) => void }) {
  return <>
    <label>Документ<select className="ui-select ui-select--native" aria-label="Документ" required value={documentId} onChange={e => onDocument(e.target.value)}><option value="">Выберите источник</option>{data.documents.map(d => <option key={d.document_id} value={d.document_id}>{documentTitle(d)}</option>)}</select></label>
    <label>Место в источнике<input className="ui-input" required value={locator} placeholder="Раздел, страница или пункт" onChange={e => onLocator(e.target.value)} /></label>
    <label>Буквальный фрагмент<input className="ui-input" required value={raw} onChange={e => onRaw(e.target.value)} /></label>
  </>;
}

function ParameterEditor({ parameter, data, registry, save }: { parameter: MachineParameter; data: MachineFile; registry: MachineRegistry; save: (value: MachineParameter) => void }) {
  const first = parameter.facts[0];
  const [kind, setKind] = useState(parameter.representation);
  const [value, setValue] = useState(parameter.representation === 'discrete_steps' ? parameter.facts.map(f => f.value).join('; ') : first?.value ?? first?.upper ?? first?.lower ?? '');
  const [lower, setLower] = useState(first?.lower ?? '');
  const [upper, setUpper] = useState(first?.upper ?? '');
  const [basis, setBasis] = useState<'source' | 'assumption'>(first?.basis === 'assumption' ? 'assumption' : 'source');
  const [documentId, setDocumentId] = useState(first?.document_id ?? '');
  const [locator, setLocator] = useState(first?.locator ?? '');
  const [raw, setRaw] = useState(first?.raw ?? '');
  const [reason, setReason] = useState(parameter.reason || (first?.basis === 'assumption' ? first.source : ''));
  const [complete, setComplete] = useState(parameter.set_complete);
  const [conditions, setConditions] = useState(Object.entries(first?.conditions ?? {}).filter(([key]) => !['selection', 'set_complete'].includes(key)));
  const [error, setError] = useState('');
  const known = !['unknown', 'not_applicable'].includes(kind);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      if (new Set(conditions.filter(([key]) => key).map(([key]) => key)).size !== conditions.filter(([key]) => key).length) throw new Error('Одно условие указано дважды. Уберите повторение.');
      const fact = { ...newFact(parameter.unit), basis, document_id: basis === 'source' ? documentId : null, source: basis === 'source' ? data.documents.find(d => d.document_id === documentId)?.uri ?? '' : reason, locator, raw, conditions: Object.fromEntries(conditions.filter(([key]) => key)) };
      let facts: MachineFact[] = [];
      if (known) {
        if (kind === 'discrete_steps') facts = value.split(/[;\n]+/).filter(v => v.trim()).map(v => ({ ...fact, value: canonicalNumber(v) }));
        else if (['continuous_range', 'bounds_only'].includes(kind)) facts = [{ ...fact, lower: canonicalNumber(lower), upper: canonicalNumber(upper), lower_inclusive: first?.lower_inclusive ?? true, upper_inclusive: first?.upper_inclusive ?? true }];
        else { const number = canonicalNumber(value); facts = [{ ...fact, value: kind === 'scalar' ? number : null, lower: kind === 'minimum' ? number : null, upper: kind === 'maximum' ? number : null }]; }
        if (!facts.length || facts.every(f => f.value === null && f.lower === null && f.upper === null)) throw new Error('Укажите значение или выберите «Неизвестно».');
      }
      save({ ...parameter, representation: kind, facts, set_complete: known && basis === 'source' && ['continuous_range', 'discrete_steps'].includes(kind) && complete, reason: known ? '' : reason });
      setError('');
    } catch (error) { setError(errorText(error)); }
  };
  return <form className="machine-field-form" onSubmit={submit}>
    <label>Способ задания<select className="ui-select ui-select--native" aria-label="Способ задания" value={kind} onChange={e => setKind(e.target.value as typeof kind)}>{Object.entries(kinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    {known ? <>
      {['continuous_range', 'bounds_only'].includes(kind) ? <div className="machine-data-grid"><label>Нижняя граница<input className="ui-input" inputMode="decimal" value={lower} onChange={e => setLower(e.target.value)} required={kind === 'continuous_range'} /></label><label>Верхняя граница<input className="ui-input" inputMode="decimal" value={upper} onChange={e => setUpper(e.target.value)} required={kind === 'continuous_range'} /></label></div> : <label>{kind === 'discrete_steps' ? 'Ступени через «;»' : 'Значение'}<input className="ui-input" required inputMode={kind === 'discrete_steps' ? 'text' : 'decimal'} value={value} onChange={e => setValue(e.target.value)} /></label>}
      <label>Основание<select className="ui-select ui-select--native" aria-label="Основание" value={basis} onChange={e => setBasis(e.target.value as typeof basis)}><option value="source">Из источника</option><option value="assumption">Оценочное допущение</option></select></label>
      {basis === 'source' ? <SourceFields data={data} documentId={documentId} locator={locator} raw={raw} onDocument={setDocumentId} onLocator={setLocator} onRaw={setRaw} /> : <label>Основание допущения<input className="ui-input" required value={reason} onChange={e => setReason(e.target.value)} /></label>}
      {['continuous_range', 'discrete_steps'].includes(kind) && basis === 'source' && <label className="machine-check"><input type="checkbox" checked={complete} onChange={e => setComplete(e.target.checked)} />Источник устанавливает полный набор в этих условиях</label>}
      <InfoBlock title="Условия применения"><div className="machine-field-form">{conditions.map(([key, text], index) => <div className="machine-condition" key={index}><label>Условие<select className="ui-select ui-select--native" aria-label="Условие" value={key} onChange={e => setConditions(conditions.map((row, i) => i === index ? [e.target.value, row[1]] : row))}><option value="">Выберите условие</option>{registry.condition_keys.filter(k => !['selection', 'set_complete'].includes(k)).map(k => <option key={k} value={k}>{conditionTitles[k] ?? k}</option>)}</select></label><label>Содержание<input className="ui-input" value={text} onChange={e => setConditions(conditions.map((row, i) => i === index ? [row[0], e.target.value] : row))} /></label><button type="button" className="secondary-action" aria-label={`Убрать условие ${conditionTitles[key] ?? key}`} onClick={() => setConditions(conditions.filter((_, i) => i !== index))}>Убрать</button></div>)}<button type="button" className="secondary-action" onClick={() => setConditions([...conditions, ['', '']])}>Добавить условие</button></div></InfoBlock>
    </> : <label>Причина<input className="ui-input" required value={reason} onChange={e => setReason(e.target.value)} /></label>}
    {registry.parameters[parameter.parameter_id].comparison === 'record_only' && <p className="passport-count">Справочное поле: автоматическая проверка этой характеристики пока не подключена.</p>}
    {error && <p role="alert" className="passport-error">{error}</p>}
    <button type="submit" className="secondary-action">Обновить поле в черновике</button>
  </form>;
}

function FeatureEditor({ feature, data, save }: { feature: MachineFeature; data: MachineFile; save: (value: MachineFeature) => void }) {
  const [value, setValue] = useState(feature);
  return <InfoBlock className="machine-data-row" title={<>{features[value.feature_id]} <span>{featureState[value.state]}</span></>}><form className="machine-field-form" onSubmit={e => { e.preventDefault(); save(value); }}>
    <label>Наличие<select className="ui-select ui-select--native" aria-label="Наличие" value={value.state} onChange={e => setValue({ ...value, state: e.target.value as typeof value.state })}>{Object.entries(featureState).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
    {value.state === 'unknown' ? <label>Причина<input className="ui-input" required value={value.reason} onChange={e => setValue({ ...value, reason: e.target.value })} /></label> : <SourceFields data={data} documentId={value.document_id ?? ''} locator={value.locator} raw={value.raw} onDocument={document_id => setValue({ ...value, document_id })} onLocator={locator => setValue({ ...value, locator })} onRaw={raw => setValue({ ...value, raw })} />}
    <button type="submit" className="secondary-action">Обновить оснащение в черновике</button>
  </form></InfoBlock>;
}

export function MachineData({ machineId, parameterId, sourceVersion, template, catalog, onClose, onSaved }: {
  machineId?: string;
  parameterId?: string;
  sourceVersion?: string;
  template?: MachineFile;
  catalog: EquipmentCatalog;
  onClose: () => void;
  onSaved: (value: EquipmentCatalog) => void;
}) {
  const client = useQueryClient();
  const [data, setData] = useState<MachineFile | null>(template ?? null);
  const [registry, setRegistry] = useState<MachineRegistry | null>(null);
  const [revision, setRevision] = useState(catalog.revision);
  const [passportVersion, setPassportVersion] = useState<number>();
  const [status, setStatus] = useState<ExchangeView['status']>('from_passport');
  const [preview, setPreview] = useState<ExchangePreview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(Boolean(template));
  const [search, setSearch] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [selectedConfig, setSelectedConfig] = useState(0);
  const [activeConfig, setActiveConfig] = useState<string | null>(null);
  const [newFeature, setNewFeature] = useState('');
  const [newParameter, setNewParameter] = useState('');
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [historyError, setHistoryError] = useState('');
  const [selectedHistory, setSelectedHistory] = useState('');
  useEffect(() => {
    let active = true;
    void Promise.all([equipmentRequest<MachineRegistry>('exchange/registry'), machineId ? equipmentRequest<ExchangeView>(`passports/${encodeURIComponent(machineId)}/exchange`) : Promise.resolve(null)]).then(([registry, view]) => {
      if (!active) return;
      setRegistry(registry);
      if (view) {
        setData(view.package);
        setRevision(view.catalog_revision);
        setPassportVersion(view.passport_version);
        setStatus(view.status);
        const configIndex = view.package.configurations.findIndex(c => c.configuration_id === view.configuration_id);
        setActiveConfig(configIndex >= 0 ? view.configuration_id : null);
        if (configIndex >= 0) setSelectedConfig(configIndex);
      }
    }).catch(error => { if (active) setError(errorText(error)); });
    if (machineId) {
      void equipmentRequest<HistoryItem[]>(`passports/${encodeURIComponent(machineId)}/history`)
        .then(items => { if (active) setHistory(items); })
        .catch(error => { if (active) setHistoryError(errorText(error)); });
    }
    return () => { active = false; };
  }, [machineId]);
  const change = (next: MachineFile) => { setData(next); setDirty(true); setPreview(null); setError(''); };
  const updateConfig = (next: MachineConfiguration) => {
    if (data) change({ ...data, configurations: data.configurations.map((c, i) => i === selectedConfig ? next : c) });
  };
  const apply = async (draft: MachineFile, checked: ExchangePreview) => {
    const saved = await equipmentRequest<EquipmentCatalog>('exchange/apply', {
      package: draft,
      expected_revision: checked.expected_revision,
      preview_sha256: checked.preview_sha256,
      configuration_id: checked.configuration_id,
    });
    client.setQueryData(['machine-passports'], saved);
    void client.invalidateQueries({ queryKey: ['machine-hourly-rates'] });
    void client.invalidateQueries({ queryKey: ['machine-hourly-rate', draft.machine.machine_id] });
    void client.invalidateQueries({ queryKey: ['catalog'] });
    onSaved(saved);
  };
  const check = async (refresh = false, applyImmediately = false) => {
    if (!data?.machine.title.trim() || Object.keys(fieldErrors).length) return;
    setBusy(true); setError('');
    try {
      let expected = revision;
      if (refresh) { const latest = await equipmentRequest<EquipmentCatalog>(''); expected = latest.revision; setRevision(expected); client.setQueryData(['machine-passports'], latest); }
      const checked = await equipmentRequest<ExchangePreview>('exchange/preview', { package: data, expected_revision: expected, configuration_id: activeConfig });
      if (applyImmediately && checked.action !== 'unchanged') await apply(data, checked);
      else setPreview(checked);
    } catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  };
  const commit = async () => {
    if (!data || !preview || preview.action === 'unchanged' || Object.keys(fieldErrors).length) return;
    setBusy(true); setError('');
    try {
      await apply(data, preview);
    } catch (error) { setError(errorText(error)); setPreview(null); } finally { setBusy(false); }
  };
  const restoreRevision = async (item: HistoryItem) => {
    if (!data || dirty || Object.keys(fieldErrors).length) return;
    setBusy(true); setError('');
    try {
      const id = encodeURIComponent(data.machine.machine_id);
      const saved = await equipmentRequest<EquipmentCatalog>(
        `passports/${id}/history/${item.history_id}/restore`, { expected_revision: revision },
      );
      client.setQueryData(['machine-passports'], saved);
      void client.invalidateQueries({ queryKey: ['catalog'] });
      onSaved(saved);
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  };
  const configuration = data?.configurations[selectedConfig];
  const boundMethods = new Set(configuration?.execution_methods?.flatMap(method => method.calculation_methods ?? []));
  const existing = data && catalog.machines.some(m => m.machine_id === data.machine.machine_id);
  const currentVersion = passportVersion ?? catalog.machines.find(m => m.machine_id === data?.machine.machine_id)?.version;
  const snapshots = history?.filter(h => h.event !== 'passport-rename' && h.event !== 'passport-delete') ?? [];
  const snapshot = snapshots.find(h => String(h.history_id) === selectedHistory);
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;
  const shortFields = data ? shortMachineFields[data.machine.equipment_class] : [];
  const requestedField = parameterId?.split('.')[0] as ParameterId | undefined;
  const cardFields = new Set(shortFields);
  if (requestedField && registry && Object.prototype.hasOwnProperty.call(registry.parameters, requestedField)) cardFields.add(requestedField);
  const parameters = configuration?.parameters ?? [];
  const rows = parameters.map((p, index) => ({ p, index }));
  for (const field of cardFields) {
    if (registry && !parameters.some(p => p.parameter_id === field)) {
      rows.push({ index: -1, p: { parameter_id: field, variant_id: 'base', unit: registry.parameters[field].unit,
        representation: 'unknown', set_complete: false, facts: [], reason: 'Сведения пока не внесены' } });
    }
  }
  const requestedVariant = parameterId?.split('.').slice(1).join('.');
  const matchingRows = rows.filter(({ p }) => p.parameter_id === requestedField);
  const target = requestedVariant
    ? matchingRows.find(({ p }) => p.variant_id === requestedVariant)
    : matchingRows.length === 1 ? matchingRows[0] : undefined;
  return <Modal isOpen onClose={() => { if (!busy) onClose(); }} title={data?.machine.title ? `Станок · ${data.machine.title}` : 'Новый профиль станка'} size="full">
    <fieldset className="machine-data-shell" disabled={busy}><div className="passport-form machine-data">
      {error && <div className="passport-error" role="alert"><p>{publicSourceText(error, 'Не удалось сохранить изменение.')}</p>{data && <button type="button" disabled={busy} className="secondary-action" onClick={() => void check(true)}>Обновить сравнение, сохранив черновик</button>}</div>}
      {!data || !registry || !configuration ? <p role="status">Загрузка параметров…</p> : <>
        <p role="status" className="passport-count">{dirty ? 'Изменения ещё не сохранены.' : status === 'saved' ? `Сохранённая редакция. Версия каталога ${revision}.` : status === 'needs_review' ? 'Паспорт изменился. Прежние параметры сохранены в истории; их применимость нужно перепроверить.' : 'Доступные сведения паспорта. Неизвестные поля можно заполнять постепенно.'}</p>
        {requestedVariant && !target && <p role="status" className="passport-count">Запрошенный вариант предела отсутствует в текущей комплектации.</p>}
        <label>Имя профиля<input className="ui-input" required value={data.machine.title} onChange={e => change({ ...data, machine: { ...data.machine, title: e.target.value } })} /></label>
        <p className="machine-table-hint">{catalog.categories.find(c => c.category_id === data.machine.category_id)?.title ?? 'Категория не указана'}
          {currentVersion !== undefined && ` · версия паспорта ${currentVersion}`}</p>
        {sourceVersion && currentVersion !== undefined && sourceVersion !== String(currentVersion) &&
          <p role="status">Результат операции относится к прежней версии паспорта. Открыта текущая версия {currentVersion}.</p>}
        {data.configurations.length > 1 && <>
          <label>Комплектация<select className="ui-select ui-select--native" value={selectedConfig} onChange={e => { setSelectedConfig(Number(e.target.value)); setNewParameter(''); }}>
            {data.configurations.map((c, i) => <option key={c.configuration_id} value={i}>{c.description || `Комплектация ${i + 1}`}</option>)}
          </select></label>
          <p className="machine-table-hint">{activeConfig === configuration.configuration_id ? 'Комплектация выбрана для предварительных проверок.'
            : activeConfig ? 'Для предварительных проверок выбрана другая комплектация.'
            : 'Комплектация для предварительных проверок не выбрана.'}</p>
        </>}
        <div className="machine-card-heading"><h4>Параметры станка</h4></div>
        <ExecutionMethods configuration={configuration} documents={data.documents} />
        {requestedField && !target && <p role="status">Запрошенного параметра нет в словаре станков.</p>}
        <div className="machine-full-fields">
        {existing && <section className="machine-history" aria-label="История снимков">
          <label>Снимки паспорта<select className="ui-select ui-select--native" value={selectedHistory} onChange={e => setSelectedHistory(e.target.value)}>
            <option value="">{history ? 'Выберите снимок' : historyError ? 'История недоступна' : 'Загрузка снимков…'}</option>
            {snapshots.map(h => <option key={h.history_id} value={h.history_id}>
              {new Date(h.recorded_at).toLocaleString('ru')} · версия {h.version}{h.version === currentVersion ? ' · текущая' : ''}
            </option>)}
          </select></label>
          {historyError && <p role="status">{publicSourceText(historyError, 'История временно недоступна.')}</p>}
          {snapshot && <>
            <div className="passport-actions">
              {snapshot.version !== currentVersion && <button type="button" className="secondary-action"
                disabled={dirty || hasFieldErrors} onClick={() => void restoreRevision(snapshot)}>
                Восстановить и применить
              </button>}
            </div>
            {(dirty || hasFieldErrors) && snapshot.version !== currentVersion && <p>Завершите редактирование, чтобы восстановить снимок.</p>}
          </>}
        </section>}
          {existing && <MachineHourlyRate machineId={data.machine.machine_id} />}
          <label>Найти параметр<input className="ui-input" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Название или единица" /></label>
          <p className="machine-table-hint">Вносите данные в колонку «На станке». Пустое поле означает, что значение экземпляра неизвестно.</p>
        </div>
          {Object.entries(groups).map(([group, title]) => {
            const groupRows = rows.filter(({ p }) => registry.parameters[p.parameter_id].group === group);
            if (!groupRows.length) return null;
            const matches = (p: MachineParameter) => `${registry.parameters[p.parameter_id].title} ${p.unit}`.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru'));
            return <section className="machine-parameter-group" key={group} aria-label={title} hidden={!groupRows.some(({ p }) => matches(p))}>
              <h4>{title}</h4>
              <table className="machine-parameter-table machine-passport-values"><thead><tr><th scope="col">Параметр</th><th scope="col">По паспорту</th><th scope="col">На станке</th></tr></thead><tbody>{groupRows.map(({ p, index }) => {
                const key = `${configuration.configuration_id}-${p.parameter_id}-${p.variant_id}`;
                const sameRow = (row: MachineParameter) => row.parameter_id === p.parameter_id && row.variant_id === p.variant_id;
                const entered = configuration.operator_parameters ?? [];
                const saved = entered.find(sameRow);
                const reference = p.facts.length > 0 && p.facts.every(f => f.basis === 'source'
                  && data.documents.some(d => d.document_id === f.document_id && d.scope === 'model')) ? p : undefined;
                const input = saved ?? (reference ? { ...p, representation: 'unknown' as const, facts: [], set_complete: false } : p);
                const save = (value: MachineParameter) => {
                  const clear = value.representation === 'unknown' && (reference || p.representation === 'unknown');
                  if (clear && !saved) return;
                  const operator_parameters = entered.filter(row => !sameRow(row));
                  if (!clear) operator_parameters.push(value);
                  const parameters = index < 0 ? [...configuration.parameters, p] : configuration.parameters;
                  updateConfig({ ...configuration, parameters, operator_parameters });
                };
                const saveReference = (value: MachineParameter) => {
                  setFieldErrors(previous => { const next = { ...previous }; delete next[key]; return next; });
                  const parameters = index < 0 ? [...configuration.parameters, value] : configuration.parameters.map((old, i) => i === index ? value : old);
                  updateConfig({ ...configuration, parameters });
                };
                return <MachineParameterRow key={`${key}-${JSON.stringify(p)}`} parameter={input} reference={reference} definition={registry.parameters[p.parameter_id]} scope={scopeLabel(p)} hidden={!matches(p)}
                  targeted={target?.p === p} purpose={machineFieldPurpose[p.parameter_id]} evidence={<ParameterEvidence parameter={p} entered={saved} documents={data.documents} />}
                  save={save} onError={message => { if (message) setPreview(null); setFieldErrors(previous => { const next = { ...previous }; if (message) next[key] = `${registry.parameters[p.parameter_id].title}: ${message}`; else delete next[key]; return next; }); }} advanced={<ParameterEditor parameter={p} data={data} registry={registry} save={saveReference} />} />;
              })}</tbody></table>
            </section>;
          })}
          {hasFieldErrors && <div className="passport-error" role="alert">{Object.values(fieldErrors).map(message => <p key={message}>{message}</p>)}<button type="button" className="secondary-action" onClick={() => { setSearch(''); }}>Сбросить поиск</button></div>}
          <div className="machine-full-fields">
          <p>Рабочие формы текущего расчёта настраиваются в <Link to="/equipment-configurator">конфигураторе оборудования</Link>.</p>
          <InfoBlock className="machine-data-extra" title="Карточка, документы и оснащение"><div className="machine-data-extra-content"><InfoBlock title="Сведения об оборудовании"><fieldset className="machine-data-grid" disabled={busy}>
            <label>Категория<select className="ui-select ui-select--native" aria-label="Категория" value={data.machine.category_id} onChange={e => change({ ...data, machine: { ...data.machine, category_id: e.target.value } })}><option value={data.machine.category_id}>{catalog.categories.find(c => c.category_id === data.machine.category_id)?.title ?? 'Категория недоступна'}</option>{catalog.categories.filter(c => c.category_id !== data.machine.category_id).map(c => <option key={c.category_id} value={c.category_id}>{c.title}</option>)}</select></label>
            <label>Тип параметров<select className="ui-select ui-select--native" aria-label="Тип параметров" value={data.machine.equipment_class} onChange={e => change({ ...data, machine: { ...data.machine, equipment_class: e.target.value as MachineFile['machine']['equipment_class'] } })}>{Object.entries(classes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label>Изготовитель<input className="ui-input" value={data.machine.manufacturer ?? ''} onChange={e => change({ ...data, machine: { ...data.machine, manufacturer: e.target.value || null } })} /></label><label>Модель<input className="ui-input" value={data.machine.model ?? ''} onChange={e => change({ ...data, machine: { ...data.machine, model: e.target.value || null } })} /></label>
            <label>Вид записи<select className="ui-select ui-select--native" aria-label="Вид записи" value={data.machine.record_kind} onChange={e => change({ ...data, machine: { ...data.machine, record_kind: e.target.value as MachineFile['machine']['record_kind'] } })}><option value="unknown">Не установлен</option><option value="model">Модель</option><option value="installed_unit">Установленный экземпляр</option></select></label>
            <label>Инвентарный номер<input className="ui-input" value={data.machine.asset_id ?? ''} onChange={e => change({ ...data, machine: { ...data.machine, asset_id: e.target.value || null } })} /></label><label>Серийный номер<input className="ui-input" value={data.machine.serial_number ?? ''} onChange={e => change({ ...data, machine: { ...data.machine, serial_number: e.target.value || null } })} /></label>
          </fieldset></InfoBlock>
          {data.documents.length > 0 && <InfoBlock title={<>Документы оборудования · {data.documents.length}</>}>
            <ul className="space-y-1">{data.documents.map(document => <li key={document.document_id}>{documentLink(document.uri) ? <a href={documentLink(document.uri)} target="_blank" rel="noreferrer">{documentTitle(document)}</a> : documentTitle(document)}</li>)}</ul>
          </InfoBlock>}
          <InfoBlock title="Комплектация и установка"><div className="machine-data-grid"><button type="button" className="secondary-action" disabled={busy} onClick={() => { change({ ...data, configurations: [...data.configurations, { configuration_id: `config-${Date.now()}`, description: 'Новая комплектация', control_type: 'unknown', parameters: [], features: [], supported_methods: [], methods_document_id: null, limitations: [] }] }); setSelectedConfig(data.configurations.length); }}>Добавить комплектацию</button></div>
          <div className="machine-data-grid">
            <label>Описание комплектации<input className="ui-input" value={configuration.description} onChange={e => updateConfig({ ...configuration, description: e.target.value })} /></label>
            <label>Тип управления<select className="ui-select ui-select--native" name="control_type" value={configuration.control_type ?? 'unknown'} onChange={e => updateConfig({ ...configuration, control_type: e.target.value as ControlType })}>
              {Object.entries(controlTypes).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
            </select></label>
          </div>
          {data.configurations.length > 1 && <label className="machine-check"><input type="checkbox" checked={activeConfig === configuration.configuration_id} onChange={e => { setActiveConfig(e.target.checked ? configuration.configuration_id : null); change(data); }} />Использовать эту комплектацию для предварительных проверок</label>}
          </InfoBlock>
          <InfoBlock title="Дополнительный параметр"><div className="machine-data-grid"><label>Дополнительный параметр<select className="ui-select ui-select--native" aria-label="Дополнительный параметр" value={newParameter} onChange={e => setNewParameter(e.target.value)}><option value="">Выберите из словаря</option>{(Object.keys(registry.parameters) as ParameterId[]).filter(key => !configuration.parameters.some(p => p.parameter_id === key)).map(key => <option key={key} value={key}>{registry.parameters[key].title}</option>)}</select></label><button type="button" className="secondary-action" disabled={!newParameter || busy} onClick={() => { const key = newParameter as ParameterId; updateConfig({ ...configuration, parameters: [...configuration.parameters, { parameter_id: key, variant_id: 'base', unit: registry.parameters[key].unit, representation: 'unknown', set_complete: false, facts: [], reason: 'Сведения пока не внесены' }] }); setNewParameter(''); }}>Добавить поле</button></div></InfoBlock>
          <InfoBlock title={<>Оснащение · {configuration.features.length}</>}>{configuration.features.map((feature, index) => <FeatureEditor key={`${configuration.configuration_id}-${feature.feature_id}`} feature={feature} data={data} save={value => updateConfig({ ...configuration, features: configuration.features.map((old, i) => i === index ? value : old) })} />)}</InfoBlock>
          <InfoBlock title="Дополнительное оснащение"><div className="machine-data-grid"><label>Дополнительное оснащение<select className="ui-select ui-select--native" aria-label="Дополнительное оснащение" value={newFeature} onChange={e => setNewFeature(e.target.value)}><option value="">Выберите признак</option>{(Object.keys(features) as MachineFeature['feature_id'][]).filter(key => !configuration.features.some(f => f.feature_id === key)).map(key => <option key={key} value={key}>{features[key]}</option>)}</select></label><button type="button" className="secondary-action" disabled={!newFeature} onClick={() => { updateConfig({ ...configuration, features: [...configuration.features, { feature_id: newFeature as MachineFeature['feature_id'], state: 'unknown', document_id: null, locator: '', raw: '', reason: 'Наличие не подтверждено' }] }); setNewFeature(''); }}>Добавить признак</button></div></InfoBlock>
          <InfoBlock title={<>Операции по паспорту · {configuration.supported_methods.length}</>}>

            <fieldset className="machine-field-form" disabled={busy}>
              <legend>Операции с явным основанием в источнике</legend>
              {boundMethods.size > 0 && <p className="machine-table-hint">Операции, связанные со способами обработки, меняются через импорт структурированного паспорта.</p>}
              {Object.entries(methods).map(([key, title]) => {
                const methodId = key as MachineConfiguration['supported_methods'][number];
                return <label className="machine-check" key={key}>
                  <input type="checkbox" disabled={boundMethods.has(methodId)} checked={configuration.supported_methods.includes(methodId)} onChange={e => updateConfig({
                    ...configuration,
                    supported_methods: e.target.checked ? [...configuration.supported_methods, methodId] : configuration.supported_methods.filter(method => method !== methodId),
                  })} />{title}
                </label>;
              })}
              <label>Источник операций<select className="ui-select ui-select--native" aria-label="Источник операций" value={configuration.methods_document_id ?? ''} onChange={e => updateConfig({ ...configuration, methods_document_id: e.target.value || null })}>
                <option value="" disabled={boundMethods.size > 0}>Не установлен</option>
                {data.documents.map(d => <option key={d.document_id} value={d.document_id}>{documentTitle(d)}</option>)}
              </select></label>
            </fieldset>
          </InfoBlock>
          {data.unmapped.length > 0 && <InfoBlock title={<>Неуточнённые сведения · {data.unmapped.length}</>}>{data.unmapped.map((item, i) => <p key={i}>{publicSourceText(item.reason, 'Сведения требуют уточнения.')}</p>)}</InfoBlock>}
          </div></InfoBlock>
          </div>
          {(!preview || preview.action === 'unchanged') && <div className="passport-actions"><button type="button" disabled={busy || !data.machine.title.trim() || hasFieldErrors} className="primary-action" onClick={() => void check(false, true)}>{busy ? 'Сохранение…' : 'Сохранить и применить'}</button></div>}
          {preview && <section className="machine-import-preview" aria-label="Проверка изменений"><h4>{preview.action === 'create' ? 'Будет добавлен станок' : preview.action === 'unchanged' ? 'Изменений нет' : 'Будет сохранена новая редакция'}: {publicSourceText(preview.title, 'Оборудование')}</h4>{preview.warnings.map(w => <p key={w} className="passport-count">{publicSourceText(w, 'Сведения требуют проверки.')}</p>)}{preview.changes.length > 0 && <div className="machine-table-scroll"><table><thead><tr><th>Изменение</th><th>Сейчас</th><th>После сохранения</th></tr></thead><tbody>{preview.changes.filter(c => !/(?:\b(?:schema|registry|machine|document|configuration)_id\b|sha256|hash|контрольн.{0,8}сумм)/i.test(c.label)).map((c, i) => <tr key={i}><td>{publicSourceText(c.label, 'Параметр оборудования')}</td><td>{changeValue(c.before)}</td><td>{changeValue(c.after)}</td></tr>)}</tbody></table></div>}{preview.action !== 'unchanged' && <button type="button" className="primary-action" disabled={busy || hasFieldErrors} onClick={() => void commit()}>Сохранить и применить</button>}</section>}
      </>}
    </div></fieldset>
  </Modal>;
}
