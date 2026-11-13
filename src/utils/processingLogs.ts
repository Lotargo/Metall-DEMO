import type { components } from '@/api/schema';

export type ProcessingEvent = components['schemas']['TraceEvent'];
type Run = Pick<components['schemas']['ProcessingRun'], 'id' | 'current_stage'>;

const stageLabels: Record<string, string> = {
  read: 'Чтение чертежа', reading: 'Чтение чертежа',
  compact_reading: 'Подготовка исходного чертежа', upload: 'Загрузка чертежа',
  verify: 'Перепроверка распознавания', checking: 'Перепроверка распознавания',
  verify_repair: 'Исправление связей',
  clarifications: 'Поиск ответов на вопросы', resolving: 'Поиск ответов на вопросы',
  plan: 'Предварительная карта', planning: 'Предварительная карта', preliminary: 'Подготовка данных маршрута',
  detail: 'Детализация', detailing: 'Детализация',
  agent_1: 'Чтение чертежа', agent_2: 'Перепроверка распознавания',
  queued: 'Очередь', needs_review: 'Ожидание подтверждения', review: 'Ожидание подтверждения',
  ready: 'Итог детализации', done: 'Завершение', failed: 'Ошибка обработки',
  cancelled: 'Обработка отменена', unsupported: 'Обработка не поддерживается',
};

const eventLabels: Record<string, string> = {
  'run.started': 'Этап запущен', 'run.completed': 'Результат этапа принят',
  'run.needs_review': 'Ожидается решение оператора', 'run.failed': 'Ошибка обработки',
  'run.cancelled': 'Обработка отменена', 'run.family_cancel_requested': 'Запрошена отмена обработки',
  'llm.failed': 'Ошибка модели', 'llm.cancelled': 'Вызов модели отменён',
  'llm.response.received': 'Ответ получен и передан на проверку',
  'llm.response.invalid': 'Ответ не прошёл проверку',
  'llm.retry.scheduled': 'Запланирована повторная попытка',
  'llm.provider.timeout': 'Превышено время ожидания ответа',
  'llm.provider.runaway': 'Работа сервиса остановлена по ограничению ожидания',
  'tool.failed': 'Ошибка проверки или расчёта',
};

const compactLabels: Record<string, string> = {
  reading: 'Исходный чертёж принят',
  checking: 'Распознавание передано на перепроверку',
  resolving: 'Агент ищет решения вопросов',
  preliminary: 'Подготавливаются исходные данные маршрута',
  review: 'Ожидается решение оператора',
  detailing: 'Начата детализация',
  ready: 'Итог детализации сохранён',
  failed: 'Обработка остановилась с ошибкой',
  cancelled: 'Обработка отменена',
  unsupported: 'Обработка завершилась на границе поддерживаемого сценария',
};

const terminalEvents = new Set(['run.completed', 'run.needs_review', 'run.failed', 'run.cancelled']);
const liveRoles = new Set(['reading', 'verify', 'verify_repair', 'clarifications', 'plan', 'planning', 'detail', 'detailing', 'compact_reading']);
const eventKey = (event: ProcessingEvent) => `${event.run_id}:${event.sequence_no}`;
const payloadStage = (event: ProcessingEvent) => typeof event.payload?.stage === 'string' ? event.payload.stage : undefined;
const isCompactState = (event: ProcessingEvent) => event.event_type === 'compact.state.updated';

export function processingStageLabel(stage?: string | null): string {
  return stageLabels[stage ?? ''] || stage || 'Обработка';
}

export function processingEventText(event: ProcessingEvent): string {
  if (isCompactState(event)) return compactLabels[payloadStage(event) ?? ''] || 'Состояние обновлено';
  const payload = event.payload ?? {};
  if (event.event_type === 'run.needs_review' && payload.validation_status === 'unsupported') {
    return compactLabels.unsupported;
  }
  const reason = event.event_type === 'run.needs_review' ? undefined : payload.reason;
  const messages = [payload.label, payload.summary, payload.detail, payload.message, reason, payload.error]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  return [...new Set([eventLabels[event.event_type] || event.event_type, ...messages])].join('. ');
}

function chronologicalEvents(events: ProcessingEvent[]) {
  return [...new Map(events.map(event => [eventKey(event), event])).values()]
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.id - b.id || a.sequence_no - b.sequence_no);
}

export function activeProcessingStage(events: ProcessingEvent[]) {
  const active = new Map<string, ProcessingEvent>();
  for (const event of chronologicalEvents(events)) {
    if (event.event_type === 'run.started') {
      const stage = payloadStage(event);
      if (stage && stage !== 'compact_reading' && liveRoles.has(stage)) {
        for (const [id, previous] of active) {
          if (payloadStage(previous) === 'compact_reading') active.delete(id);
        }
      }
      active.set(event.run_id, event);
    }
    if (event.event_type === 'run.family_cancel_requested') active.clear();
    if (terminalEvents.has(event.event_type)) active.delete(event.run_id);
  }
  for (const event of [...active.values()].reverse()) {
    const stage = payloadStage(event);
    if (stage && liveRoles.has(stage)) return { label: processingStageLabel(stage), startedAt: event.timestamp };
  }
  return undefined;
}

export const compactProgressStages = [
  'compact_reading', 'reading', 'verify', 'verify_repair', 'clarifications', 'planning', 'review', 'detailing', 'ready',
] as const;
export type CompactProgressStage = typeof compactProgressStages[number];
type ActiveStage = Exclude<CompactProgressStage, 'review' | 'ready'>;
type ResultStage = 'review' | 'ready' | 'failed' | 'unsupported' | 'cancelled';
type Interval = { stage: ActiveStage; runId: string; startedAt: number };
const modelStage: Partial<Record<string, ActiveStage>> = {
  compact_reading: 'compact_reading', read: 'reading', reading: 'reading',
  verify: 'verify', verify_repair: 'verify_repair', plan: 'planning', planning: 'planning',
  clarifications: 'clarifications',
  detail: 'detailing', detailing: 'detailing',
};
const rootStage: Partial<Record<string, ActiveStage>> = {
  // Preliminary also covers stock preparation before clarification. Only a
  // planner's own run.started event establishes that the map is being built.
  reading: 'compact_reading', checking: 'verify', resolving: 'clarifications', detailing: 'detailing',
};

export function compactProgressTimeline(events: ProcessingEvent[], sourceRunId?: string, uploadStart?: number | null) {
  const elapsed: Partial<Record<ActiveStage, number>> = {};
  const visited = new Set<CompactProgressStage>();
  let active: Interval | undefined;
  let result: ResultStage | undefined;
  let revision = 0;
  let lastStage: ActiveStage | undefined;

  function finish(at: number) {
    if (!active) return;
    const { stage, startedAt } = active;
    elapsed[stage] = (elapsed[stage] ?? 0) + Math.max(0, at - startedAt);
    active = undefined;
  }
  function start(stage: ActiveStage, runId: string, at: number) {
    if (active?.stage === stage) {
      active.runId = runId;
      return;
    }
    finish(at);
    visited.add(stage);
    const startedAt = stage === 'compact_reading' && elapsed[stage] === undefined ? Math.min(at, uploadStart ?? at) : at;
    active = { stage, runId, startedAt };
    lastStage = stage;
    result = undefined;
  }
  function settle(stage: ResultStage, at: number) {
    finish(at);
    result = stage;
    if (stage === 'review' || stage === 'ready') visited.add(stage);
  }

  for (const event of chronologicalEvents(events)) {
    const at = Date.parse(event.timestamp);
    if (!Number.isFinite(at)) continue;
    const explicit = payloadStage(event) ?? '';
    const isRoot = event.run_id === sourceRunId;
    if (event.event_type === 'run.family_cancel_requested') {
      settle('cancelled', at);
      break;
    }
    if (isRoot && isCompactState(event)) {
      if (typeof event.payload?.revision === 'number') revision = event.payload.revision;
      const stage = rootStage[explicit];
      if (stage) {
        // Saves during READ/REPAIR can repeat the coarse status without changing roles.
        const currentRole = active?.stage;
        const withinStage = currentRole === 'reading' && stage === 'compact_reading'
          || currentRole === 'verify_repair' && stage === 'verify';
        if (currentRole !== stage && !withinStage) start(stage, event.run_id, at);
      } else if (explicit === 'review' || explicit === 'ready' || explicit === 'failed' || explicit === 'unsupported' || explicit === 'cancelled') {
        settle(explicit, at);
      }
    } else if (event.event_type === 'run.started' && modelStage[explicit]) {
      start(modelStage[explicit], event.run_id, at);
    } else if (isRoot && terminalEvents.has(event.event_type)) {
      const validation = event.payload?.validation_status;
      settle(event.event_type === 'run.cancelled' ? 'cancelled' : event.event_type === 'run.failed' ? 'failed'
        : event.event_type === 'run.completed' || validation === 'ready' ? 'ready'
          : validation === 'unsupported' ? 'unsupported' : validation === 'failed' ? 'failed' : 'review', at);
    } else if (active?.runId === event.run_id && terminalEvents.has(event.event_type)) {
      finish(at);
    }
  }
  const skipped = new Set<CompactProgressStage>();
  if (visited.has('verify') && !visited.has('verify_repair')
    && (visited.has('clarifications') || visited.has('planning') || visited.has('review') || visited.has('detailing') || visited.has('ready'))) {
    skipped.add('verify_repair');
  }
  if (!visited.has('clarifications')
    && (visited.has('planning') || visited.has('detailing') || visited.has('ready'))) {
    skipped.add('clarifications');
  }
  return { elapsed, active, result, revision, visited, skipped, lastStage };
}

export function processingLogRows(runs: Run[], events: ProcessingEvent[]) {
  const stages = new Map(runs.map(run => [run.id, run.current_stage]));
  const compactStages = new Map<string, string>();
  return chronologicalEvents(events).flatMap(event => {
    const explicit = payloadStage(event);
    if (event.event_type === 'run.started' && explicit) stages.set(event.run_id, explicit);
    if (isCompactState(event)) {
      if (!explicit || !compactLabels[explicit] || compactStages.get(event.run_id) === explicit) return [];
      compactStages.set(event.run_id, explicit);
      stages.set(event.run_id, explicit);
    } else if (!eventLabels[event.event_type] || (event.event_type === 'run.needs_review'
      && typeof event.payload?.validation_status === 'string'
      && compactStages.get(event.run_id) === event.payload.validation_status)) {
      return [];
    }
    const agent = typeof event.payload?.agent === 'string' ? event.payload.agent : undefined;
    return [{
      key: eventKey(event),
      timestamp: event.timestamp,
      stage: processingStageLabel(explicit ?? stages.get(event.run_id) ?? agent),
      text: processingEventText(event),
      error: explicit === 'failed' || /failed|invalid|error|timeout|runaway/.test(event.event_type),
    }];
  });
}
