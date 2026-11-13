import { InfoBlock } from '@/components/ui/InfoBlock';
import { Fragment, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { apiClient } from '@/api/client';
import type { useCompactRound } from '@/api/hooks/useCompactRound';
import type { components } from '@/api/schema';
import { Button } from '@/components/ui/Button';
import { equipmentRequest, type MachineRate } from '@/api/machineExchange';
import { asRecord, finiteNonnegative, formatNumber } from '@/utils/compactNumbers';
import { coefficientForRequest } from '@/utils/estimateCoefficient';
import { calculationDocumentsLink, calculationRateLink, calculationTimeNormsLink, estimateDocumentsAnchor, estimateTimeNormsAnchor } from '@/utils/calculationSettingsLinks';
import { hasHistoricalMaterialCost } from '@/utils/priceEvidence';
import { publicSourceText } from '@/utils/publicSource';
import { CompactEstimateComparison, CompactEstimatePreview, CompactEstimateRateSources, pinnedVersions } from './CompactEstimateCommercialComparison';
import { estimateFormKey } from './CompactEstimateDocument';
import { EstimateDocumentWorkspace } from './EstimateDocumentWorkspace';
import { CompactEstimateRateSettings } from './CompactEstimateRateSettings';
import { CompactEstimateReserveEditor } from './CompactEstimateReserveEditor';
import { CompactEstimatePosition } from './CompactEstimatePosition';
import { CompactEstimateSavedSettings } from './CompactEstimateSavedSettings';
import { CompactEstimateScenarioInputs, EstimateNormDetails } from './CompactEstimateScenarioInputs';
import { estimateOperatorText } from './estimateOperatorText';
import './compact-cost-estimate.css';

type State = components['schemas']['CompactState'];
type Estimate = components['schemas']['EstimateSnapshot'];
type Line = components['schemas']['EstimateLine-Output'];
type Work = components['schemas']['WorkItem'];
type CoefficientDraft = { text: string; expectedRevision: number };

class CostPreviewError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}
const categoryNames: Record<string, string> = {
  machining: 'Обработка', auxiliary: 'Вспомогательное время', setup: 'Наладка', control: 'Контроль',
  material: 'Материал, заготовка и потери', tool: 'Инструмент', overhead: 'Накладные расходы',
  'stock-loading': 'Загрузка прутка', 'head-cut': 'Начальная обрезка', 'operation-time': 'Дополнительное время',
  'tool-change': 'Установка и смена инструмента',
  'declared-work': 'Работы операции', uncovered: 'Неоценённые работы', motion: 'Дополнительные перемещения',
  'time-norm-remainder': 'Неполная садка',
  return: 'Возврат резьбового прохода', reserve: 'Резерв',
};
const processNames: Record<string, string> = {
  sawing: 'Отрезка', turning: 'Точение', boring: 'Расточка', drilling: 'Сверление', milling: 'Фрезерование',
  grinding: 'Шлифование', deburr: 'Снятие заусенцев', assembly: 'Сборка', heat: 'Термообработка',
  inspection: 'Контроль', coating: 'Покрытие', cleaning: 'Очистка', generic: 'Прочие работы',
};
const money = (value: unknown) => value == null ? 'Не определено' : new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value));
const uniqueTexts = (values: string[]) => [...new Set(values.map(value => value.trim()).filter(Boolean))];
const categoryName = (category: string, work?: Work) =>
  category === 'declared-work' ? processNames[work?.process ?? ''] ?? categoryNames[category]
    : categoryNames[category] ?? processNames[work?.process ?? ''] ?? 'Прочие работы';
const priceBasis = (line: Line) => line.price_basis === 'mock' ? 'Демонстрационная оценка'
  : line.price_basis === 'estimate' ? 'Ориентировочная стоимость'
    : '';
const frequencyName = (value: Line['frequency']) => value === 'per_batch' ? 'На партию' : 'На деталь';
const currencyName = (value: string) => value === 'RUB' ? '₽' : value;
const timeUnits: Record<string, [string, string]> = {
  'min/cycle': ['мин/садку', 'Садок'],
  'min/inspection': ['мин/проверку', 'Проверок'],
};
const cycleMoveNames: Record<string, string> = {
  approach: 'Подвод', dwell: 'Выдержка', retract: 'Отвод', advance: 'Рабочая подача',
  forward: 'Ход метчика', reverse: 'Вывод метчика', 'reverse-transition': 'Реверс',
};

function articleDescription(work: Work | undefined) {
  const category = work?.category ?? '';
  if (work && ['motion', 'declared-work', 'time-norm-remainder'].includes(category)) {
    return estimateOperatorText(work.description) || categoryName(category, work);
  }
  return categoryName(category, work);
}

function TimeCharge({ line }: { line: Line }) {
  const unit = line.time_unit ? timeUnits[line.time_unit] : undefined;
  if (!unit) return null;
  return <div className="text-xs text-muted tabular-nums">
    <p>{line.time_unit_minutes == null ? `Норма · ${unit[0]}` : `${formatNumber(line.time_unit_minutes, 6)} ${unit[0]}`}</p>
    <p>{unit[1]} · {formatNumber(line.quantity, 0)}</p>
  </div>;
}

function pricedAmount(value: string | null, currency: string) {
  return value == null ? 'Не определена' : `${money(value)} ${currencyName(currency)}`;
}

function usableLine(line: Line) {
  return line.state === 'calculated' || line.state === 'estimated';
}

function linePrice(line: Line) {
  if (!usableLine(line)) return 'Не определена';
  if (line.hourly_rate != null) return `${pricedAmount(line.hourly_rate, line.currency)}/ч`;
  if (line.unit_price != null) return `${pricedAmount(line.unit_price, line.currency)} за ед.`;
  return pricedAmount(line.amount, line.currency);
}

function articleTime(line: Line) {
  return usableLine(line) ? finiteNonnegative(line.minutes) : null;
}

function equipmentText(state: unknown) {
  if (state === 'compatible') return 'Соответствует проверенным требованиям';
  if (state === 'incompatible') return 'Не соответствует известным требованиям';
  return 'Требует подтверждения';
}

function ArticleSource({ sources, notes = [], normLink, fallback = 'Источник не указан в сохранённых данных.' }: { sources: string[]; notes?: string[]; normLink?: string; fallback?: string }) {
  const texts = uniqueTexts(sources.flatMap(source => source.split('\n')).flatMap(source => estimateOperatorText(publicSourceText(source, '')) ?? []));
  const humanNotes = uniqueTexts(notes.flatMap(note => estimateOperatorText(publicSourceText(note, '')) ?? [])).filter(note => !texts.includes(note));
  return <InfoBlock className="estimate-row-source" title="Основание оценки"><div className="mt-2 space-y-2 break-words text-xs text-muted">
    {texts.length ? texts.map(source => <p key={source} className="whitespace-pre-wrap">{source}</p>) : <p>{fallback}</p>}
    {humanNotes.map(note => <p key={note} className="whitespace-pre-wrap">{note}</p>)}
    {normLink && <Link to={normLink} className="text-accent underline">Нормы времени</Link>}
  </div></InfoBlock>;
}

function groupByOperation<T>(items: T[], operation: (item: T) => number | null | undefined) {
  const groups = new Map<number | null, T[]>();
  for (const item of items) {
    const index = operation(item) ?? null;
    const group = groups.get(index) ?? [];
    group.push(item); groups.set(index, group);
  }
  return [...groups.entries()].sort(([left], [right]) => (left ?? -1) - (right ?? -1));
}

function includedTimeByArticle(works: Map<string, Work>) {
  const groups = new Map<string, Work[]>();
  for (const work of works.values()) {
    const coverageKey = work.required_time && work.state === 'included' ? work.included_in
      : work.category === 'declared-work' && !work.required_time && work.state === 'required' ? work.time_basis_key : null;
    if (!coverageKey) continue;
    const seen = new Set([work.key]);
    let target = works.get(coverageKey);
    while (target?.state === 'included' && target.included_in && !seen.has(target.key)) {
      seen.add(target.key);
      target = works.get(target.included_in);
    }
    if (target?.state !== 'required' || target.key === work.key) continue;
    const group = groups.get(target.key) ?? [];
    group.push(work);
    groups.set(target.key, group);
  }
  return groups;
}

function MissingArticles({ estimate, title, normLink }: { estimate: Estimate; title: (index: number | null) => string; normLink: string }) {
  const works = new Map(estimate.inventory.items.map(item => [item.key, item]));
  const lines = new Map(estimate.lines.map(line => [line.work_key, line]));
  const missingTime = new Set(estimate.uncovered_time);
  const missingCost = new Set(estimate.uncovered_cost);
  const keys = [...new Set([...missingCost, ...missingTime])];
  if (!keys.length) return null;
  return <section className="space-y-3 text-sm" aria-label="Неоценённые работы и материалы">
    <h3 className="font-medium">Неоценённые работы и материалы</h3>
    <div className="estimate-table-scroll" tabIndex={0} role="region" aria-label="Таблица неоценённых работ"><table className="estimate-articles-table estimate-missing-table"><caption className="sr-only">Непокрытые время и стоимость по операциям</caption><thead><tr><th scope="col">Работа или статья</th><th scope="col">Статей</th><th scope="col">Не определено</th><th scope="col">Выбор</th><th scope="col">Основание</th></tr></thead>
    {groupByOperation(keys, key => works.get(key)?.operation_index).map(([operation, group]) => {
      const articles = new Map<string, { label: string; state: string; keys: string[]; conditional: boolean }>();
      for (const key of group) {
        const work = works.get(key);
        const line = lines.get(key);
        const label = work?.category === 'time-norm-remainder' ? articleDescription(work)
          : work?.category === 'declared-work' && work.description.trim() ? work.description : categoryName(work?.category ?? '', work);
        const timeLabel = estimate.quantity == null && line && articleTime(line) !== null ? 'Время на партию' : 'Время';
        const state = missingTime.has(key) && missingCost.has(key) ? `${timeLabel} и стоимость`
          : missingTime.has(key) ? timeLabel : 'Стоимость';
        const conditional = work?.selection === 'conditional';
        // Only typed categories are combined; declared work keeps its own description and identity.
        const articleKey = line?.time_unit || work?.category === 'declared-work' || work?.category === 'time-norm-remainder' ? key
          : JSON.stringify([work?.category, work?.process, state, conditional]);
        const article = articles.get(articleKey);
        if (article) article.keys.push(key);
        else articles.set(articleKey, { label, state, keys: [key], conditional });
      }
      return <tbody key={operation ?? 'common'}><tr className="estimate-group-row"><th colSpan={5} scope="rowgroup">{title(operation)}</th></tr>
        {[...articles.entries()].map(([key, article]) => {
          const line = lines.get(key);
          return <tr key={key}><th scope="row">{article.label}{line && <TimeCharge line={line} />}</th><td className="estimate-number">{article.keys.length}</td><td>{article.state}</td><td>{article.conditional ? 'Условная работа' : 'Без отдельного условия выбора'}</td><td><ArticleSource sources={article.keys.flatMap(item => [works.get(item)?.source ?? '', lines.get(item)?.source ?? ''])} notes={article.keys.flatMap(item => [item === 'material' ? 'Стоимость материала открыта.' : works.get(item)?.reason ?? '', ...(lines.get(item)?.limitations ?? [])])} normLink={line?.time_unit ? normLink : undefined} fallback="Пробел указан в сохранённом составе работ или результате расчёта." /></td></tr>;
        })}
      </tbody>;
    })}</table></div>
  </section>;
}

export function CompactCostEstimate({ runId, value, referenceOnly, active, refetchState, quantityEditor }: {
  runId: string;
  value: State;
  referenceOnly: boolean;
  active: boolean;
  refetchState: ReturnType<typeof useCompactRound>['refetch'];
  quantityEditor?: ReactNode;
}) {
  const client = useQueryClient();
  const { hash, search } = useLocation();
  const navigate = useNavigate();
  const draftKey = ['compact-coefficient-draft', runId];
  const { data: draft } = useQuery<CoefficientDraft | null>({
    queryKey: draftKey, queryFn: skipToken, initialData: null, enabled: false, gcTime: Infinity, structuralSharing: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const savedCoefficient = value.estimation_settings.processing_markup_coefficient ?? '1';
  const coefficient = draft?.text ?? savedCoefficient;
  const candidate = coefficientForRequest(coefficient, savedCoefficient);
  const expectedRevision = draft?.expectedRevision ?? value.revision;
  const tariffs = useQuery({ queryKey: ['machine-hourly-rates'], queryFn: () => equipmentRequest<Record<string, MachineRate>>('hourly-rates'), enabled: active, refetchOnWindowFocus: true });
  const estimate = value.cost_estimate;
  const savedVersions = pinnedVersions(estimate);
  const machineIds = [...new Set(value.details.flatMap(detail => typeof detail.machine_id === 'string' ? [detail.machine_id] : []))];
  const availableRates = tariffs.data;
  const stale = !!estimate && !!availableRates && (
    Object.entries(savedVersions).some(([id, version]) => availableRates[id]?.version !== version)
    || machineIds.some(id => availableRates[id] && savedVersions[id] === undefined)
  );
  const processing = ['reading', 'checking', 'resolving', 'preliminary', 'detailing'].includes(value.status);
  const enabled = value.details.length > 0 && !processing && !referenceOnly && !value.calculation_pending && ['ready', 'review'].includes(value.status);
  const savedEstimateAvailable = !!estimate && !referenceOnly && !value.calculation_pending;
  const tableQuery = useQuery({
    queryKey: ['compact-estimate-table', runId, value.revision],
    enabled: active && savedEstimateAvailable,
    retry: false,
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/api/v1/runs/{run_id}/compact-round/estimate-table', {
        signal, params: { path: { run_id: runId } },
      });
      if (error) throw new Error('Не удалось прочитать смету.');
      return data ?? null;
    },
  });
  const formQuery = useQuery({
    queryKey: estimateFormKey(runId, value.revision),
    enabled: active && savedEstimateAvailable,
    retry: false,
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/api/v1/runs/{run_id}/compact-round/estimate-form', {
        signal,
        params: { path: { run_id: runId } },
      });
      if (error || data && !Array.isArray(data.rows)) throw new Error('Не удалось прочитать форму сметы.');
      return data ?? null;
    },
  });
  const form = !referenceOnly && !value.calculation_pending ? formQuery.data : null;
  useEffect(() => {
    if (!active || !hash.startsWith('#estimate-')) return;
    const frame = requestAnimationFrame(() => {
      const anchor = [...document.querySelectorAll<HTMLElement>('.compact-cost-estimate [id^="estimate-"]')]
        .find(element => `#${encodeURIComponent(element.id)}` === hash);
      const panel = anchor?.closest<HTMLElement>('[data-estimate-panel]');
      const target = panel?.dataset.estimatePanel ?? 'rates';
      if (new URLSearchParams(search).get('section') !== target) {
        const next = new URLSearchParams(search);
        next.set('section', target);
        navigate({ search: `?${next}`, hash }, { replace: true });
        return;
      }
      anchor?.focus(); anchor?.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(frame);
  }, [active, hash, search, navigate, tariffs.data, value.revision]);
  const historicalMaterialCost = hasHistoricalMaterialCost(estimate);
  const needsPreview = candidate !== null && (candidate !== savedCoefficient || stale || historicalMaterialCost || !Object.keys(savedVersions).length);
  const preview = useQuery({
    queryKey: ['compact-cost-preview', runId, expectedRevision, candidate, tariffs.dataUpdatedAt],
    enabled: active && enabled && needsPreview && !conflict,
    retry: false,
    queryFn: async ({ signal }) => {
      await new Promise(resolve => setTimeout(resolve, 250));
      signal.throwIfAborted();
      if (candidate === null) throw new Error('Коэффициент не определён');
      const { data, error, response } = await apiClient.POST('/api/v1/runs/{run_id}/compact-round/cost-estimate/preview', {
        signal,
        params: { path: { run_id: runId } },
        body: { expected_revision: expectedRevision, processing_markup_coefficient: candidate },
      });
      if (!data) throw new CostPreviewError(response.status, typeof error?.detail === 'string' ? error.detail : 'Не удалось подготовить предпросмотр.');
      return data;
    },
  });
  const previewConflict = preview.error instanceof CostPreviewError && preview.error.status === 409;
  const awaitingPreview = needsPreview && (!preview.data || preview.isError || preview.isFetching);

  function editCoefficient(text: string, revision = expectedRevision) {
    const next: CoefficientDraft = { text, expectedRevision: revision };
    client.setQueryData(draftKey, next);
    setInvalid(false);
    if (!conflict) setError('');
  }

  function discardCoefficient() {
    client.setQueryData(draftKey, null);
    setError('');
    setConflict(false);
    setInvalid(false);
  }

  async function refreshEstimate() {
    setBusy(true);
    try {
      const { data } = await refetchState({ throwOnError: true });
      if (!data) throw new Error('Смета недоступна');
      if (draft && client.getQueryData(draftKey) === draft) editCoefficient(draft.text, data.revision);
      void client.invalidateQueries({ queryKey: ['machine-hourly-rates'] });
      void client.invalidateQueries({ queryKey: ['compact-cost-preview', runId] });
      setConflict(false);
      setError('');
    } catch {
      setError('Не удалось обновить смету. Черновик сохранён.');
    } finally {
      setBusy(false);
    }
  }

  async function calculate(e?: FormEvent) {
    e?.preventDefault();
    if (!enabled || busy || conflict || awaitingPreview) return;
    setError('');
    if (candidate === null) {
      setInvalid(true);
      setError('Введите коэффициент не меньше 1. Например, 1,20 соответствует надбавке 20%.');
      return;
    }
    const versions = needsPreview ? pinnedVersions(preview.data) : savedVersions;
    await saveCost({
      expected_revision: expectedRevision,
      processing_markup_coefficient: candidate,
      ...(needsPreview || Object.keys(versions).length ? { expected_rate_versions: versions } : {}),
      ...(needsPreview && preview.data ? { expected_input_sha256: preview.data.input_sha256 } : {}),
    }, true);
  }

  async function saveCost(body: components['schemas']['CompactCostCommand'], appliedCoefficient = false) {
    setError('');
    setBusy(true);
    try {
      const { data, error, response } = await apiClient.POST('/api/v1/runs/{run_id}/compact-round/cost-estimate', {
        params: { path: { run_id: runId } },
        body,
      });
      if (response.status === 409) {
        setConflict(true);
        setError(`${typeof error?.detail === 'string' ? error.detail : 'Редакция сметы изменилась.'}${draft ? ' Черновик сохранён.' : ''}`);
        return false;
      }
      if (error || !data) throw new Error(typeof error === 'object' && error && 'detail' in error && typeof error.detail === 'string' ? error.detail : 'Не удалось рассчитать стоимость. Обновите данные.');
      await client.cancelQueries({ queryKey: ['compact-round', runId], exact: true });
      client.setQueryData<State>(['compact-round', runId], current => current && current.revision > data.revision ? current : data);
      if (appliedCoefficient && client.getQueryData(draftKey) === draft) discardCoefficient();
      void client.invalidateQueries({ queryKey: ['machine-hourly-rates'] });
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Не удалось рассчитать стоимость');
      return false;
    }
    finally { setBusy(false); }
  }
  const knownLines = estimate?.lines.filter(line => usableLine(line) && (
    line.computed_batch_amount != null || articleTime(line) !== null || line.unit_price != null || line.amount != null
  )) ?? [];
  const works = new Map(estimate?.inventory.items.map(item => [item.key, item]) ?? []);
  const includedTime = includedTimeByArticle(works);
  const knownGroups = groupByOperation(knownLines, line => works.get(line.work_key)?.operation_index);
  const detailByOperation = new Map(value.details.map(detail => [detail.operation_index, detail]));
  const hasTotals = Boolean(estimate?.totals.length);
  const scenarioEstimate = preview.data?.operation_bases ? preview.data : estimate;
  const currencyTotals = new Map<string, Estimate['totals']>();
  for (const total of estimate?.totals ?? []) {
    if (total.price_basis === 'source' || total.price_basis === 'estimate') {
      currencyTotals.set(total.currency, [...currencyTotals.get(total.currency) ?? [], total]);
    }
  }
  const time = estimate && value.time_estimate?.quantity === estimate.quantity && !referenceOnly ? value.time_estimate : null;
  const operationTitle = (index: number | null) => index === null ? 'Общие статьи партии'
    : value.route?.operations[index]?.title ?? `Операция ${index + 1}`;
  const articleLabel = (key: string) => { const work = works.get(key); return work ? `${work.operation_index == null ? '' : `${operationTitle(work.operation_index)} · `}${work.category === 'declared-work' ? work.description : categoryName(work.category, work)}` : 'Статья вне текущего состава'; };
  const notices = <>
    {referenceOnly && <p className="text-sm text-warning" role="status">Показана смета по прежним инженерным основаниям. После изменения количества требуется пересмотр зависимой карты и расчётов.</p>}
    {historicalMaterialCost && <p role="status">Показана сохранённая смета. Для нового документа нажмите «Пересчитать и сохранить».</p>}
    {stale && <p role="status" className="rounded-md border border-line p-3 text-sm">Есть расхождения между доступными и закреплёнными ставками. Проверьте сравнение перед пересчётом.</p>}
  </>;
  const summary = <>
    {estimate && <section className="space-y-3"><h3 className="font-medium">Итоги расчёта</h3><table className="estimate-summary-table"><caption className="sr-only">Итоги стоимости на сохранённую партию</caption><thead><tr><th scope="col">Показатель</th><th scope="col">Значение</th></tr></thead>
      <tbody>
        <tr><th scope="row">Количество деталей в расчёте</th><td>{estimate.quantity == null ? 'Не определено' : `${estimate.quantity} шт.`}{estimate.quantity !== value.quantity && <p className="text-xs text-muted">Текущее количество: {value.quantity == null ? 'не определено' : `${value.quantity} шт.`}</p>}</td></tr>
        <tr><th scope="row">Полнота стоимости</th><td>{estimate.total_state === 'complete' && hasTotals ? 'Рассчитана на сохранённых основаниях' : hasTotals ? 'Частичный расчёт' : 'Стоимость не определена'}{estimate.base_complete && hasTotals && estimate.reserve_state === 'unknown' && <p className="text-xs text-muted">Основная стоимость рассчитана. Резерв требует решения.</p>}</td></tr>
        <tr><th scope="row">Покрытие времени</th><td>{estimate.uncovered_time.length > 0 ? 'Есть работы без оценки времени' : estimate.inventory.items.some(item => item.required_time && item.state !== 'not_applicable') ? 'Время заявленных работ учтено' : 'Нет работ для оценки времени'}</td></tr>
        <tr><th scope="row">Коэффициент трудоёмкости</th><td>×{formatNumber(estimate.labor_coefficient ?? '1', 6)}</td></tr>
        {[...currencyTotals].filter(([, totals]) => totals.length > 1).map(([currency, totals]) => {
          const complete = estimate.total_state === 'complete' && totals.every(total => total.total != null);
          const sum = totals.reduce((amount, total) => amount + Number(complete ? total.total : total.subtotal_with_markup ?? total.base), 0);
          return <tr key={currency} className="estimate-subtotal">
            <th scope="row">{complete ? 'Полный итог партии' : 'Известный подытог с надбавкой'}</th>
            <td className="estimate-number">{money(sum)} {currencyName(currency)} · предварительно</td>
          </tr>;
        })}
        {time?.known_piece_minutes != null && estimate.quantity == null && <tr><th scope="row">Известное время на деталь</th><td>{formatNumber(time.known_piece_minutes)} мин</td></tr>}
        {time?.known_fixed_batch_minutes != null && estimate.quantity == null && <tr><th scope="row">Известные работы на партию</th><td>{formatNumber(time.known_fixed_batch_minutes)} мин</td></tr>}
        {time?.known_batch_minutes != null && estimate.quantity != null && time.full_batch_minutes == null && <tr><th scope="row">Известная часть времени партии</th><td>{formatNumber(time.known_batch_minutes)} мин</td></tr>}
        {time && <tr><th scope="row">Полное время партии</th><td>{time.full_batch_minutes == null ? 'Не определено' : `${formatNumber(time.full_batch_minutes)} мин${time.state === 'estimated' ? ' · ориентир' : ''}`}</td></tr>}
      </tbody>
      {estimate.totals.map(total => <tbody key={`${total.currency}-${total.price_basis}`}>
        <tr className="estimate-group-row"><th colSpan={2} scope="rowgroup">{{ source: 'По источнику', estimate: 'Ориентировочная оценка', mock: 'Демонстрационная оценка', unknown: 'Основание не установлено' }[total.price_basis]} · {currencyName(total.currency)}</th></tr>
        <tr><th scope="row">Известная стоимость обработки</th><td className="estimate-number">{money(total.processing_base ?? total.base)} {currencyName(total.currency)}</td></tr>
        <tr><th scope="row">Надбавка · ×{estimate.processing_markup_coefficient ?? '1'}</th><td className="estimate-number">{money(total.markup ?? '0')} {currencyName(total.currency)}</td></tr>
        <tr className="estimate-subtotal"><th scope="row">Известная сумма с надбавкой</th><td className="estimate-number">{money(total.subtotal_with_markup ?? total.base)} {currencyName(total.currency)}</td></tr>
        <tr><th scope="row">Резерв</th><td className="estimate-number">{estimate.reserve_state === 'not_applicable' ? 'Не требуется' : total.reserve == null ? 'Не определено' : `${money(total.reserve)} ${currencyName(total.currency)}`}</td></tr>
        <tr className="estimate-subtotal"><th scope="row">{(currencyTotals.get(total.currency)?.length ?? 0) > 1 ? 'Итог по основанию' : 'Полный итог партии'}</th><td className="estimate-number">{estimate.total_state === 'complete' && total.total != null ? `${money(total.total)} ${currencyName(total.currency)}` : 'Не определено'}</td></tr>
      </tbody>)}
      {estimate.totals.length === 0 && <tbody><tr><th scope="row">Известная сумма с надбавкой</th><td>Не определено</td></tr><tr><th scope="row">Резерв</th><td>{estimate.reserve_state === 'not_applicable' ? 'Не требуется' : 'Не определено'}</td></tr><tr><th scope="row">Полный итог партии</th><td>Не определено</td></tr></tbody>}
    </table>{estimate.total_state !== 'complete' && <p className="text-sm text-muted">Полная стоимость не определена.{hasTotals ? ' Показан подытог оценённых статей.' : ' Для денежного подытога нужны основания цены.'}</p>}</section>}
  </>;
  const rates = <>
    <section className="space-y-4">
      <div><h2 className="document-section-title">Ставки и коммерческие параметры</h2>
        <p className="document-help">Инструмент и накладные расходы входят в тарифы работ.</p></div>
      <form className="document-rate-form" onSubmit={event => void calculate(event)}>
        <label htmlFor="estimate-markup" className="font-semibold">Коэффициент надбавки</label>
        <p id="estimate-markup-hint" className="document-help">1,00 — без надбавки. 1,20 добавляет 20% к обработке. Резерв выбирается отдельно.</p>
        <div className="flex flex-wrap items-center gap-3">
          <input id="estimate-markup" className="ui-input w-32 tabular-nums" inputMode="decimal" value={coefficient}
            aria-invalid={invalid || undefined} aria-describedby="estimate-markup-hint" disabled={busy}
            onChange={event => editCoefficient(event.target.value)} />
          <Button type="submit" loading={busy} disabled={!enabled || busy || conflict || awaitingPreview}>Применить и пересчитать</Button>
          {draft && <Button type="button" variant="outline" disabled={busy} onClick={discardCoefficient}>Отменить надбавку</Button>}
        </div>
        {draft && <p className="document-help">Сохранено: ×{savedCoefficient.replace('.', ',')}. Новое значение ещё не применено.</p>}
      </form>
      <div className="document-settings-links">
        <Link id="estimate-rate-settings" className="secondary-action" to={calculationRateLink(runId)}>Каталог ставок оборудования</Link>
        <Link id={estimateTimeNormsAnchor} className="secondary-action" to={calculationTimeNormsLink(runId)}>Нормы времени</Link>
      </div>
    </section>
    {error && <div className="passport-error space-y-2">
      <p role="alert" id="estimate-markup-error">{publicSourceText(error, 'Не удалось обновить стоимость. Проверьте исходные значения.')}</p>
      {conflict && <button type="button" className="secondary-action" disabled={busy} onClick={() => void refreshEstimate()}>Обновить смету, сохранив ввод</button>}
    </div>}
    {needsPreview && enabled && !conflict && (
      preview.isError ? <div className="passport-error space-y-2">
        <p role="alert">{preview.error instanceof Error ? preview.error.message : 'Не удалось подготовить предпросмотр.'}</p>
        {previewConflict
          ? <button type="button" className="secondary-action" disabled={busy} onClick={() => void refreshEstimate()}>Обновить смету, сохранив ввод</button>
          : <button type="button" className="secondary-action" onClick={() => void preview.refetch()}>Повторить предпросмотр</button>}
      </div>
      : preview.data ? <CompactEstimatePreview estimate={preview.data} />
      : <p role="status">Подготовка предпросмотра стоимости…</p>
    )}
    {!enabled && <p className="text-sm text-muted">Для стоимости нужны сохранённые результаты операций. Неизвестное время или ставка остаются неопределёнными.</p>}
    {tariffs.isError && <p className="text-sm text-muted">Не удалось проверить актуальность ставок станков.</p>}
    <CompactEstimateRateSources runId={runId} estimate={estimate} machineIds={machineIds} currentRates={availableRates}
      projectedRates={needsPreview && !awaitingPreview && !conflict ? preview.data?.machine_rate_pins as Record<string, MachineRate> | undefined : undefined}
      failed={tariffs.isError} />
    <CompactEstimateRateSettings state={value} reload={refetchState} includeProcessingMarkup={false} />
    <CompactEstimateSavedSettings settings={value.estimation_settings} articleLabel={articleLabel} />
  </>;
  const extras = <>
    <h2 className="document-section-title">Дополнительные нормы и резерв</h2>
    {estimate && <CompactEstimateReserveEditor estimate={estimate} saved={value.estimation_settings.reserve_groups}
      disabled={!enabled || busy || conflict}
      save={reserve_groups => saveCost({ expected_revision: value.revision, preserve_machine_rates: true, reserve_groups })} />}
    {scenarioEstimate?.operation_bases && <CompactEstimateScenarioInputs
      runId={runId} value={value} estimate={scenarioEstimate}
      disabled={!enabled || busy || conflict || awaitingPreview || candidate !== savedCoefficient}
      refresh={refetchState} />}
    <InfoBlock title="Отдельная ручная позиция"><div className="mt-4 space-y-4">
      <p className="text-sm text-muted">Самостоятельный черновик цены на выбранный объём. В общий итог маршрута автоматически не добавляется.</p>
    <CompactEstimatePosition value={value} runId={runId} enabled={enabled} />
    </div></InfoBlock>
    <Link id={estimateDocumentsAnchor} className="secondary-action" to={calculationDocumentsLink(runId)}>Коммерческое предложение</Link>
  </>;
  const worksView = <>
    {!estimate ? <p className="text-sm text-muted">Стоимость ещё не рассчитана.</p> : <>
      {estimate.uncovered_cost.includes('material') && <p className="text-sm text-muted">Стоимость материала открыта.</p>}

      {knownLines.length > 0 && <section className="space-y-3">
        <h3 className="font-medium text-balance">Известное время и стоимость</h3>
        <div className="estimate-table-scroll" tabIndex={0} role="region" aria-label="Таблица рассчитанных статей"><table className="estimate-articles-table">
          <caption className="sr-only">Время и стоимость статей по операциям</caption>
          <thead><tr><th scope="col">Статья</th><th scope="col">Начисление</th><th scope="col" className="estimate-number">Время, мин</th><th scope="col">Основание цены</th><th scope="col">Сумма на партию</th></tr></thead>
          {knownGroups.map(([operation, lines]) => {
            const detail = detailByOperation.get(operation);
            const basis = operation === null ? undefined : estimate.operation_bases?.[String(operation)];
            const motionLines = lines.filter(line => line.frequency === 'per_piece' && ['machining', 'motion', 'return'].includes(line.category) && articleTime(line) !== null);
            const motionSeconds = motionLines.reduce((sum, line) => sum + (articleTime(line) ?? 0), 0) * 60;
            const conditional = Array.isArray(detail?.calculations) && detail.calculations.some(
              calculation => asRecord(asRecord(calculation).response).conditional === true,
            );
            const timePrefix = conditional || motionLines.some(line => line.state === 'estimated') ? '≈' : '';
            return <tbody key={operation ?? 'common'}>
              <tr className="estimate-group-row"><th colSpan={5} scope="rowgroup">{operationTitle(operation)}
                {operation !== null && detail?.machine_id != null && <p className="text-xs font-normal text-muted">Применимость станка · {equipmentText(basis?.actual_equipment_state ?? detail?.equipment_state)}</p>}
                {basis?.reference_title && <p className="text-xs font-normal text-muted">Условный расчёт · {publicSourceText(basis.reference_title, 'Оборудование для предварительной оценки')}</p>}
                {motionLines.length > 0 && <p className="text-xs font-normal text-muted">Известное время движений · {timePrefix}{formatNumber(motionSeconds, 2)} с/дет.</p>}
              </th></tr>
              {lines.map(line => {
                const work = works.get(line.work_key);
                const minutes = articleTime(line);
                const historicalMaterial = line.work_key === "material" || ["material", "material-credit"].includes(line.category);
                const covered = (includedTime.get(line.work_key) ?? []).filter(item => !line.labor_basis || !['motion', 'return'].includes(item.category));
                const description = line.time_unit === 'min/cycle' ? 'Садка' : line.time_unit === 'min/inspection' ? 'Выборочный контроль'
                  : work ? articleDescription(work) : categoryName(line.category);
                const normLink = line.assumption_ids?.some(id => id.startsWith('profile:')) ? calculationTimeNormsLink(runId) : undefined;
                return <Fragment key={line.id}><tr><th scope="row">{description}{!historicalMaterial && priceBasis(line) && <p className="text-xs text-muted">{priceBasis(line)}</p>}

                </th>
                  <td>{frequencyName(line.frequency)}<TimeCharge line={line} />{line.time_norm && <EstimateNormDetails norm={line.time_norm} />}</td>
                  <td className="estimate-number">{formatNumber(minutes)}{line.state === 'estimated' && minutes !== null && <p className="text-xs text-muted">Ориентир</p>}
                    {line.labor_basis && <p className="text-xs text-muted">База {formatNumber(line.labor_basis.base_minutes_per_piece)} × {formatNumber(line.labor_basis.coefficient, 6)}</p>}
                    {line.frequency === 'per_piece' && line.computed_batch_minutes != null && <p className="text-xs text-muted">На партию {formatNumber(line.computed_batch_minutes)}</p>}</td>
                  <td className="estimate-number">{historicalMaterial ? "—" : linePrice(line)}</td>
                  <td className="estimate-number">{pricedAmount(line.computed_batch_amount, line.currency)}</td>
                </tr><tr className="estimate-line-notes"><td colSpan={5}><div className="estimate-line-context">
                  {covered.length > 0 && <InfoBlock className="mt-1 font-normal text-xs" title={<>Учтено в этой строке ({covered.length})</>}>
                    <ul className="mt-1 space-y-1 text-muted">{covered.map(item => <li key={item.key}>{item.operation_index !== operation && `${operationTitle(item.operation_index)} · `}{articleDescription(item)}</li>)}</ul>
                  </InfoBlock>}
                  <div className="estimate-line-basis">{historicalMaterial ? "Сохранённая смета" : <ArticleSource sources={[line.source, work?.source ?? '', line.labor_basis?.source ?? '']} notes={line.labor_basis ? [...line.limitations ?? [], line.labor_basis.includes] : line.limitations} normLink={normLink} fallback="Расчёт по сохранённым условиям операции." />}
                    {!!line.cycle_movements?.length && !line.labor_basis && <InfoBlock className="mt-1 text-xs" title="Движения в этом времени">

                      <ul className="mt-1 space-y-1">{line.cycle_movements.map((move, index) => <li key={index}>
                        {cycleMoveNames[move.kind] ?? move.kind} · {move.category === 'working' ? 'рабочее' : 'вспомогательное'} · {formatNumber(Number(move.minutes_per_event) * 60, 3)} с × {move.events_per_piece}
                      </li>)}</ul>
                    </InfoBlock>}
                  </div>
                </div></td></tr></Fragment>;
              })}
            </tbody>;
          })}
        </table></div>
      </section>}
      <MissingArticles estimate={estimate} title={operationTitle} normLink={calculationTimeNormsLink(runId)} />
      <CompactEstimateComparison runId={runId} estimate={estimate} revision={value.revision} />
    </>}
  </>;
  return <EstimateDocumentWorkspace runId={runId} value={value} form={form} table={savedEstimateAvailable ? tableQuery.data : null}
    quantityEditor={quantityEditor} notices={<>{notices}{error && <p role="alert" className="document-notice">{publicSourceText(error, 'Не удалось сохранить смету.')}</p>}</>}
    rates={rates} works={worksView} extras={extras} summary={summary} busy={busy}
    canSave={enabled && !busy && !conflict && !awaitingPreview} dirty={candidate !== savedCoefficient}
    onSave={() => void calculate()} onRefresh={() => void refreshEstimate()}
    retryTable={tableQuery.isError && <Button variant="outline" onClick={() => void tableQuery.refetch()}>Повторить загрузку</Button>} />;
}
