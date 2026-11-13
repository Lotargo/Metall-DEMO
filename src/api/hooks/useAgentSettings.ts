import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export const agentSettingsKey = ['compact-agent-settings'];

export function useAgentSettings() {
  return useQuery({
    queryKey: agentSettingsKey,
    queryFn: async ({ signal }) => {
      const result = await apiClient.GET('/api/v1/settings/agents', { signal });
      if (!result.data) throw new Error('Не удалось загрузить настройки запуска.');
      return result.data;
    },
  });
}
