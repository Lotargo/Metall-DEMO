import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useCompactRound } from '@/api/hooks/useCompactRound';
import { useVolumeRound } from '@/api/hooks/useVolumeRound';
import { useCadRoute } from '@/api/hooks/useCadRoute';
import { VolumeRoundWorkspace } from '@/components/route/VolumeRoundWorkspace';
import { Button } from '@/components/ui/Button';
import { RunDocumentLayout } from '@/components/route/RunDocumentLayout';
import { CompactCostEstimate } from '@/components/route/CompactCostEstimate';
import { CompactQuantityEditor } from '@/components/route/CompactQuantityEditor';
import { runWorkspaceDocumentLink } from '@/utils/runDocumentLinks';

export function RunEstimatePage() {
  const { runId } = useParams();
  const location = useLocation();
  const client = useQueryClient();
  const query = useCompactRound(runId, true);
  const volume = useVolumeRound(runId);
  const cad = useCadRoute(runId);
  if (cad.data && runId) return <Navigate replace to={runWorkspaceDocumentLink(runId, 'estimate', 'cad_route', location.hash)} />;
  if (cad.isPending) return <p role="status">Загрузка сметы…</p>;
  if (volume.data) return <VolumeRoundWorkspace key={runId} state={volume.data} document="estimate" />;
  if (query.data && runId) {
    const value = query.data;
    const processing = ['reading', 'checking', 'resolving', 'preliminary', 'detailing', 'cancelled'].includes(value.status);
    return <RunDocumentLayout runId={runId} state={value} document="estimate">
      <CompactCostEstimate runId={runId} value={value} referenceOnly={value.quantity_review?.impact === 'dependent'} active
        refetchState={query.refetch} quantityEditor={value.reading && <CompactQuantityEditor runId={runId} state={value}
          disabled={processing || !!value.calculation_pending} onSaved={updated => client.setQueryData(['compact-round', runId], updated)} />} />
    </RunDocumentLayout>;
  }
  if (query.isSuccess && volume.isSuccess && runId) return <Navigate replace to={`/runs/${encodeURIComponent(runId)}?tab=estimate`} />;
  return <section className="content space-y-3">
    <p role={query.isError ? 'alert' : 'status'}>{query.isError ? 'Не удалось получить смету.' : 'Загрузка сметы…'}</p>
    {query.isError && <Button variant="outline" onClick={() => void query.refetch()}>Повторить загрузку</Button>}
    <Link to="/projects">К проектам</Link>
  </section>;
}
