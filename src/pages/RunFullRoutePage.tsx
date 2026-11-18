import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { useCompactRound } from '@/api/hooks/useCompactRound';
import { useVolumeRound } from '@/api/hooks/useVolumeRound';
import { useCadRoute } from '@/api/hooks/useCadRoute';
import { VolumeRoundWorkspace } from '@/components/route/VolumeRoundWorkspace';
import { Button } from '@/components/ui/Button';
import { RunDocumentLayout } from '@/components/route/RunDocumentLayout';
import { FullRouteWorkspace } from '@/components/route/FullRouteWorkspace';
import { runWorkspaceDocumentLink } from '@/utils/runDocumentLinks';

export function RunFullRoutePage() {
  const { runId } = useParams();
  const location = useLocation();
  const query = useCompactRound(runId, true);
  const volume = useVolumeRound(runId);
  const cad = useCadRoute(runId);
  if (cad.data && runId) return <Navigate replace to={runWorkspaceDocumentLink(runId, 'route', 'cad_route', location.hash)} />;
  if (cad.isPending) return <p role="status">Загрузка маршрута…</p>;
  if (volume.data) return <VolumeRoundWorkspace key={runId} state={volume.data} document="route" />;
  if (query.data && runId) return <RunDocumentLayout runId={runId} state={query.data} document="route">
    <FullRouteWorkspace runId={runId} value={query.data} />
  </RunDocumentLayout>;
  if (query.isSuccess && volume.isSuccess && runId) return <Navigate replace to={`/runs/${encodeURIComponent(runId)}?tab=full-route`} />;
  return <section className="content space-y-3">
    <p role={query.isError ? 'alert' : 'status'}>{query.isError ? 'Не удалось получить маршрут.' : 'Загрузка маршрута…'}</p>
    {query.isError && <Button variant="outline" onClick={() => void query.refetch()}>Повторить загрузку</Button>}
    <Link to="/projects">К проектам</Link>
  </section>;
}
