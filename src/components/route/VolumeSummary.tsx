import type { VolumeState } from '@/api/hooks/useVolumeRound';
import { formatNumber } from './geometryPresentation';

export function VolumeSummary({ state, showTime = false }: { state: VolumeState; showTime?: boolean }) {
  const time = state.time_estimate?.totals;
  const interval = (value?: { min: number; max: number } | null) => value ? `${formatNumber(value.min)}–${formatNumber(value.max)}` : 'Не оценено';
  const labels = { stock_mm3: 'Заготовка', rough_mm3: 'После черновой', final_mm3: 'Готовая деталь', rough_removed_mm3: 'Черновой', finish_removed_mm3: 'Чистовой', total_removed_mm3: 'Всего' };
  if (!state.volumes && !time) return null;
  return <aside className="geometry-summary" aria-label="Объёмы и съём материала">
    {state.results_stale && <p className="text-sm">Предыдущий расчёт · модель {state.model_revision}</p>}
    <section><h3>Объём, см³</h3><dl>{Object.entries(labels).map(([key, label], i) => <div key={key} className={i === 3 ? 'geometry-summary-divider' : undefined}>
      {i === 3 && <dt className="geometry-summary-subheading">Съём материала</dt>}<dt>{label}</dt><dd>{state.volumes?.[key] != null ? formatNumber(state.volumes[key]! / 1000) : 'Не определён'}</dd>
    </div>)}</dl></section>
    {showTime && time && <section><h3>Время, мин</h3><dl><div><dt>На деталь</dt><dd>{interval(time.per_piece_minutes)}</dd></div><div><dt>Наладка партии</dt><dd>{interval(time.setup_per_batch_minutes)}</dd></div><div><dt>Партия · {state.quantity} шт.</dt><dd>{interval(time.batch_minutes)}</dd></div></dl></section>}
    {showTime && state.time_estimate && state.time_estimate.status !== 'estimated' && <p className="text-sm">Не все работы оценены. Подробности указаны в смете.</p>}
  </aside>;
}
