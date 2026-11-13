import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { apiClient } from '@/api/client';
import { useCompactRound } from '@/api/hooks/useCompactRound';
import { Button } from '@/components/ui/Button';
import { EstimatePrintDocument } from '@/components/route/EstimatePrintDocument';
import { estimateFormKey } from '@/components/route/CompactEstimateDocument';
import { RunDocumentLayout } from '@/components/route/RunDocumentLayout';
import { runDocumentLink } from '@/utils/runDocumentLinks';
import { hasHistoricalMaterialCost } from '@/utils/priceEvidence';

export function RunEstimatePrintPage() {
  const { runId } = useParams();
  const [params] = useSearchParams();
  const client = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const state = useCompactRound(runId);
  const value = state.data;
  const enabled = !!runId && !!value?.cost_estimate && !hasHistoricalMaterialCost(value.cost_estimate)
    && !value.calculation_pending && value.quantity_review?.impact !== 'dependent';
  const table = useQuery({ queryKey: ['compact-estimate-table', runId, value?.revision], enabled,
    queryFn: async ({ signal }) => { const result = await apiClient.GET('/api/v1/runs/{run_id}/compact-round/estimate-table', { signal, params: { path: { run_id: runId! } } });
      if (result.error || !result.data) throw new Error('Не удалось загрузить сохранённую смету.'); return result.data; },
  });
  const form = useQuery({ queryKey: estimateFormKey(runId ?? '', value?.revision ?? -1), enabled,
    queryFn: async ({ signal }) => { const result = await apiClient.GET('/api/v1/runs/{run_id}/compact-round/estimate-form', { signal, params: { path: { run_id: runId! } } });
      if (result.error) throw new Error('Не удалось загрузить реквизиты документа.'); return result.data ?? null; },
  });
  async function prepareForm() {
    if (!runId || !value || !enabled || saving) return;
    setSaving(true); setSaveError('');
    try {
      const result = await apiClient.POST('/api/v1/runs/{run_id}/compact-round/estimate-form', {
        params: { path: { run_id: runId } }, body: { expected_revision: value.revision },
      });
      if (result.error || !result.data) {
        if (result.response.status === 409) {
          await state.refetch();
          throw new Error('Смета изменилась. Подготовьте форму по обновлённым данным.');
        }
        throw new Error('Не удалось подготовить печатную форму. Повторите действие.');
      }
      client.setQueryData(estimateFormKey(runId, value.revision), result.data);
    } catch (error) { setSaveError(error instanceof Error ? error.message : 'Не удалось подготовить печатную форму.'); }
    finally { setSaving(false); }
  }
  if (!value || !runId) return <section className="content"><p role={state.isError ? 'alert' : 'status'}>{state.isError ? 'Не удалось загрузить документ.' : 'Загрузка печатной формы…'}</p></section>;
  const ready = enabled && !!table.data && !!form.data && !table.isError && !form.isError;
  return <RunDocumentLayout runId={runId} state={value} document="estimate">
    <div className="document-toolbar document-screen-only">
      <Link className="secondary-action" to={`${runDocumentLink(runId, 'estimate')}?section=totals&basis=${params.get('basis') === 'piece' ? 'piece' : 'order'}`}>← К редактированию сметы</Link>
      {enabled && form.isSuccess && !form.data && <Button loading={saving} disabled={saving || !table.data} onClick={() => void prepareForm()}>Подготовить печатную форму</Button>}
      <Button variant={ready ? 'primary' : 'outline'} icon={<Printer size={16} />} disabled={!ready || saving} onClick={() => window.print()}>Печать / PDF</Button>
    </div>
    {!enabled && <p role="status" className="document-notice document-screen-only">Для печати нужна сохранённая смета по текущим инженерным основаниям.</p>}
    {enabled && !ready && <div className="document-notice document-screen-only"><p role={table.isError || form.isError ? 'alert' : 'status'}>
      {table.isError || form.isError ? 'Не удалось прочитать печатную форму.' : form.isSuccess && !form.data ? 'Смета сохранена. Подготовьте печатную форму для этой редакции.' : 'Загрузка печатной формы…'}</p>
      {(table.isError || form.isError) && <Button variant="outline" onClick={() => { void table.refetch(); void form.refetch(); }}>Повторить загрузку</Button>}
    </div>}
    {saveError && <p role="alert" className="document-notice document-screen-only">{saveError}</p>}
    {ready && <EstimatePrintDocument table={table.data!} form={form.data} order={params.get('basis') !== 'piece'} />}
  </RunDocumentLayout>;
}
