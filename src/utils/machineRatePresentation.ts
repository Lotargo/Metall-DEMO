import type { MachineRate } from '@/api/machineExchange';

export const MACHINE_RATE_COMPOSITION = 'Труд оператора, работа оборудования, энергия, накладные расходы и обычные расходники.';

export function formatMachineHourlyRate(value: MachineRate['terms']['hourly_rate']) {
  return value === null ? 'Ставка не установлена' : `${value.replace('.', ',')} ₽/ч`;
}
