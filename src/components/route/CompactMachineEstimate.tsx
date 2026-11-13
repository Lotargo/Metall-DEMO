import type { components } from '@/api/schema';
import { demoNotice, DEMO_READ_ONLY } from '@/demo/config';

export function CompactMachineEstimate(_props: { runId: string; value: components['schemas']['CompactState']; referenceOnly: boolean }) {
  return <div className="space-y-2 text-sm">
    <button type="button" className="secondary-action" onClick={() => demoNotice(DEMO_READ_ONLY)}>Пересчитать по карточкам станков</button>
    <p className="text-muted">Показан сохранённый расчёт по закреплённым профилям оборудования.</p>
  </div>;
}
