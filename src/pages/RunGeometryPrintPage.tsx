import { Link, useParams } from 'react-router-dom';
import { useCadRoute } from '@/api/hooks/useCadRoute';
import { useVolumeRound } from '@/api/hooks/useVolumeRound';
import { GeometryPrintDocument } from '@/components/route/GeometryPrintDocument';
import { passportMatchesModel } from '@/components/route/geometryPresentation';
import { Button } from '@/components/ui/Button';

export function RunGeometryPrintPage({ document }: { document: 'route' | 'estimate' | 'basis' }) {
  const { runId } = useParams();
  const cad = useCadRoute(runId), volume = useVolumeRound(runId);
  const state = cad.data?.downstream ?? volume.data;
  if (cad.isPending || !cad.data && volume.isPending) return <section className="content"><p role="status">Загрузка печатной формы…</p></section>;
  if (state) return <GeometryPrintDocument state={{ ...state, results_stale: !!state.results_stale || !!cad.data?.results_stale || !!cad.data && !passportMatchesModel(state, cad.data.route.models.at(-1)) }} document={document} />;
  return <section className="content space-y-3"><p role={cad.isError || volume.isError ? 'alert' : 'status'}>{cad.isError || volume.isError ? 'Не удалось загрузить сохранённый документ.' : 'Сохранённый документ ещё не подготовлен.'}</p>{(cad.isError || volume.isError) && <Button variant="outline" onClick={() => { void cad.refetch(); void volume.refetch(); }}>Повторить загрузку</Button>}<Link to={`/runs/${runId}?tab=${document}`}>К рабочему пространству</Link></section>;
}
