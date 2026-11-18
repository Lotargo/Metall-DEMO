import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { operatorText } from '@/components/route/geometryPresentation';
import { createWorkSender, workLabel, type WorkInput, type WorkJob } from '@/utils/orchestratorWork';
import { getOperatorProfile } from '@/utils/storage';

export function OrchestratorWork({ runId, phase, model, jobs, accepted, enabled }: {
  runId: string; phase: string; model?: { revision: number; step_sha256: string };
  jobs: WorkJob[]; accepted: boolean; enabled: boolean;
}) {
  const cache = useQueryClient();
  const sender = useRef<ReturnType<typeof createWorkSender> | null>(null);
  if (!sender.current) sender.current = createWorkSender();
  const [history, setHistory] = useState(false);
  const [answer, setAnswer] = useState<WorkJob>();
  const command = useMutation({ retry: false,
    mutationFn: (input: WorkInput) => { const actor = getOperatorProfile(); return sender.current!(input, actor.id || encodeURIComponent(actor.name || 'operator')); },
    onSettled: (_data, _error, input) => {
      void cache.invalidateQueries({ queryKey: ['orchestrator', `run:${input.run_id}`] });
      void cache.invalidateQueries({ queryKey: ['cad-route', input.run_id] });
      void cache.invalidateQueries({ queryKey: ['runs'] });
    },
  });
  const execute = (action: WorkInput['action'], extra: Partial<WorkInput> = {}) => command.mutate({
    run_id: runId, action, ...(model ? { model_revision: model.revision, step_sha256: model.step_sha256 } : {}), ...extra,
  });
  const active = jobs.filter(job => ['queued', 'running', 'waiting_executor'].includes(job.status));
  const visible = [...active, ...jobs.filter(job => !active.includes(job)).slice(-2)];
  function jobRow(job: WorkJob) {
    return <li key={job.id} data-status={job.status}>
      <span className="orchestrator-job-status" aria-hidden="true" />
      <div><p>{workLabel(job)}</p>
        {job.published_revision && <small>Модель {job.published_revision}</small>}
        {job.error && ['failed', 'interrupted', 'stale'].includes(job.status) && <p className="orchestrator-error">{operatorText(job.error)}</p>}
        {job.response && <button type="button" className="orchestrator-answer-link" onClick={() => { setHistory(false); setAnswer(job); }}>Ответ по модели</button>}
      </div>
      {['queued', 'running', 'waiting_executor'].includes(job.status) && <Button type="button" size="xs" variant="outline" disabled={command.isPending || job.cancel_requested} onClick={() => execute('cancel', { task_id: job.id })}>Отменить</Button>}
    </li>;
  }
  return <section className="orchestrator-work" aria-labelledby="orchestrator-work-title" aria-busy={command.isPending}>
    <div className="orchestrator-work-heading"><h3 id="orchestrator-work-title">Работа</h3>{jobs.length > 0 && <button type="button" className="orchestrator-answer-link" onClick={() => setHistory(true)}>История</button>}</div>
    {!!visible.length && <ol aria-label="Последние задания">{visible.map(jobRow)}</ol>}
    <div className="orchestrator-work-actions">
      {phase === 'queued' && <Button type="button" size="xs" disabled={!enabled || command.isPending} onClick={() => execute('start')}>Запустить CAD</Button>}
      {!['completed', 'failed', 'cancelled'].includes(phase) && <Button type="button" size="xs" variant="outline" disabled={command.isPending} onClick={() => execute('cancel')}>Остановить расчёт</Button>}
      {accepted && phase === 'accepted' && <Button type="button" size="xs" variant="outline" disabled={!enabled || command.isPending} onClick={() => execute('continue')}>Продолжить расчёт</Button>}
      {accepted && <Link to={`/runs/${runId}?tab=estimate`}>Открыть смету</Link>}
    </div>
    {command.error && <p role="alert" className="orchestrator-error">{operatorText(command.error.message)}</p>}
    <Modal isOpen={history} onClose={() => setHistory(false)} title="История заданий"><ol className="orchestrator-job-history">{jobs.map(jobRow)}</ol></Modal>
    <Modal isOpen={!!answer} onClose={() => setAnswer(undefined)} title="Ответ по модели"><p className="whitespace-pre-wrap">{operatorText(answer?.response)}</p></Modal>
  </section>;
}
