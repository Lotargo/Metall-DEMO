import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck, FileInput, Link2, LoaderCircle, Route, ScanLine, SearchCheck, ShieldCheck, Timer, Wrench } from 'lucide-react';
import type { components } from '@/api/schema';
import type { ProcessingJournal } from '@/api/hooks/useProcessingJournal';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ProcessingLogs } from '@/components/trace/ProcessingLogs';
import { compactProgressStages, compactProgressTimeline, processingStageLabel, type CompactProgressStage, type ProcessingEvent } from '@/utils/processingLogs';
import { formatElapsedTime, processingTimestamp } from '@/utils/processingTimer';
import './CompactRecognitionProgress.css';

type State = components['schemas']['CompactState'];
const emptyEvents: ProcessingEvent[] = [];
const icons = {
  compact_reading: FileInput,
  reading: ScanLine,
  verify: ShieldCheck,
  verify_repair: Link2,
  clarifications: SearchCheck,
  planning: Route,
  review: ClipboardCheck,
  detailing: Wrench,
  ready: CheckCircle2,
};

function elapsedTime(value: number | undefined) {
  return value === undefined ? <span aria-label="Время неизвестно">—</span>
    : <time dateTime={`PT${Math.floor(value / 1000)}S`}>{formatElapsedTime(value)}</time>;
}

export function CompactRecognitionProgress({ state, journal, uploadStart, onReview, onCancel, cancelling, error }: {
  state?: Pick<State, 'source_run_id' | 'status' | 'revision' | 'image_artifact_id' | 'launch_options' | 'geometry' | 'geometry_issue'>;
  journal?: ProcessingJournal;
  uploadStart?: number | null;
  onReview?: () => void;
  onCancel?: () => void;
  cancelling?: boolean;
  error?: string;
}) {
  const events = journal?.events ?? emptyEvents;
  const runId = state?.source_run_id;
  const timeline = useMemo(() => compactProgressTimeline(events, runId, uploadStart), [events, runId, uploadStart]);
  const savedStatus = state?.status ?? 'reading';
  const status = timeline.result && (timeline.revision >= (state?.revision ?? 0) || timeline.result === 'cancelled')
    ? timeline.result : savedStatus;
  const fallbackStage = {
    reading: state?.image_artifact_id ? 'reading' : 'compact_reading',
    checking: 'verify',
    resolving: 'clarifications',
    preliminary: 'planning',
    detailing: 'detailing',
  } as const;
  const activeStage = status in fallbackStage
    ? timeline.active?.stage ?? fallbackStage[status as keyof typeof fallbackStage]
    : undefined;
  const startedAt = activeStage
    ? timeline.active?.startedAt ?? (activeStage === 'compact_reading' && !events.length ? processingTimestamp(uploadStart) : null)
    : null;
  const [wasRunning, setWasRunning] = useState(!!activeStage);
  const [open, setOpen] = useState(!!activeStage);
  if (wasRunning !== !!activeStage) {
    setWasRunning(!!activeStage);
    if (activeStage) setOpen(true);
  }

  const [, tick] = useState(0);
  useEffect(() => {
    if (startedAt === null) return;
    const timer = window.setInterval(() => tick(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  const activeDuration = startedAt !== null ? Math.max(0, Date.now() - startedAt) : undefined;
  const measured = Object.values(timeline.elapsed);
  const total = measured.length || activeDuration !== undefined
    ? measured.reduce((sum, duration) => sum + duration, activeDuration ?? 0)
    : undefined;
  const highlighted: CompactProgressStage | undefined = activeStage ?? (
    status === 'review' || status === 'ready' ? status : timeline.lastStage
  );
  const progressStatus = activeStage ? processingStageLabel(activeStage) : processingStageLabel(status);
  const close = () => setOpen(false);
  const clock = <div className="processing-timer" role="timer" aria-label="Активное время обработки" aria-live="off">
    <Timer size={16} aria-hidden="true" />
    <span>Активное время</span>
    {elapsedTime(total)}
  </div>;

  return <>
    <div className="recognition-progress-bar">
      <Button variant="outline" size="sm" aria-haspopup="dialog" onClick={() => setOpen(true)}>Ход обработки</Button>
      {clock}
    </div>
    <Modal isOpen={open} onClose={close} title="Ход обработки чертежа" size="xl"
      footer={<>
        {activeStage && onCancel && <Button variant="outline" loading={cancelling} onClick={onCancel}>Отменить обработку</Button>}
        <Button onClick={() => { close(); if (status === 'review') onReview?.(); }}>
          {status === 'review' ? 'К проверке' : activeStage ? 'Свернуть' : 'Закрыть'}
        </Button>
      </>}>
      <div className="recognition-progress-summary">
        <p role="status" className="font-semibold">{progressStatus}</p>
        {clock}
      </div>
      {error && <p role="alert" className="mb-3 text-danger">{error}</p>}
      <ol className="recognition-progress-stages" aria-label="Этапы обработки">
        {compactProgressStages.filter(stage => !(
          state?.launch_options?.verification_enabled === false && (stage === 'verify' || stage === 'verify_repair')
          || state?.launch_options?.auto_resolve_questions === false && stage === 'clarifications'
        )).map(stage => {
          const Icon = icons[stage];
          const running = activeStage === stage;
          const current = highlighted === stage;
          const duration = stage === 'review' || stage === 'ready' ? undefined : timeline.elapsed[stage];
          const completed = timeline.visited.has(stage) || status === 'ready' && stage === 'ready';
          const skippedLabel = state?.geometry && !state.geometry_issue ? 'Не требуется' : 'Не выполнялось';
          const label = running ? 'В работе' : current && stage === 'review' ? 'Пауза'
            : current && status !== 'ready' ? 'Остановлен' : timeline.skipped.has(stage) ? skippedLabel : completed ? 'Пройден' : 'Ожидает';
          return <li key={stage} data-stage={stage} aria-current={current ? 'step' : undefined}>
            <div className="recognition-progress-step">
              <span className="recognition-progress-icon"><Icon size={20} aria-hidden="true" /></span>
              <div className="min-w-0">
                <p className="font-medium">{processingStageLabel(stage)}</p>
                <span className="text-xs text-muted">{label}</span>
              </div>
              <div className="recognition-progress-duration" data-stage-time={stage}>
                {running && <LoaderCircle size={16} aria-hidden="true" className="recognition-progress-spinner" />}
                {elapsedTime(running && activeDuration !== undefined ? (duration ?? 0) + activeDuration : duration)}
              </div>
            </div>
            {current && <div className="recognition-progress-events">
              {journal ? <ProcessingLogs journal={journal} />
                : <p className="text-sm text-muted">Загружаем исходный лист…</p>}
            </div>}
          </li>;
        })}
      </ol>
      {!highlighted && journal && <ProcessingLogs journal={journal} />}
    </Modal>
  </>;
}
