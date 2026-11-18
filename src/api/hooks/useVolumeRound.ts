import { useQuery } from '@tanstack/react-query';

export type Range = { min: number; max: number } | null;
export type EngineeringIssue = {
  id: string; title: string; text: string; source: string; kind?: 'geometry' | 'source';
  state: 'open' | 'resolved' | 'provisional'; applied_step_sha256?: string | null;
  parameter_ids?: string[];
  crops: { page: number; rect: number[]; caption: string; file: string; url?: string }[];
  resolution?: { kind: 'resolved' | 'provisional'; text: string; basis: string } | null;
};
export type GeometryDimension = {
  ref: string; name: string; feature: string; value: number | null; unit: string; prefix: string;
  face_ids?: number[];
  source: string; drawing_nominal?: string | null; tolerance?: string | null;
  roughness?: string | null; designation?: string | null; drawing_source?: string | null; notes?: string;
  measurement_status?: 'measured' | 'unbound' | 'unavailable'; measurement_kind?: string;
  nominal?: number | { expr: string } | null; scope?: 'part' | 'stock';
  representation?: 'modeled' | 'conditional' | 'not_modeled' | 'requirement' | null;
  model_note?: string | null;
  dimension_points?: number[][]; assumption?: { adopted_value?: number; basis?: string; affects?: string } | null;
};
export type GroupTime = {
  name: string; equipment: string; rate_class?: string | null; per_piece_minutes: Range;
  setup_per_batch_minutes: Range; basis: string; assumptions?: string[];
  known_per_piece_minutes?: Range; known_setup_per_batch_minutes?: Range;
  calculation_explanation?: { method?: string; per_piece?: string; setup?: string; range_reason?: string; sources?: string };
};
export type CalculationBasis = {
  schema: string; model_revision?: number | null;
  assumptions?: { current: PlanningAssumption[]; retained: PlanningAssumption[] };
  sections: { id: 'volumes' | 'time' | 'cost'; title: string; notes: string[]; legend?: string;
    items: { title: string; origin: string; lines: string[]; formulas: string[]; notes: string[]; table?: string[][] }[];
  }[];
};
export type PlanningAssumption = {
  subject?: string; reason_kind?: string; missing?: string; adopted?: string; basis?: string; affects?: string;
};
export type ExcludedWork = string | {
  work: string; reason: string; requirement?: string; source?: string; retained_work?: string;
};
export type VolumeState = {
  schema: string; run_id: string; revision: number; status: string; stage: string;
  title: string; filename: string; quantity: number; quantity_basis: string; message?: string;
  source_artifact_id: string; source_sha256: string; stage_started_at?: string;
  steps: { stage: string; title: string; status: string; seconds: number }[];
  models: Record<string, { model_id: string; reasoning_effort: string }>;
  warnings: string[]; artifacts: Record<string, string>; model_notes?: string[];
  pipeline?: string; model_revision?: number; step_sha256?: string; results_stale?: boolean; calculation_locked?: boolean; preview_url?: string;
  stock_selection?: { prescription?: { prescription_status?: string; prescription_raw?: string }; recommendation?: { selected?: { diameter_mm: string } }; evaluation?: { status?: string; limitations?: string[] }; warnings?: string[]; batch_plan_stale?: boolean; batch_plan_quantity?: number };
  stock?: { diameter_mm: number; cut_length_mm: number; basis: string };
  volumes?: Record<string, number | null>;
  planning_stock?: { diameter_mm: number; cut_length_mm: number; basis: string; assumptions: PlanningAssumption[] } | null;
  planning_volumes?: Record<string, number | null> | null;
  planning_volume_issue?: string | null;
  calculation_basis?: CalculationBasis;
  operations_markdown?: string; viewer_ready?: boolean;
  passport?: {
    schema?: string; drawing_designation?: string | null; material?: unknown; condition: string; step_sha256?: string;
    description?: string | null; views_and_datums?: string | null;
    dimensions: GeometryDimension[]; other_geometry_dimensions: GeometryDimension[];
    requirements: ({ text: string; source?: string } | string)[];
    unknowns: string[]; unmatched_requirements: unknown[];
    issues?: EngineeringIssue[];
  };
  time_estimate?: {
    status: string; quantity: number; groups: GroupTime[]; conditions: string[];
    unestimated_work: string[]; issues: string[]; operator_issues?: string[];
    scenario_limitations?: string[]; estimated_machine_cycles?: boolean;
    planning_assumptions?: PlanningAssumption[]; failure_kind?: string | null;
    scope?: string; excluded_work?: ExcludedWork[]; basis_quantity?: number;
    totals: { per_piece_minutes: Range; setup_per_batch_minutes: Range; batch_minutes: Range; effective_per_piece_minutes: Range };
    known_groups: { batch_minutes: Range; per_piece_minutes?: Range; setup_per_batch_minutes?: Range };
  };
  cost_estimate?: {
    status: string; currency: string; batch_rub: Range; known_batch_rub: Range; condition: string;
    rows: { name: string; rate_class: string | null; rate: { hourly_rate: string; source: string; scenario?: boolean } | null; rate_issue?: string; batch_minutes: Range; batch_rub: Range; known_batch_rub?: Range }[];
  };
};

export function useVolumeRound(runId: string | undefined) {
  return useQuery({
    queryKey: ['volume-round', runId], enabled: !!runId, retry: 1,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/v1/runs/${encodeURIComponent(runId!)}/volume-round`, { signal });
      if (!response.ok) throw new Error('Не удалось загрузить геометрический маршрут.');
      return await response.json() as VolumeState | null;
    },
    refetchInterval: query => ['queued', 'running'].includes(query.state.data?.status ?? '') ? 1500 : false,
  });
}
