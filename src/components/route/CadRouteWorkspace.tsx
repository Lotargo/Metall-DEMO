import { useState } from 'react';
import { useApproveCadModel, useContinueCadCalculation, type CadRouteState } from '@/api/hooks/useCadRoute';
import type { VolumeState } from '@/api/hooks/useVolumeRound';
import { Button } from '@/components/ui/Button';
import { canContinueCadCalculation } from '@/utils/cadModelContinuation';
import { awaitingAutomaticReview } from '@/utils/cadReviewStatus';
import { GeometryRunWorkspace } from './GeometryRunWorkspace';
import { operatorText, passportMatchesModel } from './geometryPresentation';

export function CadRouteWorkspace({ state }: { state: CadRouteState }) {
  const { route } = state;
  const runId = route.run_id, model = route.models.at(-1);
  const approve = useApproveCadModel(runId), continuation = useContinueCadCalculation(runId);
  const [loadedModel, setLoadedModel] = useState('');
  const modelKey = model ? `${model.revision}:${model.step_sha256}` : '';
  const corrections = Object.values(state.jobs ?? {}).some(job => job.action === 'correct' && ['queued', 'running'].includes(job.status));
  const value: VolumeState = state.downstream ? {
    ...state.downstream,
    results_stale: !!state.results_stale || !passportMatchesModel(state.downstream, model),
    calculation_locked: true,
  } : {
    schema: 'metall-volume-round/1', pipeline: 'cad_route', run_id: runId, revision: route.revision,
    status: route.phase, stage: route.phase, title: state.title, filename: state.source_file,
    quantity: state.quantity, quantity_basis: '', source_artifact_id: state.originals.drawing?.artifact_id ?? '',
    source_sha256: state.originals.drawing?.sha256 ?? '', models: {}, warnings: [], artifacts: {}, steps: [],
    model_revision: model?.revision,
  };
  const automaticReviewQueued = awaitingAutomaticReview(state);
  const approvalControls = route.phase === 'awaiting_review' && model && !automaticReviewQueued ? <section className="geometry-approval" aria-label="Проверка модели">
    <p>Проверьте форму и размеры. После подтверждения продолжится расчёт по этой версии.</p>
    <Button loading={approve.isPending} disabled={corrections || continuation.isPending || loadedModel !== modelKey} onClick={() => approve.mutate(state)}>Подтвердить модель и продолжить</Button>
    <p role="status" className="text-sm text-muted">{corrections ? 'Ожидаем завершения исправлений.' : loadedModel !== modelKey ? 'Откройте превью 3D для проверки модели.' : 'Модель загружена. Ограничения сохранены в паспорте.'}</p>
    {approve.error && <p role="alert" className="text-danger">{operatorText(approve.error.message)}</p>}
  </section> : undefined;
  const recovery = canContinueCadCalculation(state) ? <section className="geometry-approval" aria-label="Продолжение расчёта">
    <p>Модель {model?.revision} принята. Расчёт остановился и может быть продолжен.</p>
    <Button loading={continuation.isPending} disabled={approve.isPending} onClick={() => continuation.mutate(state)}>Продолжить расчёт</Button>
    {continuation.error && <p role="alert" className="text-danger">{operatorText(continuation.error.message)}</p>}
  </section> : undefined;
  return <GeometryRunWorkspace state={value} cad={state} modelControls={approvalControls} runActions={recovery}
    actionBusy={approve.isPending || continuation.isPending}
    onModelReady={ready => setLoadedModel(ready ? modelKey : '')} />;
}
