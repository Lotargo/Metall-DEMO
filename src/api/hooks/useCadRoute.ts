import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GeometryDimension, VolumeState } from './useVolumeRound';
import { createCadApprovalController, mergeCadRouteState, shouldPollCadRoute } from '@/utils/cadModelApproval';
import { createCadContinuationController } from '@/utils/cadModelContinuation';
import { getOperatorProfile } from '@/utils/storage';

export type CadModelVersion = {
  revision: number; cad_job_id: string; cad_model_id: string;
  step_sha256: string; model_url: string; limitations: string[];
};
export type CadRouteState = {
  sequence: number; title: string; source_file: string; quantity: number;
  route: {
    run_id: string; revision: number; phase: string; mode: 'manual' | 'automatic';
    input_mode: 'drawing' | 'step'; models: CadModelVersion[]; message: string;
    decision: CadModelDecision | null; decisions?: CadModelDecision[];
    active_task_id?: string | null;
    review_count?: number; repair_count?: number;
  };
  originals: Record<string, { artifact_id: string; sha256: string; filename: string }>;
  viewer_ready?: boolean; preview_directory?: string;
  cad_events: { text: string; kind?: string; at?: string }[];
  geometry_passport?: Partial<NonNullable<VolumeState['passport']>> & { dimensions: GeometryDimension[] };
  effects?: Record<string, { kind: string; delivered: boolean }>;
  jobs?: Record<string, { id: string; action: string; status: string; created_at?: string; started_at?: string; finished_at?: string }>;
  results_stale?: { reason: string; model_revision: number; new_model_revision: number };
  downstream?: VolumeState;
  calculations?: { model_revision: number; quantity: number; step_sha256: string; artifacts: Record<string, string> }[];
  review?: {
    status: string; model_revision: number; step_sha256: string; summary?: string; message?: string;
    findings: unknown[]; limitations: unknown[];
    viewed: { artifact_id: string; path: string; sha256: string }[];
  };
};

export type CadModelDecision = {
  kind: string; accepted_revision: number; reviewed_revision: number | null; note: string;
  step_sha256?: string | null; actor?: string | null; method?: string | null;
  confirmed_at?: string | null; request_id?: string | null;
};

export function useCadRoute(runId: string | undefined) {
  return useQuery({
    queryKey: ['cad-route', runId], enabled: !!runId, retry: 1,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/v1/runs/${encodeURIComponent(runId!)}/cad-route`, { signal });
      if (!response.ok) throw new Error('Не удалось загрузить CAD-маршрут.');
      return await response.json() as CadRouteState | null;
    },
    refetchInterval: query => shouldPollCadRoute(query.state.data) ? 1500 : false,
    structuralSharing: (previous, next) => mergeCadRouteState(previous as CadRouteState | null | undefined, next as CadRouteState | null),
  });
}

export function useApproveCadModel(runId: string) {
  const cache = useQueryClient();
  const controller = useRef<ReturnType<typeof createCadApprovalController> | null>(null);
  if (!controller.current) controller.current = createCadApprovalController();
  return useMutation({
    retry: false,
    mutationFn: (state: CadRouteState) => {
      const operator = getOperatorProfile();
      return controller.current!.submit(state, operator.id || encodeURIComponent(operator.name || 'operator'));
    },
    onSuccess: result => {
      cache.setQueryData<CadRouteState | null>(['cad-route', runId], previous => mergeCadRouteState(previous, result.state));
    },
    onSettled: () => {
      void cache.invalidateQueries({ queryKey: ['cad-route', runId] });
      void cache.invalidateQueries({ queryKey: ['runs'] });
    },
  });
}

export function useContinueCadCalculation(runId: string) {
  const cache = useQueryClient();
  const controller = useRef<ReturnType<typeof createCadContinuationController> | null>(null);
  if (!controller.current) controller.current = createCadContinuationController();
  return useMutation({
    retry: false,
    mutationFn: (state: CadRouteState) => {
      const operator = getOperatorProfile();
      return controller.current!.submit(state, operator.id || encodeURIComponent(operator.name || 'operator'));
    },
    onSettled: () => Promise.all([
      cache.invalidateQueries({ queryKey: ['cad-route', runId] }),
      cache.invalidateQueries({ queryKey: ['volume-round', runId] }),
      cache.invalidateQueries({ queryKey: ['runs'] }),
      cache.invalidateQueries({ queryKey: ['orchestrator'] }),
    ]),
  });
}
