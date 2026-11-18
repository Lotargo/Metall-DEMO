import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { components } from '@/api/schema';
import { getOperatorProfile } from '@/utils/storage';

export type ConfiguredEquipment = components['schemas']['EquipmentConfiguration-Output'] & { hourly_rate?: string | null };
export type EquipmentValue = { title: string; unit: string; representation: string; facts: { value?: string; lower?: string; upper?: string; conditions?: Record<string, unknown> }[] };
export type EquipmentPassportBrief = { machine_id: string; title: string; equipment_class: string; category: string; hourly_rate: string | null; rate_version: number; parameters: EquipmentValue[]; configuration_required?: boolean; enabled?: boolean };
export type EquipmentLibrary = Omit<components['schemas']['ConfiguratorView'], 'catalog' | 'passports'> & {
  catalog: { revision: number; equipment: ConfiguredEquipment[] }; passports: EquipmentPassportBrief[];
};
export const equipmentLibraryKey = ['equipment-configurator'];
export function useEquipmentLibrary() {
  return useQuery({ queryKey: equipmentLibraryKey, queryFn: async ({ signal }) => {
    const response = await fetch('/api/v1/equipment-configurator', { signal });
    if (!response.ok) throw new Error('Не удалось загрузить оборудование.');
    return await response.json() as EquipmentLibrary;
  } });
}

export type EquipmentChange = { id: string; source: 'configuration' | 'passport'; revision: number; enabled?: boolean };
export async function changeEquipment(input: EquipmentChange, actor: string, fetcher: typeof fetch = fetch) {
  const remove = input.enabled === undefined;
  const base = input.source === 'passport' ? '/api/v1/equipment/passports/' : '/api/v1/equipment-configurator/';
  const path = base + encodeURIComponent(input.id) + (remove ? `?expected_revision=${input.revision}` : '/availability');
  const response = await fetcher(path, {
    method: remove ? 'DELETE' : 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Operator': actor },
    ...(remove ? {} : { body: JSON.stringify({ expected_revision: input.revision, enabled: input.enabled }) }),
  });
  if (!response.ok) throw new Error(response.status === 409 ? 'Список оборудования изменился. Обновите его и повторите действие.' : response.status === 404 ? 'Оборудование уже удалено. Обновите список.' : 'Не удалось изменить оборудование. Обновите список и повторите действие.');
}
export function useEquipmentChange() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: EquipmentChange) => {
      const operator = getOperatorProfile();
      await changeEquipment(input, operator.id || encodeURIComponent(operator.name || 'operator'));
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: equipmentLibraryKey }),
        client.invalidateQueries({ queryKey: ['machine-passports'] }),
        client.invalidateQueries({ queryKey: ['machine-hourly-rates'] }),
        client.invalidateQueries({ queryKey: ['calculation-settings'] }),
      ]);
    },
  });
}
