import type { CadRouteState } from '@/api/hooks/useCadRoute';
import type { VolumeState } from '@/api/hooks/useVolumeRound';
import type { ProcessingEvent } from './processingLogs';
import { awaitingAutomaticReview } from './cadReviewStatus';

const stages = {
  geometry: 'Подготовка 3D-модели',
  cad: 'Подготовка 3D-модели', reviewing: 'Проверка модели', correcting: 'Исправление модели',
  awaiting_review: 'Подтверждение модели', measure: 'Измерение модели', passport: 'Технический паспорт',
  stock: 'Подбор заготовки', technology: 'Технология и черновое тело', volumes: 'Объёмы и съём материала',
  time: 'Оценка времени по группам', estimate: 'Подготовка сметы',
};
type Stage = keyof typeof stages;
export type ProgressStatus = 'waiting' | 'running' | 'completed' | 'paused' | 'failed' | 'cancelled';
export type ProgressRow = { stage: Stage; title: string; status: ProgressStatus; milliseconds?: number; events: { at: string; text: string }[] };
const phases: Record<string, string> = {
  queued: 'В очереди', awaiting_review: 'Проверьте модель', accepted: 'Модель принята',
  downstream: 'Расчёт', running: 'Расчёт', completed: 'Расчёт завершён', done: 'Расчёт завершён',
  failed: 'Обработка остановлена', interrupted: 'Обработка прервана', cancelled: 'Обработка отменена',
};
export const geometryStageLabel = (stage: string) => stages[stage as Stage] ?? phases[stage];
export function geometryRunLabel(state: Pick<VolumeState, 'status' | 'stage'>, cad?: CadRouteState) {
  if (awaitingAutomaticReview(cad)) return 'Ожидание автоматической проверки';
  const phase = cad?.route.phase ?? state.status;
  return geometryStageLabel(['running', 'downstream'].includes(phase) ? state.stage : phase) ?? 'Расчёт';
}
const spanStages: Record<string, Stage> = {
  'cad.geometry': 'cad', 'cad.import': 'cad', 'cad.correction': 'correcting',
  'orchestrator.model_review': 'reviewing', 'cad_route.technology': 'technology',
  'cad_route.group_time': 'time', 'volume_round.geometry': 'cad',
  'volume.geometry': 'geometry', 'volume.passport': 'passport', 'volume.group_time': 'time',
};
const stamp = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : undefined;
const seconds = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value * 1000 : undefined;
const terminal = new Set(['completed', 'failed', 'interrupted', 'cancelled']);
function unionDuration(intervals: [number, number][]) {
  let end = -Infinity, total = 0;
  for (const [a, b] of [...intervals].sort((x, y) => x[0] - y[0])) {
    total += Math.max(0, b - Math.max(a, end)); end = Math.max(end, b);
  }
  return total;
}

// Only lifecycle timestamps and known stage names enter the operator view.
// Nested spans, retries and manual waiting must not inflate active time.
export function geometryProgress(state: VolumeState, cad?: CadRouteState, events: ProcessingEvent[] = [], now = Date.now()) {
  const automaticReviewQueued = awaitingAutomaticReview(cad);
  const phase = cad?.route.phase ?? state.status;
  const active = !terminal.has(phase);
  const current = (['running', 'downstream'].includes(phase) ? state.stage : phase) as Stage;
  const rows = new Map<Stage, ProgressRow>();
  const ensure = (stage: Stage) => {
    if (!rows.has(stage)) rows.set(stage, { stage, title: stages[stage], status: 'waiting', events: [] });
    return rows.get(stage)!;
  };
  const intervals = new Map<Stage, [number, number][]>();
  const started = new Map<string, { stage: Stage; at: number }>();
  const ordered = [...new Map(events.map(e => [e.id, e])).values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.id - b.id);
  for (const event of ordered) {
    const at = stamp(event.timestamp);
    if (at === undefined || !event.span_id) continue;
    if (event.event_type.endsWith('.started')) {
      const stage = spanStages[String(event.payload?.name)];
      if (stage) { started.set(event.span_id, { stage, at }); ensure(stage).events.push({ at: event.timestamp, text: 'Начато выполнение' }); }
    } else if (/\.(completed|failed|cancelled)$/.test(event.event_type)) {
      const start = started.get(event.span_id);
      if (!start) continue;
      const row = ensure(start.stage);
      row.status = event.event_type.endsWith('.completed') ? 'completed' : event.event_type.endsWith('.cancelled') ? 'cancelled' : 'failed';
      row.events.push({ at: event.timestamp, text: row.status === 'completed' ? 'Выполнение завершено' : row.status === 'cancelled' ? 'Выполнение отменено' : 'Выполнение остановлено' });
      intervals.set(start.stage, [...(intervals.get(start.stage) ?? []), [start.at, Math.max(start.at, at)]]);
      started.delete(event.span_id);
    }
  }
  for (const { stage, at } of started.values()) {
    // An orphaned historical start is not an indefinitely running timer.
    if (active && current === stage) intervals.set(stage, [...(intervals.get(stage) ?? []), [at, Math.max(at, now)]]);
  }
  if (cad) {
    ensure('cad');
    if (cad.route.models.length) ensure('cad').status = 'completed';
    for (const job of Object.values(cad.jobs ?? {})) {
      const stage = job.action === 'review' ? 'reviewing' : job.action === 'correct' ? 'correcting' : undefined;
      if (!stage) continue;
      const row = ensure(stage);
      const at = stamp(job.started_at), end = stamp(job.finished_at);
      if (at !== undefined && (end !== undefined || active && current === stage)) {
        intervals.set(stage, [...(intervals.get(stage) ?? []), [at, Math.max(at, end ?? now)]]);
      }
      if (['completed', 'failed', 'cancelled'].includes(job.status)) row.status = job.status as ProgressStatus;
    }
    if (automaticReviewQueued) ensure('reviewing').status = 'waiting';
    if (cad.route.mode === 'manual' || cad.route.decision?.kind === 'user' || phase === 'awaiting_review' && !automaticReviewQueued) {
      ensure('awaiting_review').status = cad.route.decision ? 'completed' : phase === 'awaiting_review' ? 'paused' : 'waiting';
    }
  }
  const order: Stage[] = cad ? ['cad', 'reviewing', 'correcting', 'awaiting_review', 'measure', 'passport', 'stock', 'technology', 'volumes', 'time', 'estimate'] : ['geometry', 'volumes', 'passport', 'time', 'estimate'];
  for (const stage of cad ? ['measure', 'passport', 'stock', 'technology', 'volumes', 'time', 'estimate'] as Stage[] : order) ensure(stage);
  for (const step of state.steps) {
    if (!(step.stage in stages)) continue;
    const row = ensure(step.stage as Stage);
    row.status = step.status === 'completed' ? 'completed' : 'waiting';
    const duration = seconds(step.seconds);
    if (duration !== undefined) row.milliseconds = (row.milliseconds ?? 0) + duration;
  }
  if (current in stages && active && !automaticReviewQueued) {
    const row = ensure(current);
    row.status = current === 'awaiting_review' ? 'paused' : 'running';
    const at = stamp(state.stage_started_at);
    if (current !== 'awaiting_review' && !intervals.has(current) && at !== undefined && ['running', 'downstream'].includes(phase)) row.milliseconds = (row.milliseconds ?? 0) + Math.max(0, now - at);
  } else if (!active && phase !== 'completed') {
    const last = [...rows.values()].filter(row => row.events.length).sort((a, b) => Date.parse(b.events.at(-1)!.at) - Date.parse(a.events.at(-1)!.at))[0];
    const stopped = state.stage in stages ? ensure(state.stage as Stage) : last;
    if (stopped) stopped.status = phase === 'cancelled' ? 'cancelled' : 'failed';
  }
  let supplemental = 0, measured = false;
  for (const [stage, row] of rows) {
    if (stage === 'awaiting_review') continue;
    if (intervals.has(stage)) row.milliseconds = unionDuration(intervals.get(stage)!);
    else if (row.milliseconds !== undefined) supplemental += row.milliseconds;
    if (row.milliseconds !== undefined) measured = true;
  }
  const timeline = order.filter(stage => rows.has(stage)).map(stage => rows.get(stage)!);
  return { label: geometryRunLabel(state, cad), active, current, rows: timeline,
    milliseconds: measured ? unionDuration([...intervals.values()].flat()) + supplemental : undefined };
}
