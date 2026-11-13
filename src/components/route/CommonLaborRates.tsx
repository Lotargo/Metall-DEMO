import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import type { useCompactRound } from '@/api/hooks/useCompactRound';
import type { components } from '@/api/schema';
import { TimeNormRow } from './TimeNormRow';
import { publicSourceText } from '@/utils/publicSource';

type State = components['schemas']['CompactState'];
type Profile = components['schemas']['EstimateProfile'];
type Reload = ReturnType<typeof useCompactRound>['refetch'];
const rateNames = { 'rate.manual': 'Ручные работы', 'rate.inspection': 'ОТК', 'rate.reference-equipment': 'Оборудование без тарифа' } as const;

function savedRate(profile: Profile | undefined) {
  const hourly_rate = profile?.parameters.hourly_rate?.value;
  return profile && hourly_rate != null ? {
    hourly_rate, source: profile.source, revision: `${profile.id}@${profile.version}#${profile.sha256}`,
  } : null;
}

export function CommonLaborRates({ state, reload, active = true }: { state?: State | null; reload: Reload; active?: boolean }) {
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string }>();
  const profiles = useQuery({
    queryKey: ['estimation-profiles'],
    enabled: active,
    queryFn: async () => {
      const { data } = await apiClient.GET('/api/v1/estimation/profiles');
      if (!data) throw new Error('Не удалось прочитать общие ставки.');
      return data;
    },
  });
  const rates = profiles.data?.filter(profile => Object.prototype.hasOwnProperty.call(rateNames, profile.id)) ?? [];
  const manual = savedRate(rates.find(profile => profile.id === 'rate.manual'));
  const inspection = savedRate(rates.find(profile => profile.id === 'rate.inspection'));
  const equipment = savedRate(rates.find(profile => profile.id === 'rate.reference-equipment'));
  const canApply = !!state && !state.calculation_pending && state.details.length > 0
    && state.quantity_review?.impact !== 'dependent' && ['ready', 'review'].includes(state.status);

  async function apply() {
    if (!state || !canApply || busy || conflict || !manual || !inspection || !equipment) return;
    setBusy(true);
    setNotice(undefined);
    try {
      const { data, error, response } = await apiClient.POST('/api/v1/runs/{run_id}/compact-round/cost-estimate', {
        params: { path: { run_id: state.source_run_id } },
        body: { expected_revision: state.revision, preserve_machine_rates: !!state.cost_estimate,
          manual_rate: manual, inspection_rate: inspection, equipment_rate: equipment },
      });
      if (!data) {
        setConflict(response.status === 409);
        throw new Error(typeof error?.detail === 'string' ? error.detail : 'Не удалось применить ставки.');
      }
      const key = ['compact-round', state.source_run_id];
      await cache.cancelQueries({ queryKey: key, exact: true });
      cache.setQueryData<State>(key, current => current && current.revision > data.revision ? current : data);
      setNotice({ error: false, text: 'Общие ставки применены к детали. Стоимость пересчитана.' });
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error ? error.message : 'Не удалось применить ставки.' });
    } finally { setBusy(false); }
  }

  async function refresh() {
    try {
      await reload({ throwOnError: true });
      setConflict(false);
      setNotice(undefined);
    } catch { setNotice({ error: true, text: 'Не удалось обновить данные детали.' }); }
  }

  return <section className="space-y-3" aria-labelledby="common-labor-rates">
    <h3 id="common-labor-rates" className="font-semibold">Общие расчётные ставки</h3>
    <p className="text-muted">Применяются к новым деталям. Ставки включают труд, инструмент и накладные расходы.
      Сохранённые сметы меняются после явного пересчёта. Начальные значения — расчётный образец, их можно заменить ставками предприятия.</p>
    {profiles.isPending && <p role="status">Загрузка общих ставок…</p>}
    {profiles.isError && <p role="alert">Не удалось прочитать общие ставки.</p>}
    {rates.length > 0 && <div className="overflow-x-auto">
      <table className="w-full text-left">
        <caption className="sr-only">Общие часовые ставки</caption>
        <thead className="border-b border-line text-ink-secondary"><tr>
          <th scope="col" className="px-3 py-2">Работы</th><th scope="col" className="px-3 py-2">Параметр</th>
          <th scope="col" className="px-3 py-2">Значение</th><th scope="col" className="px-3 py-2">Применение</th>
          <th scope="col" className="px-3 py-2">Действие</th>
        </tr></thead>
        <tbody>{rates.map(profile => <TimeNormRow key={profile.id} profile={profile} parameter="hourly_rate"
          number={profile.parameters.hourly_rate} label={`Ставка · ${rateNames[profile.id as keyof typeof rateNames]}`} unit="₽/ч"
          heading={<th scope="row" className="px-3 py-2 font-medium">{rateNames[profile.id as keyof typeof rateNames]}</th>}
          conditions={<td className="max-w-sm px-3 py-2 text-ink-secondary">{profile.id === 'rate.manual'
            ? 'Подготовка, очистка, удаление заусенцев и другие работы с ручной нормой.'
            : profile.id === 'rate.inspection' ? 'Отдельный приёмочный контроль по выбранному объёму проверки.'
              : 'Применяется, когда для оборудования нет индивидуального тарифа и тарифа класса. Не заменяет снятый тариф или неоднозначный выбор.'}</td>} />)}</tbody>
      </table>
    </div>}
    {state && <>
      <button type="button" className="secondary-action" disabled={!canApply || busy || conflict || !manual || !inspection || !equipment}
        onClick={() => void apply()} aria-describedby="common-labor-apply-hint">
        {busy ? 'Применение…' : 'Применить общие ставки к детали'}
      </button>
      <p id="common-labor-apply-hint" className="text-muted">Заменяет общие ставки этой детали, сохраняет индивидуальные ставки станков.
        {!canApply && ' Применение доступно после детализации и проверки количества.'}
        {(!manual || !inspection || !equipment) && ' Для применения заполните все общие ставки.'}</p>
    </>}
    {notice && <p role={notice.error ? 'alert' : 'status'} className={notice.error ? 'text-warning' : 'text-muted'}>{publicSourceText(notice.text, 'Не удалось применить ставки. Повторите попытку.')}</p>}
    {conflict && <button type="button" className="secondary-action" onClick={() => void refresh()}>Обновить данные детали</button>}
  </section>;
}
