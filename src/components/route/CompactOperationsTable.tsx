import type { components } from '@/api/schema';
import { asRecord, formatNumber, formatText } from '@/utils/compactNumbers';
import { operationTimeView } from '@/components/route/CompactOperationResult';
import { Link } from 'react-router-dom';

type Route = components['schemas']['CompactState']['route'];

export function CompactOperationsTable({ details, route, referenceOnly = false }: { details: unknown[]; route: Route; referenceOnly?: boolean }) {
  if (!details.length) return null;
  return <div className="max-w-full min-w-0 overflow-x-auto" tabIndex={0}><table className="w-full text-sm"><caption className="text-left font-medium">{referenceOnly ? 'Прежние результаты по операциям' : 'Результаты по операциям'}</caption><thead><tr><th>№</th><th>Операция</th><th>Оборудование</th><th>Мин/дет.</th><th>Мин/партию</th><th>Состояние</th></tr></thead><tbody>{details.map((raw, position) => {
    const detail = asRecord(raw), index = typeof detail.operation_index === 'number' ? detail.operation_index : position;
    const time = operationTimeView(detail);
    const state = detail.equipment_state === 'incompatible' ? 'Станок несовместим' : detail.stock_incompatible === true ? 'Заготовка не подходит' : detail.calculation_complete === true && time.machineTime !== null ? 'Рассчитано' : time.machineTime !== null || time.motions.length > 0 ? 'Частично' : 'Время не определено';
    return <tr key={index}><td className="tabular-nums">{index + 1}</td><th scope="row"><Link to={{ hash: `#compact-operation-${index}` }} className="text-accent">{formatText(route?.operations[index]?.title || `Операция ${index + 1}`)}</Link></th><td>{detail.machine_title ? formatText(detail.machine_title) : 'Не назначено'}</td><td className="tabular-nums">{formatNumber(time.machineTime)}</td><td className="tabular-nums">{formatNumber(time.batchTime)}</td><td className={detail.equipment_state === 'incompatible' || detail.stock_incompatible === true ? 'text-warning' : ''}>{state}{time.motions.length > 0 && time.machineTime === null && <p className="mt-1 text-muted">Отдельные движения: {time.motions.length}</p>}</td></tr>;
  })}</tbody></table></div>;
}
