import { Link, Navigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useCompactRound } from '@/api/hooks/useCompactRound';
import { Button } from '@/components/ui/Button';
import { RunDocumentLayout } from '@/components/route/RunDocumentLayout';
import { CompactCostEstimate } from '@/components/route/CompactCostEstimate';
import { CompactQuantityEditor } from '@/components/route/CompactQuantityEditor';

export function RunEstimatePage() {
  const { runId } = useParams();
  const client = useQueryClient();
  const query = useCompactRound(runId, true);
  if (query.data && runId) {
    const value = query.data;
    const processing = ['reading', 'checking', 'resolving', 'preliminary', 'detailing', 'cancelled'].includes(value.status);
    return <RunDocumentLayout runId={runId} state={value} document="estimate">
      <CompactCostEstimate runId={runId} value={value} referenceOnly={value.quantity_review?.impact === 'dependent'} active
        refetchState={query.refetch} quantityEditor={value.reading && <CompactQuantityEditor runId={runId} state={value}
          disabled={processing || !!value.calculation_pending} onSaved={updated => client.setQueryData(['compact-round', runId], updated)} />} />
    </RunDocumentLayout>;
  }
  if (query.isSuccess && runId) return <Navigate replace to={`/runs/${encodeURIComponent(runId)}?tab=estimate`} />;
  return <section className="content space-y-3">
    <p role={query.isError ? 'alert' : 'status'}>{query.isError ? 'Не удалось получить смету.' : 'Загрузка сметы…'}</p>
    {query.isError && <Button variant="outline" onClick={() => void query.refetch()}>Повторить загрузку</Button>}
    <Link to="/projects">К проектам</Link>
  </section>;
}
