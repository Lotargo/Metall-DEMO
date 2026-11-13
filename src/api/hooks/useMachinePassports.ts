import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { components } from '@/api/schema';
import { getOperatorProfile } from '@/utils/storage';

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

export function useEquipmentMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      path: string;
      method: 'POST' | 'PUT' | 'DELETE';
      body?: Record<string, string | number>;
      query?: Record<string, string | number>;
    }) => {
      const operator = getOperatorProfile();
      const query = input.query ? `?${new URLSearchParams(Object.entries(input.query).map(([k, v]) => [k, String(v)]))}` : '';
      return readCatalog(await fetch(`/api/v1/equipment/${input.path}${query}`, {
        method: input.method,
        headers: { 'Content-Type': 'application/json', 'X-Operator': operator.id || encodeURIComponent(operator.name || 'operator') },
        body: input.body ? JSON.stringify(input.body) : undefined,
      }));
    },
    onSuccess: (catalog) => {
      client.setQueryData(queryKey, catalog);
      void client.invalidateQueries({ queryKey: ['catalog'] });
    },
  });
}
