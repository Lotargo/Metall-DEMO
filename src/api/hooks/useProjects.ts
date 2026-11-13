import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

function requireData<T>(data: T | undefined, error: unknown, context: string): T {
  if (error) throw new Error(`${context}: ${String(error)}`);
  if (data === undefined) throw new Error(`${context}: сервис вернул пустой ответ`);
  return data;
}

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/api/v1/projects');
      return requireData(data, error, 'Не удалось загрузить проекты');
    },
  });
}

export function useProject(projectId: string | number | undefined) {
  return useQuery({
    queryKey: ['projects', projectId],
    queryFn: async () => {
      if (!projectId) throw new Error('Project ID required');
      const { data, error } = await apiClient.GET('/api/v1/projects/{project_id}', {
        params: { path: { project_id: Number(projectId) } },
      });
      return requireData(data, error, 'Не удалось загрузить проект');
    },
    enabled: !!projectId,
  });
}

export function useTrashedProjects() {
  return useQuery({
    queryKey: ['projects', 'trash'],
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/api/v1/projects/trash');
      return requireData(data, error, 'Не удалось загрузить корзину проектов');
    },
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; customer?: string | null }) => {
      const { data, error } = await apiClient.POST('/api/v1/projects', {
        body: payload,
      });
      return requireData(data, error, 'Не удалось создать проект');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useTrashProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, deletedBy }: { projectId: string | number; deletedBy?: string | null }) => {
      const { data, error } = await apiClient.POST('/api/v1/projects/{project_id}/trash', {
        params: {
          path: { project_id: Number(projectId) },
          query: { actor: deletedBy ?? undefined },
        },
      });
      return requireData(data, error, 'Не удалось переместить проект в корзину');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useRestoreProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: string | number) => {
      const { data, error } = await apiClient.POST('/api/v1/projects/{project_id}/restore', {
        params: { path: { project_id: Number(projectId) } },
      });
      return requireData(data, error, 'Не удалось восстановить проект');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
