import { useEffect, useState } from 'react';
import { Box, CheckCircle2, ClipboardCheck, Timer, Wrench } from 'lucide-react';
import type { CadRouteState } from '@/api/hooks/useCadRoute';
import type { VolumeState } from '@/api/hooks/useVolumeRound';
import { useQuery } from '@tanstack/react-query';
import type { ProcessingEvent } from '@/utils/processingLogs';
import { geometryProgress, type ProgressStatus } from '@/utils/geometryProgress';
import { formatElapsedTime } from '@/utils/processingTimer';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import './CompactRecognitionProgress.css';

const labels: Record<ProgressStatus, string> = { waiting: 'Ожидает', running: 'В работе', completed: 'Пройден', paused: 'Ожидает подтверждения', failed: 'Требует внимания', cancelled: 'Отменён' };
const elapsed = (value?: number) => value === undefined ? '—' : value > 0 && value < 1000 ? '< 1 с' : formatElapsedTime(value);
export function GeometryRecognitionProgress({ state, cad, onReview, onCancel, cancelling, disabled }: {
  state: VolumeState; cad?: CadRouteState; onReview: () => void; onCancel: () => void; cancelling?: boolean; disabled?: boolean;
}) {
  const phase = cad?.route.phase ?? state.status;
  const active = !['completed', 'failed', 'interrupted', 'cancelled'].includes(phase);
  const journal = useQuery({ queryKey: ['geometry-progress-events', state.run_id],
    queryFn: async ({ signal }) => {
      const events: ProcessingEvent[] = [];
      let before: number | null = null;
      do {
        const response = await fetch(`/api/v1/runs/${encodeURIComponent(state.run_id)}/events?limit=500${before ? `&before_sequence=${before}` : ''}`, { signal });
        if (!response.ok) throw new Error('Не удалось прочитать события обработки.');
        const page = await response.json() as { events: ProcessingEvent[]; next_before_sequence: number | null };
        events.push(...page.events);
        if (page.next_before_sequence !== null && page.next_before_sequence === before) throw new Error('Не удалось прочитать продолжение событий.');
        before = page.next_before_sequence;
      } while (before !== null);
      return events;
    }, staleTime: 1500, refetchInterval: active ? 2000 : false,
  });
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const progress = geometryProgress(state, cad, journal.data ?? [], now);
  const ticking = progress.active && progress.current !== 'awaiting_review';
  useEffect(() => {
    if (!ticking) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [ticking]);
  const clock = <div className="processing-timer" role="timer" aria-label="Активное время обработки" aria-live="off"><Timer size={16} aria-hidden="true" /><span>Активное время</span><span>{elapsed(progress.milliseconds)}</span></div>;
  return <>
    <div className="recognition-progress-bar geometry-progress-bar">
      <Button size="sm" variant="outline" aria-haspopup="dialog" onClick={() => setOpen(true)}>Ход обработки</Button>{clock}
    </div>
    <Modal isOpen={open} onClose={() => setOpen(false)} title="Ход обработки чертежа" size="xl" footer={<>
      {progress.active && <Button variant="outline" loading={cancelling} disabled={disabled} onClick={onCancel}>Отменить обработку</Button>}
      <Button onClick={() => { setOpen(false); if (progress.current === 'awaiting_review') onReview(); }}>{progress.current === 'awaiting_review' ? 'К проверке модели' : progress.active ? 'Свернуть' : 'Закрыть'}</Button>
    </>}>
      <div className="recognition-progress-summary"><p role="status" className="font-semibold">{progress.label}</p>{clock}</div>
      {journal.isError && <p role="status" className="document-notice">Не удалось обновить время этапов. Сохранённые события доступны. <Button size="sm" variant="outline" onClick={() => void journal.refetch()}>Подключить снова</Button></p>}
      <ol className="recognition-progress-stages" aria-label="Этапы обработки">{progress.rows.map(row => {
        const current = ['running', 'paused', 'failed', 'cancelled'].includes(row.status);
        const Icon = row.stage === 'cad' ? Box : row.stage === 'awaiting_review' ? ClipboardCheck : row.status === 'completed' ? CheckCircle2 : Wrench;
        return <li key={row.stage} aria-current={current ? 'step' : undefined}>
          <div className="recognition-progress-step"><span className="recognition-progress-icon"><Icon size={20} aria-hidden="true" /></span><div className="min-w-0"><p className="font-medium">{row.title}</p><span className="text-xs text-muted">{labels[row.status]}</span></div><span className="recognition-progress-duration">{elapsed(row.milliseconds)}</span></div>
          {current && row.events.length > 0 && <ol className="geometry-progress-events" aria-label={`События: ${row.title}`}>{row.events.slice(-4).map((event, i) => <li key={i}><time dateTime={event.at}>{new Date(event.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</time><span>{event.text}</span></li>)}</ol>}
        </li>;
      })}</ol>
      <p className="document-help">В активное время входит выполнение работ; ожидание подтверждения не учитывается. Завершение обработки сохраняет замечания и предварительные решения паспорта.</p>
    </Modal>
  </>;
}
