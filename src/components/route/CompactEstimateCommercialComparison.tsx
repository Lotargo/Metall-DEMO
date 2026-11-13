import { InfoBlock } from '@/components/ui/InfoBlock';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiClient } from '@/api/client';
import { useMachinePassports } from '@/api/hooks/useMachinePassports';
import type { MachineRate } from '@/api/machineExchange';
import type { components } from '@/api/schema';
import { MACHINE_RATE_COMPOSITION, formatMachineHourlyRate } from '@/components/catalog/MachineHourlyRate';
import { calculationRateLink, estimateRateAnchor } from '@/utils/calculationSettingsLinks';
import { publicSourceText } from '@/utils/publicSource';

type Estimate = components['schemas']['EstimateSnapshot'];
type EstimateTotal = components['schemas']['EstimateTotal'];
const basisNames = { source: 'По источнику', estimate: 'Ориентировочная оценка', mock: 'Демонстрационная оценка', unknown: 'Основание не установлено' };

export function pinnedVersions(estimate?: Estimate | null) {
  return Object.fromEntries(Object.entries(estimate?.machine_rate_pins ?? {}).map(([id, pin]) => [id, (pin as MachineRate).version]));
}

export function CompactEstimateRateSources({ runId, estimate, machineIds, currentRates, projectedRates, failed }: {
  runId: string;
  estimate: Estimate | null;
  machineIds: string[];
  currentRates?: Record<string, MachineRate>;
  projectedRates?: Record<string, MachineRate>;
  failed: boolean;
}) {
  const catalog = useMachinePassports();
  const saved = (estimate?.machine_rate_pins ?? {}) as Record<string, MachineRate>;
  const available = projectedRates ?? currentRates;
  const availableIds = projectedRates ? Object.keys(projectedRates) : machineIds.filter(id => currentRates?.[id]);
  const ids = new Set([...Object.keys(saved), ...availableIds]);
  if (!ids.size) return null;
  return <section className="space-y-2" aria-labelledby="estimate-rate-sources">
    <h3 id="estimate-rate-sources" className="font-medium">Ставки в смете</h3>
    <p className="text-muted">{MACHINE_RATE_COMPOSITION}</p>
    <p className="text-muted">При пересчёте доступные ставки применяются к сохранённым работам с подходящим основанием. Пробелы стоимости перечислены в смете.</p>
    <div className="estimate-table-scroll" tabIndex={0} role="region" aria-label="Сравнение ставок">
      <table className="estimate-rate-table">
        <thead><tr><th scope="col">Станок и источник</th><th scope="col">Закреплено в смете</th><th scope="col">Доступно для пересчёта</th></tr></thead>
        <tbody>{[...ids].map(id => {
          const pin = saved[id];
          const current = available?.[id];
          return <tr key={id}>
            <th scope="row"><Link id={estimateRateAnchor(id)} className="text-accent underline" to={calculationRateLink(runId, id)}
              aria-label="Настроить ставку станка">{catalog.data?.machines.find(item => item.machine_id === id)?.title ?? 'Станок'}</Link></th>
            <td>{pin ? <><p>{formatMachineHourlyRate(pin.terms.hourly_rate)}</p>
              <p className="text-xs text-muted wrap-break-word">{publicSourceText(pin.terms.source, pin.terms.source?.trim() ? 'Основание ставки сохранено' : 'Источник не указан')}</p></> : 'Ранее не закреплено'}</td>
            <td>{current
              ? <><p>{formatMachineHourlyRate(current.terms.hourly_rate)}</p>
                {current.version !== pin?.version && <p className="text-xs text-muted wrap-break-word">{publicSourceText(current.terms.source, current.terms.source?.trim() ? 'Основание ставки сохранено' : 'Источник не указан')}</p>}</>
              : <p>{available ? 'Ставка отсутствует' : failed ? 'Источник недоступен' : 'Загрузка…'}</p>}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </section>;
}

function money(value: string | null | undefined, currency: string) {
  if (value == null) return 'Не определено';
  return `${Number(value).toLocaleString('ru-RU', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })} ${currency === 'RUB' ? '₽' : currency}`;
}

function subtotal(total?: EstimateTotal) {
  return total ? money(total.subtotal_with_markup ?? total.base, total.currency) : 'Не определён';
}

const totalKey = (total: EstimateTotal) => `${total.currency}/${total.price_basis}`;

export function CompactEstimatePreview({ estimate, description = 'По сохранённым работам и доступным ставкам. Для записи используйте пересчёт стоимости.' }: {
  estimate: Estimate;
  description?: string;
}) {
  return <section className="space-y-2 rounded-md border border-line p-3" aria-labelledby="estimate-cost-preview">
    <h3 id="estimate-cost-preview" className="font-medium">Предпросмотр стоимости</h3>
    <p className="text-muted">{description}</p>
    <table className="estimate-summary-table">
      <thead><tr><th scope="col">Показатель</th><th scope="col">Предлагаемое значение</th></tr></thead>
      {estimate.totals.map(total => <tbody key={totalKey(total)}>
        <tr className="estimate-group-row"><th scope="rowgroup" colSpan={2}>{basisNames[total.price_basis]} · {total.currency}</th></tr>
        <tr><th scope="row">Известная стоимость обработки</th><td className="estimate-number">{money(total.processing_base ?? total.base, total.currency)}</td></tr>
        <tr><th scope="row">Надбавка · ×{estimate.processing_markup_coefficient ?? '1'}</th><td className="estimate-number">{money(total.markup, total.currency)}</td></tr>
        <tr className="estimate-subtotal"><th scope="row">Известный подытог</th><td className="estimate-number">{subtotal(total)}</td></tr>
        <tr><th scope="row">Резерв</th><td className="estimate-number">{estimate.reserve_state === 'not_applicable' ? 'Не требуется' : money(total.reserve, total.currency)}</td></tr>
        <tr><th scope="row">Полный итог партии</th><td className="estimate-number">{money(estimate.total_state === 'complete' ? total.total : null, total.currency)}</td></tr>
      </tbody>)}
      <tbody>
        {!estimate.totals.length && <tr><th scope="row">Полный итог партии</th><td>Не определено</td></tr>}
        <tr><th scope="row">Статей без оценки стоимости</th><td className="estimate-number">{estimate.uncovered_cost.length}</td></tr>
        <tr><th scope="row">Статей без оценки времени</th><td className="estimate-number">{estimate.uncovered_time.length}</td></tr>
      </tbody>
    </table>
  </section>;
}

export function CompactEstimateComparison({ runId, estimate, revision }: { runId: string; estimate: Estimate; revision: number }) {
  const [chosenRevision, setChosenRevision] = useState<number>();
  const history = useQuery({
    queryKey: ['compact-cost-history', runId, revision],
    queryFn: async () => {
      const { data } = await apiClient.GET('/api/v1/runs/{run_id}/compact-round/history', {
        params: { path: { run_id: runId } },
      });
      if (!data) throw new Error('Не удалось прочитать сохранённые сметы.');
      const estimates = new Map<number, { revision: number; estimate: Estimate }>();
      for (const state of data) {
        const previous = state.cost_estimate;
        if (previous && previous.input_revision < estimate.input_revision && !estimates.has(previous.input_revision)) {
          estimates.set(previous.input_revision, { revision: state.revision, estimate: previous });
        }
      }
      return [...estimates.values()].sort((left, right) => right.revision - left.revision);
    },
  });
  const selected = history.data?.find(item => item.revision === chosenRevision) ?? history.data?.[0];
  const previous = selected?.estimate;
  const totals = new Map([...estimate.totals, ...(previous?.totals ?? [])].map(total => [totalKey(total), total]));
  return <InfoBlock className="space-y-3" title="Сравнение смет">

    {history.isFetching && <p role="status">Загрузка сохранённых смет…</p>}
    {history.isError && <p role="alert">Не удалось прочитать сохранённые сметы.</p>}
    {history.data?.length === 0 && <p>Предыдущих денежных снимков нет.</p>}
    {selected && previous && <>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="compare-estimate-revision">Предыдущая редакция</label>
        <select id="compare-estimate-revision" className="rounded-md border border-control bg-surface px-2 py-1"
          value={selected.revision} onChange={event => setChosenRevision(Number(event.target.value))}>
          {history.data?.map(item => <option key={item.revision} value={item.revision}>{item.revision}</option>)}
        </select>
      </div>
      <div className="estimate-table-scroll" role="region" tabIndex={0} aria-label="Сравнение смет">
        <table className="estimate-rate-table">
          <thead><tr><th scope="col">Показатель</th><th scope="col">Редакция {selected.revision}</th><th scope="col">Редакция {revision}</th></tr></thead>
          <tbody>
            <tr><th scope="row">Коэффициент обработки</th><td>×{previous.processing_markup_coefficient ?? '1'}</td><td>×{estimate.processing_markup_coefficient ?? '1'}</td></tr>
            {[...totals].map(([key, total]) => <tr key={key}>
              <th scope="row">Известный подытог · {basisNames[total.price_basis]} · {total.currency}</th>
              <td>{subtotal(previous.totals.find(item => totalKey(item) === key))}</td>
              <td>{subtotal(estimate.totals.find(item => totalKey(item) === key))}</td>
            </tr>)}
            <tr><th scope="row">Статей без оценки стоимости</th><td>{previous.uncovered_cost.length}</td><td>{estimate.uncovered_cost.length}</td></tr>
          </tbody>
        </table>
      </div>
    </>}
  </InfoBlock>;
}
