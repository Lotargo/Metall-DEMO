import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import type { components } from '@/api/schema';

export type AssortmentCatalogRow = components['schemas']['AssortmentCatalogRow'];

export interface AssortmentCatalogData {
  tables: components['schemas']['AssortmentCatalogTable'][];
  rows: AssortmentCatalogRow[];
  count: number;
  origin_summary?: Record<string, number>;
  nsi_data_mode?: string;
}

export function useCatalog() {
  return useQuery({
    queryKey: ['catalog'],
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/api/v1/nsi/catalog');
      if (error) throw new Error(String(error));
      return data;
    },
  });
}

export function useAssortmentCatalog() {
  return useQuery<AssortmentCatalogData>({
    queryKey: ['catalog', 'assortment'],
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/api/v1/nsi/catalog/assortment');
      if (error || !data) throw new Error(`Failed to load assortment catalog: ${String(error)}`);
      return {
        tables: data.tables ?? [],
        rows: data.rows ?? [],
        count: data.count,
        origin_summary: data.origin_summary,
        nsi_data_mode: data.nsi_data_mode,
      };
    },
  });
}
