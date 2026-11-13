import type { components } from '@/api/schema';
import { getOperatorProfile } from '@/utils/storage';

export type MachineFile = components['schemas']['MachineExchange'];
export type MachineParameter = components['schemas']['MachineParameter'];
export type MachineFact = components['schemas']['MachineFact'];
export type MachineFeature = components['schemas']['MachineFeature'];
export type ExchangePreview = components['schemas']['ExchangePreview'];
export type ExchangeView = components['schemas']['ExchangeView'];
export type HistoryItem = components['schemas']['ExchangeHistoryItem'];
export type EquipmentCatalog = components['schemas']['MachinePassportCatalog'];
export type ParameterId = MachineParameter['parameter_id'];
export type MachineRate = components['schemas']['MachineRate'];
export type MachineWorkingRegime = components['schemas']['MachineWorkingRegime'];
export type MachineRegistry = {
  parameters: Record<ParameterId, { title: string; unit: string; group: string; comparison: string; required_conditions: string[] }>;
  condition_keys: string[];
  working_regimes: {
    methods: Record<MachineWorkingRegime['method_id'], { title: string; parameters: string[]; requires_cycle_scope?: boolean }>;
    parameters: Record<string, { title: string; unit: string }>;
  };
};

export class EquipmentRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function equipmentRequest<T>(path: string, body?: unknown, method?: 'POST' | 'PUT'): Promise<T> {
  const operator = getOperatorProfile();
  const response = await fetch(`/api/v1/equipment${path ? `/${path}` : ''}`, {
    method: body === undefined ? 'GET' : method ?? 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json', 'X-Operator': operator.id || encodeURIComponent(operator.name || 'operator') },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new EquipmentRequestError(response.status, typeof data?.detail === 'string' ? data.detail : 'Не удалось прочитать или проверить данные станка.');
  }
  return response.json();
}
