import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { useCompactRound } from '@/api/hooks/useCompactRound';
import { useVolumeRound } from '@/api/hooks/useVolumeRound';
import { useCadRoute } from '@/api/hooks/useCadRoute';
import { CadRouteWorkspace } from '@/components/route/CadRouteWorkspace';
import { VolumeRoundWorkspace } from '@/components/route/VolumeRoundWorkspace';
import { useArchivedRun } from '@/api/hooks/useRuns';
import { ArchivedRunWorkspace } from '@/components/route/ArchivedRunWorkspace';
import { CompactRoundWorkspace } from '@/components/route/CompactRoundWorkspace';
import { Button } from '@/components/ui/Button';
import { runDocumentLink, runWorkspaceDocumentLink } from '@/utils/runDocumentLinks';

function ArchivedRun({ runId }: { runId: string }) {
  const archive = useArchivedRun(runId);
  const location = useLocation();
  if (archive.data) {
    if (archive.data.id !== runId) return <Navigate replace to={{
      pathname: `/runs/${archive.data.id}`, search: location.search, hash: location.hash,
    }} />;
    return <ArchivedRunWorkspace key={runId} value={archive.data} />;
  }
  return <section className="content space-y-3">
    {archive.isPending ? <p role="status">Получаем данные запуска…</p> : <>
      <p role="alert">Не удалось открыть архивный запуск.</p>
      <Button variant="outline" onClick={() => void archive.refetch()}>Повторить загрузку</Button>
    </>}
    <Link to="/projects" className="block text-accent underline">К проектам</Link>
  </section>;
}

export function RunWorkspacePage() {
  const { runId } = useParams();
  const compact = useCompactRound(runId);
  const volume = useVolumeRound(runId);
  const cad = useCadRoute(runId);
  const location = useLocation();
  const legacyTab = new URLSearchParams(location.search).get('tab');
  if (cad.data && runId && legacyTab === 'full-route') {
    return <Navigate replace to={runWorkspaceDocumentLink(runId, 'route', 'cad_route', location.hash)} />;
  }
  if (cad.data) return <CadRouteWorkspace key={runId} state={cad.data} />;
  if (cad.isSuccess && (compact.data || volume.data) && runId && (legacyTab === 'estimate' || legacyTab === 'full-route')) {
    return <Navigate replace to={`${runDocumentLink(runId, legacyTab === 'estimate' ? 'estimate' : 'route')}${location.hash}`} />;
  }
  if (volume.data) return <VolumeRoundWorkspace key={runId} state={volume.data} />;
  if (compact.data && runId) return <CompactRoundWorkspace key={runId} runId={runId} state={compact.data} />;
  if (compact.isSuccess && volume.isSuccess && cad.isSuccess && runId) return <ArchivedRun key={runId} runId={runId} />;
  return <section className="content space-y-3">
    {compact.isPending || volume.isPending || cad.isPending ? <p role="status">Получаем рабочие данные…</p> : compact.isError || volume.isError || cad.isError ? <>
      <p role="alert">Не удалось получить рабочие данные.</p>
      <Button variant="outline" onClick={() => { void compact.refetch(); void volume.refetch(); void cad.refetch(); }}>Повторить загрузку</Button>
    </> : null}
    <Link to="/projects" className="block text-accent underline">К проектам</Link>
  </section>;
}
