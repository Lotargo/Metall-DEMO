import { useId, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { apiClient } from '@/api/client';
import { useCompactRound } from '@/api/hooks/useCompactRound';
import { useMachinePassports } from '@/api/hooks/useMachinePassports';
import type { MachineRate } from '@/api/machineExchange';
import type { components } from '@/api/schema';
import { CutNormsEditor } from '@/components/catalog/CutNormsEditor';
import { MachineHourlyRate, formatMachineHourlyRate, useHasMachineRateDraft } from '@/components/catalog/MachineHourlyRate';
import { BarLengthsSettings, useBarLengthsDraft } from '@/components/route/BarLengthsSettings';
import { CompactEstimateRateSettings } from '@/components/route/CompactEstimateRateSettings';
import { TimeNormRow } from '@/components/route/TimeNormRow';
import { stockChoiceView } from '@/components/route/CompactStockChoice';
import { CompactStockResult } from '@/components/route/CompactStockResult';
import { isRoundReading } from '@/components/route/CompactStockSelection';
import { barLengthsSettingsPath, compactPanelLink, configuratorRatesLink, estimateDocumentsAnchor, estimateRateAnchor, estimateTimeNormsAnchor } from '@/utils/calculationSettingsLinks';
import { formatNumber, formatText } from '@/utils/compactNumbers';
import { publicSourceText } from '@/utils/publicSource';

type State = components['schemas']['CompactState'];
type TimeProfile = components['schemas']['EstimateProfile'];
type Pin = components['schemas']['ProfilePin'];
type Work = components['schemas']['WorkItem'];
type Reload = ReturnType<typeof useCompactRound>['refetch'];
const sections = [
  { id: 'rates', label: 'Ставки и наценка' },
  { id: 'time-norms', label: 'Нормы времени' },
  { id: 'bar-lengths', label: 'Длина прутка' },
  { id: 'cut-norms', label: 'Нормы отрезки круга' },
  { id: 'cutting-regimes', label: 'Режимы резки' },
  { id: 'documents', label: 'Документы' },
];

const developmentPlaceholder = { description: 'Раздел в разработке.' };

const sources: Record<string, { description?: string; panel?: [string, string, string?] }> = {
  'time-norms': {
    description: 'Норма даёт ориентир для события, указанного в составе работ. По смете видно, какие нормы применены и какие работы ещё требуют времени.',
    panel: ['full-route', 'Операции и время в детали'],
  },
  'bar-lengths': {},
  'cut-norms': {},
  'cutting-regimes': developmentPlaceholder,
  documents: developmentPlaceholder,
};

const timeParameters: Record<string, [string, string]> = {
  setup_minutes_per_batch: ['Наладка', 'мин на установ партии'],
  load_unload_minutes_per_part: ['Загрузка и снятие детали', 'мин/дет.'],
  clamping_minutes_per_part: ['Зажим', 'мин/дет.'],
  inspection_minutes_per_part: ['Контроль', 'мин/дет.'],
  tool_change_minutes_per_change: ['Смена инструмента', 'мин/смену'],
  handling_minutes_per_part: ['Обращение с деталью', 'мин/дет.'],
  positioning_minutes_per_hole: ['Позиционирование', 'мин/отверстие'],
  handling_minutes_per_cut: ['Обращение при отрезке', 'мин/отрез'],
  loading_minutes_per_bar: ['Загрузка прутка', 'мин/пруток'],
  cycle_minutes: ['Время цикла', 'мин/садку'],
  capacity: ['Вместимость садки', 'шт.'],
  inspection_minutes: ['Время контроля', 'мин/проверку'],
  sample_percent: ['Доля выборки', '%'],
};

const equipmentNames: Record<string, string> = {
  lathe: 'Токарное оборудование', drill: 'Сверлильное оборудование', bandsaw: 'Ленточная пила',
  heat: 'Термическое оборудование', inspection: 'Средства контроля',
};

const batchNorms: Record<string, { title: string; process: string; category: string }> = {
  'time.batch-cycle/1': { title: 'Садка', process: 'heat', category: 'machining' },
  'time.inspection-sample/1': { title: 'Выборочный контроль', process: 'inspection', category: 'control' },
};

function timeProfileTitle(profile: TimeProfile) {
  const norm = batchNorms[profile.method_id];
  if (norm) return norm.title;
  return profile.kind === 'setup' ? 'Наладка' : 'Вспомогательные работы';
}

function timeProfileCondition(key: string, value: string) {
  if (key === 'frequency' && value === 'once_per_unique_setup_group') return 'Одна наладка на каждый отдельный установ партии.';
  if (key === 'application' && value === 'explicit event counts and shared setup group; never per cutting pass') {
    return 'Кратность берётся из состава работ. Число проходов отдельно время нормы не увеличивает.';
  }
  if (key === 'partial_load') return value === 'full_cycle' ? 'Неполная садка занимает полный цикл.' : 'Время неполной садки требует подтверждения.';
  if (key === 'rounding') return value === 'ceil' ? 'Выборка округляется вверх до целого числа проверок.' : 'Для дробной выборки нужно правило округления.';
  return publicSourceText(formatText(value), 'Условия применения требуют уточнения.');
}

function samePin(left: Pin | null | undefined, right: Pin) {
  return left?.id === right.id && left.version === right.version && left.sha256 === right.sha256;
}

function TimeNormApplication({ state, profile, reload }: { state: State; profile: TimeProfile; reload: Reload }) {
  const id = useId();
  const client = useQueryClient();
  const [selection, setSelection] = useState<{ key: string; revision: number }>();
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState('');
  const { category, process, title } = batchNorms[profile.method_id];
  const { id: profileId, version, sha256 } = profile;
  const pin = { id: profileId, version, sha256 };
  const settings = state.estimation_settings;
  const items = state.cost_estimate?.inventory.items ?? [];
  const lines = state.cost_estimate?.lines ?? [];
  const decisions = settings.decisions ?? [];
  const declared = items.filter(item => item.category === 'declared-work' && item.operation_index != null && item.selection !== 'excluded');
  const workTitle = (work: Work) => `${publicSourceText(state.route?.operations[work.operation_index!]?.title, `Операция ${work.operation_index! + 1}`)} · ${publicSourceText(work.description, 'Работа операции')}`;

  const targets = declared.filter(work => work.process === process).map(work => {
    const previous = decisions.find(decision => decision.parameter_path === work.key);
    const address = `op:${work.operation_index}:${category}`;
    const base = items.find(item => item.key === address);
    const row = state.details.find(detail => detail.operation_index === work.operation_index);
    const equipment = row?.estimation_equipment_class || row?.equipment_class;
    const previousMarker = previous?.profile_pin && `profile:${previous.profile_pin.id}@${previous.profile_pin.version}`;
    const time = previousMarker ? lines.find(line => [address, `${address}:time-norm`].includes(line.work_key)
      && line.time_unit && line.assumption_ids?.includes(previousMarker)) : undefined;
    const saved = previous?.action === 'profile' && samePin(previous.profile_pin, pin);
    const replacesNorm = previous?.action === 'profile' && time != null;
    const addresses = [address, work.key];
    const explicit = settings.manual_lines?.some(line => addresses.includes(line.work_key) && line.minutes != null)
      || settings.work_dispositions?.some(item => addresses.includes(item.work_key));
    let reason = '';
    if (work.selection !== 'required' || declared.some(other => other.key !== work.key && other.operation_index === work.operation_index)) {
      reason = 'Для этой операции нужна одна выбранная работа.';
    } else if (!equipment || equipment !== profile.equipment_class || row?.equipment_state === 'incompatible') {
      reason = 'Для операции требуется совместимое оборудование указанного в профиле класса.';
    } else if (explicit || !base || (!replacesNorm && (work.state !== 'required' || base.state !== 'required' || work.time_basis_key || lines.some(line => line.work_key === address && line.minutes != null)))) {
      reason = 'У работы уже есть другое основание времени или покрытия.';
    }
    return { work, previous, saved, time, reason };
  });
  const eligible = targets.filter(target => !target.reason);
  const picked = targets.find(target => target.work.key === selection?.key);
  const selected = picked?.reason ? undefined : picked;
  const otherDecisions = decisions.filter(decision => decision.parameter_path !== selected?.work.key);
  const oldPin = selected?.previous?.profile_pin;
  const pins = (settings.profile_pins ?? []).filter(item => !oldPin || !samePin(item, oldPin)
    || samePin(item, pin) || otherDecisions.some(decision => samePin(decision.profile_pin, item)));
  const pinConflict = [...pins, ...otherDecisions.flatMap(decision => decision.profile_pin ?? [])].some(item => item.id === pin.id && !samePin(item, pin));
  const canSave = ['ready', 'review'].includes(state.status) && !state.calculation_pending;
  const stale = selection != null && selection.revision !== state.revision;

  async function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !selection || selected.saved || stale || pinConflict || !canSave || busy || conflict) return;
    setBusy(true);
    setError('');
    try {
      const result = await apiClient.POST('/api/v1/runs/{run_id}/compact-round/estimate', {
        params: { path: { run_id: state.source_run_id } },
        body: {
          expected_revision: selection.revision,
          settings: {
            ...settings,
            catalog_version: null,
            catalog_sha256: null,
            profile_pins: pins,
            decisions: [...otherDecisions, {
              id: selected.previous?.id ?? `time-norm:${selected.work.key}`,
              parameter_path: selected.work.key,
              input_revision: selection.revision,
              action: 'profile',
              answer: '',
              profile_pin: pin,
            }],
          },
        },
      });
      if (result.response.status === 409) {
        setConflict(true);
        setError('Данные детали изменились. Обновите их и проверьте выбранную работу.');
        return;
      }
      if (!result.data) {
        setError(typeof result.error?.detail === 'string' ? result.error.detail : 'Не удалось применить норму. Проверьте условия работы.');
        return;
      }
      const saved = result.data;
      const key = ['compact-round', state.source_run_id];
      await client.cancelQueries({ queryKey: key, exact: true });
      client.setQueryData<State>(key, current => current && current.revision > saved.revision ? current : saved);
      setSelection({ key: selected.work.key, revision: saved.revision });
    } catch {
      setError('Сервис не ответил. Обновите данные детали перед повторной записью.');
      setConflict(true);
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setBusy(true);
    try {
      const { data } = await reload({ throwOnError: true });
      if (!data) throw new Error('Деталь недоступна');
      setSelection(current => current && { ...current, revision: data.revision });
      setConflict(false);
      setError('');
    } catch {
      setError('Не удалось обновить данные детали. Выбор сохранён.');
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={event => void apply(event)} aria-busy={busy} className="space-y-2">
    {targets.length > 0 ? <div className="overflow-x-auto">
      <table className="w-full text-left">
        <caption className="pb-2 text-left font-medium">Работы для профиля «{title}»</caption>
        <thead className="border-b border-line text-ink-secondary">
          <tr><th scope="col" className="py-2 pr-3">Выбор</th><th scope="col" className="py-2 pr-3">Работа</th><th scope="col" className="py-2">Состояние</th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {targets.map(({ work, saved, time, reason }, index) => {
            const inputId = `${id}-work-${index}`;
            const label = workTitle(work);
            return <tr key={work.key}>
              <td className="py-2 pr-3 align-top">
                {!reason && <input type="radio" id={inputId} name={id} checked={picked?.work.key === work.key}
                  onChange={() => {
                    setSelection({ key: work.key, revision: state.revision });
                    setError('');
                  }} disabled={busy || conflict} aria-describedby={`${id}-conditions${error ? ` ${id}-error` : ''}`} />}
              </td>
              <th scope="row" className="py-2 pr-3 align-top font-normal">
                {reason ? label : <label htmlFor={inputId}>{label}</label>}
              </th>
              <td className="py-2 align-top text-ink-secondary">
                {reason || (saved ? (time?.minutes == null ? 'Профиль сохранён. Время не определено.'
                  : `Применён · ${formatNumber(time.minutes, 6)} мин на партию`) : 'Доступно для применения')}
              </td>
            </tr>;
          })}
        </tbody>
      </table>
    </div> : <p className="text-muted">Для профиля нужна выбранная работа подходящего вида в сохранённой смете.</p>}
    {eligible.length > 0 && <>
      <div id={`${id}-conditions`} className="space-y-1 text-muted">
        {selected && !selected.saved && <p>Изменится статья времени для выбранной работы. Текущее время на партию {selected.time?.minutes == null ? 'не определено' : `${formatNumber(selected.time.minutes, 6)} мин`}. Статья будет пересчитана по норме для {state.quantity == null ? 'партии с пока неизвестным количеством' : `партии ${state.quantity} шт.`}.</p>}
        {!canSave && <p>Дождитесь сохранения текущего расчёта.</p>}
        {stale && <p>Данные детали изменились. Обновите их и проверьте выбранную работу.</p>}
        {selected && pinConflict && <p>Для другой работы этого расчёта закреплены иные значения профиля.</p>}
      </div>
      <button type="submit" className="secondary-action" disabled={!selected || selected.saved || stale || pinConflict || !canSave || busy || conflict}>
        {selected?.saved ? 'Профиль сохранён' : busy ? 'Сохранение…' : 'Применить профиль'}
      </button>
    </>}
    {error && <p id={`${id}-error`} className="text-warning" role="alert">{publicSourceText(error, 'Не удалось применить норму. Проверьте условия работы.')}</p>}
    {(conflict || stale) && <button type="button" className="secondary-action" disabled={busy} onClick={() => void refresh()}>Обновить данные детали</button>}
  </form>;
}

function TimeProfiles({ state, reload }: { state: State | null | undefined; reload: Reload }) {
  const profiles = useQuery({
    queryKey: ['estimation-profiles'],
    queryFn: async () => {
      const { data } = await apiClient.GET('/api/v1/estimation/profiles');
      if (!data) throw new Error('Не удалось прочитать профили времени.');
      return data.filter(profile => profile.kind === 'auxiliary' || profile.kind === 'setup');
    },
  });
  if (profiles.isPending) return <p role="status">Загрузка профилей времени…</p>;
  if (profiles.isError) return <p role="alert">Не удалось прочитать профили времени.</p>;
  const estimate = state?.cost_estimate;
  const applied = new Set(estimate?.lines?.flatMap(line =>
    line.state === 'estimated' && line.minutes != null ? line.assumption_ids ?? [] : [],
  ));
  const appliedProfiles = profiles.data.filter(profile => applied.has(`profile:${profile.id}@${profile.version}`));

  return <div className="space-y-3">
    {!profiles.data.some(profile => profile.method_id in batchNorms) && <p className="text-muted">В каталоге пока нет опубликованных профилей для садки или выборочного контроля. Время этих работ можно указать в операции детали.</p>}
    {estimate && <div className="space-y-1 border-t border-line pt-3">
      <h3 className="font-semibold text-balance">Сохранённая смета</h3>
      {appliedProfiles.length > 0
        ? <p>Применены {appliedProfiles.map(profile => timeProfileTitle(profile)).join(', ')}.</p>
        : <p>В строках сметы нет подтверждённой связи с нормами из таблицы.</p>}
    </div>}
    {!profiles.data.length ? <p>Профили времени пока отсутствуют. Уточнить время можно в операции детали.</p> : <div className="overflow-x-auto">
      <table className="w-full text-left">
        <caption className="pb-2 text-left font-medium">Опубликованные профили времени ({profiles.data.length})</caption>
        <thead className="bg-surface-muted text-ink-secondary">
          <tr>
            <th scope="col" className="px-3 py-2">Профиль</th>
            <th scope="col" className="px-3 py-2">Работа или параметр</th>
            <th scope="col" className="px-3 py-2">Норма</th>
            <th scope="col" className="px-3 py-2">Порядок применения</th>
            <th scope="col" className="px-3 py-2 text-right">Действие</th>
          </tr>
        </thead>
        {profiles.data.map(profile => {
          const pin = estimate?.profile_pins?.some(item => item.id === profile.id && item.version === profile.version && item.sha256 === profile.sha256);
          const used = applied.has(`profile:${profile.id}@${profile.version}`);
          const parameters = Object.entries(profile.parameters);
          const rows = parameters.length ? parameters : [['', null] as const];
          const conditions = Object.entries(profile.applicability);
          return <tbody key={profile.id} className="border-t border-line">
            {rows.map(([key, number], index) => {
              const [label, unit] = timeParameters[key] ?? [key ? 'Дополнительная норма' : 'Параметры не указаны', number?.unit ?? ''];
              return <TimeNormRow key={key} profile={profile} parameter={key} number={number} label={label} unit={unit}
                heading={index === 0 && <th scope="rowgroup" rowSpan={rows.length} className="px-3 py-2 align-top font-medium">
                  <p>{timeProfileTitle(profile)}</p>
                  {profile.equipment_class && <p className="font-normal">{equipmentNames[profile.equipment_class] ?? 'Оборудование указанного класса'}</p>}
                  {(used || pin) && <p className="mt-1 text-xs font-normal text-muted">{used ? 'Применён в смете' : 'Закреплён в смете'}</p>}
                </th>}
                conditions={index === 0 && <td rowSpan={rows.length} className="max-w-sm space-y-1 px-3 py-2 align-top text-ink-secondary">
                  {conditions.length ? conditions.map(([name, condition]) => <p key={name}>{timeProfileCondition(name, condition)}</p>) : '—'}
                </td>} />;
            })}
            {profile.method_id in batchNorms && <tr><td colSpan={5} className="px-3 py-2">
              {state ? <TimeNormApplication state={state} profile={profile} reload={reload} />
                : <p>Для применения профиля <Link className="text-accent underline" to="/projects">выберите деталь</Link> с сохранённой сметой.</p>}
            </td></tr>}
          </tbody>;
        })}
      </table>
    </div>}
  </div>;
}

function AppliedBasis({ section, state }: { section: string; state: State }) {
  if (section === 'bar-lengths' && state.reading && isRoundReading(state.reading) && state.processing_passport?.kind !== 'milling') {
    const { diameter, geometry } = stockChoiceView(state);
    return <div className="space-y-2 border-t border-line pt-3">
      <h3 className="font-semibold">Сохранённый подбор детали</h3>
      <p>{diameter == null ? 'Диаметр заготовки не определён.' : `Круг Ø${formatNumber(diameter)} мм.`}</p>
      <CompactStockResult state={state} geometry={geometry} showCalculationDetails />
    </div>;
  }
  return null;
}

function RatesSection({ runId, state, reload, requestedMachine, selectMachine }: {
  runId?: string;
  state?: State | null;
  reload: Reload;
  requestedMachine: string | null;
  selectMachine: (id: string) => void;
}) {
  const catalog = useMachinePassports();
  const categories = catalog.data?.categories ?? [];
  const machines = catalog.data?.machines ?? [];
  const categoryIds = new Set(categories.map(category => category.category_id));
  const machineGroups = [
    ...categories.map(category => ({
      id: category.category_id,
      title: category.title,
      machines: machines.filter(machine => machine.category_id === category.category_id),
    })),
    {
      id: null,
      title: 'Без категории',
      machines: machines.filter(machine => !categoryIds.has(machine.category_id)),
    },
  ].filter(group => group.machines.length > 0);
  const estimate = state?.cost_estimate;
  const pins = estimate?.machine_rate_pins ?? {};
  const machine = requestedMachine ?? machines.find(item => item.machine_id in pins)?.machine_id ?? machines[0]?.machine_id ?? '';
  const selected = machines.find(item => item.machine_id === machine);
  const applied = pins[machine] as MachineRate | undefined;
  return <>
    <section className="space-y-2" aria-label="Общие ставки работ">
      <p className="text-muted">Общие ставки ручных работ, ОТК и оборудования настраиваются в конфигураторе.</p>
      <Link className="secondary-action" to={configuratorRatesLink(runId)}>Открыть ставки в конфигураторе</Link>
    </section>
    {state && <CompactEstimateRateSettings key={state.source_run_id} state={state} reload={reload} />}
    {runId && state === undefined && <p role="status">Загрузка расчёта детали…</p>}
    <section className={state ? 'space-y-3 border-t border-line pt-4' : 'space-y-3'} aria-labelledby="calculation-equipment-rates">
      <h3 id="calculation-equipment-rates" className="font-semibold">Ставки станков</h3>
      {catalog.isPending && <p role="status">Загрузка станков…</p>}
      {catalog.isError && <p role="alert">Не удалось прочитать парк оборудования.</p>}
      {catalog.isSuccess && <div className="grid max-w-xl gap-1">
        <label htmlFor="calculation-rate-machine" className="font-medium">Станок</label>
        <select id="calculation-rate-machine" className="min-w-0 rounded-md border border-control bg-surface px-3 py-2"
          value={selected?.machine_id ?? ''} onChange={event => selectMachine(event.target.value)}>
          {!selected && <option value="" disabled>Выберите станок</option>}
          {machineGroups.map(group => <optgroup key={group.id ?? ''} label={group.title}>
            {group.machines.map(item => <option value={item.machine_id} key={item.machine_id}>{item.title}</option>)}
          </optgroup>)}
        </select>
        {requestedMachine && !selected && <p role="status">Выбранный станок отсутствует в действующем парке.</p>}
      </div>}
      {estimate && selected && <p className="break-words"><strong>Закреплено в смете.</strong> {applied
        ? formatMachineHourlyRate(applied.terms.hourly_rate)
        : 'Для этого станка в смете нет сохранённого тарифа.'}</p>}
      {selected && <MachineHourlyRate machineId={machine} compact />}
    </section>
  </>;
}

export function CalculationSettingsPage() {
  const { section } = useParams();
  const [params, setParams] = useSearchParams();
  const runId = params.get('run') || undefined;
  const machine = params.get('machine');
  const documents = section === 'documents';
  const run = useCompactRound(section === 'cutting-regimes' || documents ? undefined : runId, true);
  const rateDraft = useHasMachineRateDraft();
  const barLengthsDraft = useBarLengthsDraft();
  if (section === 'materials' && runId) return <Navigate to={compactPanelLink(runId, 'material')} replace />;
  if (section === 'sheet-layout' && runId) return <Navigate to={compactPanelLink(runId, 'stock')} replace />;
  if (section === 'bar-cutting') return <Navigate to={`${barLengthsSettingsPath}${params.size ? `?${params}` : ''}`} replace />;
  const active = sections.find(item => item.id === section);
  if (!active) return <Navigate to={`/calculation-settings/rates${params.size ? `?${params}` : ''}`} replace />;
  const source = sources[active.id];
  const returnToStock = params.get('from') === 'stock';
  const estimateAnchor = documents ? estimateDocumentsAnchor : active.id === 'time-norms' ? estimateTimeNormsAnchor : machine ? estimateRateAnchor(machine) : 'estimate-rate-settings';

  return <div className="content space-y-4 text-sm text-ink">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-ink-secondary">Ставки, исходные данные и условия расчёта</p>
      <div className="flex flex-wrap gap-3">
        {runId && <Link className="secondary-action" to={returnToStock ? compactPanelLink(runId, 'stock') : compactPanelLink(runId, 'estimate', estimateAnchor)}>
          {returnToStock ? 'Вернуться к заготовке' : 'Вернуться к смете'}
        </Link>}
        <Link className="secondary-action" to="/equipment">Парк оборудования</Link>
      </div>
    </div>
    <nav className="page-section-nav flex flex-wrap gap-2" aria-label="Разделы настроек расчёта">
      {sections.map(item => <Link key={item.id} to={`/calculation-settings/${item.id}${params.size ? `?${params}` : ''}`}
        className={item.id === active.id ? 'primary-action' : 'secondary-action'}
        aria-current={item.id === active.id ? 'page' : undefined}>{item.label}
        {item.id === 'rates' && rateDraft && <span className="ml-1 rounded border border-current px-1.5 text-xs">Черновик</span>}
        {item.id === 'bar-lengths' && barLengthsDraft && <span className="ml-1 rounded border border-current px-1.5 text-xs">Черновик</span>}
      </Link>)}
    </nav>
    <section className="workspace-card space-y-4 p-4 sm:p-5" aria-labelledby="calculation-section-title">
      <h2 className="text-lg font-semibold" id="calculation-section-title">{active.label}</h2>
      {runId && run.isError && <p role="status">Не удалось прочитать применённые данные детали.</p>}
      {source ? <>
        {source.description && <p>{source.description}</p>}
        {active.id === 'bar-lengths' && <BarLengthsSettings />}
        {active.id === 'cut-norms' && <CutNormsEditor />}
        {run.data && <AppliedBasis section={active.id} state={run.data} />}
        {runId && source.panel && <p><Link className="text-accent underline" to={compactPanelLink(runId, source.panel[0], source.panel[2])}>{source.panel[1]}</Link></p>}
        {active.id === 'time-norms' && <TimeProfiles state={run.data} reload={run.refetch} />}
      </> : <RatesSection runId={runId} state={run.isError ? null : run.data} reload={run.refetch} requestedMachine={machine} selectMachine={id => setParams(previous => {
        const next = new URLSearchParams(previous);
        next.set('machine', id);
        return next;
      }, { replace: true })} />}
    </section>
  </div>;
}
