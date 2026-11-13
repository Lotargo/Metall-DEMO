import { Link, Navigate, useParams } from 'react-router-dom';
import { useCompactRound } from '@/api/hooks/useCompactRound';
import { Button } from '@/components/ui/Button';
import { RunDocumentLayout } from '@/components/route/RunDocumentLayout';
import { FullRouteWorkspace } from '@/components/route/FullRouteWorkspace';

export function RunFullRoutePage() {
  const { runId } = useParams();
  const query = useCompactRound(runId, true);
  if (query.data && runId) return <RunDocumentLayout runId={runId} state={query.data} document="route">
    <FullRouteWorkspace runId={runId} value={query.data} />
  </RunDocumentLayout>;
  if (query.isSuccess && runId) return <Navigate replace to={`/runs/${encodeURIComponent(runId)}?tab=full-route`} />;
  return <section className="content space-y-3">
    <p role={query.isError ? 'alert' : 'status'}>{query.isError ? 'Не удалось получить маршрут.' : 'Загрузка маршрута…'}</p>
    {query.isError && <Button variant="outline" onClick={() => void query.refetch()}>Повторить загрузку</Button>}
    <Link to="/projects">К проектам</Link>
  </section>;
}
