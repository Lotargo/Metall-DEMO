import { useQuery } from '@tanstack/react-query';
import type { components } from '@/api/schema';

export type EquipmentCatalog = components['schemas']['MachinePassportCatalog'];
export type EquipmentPassport = components['schemas']['MachinePassport'];
export type EquipmentCategory = components['schemas']['EquipmentCategory'];

const queryKey = ['machine-passports'];

async function readCatalog(response: Response): Promise<EquipmentCatalog> {
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(typeof data?.detail === 'string' ? data.detail : `Ошибка сохранения: HTTP ${response.status}`);
  }
  return response.json();
}

export function useMachinePassports(refreshOnMount = false) {
  return useQuery({
    queryKey,
    queryFn: async () => readCatalog(await fetch('/api/v1/equipment')),
    refetchOnMount: refreshOnMount ? 'always' : true,
    refetchOnWindowFocus: true,
  });
}
