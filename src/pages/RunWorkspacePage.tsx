import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { useCompactRound } from '@/api/hooks/useCompactRound';
import { useArchivedRun } from '@/api/hooks/useRuns';
import { ArchivedRunWorkspace } from '@/components/route/ArchivedRunWorkspace';
import { CompactRoundWorkspace } from '@/components/route/CompactRoundWorkspace';
import { Button } from '@/components/ui/Button';
import { runDocumentLink } from '@/utils/runDocumentLinks';

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
  const location = useLocation();
  const legacyTab = new URLSearchParams(location.search).get('tab');
  if (compact.data && runId && (legacyTab === 'estimate' || legacyTab === 'full-route')) {
    return <Navigate replace to={`${runDocumentLink(runId, legacyTab === 'estimate' ? 'estimate' : 'route')}${location.hash}`} />;
  }
  if (compact.data && runId) return <CompactRoundWorkspace key={runId} runId={runId} state={compact.data} />;
  if (compact.isSuccess && runId) return <ArchivedRun key={runId} runId={runId} />;
  return <section className="content space-y-3">
    {compact.isPending ? <p role="status">Получаем рабочие данные…</p> : compact.isError ? <>
      <p role="alert">Не удалось получить рабочие данные.</p>
      <Button variant="outline" onClick={() => void compact.refetch()}>Повторить загрузку</Button>
    </> : null}
    <Link to="/projects" className="block text-accent underline">К проектам</Link>
  </section>;
}
