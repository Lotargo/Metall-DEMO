import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import type { components } from '@/api/schema';

export type CutNormsView = components['schemas']['CutNormsView'];
export type CutNormRow = components['schemas']['CutNormRow-Output'];
export type CutNormsPublish = components['schemas']['CutNormsPublish'];

const key = ['nsi-cut-norms'];

export function useCutNorms() {
  return useQuery({ queryKey: key, retry: false, queryFn: async ({ signal }) => {
    const { data } = await apiClient.GET('/api/v1/nsi/cut-norms', { signal });
    if (!data) throw new Error('Не удалось загрузить нормы реза.');
    return data;
  } });
}

export function usePublishCutNorms() {
  const client = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (body: CutNormsPublish) => {
      const { data, error } = await apiClient.PUT('/api/v1/nsi/cut-norms', { body });
      if (!data) throw new Error(typeof error?.detail === 'string' ? error.detail : 'Не удалось сохранить нормы реза.');
      return data;
    },
    onSuccess: data => client.setQueryData(key, data),
  });
}
