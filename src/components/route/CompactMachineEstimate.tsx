import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import type { components } from '@/api/schema';
import { equipmentRequest, type EquipmentCatalog } from '@/api/machineExchange';
import { asRecord } from '@/utils/compactNumbers';
import { publicSourceText } from '@/utils/publicSource';

export function CompactMachineEstimate({ runId, value, referenceOnly }: { runId: string; value: components['schemas']['CompactState']; referenceOnly: boolean }) {
  const client = useQueryClient();
  const catalogue = useQuery({ queryKey: ['machine-passports'], queryFn: () => equipmentRequest<EquipmentCatalog>('') });
  const stale = Boolean(catalogue.data && value.details.some(raw => {
    const detail = asRecord(raw); const basis = asRecord(detail.machine_basis);
    const machine = catalogue.data?.machines.find(m => m.machine_id === detail.machine_id);
    return detail.machine_id && (!machine || String(machine.version) !== basis.passport_version || machine.body_sha256 !== basis.passport_sha256);
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const enabled = !referenceOnly && !value.calculation_pending && ['ready', 'review'].includes(value.status) && value.calculation_inputs.length > 0 && !['dependent', 'review_required'].includes(value.quantity_review?.impact ?? '');
  async function calculate() {
    setBusy(true); setError('');
    try {
      const { data, error } = await apiClient.POST('/api/v1/runs/{run_id}/compact-round/machine-estimate', { params: { path: { run_id: runId } }, body: { expected_revision: value.revision } });
      if (!data || error) throw new Error(typeof error === 'object' && error && 'detail' in error && typeof error.detail === 'string' ? error.detail : 'Не удалось пересчитать операции. Обновите данные.');
      client.setQueryData(['compact-round', runId], data);
    } catch (error) { setError(error instanceof Error ? error.message : 'Не удалось пересчитать операции'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-2 text-sm"><button type="button" className="secondary-action" disabled={!enabled || busy} onClick={() => void calculate()}>{busy ? 'Расчёт…' : 'Пересчитать по карточкам станков'}</button><p className="text-muted">Сохранённая геометрия и маршрут используются для пересчёта времени и стоимости по текущим карточкам.</p>{stale && <p role="status" className="text-muted">Карточки станков изменились. Показан прежний расчёт; пересчитайте по текущим значениям.</p>}{error && <p role="alert" className="passport-error">{publicSourceText(error, 'Не удалось пересчитать операции. Обновите данные.')}</p>}</div>;
}
