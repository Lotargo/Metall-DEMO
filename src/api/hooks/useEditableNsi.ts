import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { downloadFile } from '@/api/client';

export type EditableTableKey = string;

export interface EditableTableColumn {
  field: string;
  header: string;
  type: string;
  semantic: string;
  unit: string;
  required: boolean;
  allow_not_available: boolean;
  accepted_notations: string[];
  export_notation: string | null;
}

export type EditableNsiRow = Record<string, string | null>;

export interface EditableTableSummary {
  table_key: EditableTableKey;
  title: string;
  table_kind: string;
  schema_id: string;
  natural_key: string[];
  columns: EditableTableColumn[];
  active_revision_id: string;
  default_revision_id: string;
  revision_number: number;
  row_count: number;
  created_at_utc: string;
  created_by: string;
  source: 'default_seed' | 'csv_import' | 'ui_edit' | 'rollback' | 'default_reset' | 'recovery';
  source_filename: string | null;
  payload_sha256: string;
  enabled: boolean;
  precision_class: string | null;
  applicable_material_versions: Array<[string, number]>;
  warnings?: string[];
  working_csv_path?: string | null;
  default_snapshot_path?: string | null;
}

export interface EditableMaterialOption {
  material_id: string;
  record_version: number;
  name: string;
}

export interface StockFormulaBand {
  through_mm: string | null;
  value: string;
  unit: 'mm' | 'percent';
}

export interface StockFormulaRule {
  standard: string;
  family: 'bar' | 'sheet' | 'pipe';
  shape_type: string;
  shape_unit: string;
  outer_upper_bands: StockFormulaBand[];
  wall_lower_bands: StockFormulaBand[];
  precision_class?: string;
}

export interface StockFormulaDocument {
  schema_version: number;
  rules: StockFormulaRule[];
}

export interface StockFormulaRevision {
  sha256: string;
  is_active: boolean;
}

export interface StockFormulaValidation {
  standards: string[];
  count: number;
}

export interface EditableTableDetail extends EditableTableSummary {
  rows: EditableNsiRow[];
}

export interface EditableDiff {
  added: Array<{ key: string[]; row: EditableNsiRow }>;
  changed: Array<{
    key: string[];
    fields: Record<string, { before: string | null; after: string | null }>;
  }>;
  removed: Array<{ key: string[]; row: EditableNsiRow }>;
  summary: { added: number; changed: number; removed: number };
}

export interface EditableValidationResult {
  table_key: EditableTableKey;
  base_revision_id: string;
  row_count: number;
  payload_sha256: string;
  confirmation_hash: string;
  diff: EditableDiff;
  warnings: string[];
}

export interface EditableRevisionSummary {
  revision_id: string;
  revision_number: number;
  parent_revision_id: string | null;
  created_at_utc: string;
  created_by: string;
  source: EditableTableSummary['source'];
  source_filename: string | null;
  comment: string | null;
  schema_version: string;
  row_count: number;
  payload_sha256: string;
  diff_summary: EditableDiff['summary'];
  is_active: boolean;
  is_default: boolean;
}

export interface EditableRevisionDetail extends EditableRevisionSummary {
  table_key: EditableTableKey;
  rows: EditableNsiRow[];
  diff: EditableDiff;
}

export interface EditableRevisionComparison {
  table_key: EditableTableKey;
  from_revision_id: string;
  to_revision_id: string;
  diff: EditableDiff;
}

interface ApplyRowsInput {
  tableKey: EditableTableKey;
  rows: EditableNsiRow[];
  validation: EditableValidationResult;
  comment?: string;
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail;
    const message = typeof detail === 'string'
      ? detail
      : Array.isArray(detail)
        ? detail.map((item) => item?.msg || String(item)).join('; ')
        : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function useEditableTables() {
  return useQuery<EditableTableSummary[]>({
    queryKey: ['editable-nsi', 'tables'],
    queryFn: async () => readJson(await fetch('/api/v1/nsi/editable-tables')),
    refetchInterval: 3000,
  });
}

export function useEditableMaterialOptions() {
  return useQuery<EditableMaterialOption[]>({
    queryKey: ['editable-nsi', 'material-options'],
    queryFn: async () => readJson(await fetch('/api/v1/nsi/editable-tables/material-options')),
  });
}

export function useRegisterEditableTable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      tableKey: string;
      title: string;
      templateKey: string;
      precisionClass: string;
      materialRefs: Array<[string, number]>;
      file: File;
    }) => {
      const form = new FormData();
      form.append('table_key', input.tableKey.trim());
      form.append('title', input.title.trim());
      form.append('template_key', input.templateKey);
      form.append('precision_class', input.precisionClass.trim());
      form.append('material_refs', JSON.stringify(input.materialRefs));
      form.append('file', input.file);
      form.append('confirmed', 'true');
      return readJson<EditableTableSummary>(await fetch('/api/v1/nsi/editable-tables', {
        method: 'POST', body: form,
      }));
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['editable-nsi'] }),
        queryClient.invalidateQueries({ queryKey: ['catalog', 'assortment'] }),
      ]);
    },
  });
}

export function useSetEditableTableEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ tableKey, enabled, expectedActiveRevisionId }: {
      tableKey: string;
      enabled: boolean;
      expectedActiveRevisionId: string;
    }) => readJson<EditableTableSummary>(await fetch(
      `/api/v1/nsi/editable-tables/${encodeURIComponent(tableKey)}/activation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled, expected_active_revision_id: expectedActiveRevisionId, confirmed: true,
        }),
      }
    )),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['editable-nsi'] }),
        queryClient.invalidateQueries({ queryKey: ['catalog', 'assortment'] }),
      ]);
    },
  });
}

export function useStockFormulaDocument() {
  return useQuery<{ document: StockFormulaDocument; sha256: string }>({
    queryKey: ['editable-nsi', 'formulas'],
    queryFn: async () => readJson(await fetch('/api/v1/nsi/editable-tables/formulas')),
  });
}

export function useStockFormulaRevisions(enabled: boolean) {
  return useQuery<StockFormulaRevision[]>({
    queryKey: ['editable-nsi', 'formula-revisions'],
    queryFn: async () => readJson(await fetch('/api/v1/nsi/editable-tables/formulas/revisions')),
    enabled,
  });
}

export function useValidateStockFormulas() {
  return useMutation({
    mutationFn: async (document: StockFormulaDocument) =>
      readJson<StockFormulaValidation>(await fetch('/api/v1/nsi/editable-tables/formulas/validate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(document),
      })),
  });
}

export function usePublishStockFormulas() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ document, expectedSha256 }: {
      document: StockFormulaDocument;
      expectedSha256: string;
    }) => readJson<{ sha256: string }>(await fetch('/api/v1/nsi/editable-tables/formulas', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document, expected_sha256: expectedSha256, confirmed: true }),
      })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['editable-nsi'] });
    },
  });
}

export function useRestoreStockFormulas() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sha256, expectedSha256 }: {
      sha256: string; expectedSha256: string;
    }) => readJson<{ sha256: string }>(await fetch(
      `/api/v1/nsi/editable-tables/formulas/restore/${encodeURIComponent(sha256)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expected_sha256: expectedSha256, confirmed: true }),
      }
    )),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['editable-nsi'] });
    },
  });
}

export function useEditableTable(tableKey: EditableTableKey | undefined, editing = false) {
  return useQuery<EditableTableDetail>({
    queryKey: ['editable-nsi', 'table', tableKey],
    queryFn: async () => readJson(
      await fetch(`/api/v1/nsi/editable-tables/${encodeURIComponent(tableKey!)}`)
    ),
    enabled: !!tableKey,
    refetchInterval: editing ? false : 3000,
  });
}

export function useEditableRevisionHistory(tableKey: EditableTableKey | undefined, enabled = true) {
  return useQuery<EditableRevisionSummary[]>({
    queryKey: ['editable-nsi', 'revisions', tableKey],
    queryFn: async () => readJson(
      await fetch(`/api/v1/nsi/editable-tables/${encodeURIComponent(tableKey!)}/revisions`)
    ),
    enabled: !!tableKey && enabled,
  });
}

export function useEditableRevisionDetail(
  tableKey: EditableTableKey | undefined,
  revisionId: string | undefined
) {
  return useQuery<EditableRevisionDetail>({
    queryKey: ['editable-nsi', 'revision', tableKey, revisionId],
    queryFn: async () => readJson(
      await fetch(
        `/api/v1/nsi/editable-tables/${encodeURIComponent(tableKey!)}/revisions/${encodeURIComponent(revisionId!)}`
      )
    ),
    enabled: !!tableKey && !!revisionId,
  });
}

export function useCompareEditableRevisions() {
  return useMutation({
    mutationFn: async ({ tableKey, fromRevisionId, toRevisionId }: {
      tableKey: EditableTableKey;
      fromRevisionId: string;
      toRevisionId: string;
    }) => {
      const query = new URLSearchParams({ from: fromRevisionId, to: toRevisionId });
      return readJson<EditableRevisionComparison>(
        await fetch(`/api/v1/nsi/editable-tables/${encodeURIComponent(tableKey)}/diff?${query}`)
      );
    },
  });
}

function useRestoreMutation(defaultReset: boolean) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ tableKey, revisionId, activeRevisionId, comment }: {
      tableKey: EditableTableKey;
      revisionId?: string;
      activeRevisionId: string;
      comment?: string;
    }) => readJson<{ revision: EditableTableSummary; warnings: string[] }>(
      await fetch(
        defaultReset
          ? `/api/v1/nsi/editable-tables/${encodeURIComponent(tableKey)}/restore-default`
          : `/api/v1/nsi/editable-tables/${encodeURIComponent(tableKey)}/restore/${encodeURIComponent(revisionId!)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expected_active_revision_id: activeRevisionId,
            confirmed: true,
            comment: comment?.trim() || null,
          }),
        }
      )
    ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['editable-nsi'] }),
        queryClient.invalidateQueries({ queryKey: ['catalog', 'assortment'] }),
      ]);
    },
  });
}

export function useRestoreEditableRevision() {
  return useRestoreMutation(false);
}

export function useRestoreEditableDefault() {
  return useRestoreMutation(true);
}

export function useValidateEditableRows() {
  return useMutation({
    mutationFn: async ({ tableKey, rows, expectedRevisionId }: { tableKey: EditableTableKey; rows: EditableNsiRow[]; expectedRevisionId?: string }) =>
      readJson<EditableValidationResult>(
        await fetch(`/api/v1/nsi/editable-tables/${encodeURIComponent(tableKey)}/validate-rows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows, expected_active_revision_id: expectedRevisionId }),
        })
      ),
  });
}

export function useApplyEditableRows() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ tableKey, rows, validation, comment }: ApplyRowsInput) =>
      readJson<{ revision: EditableTableSummary; warnings: string[] }>(
        await fetch(`/api/v1/nsi/editable-tables/${encodeURIComponent(tableKey)}/apply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rows,
            base_revision_id: validation.base_revision_id,
            confirmation_hash: validation.confirmation_hash,
            confirmed: true,
            comment: comment?.trim() || null,
          }),
        })
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['editable-nsi'] }),
        queryClient.invalidateQueries({ queryKey: ['catalog', 'assortment'] }),
      ]);
    },
  });
}

export function useValidateEditableCsv() {
  return useMutation({
    mutationFn: async ({ tableKey, file }: { tableKey: EditableTableKey; file: File }) => {
      const form = new FormData();
      form.append('file', file);
      return readJson<EditableValidationResult>(
        await fetch(`/api/v1/nsi/editable-tables/${encodeURIComponent(tableKey)}/validate`, {
          method: 'POST',
          body: form,
        })
      );
    },
  });
}

export function useImportEditableCsv() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      tableKey,
      file,
      comment,
    }: {
      tableKey: EditableTableKey;
      file: File;
      comment?: string;
    }) => {
      const form = new FormData();
      form.append('file', file);
      form.append('confirmed', 'true');
      if (comment?.trim()) form.append('comment', comment.trim());
      return readJson<{ revision: EditableTableSummary; warnings: string[] }>(
        await fetch(`/api/v1/nsi/editable-tables/${encodeURIComponent(tableKey)}/import.csv`, {
          method: 'POST',
          body: form,
        })
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['editable-nsi'] }),
        queryClient.invalidateQueries({ queryKey: ['catalog', 'assortment'] }),
      ]);
    },
  });
}

export function downloadEditableTableCsv(tableKey: EditableTableKey): Promise<void> {
  return downloadFile(
    `/api/v1/nsi/editable-tables/${encodeURIComponent(tableKey)}/template.csv`,
    `${tableKey}.csv`
  );
}

export function downloadEditableRevisionCsv(
  tableKey: EditableTableKey,
  revisionId: string,
  revisionNumber: number
): Promise<void> {
  return downloadFile(
    `/api/v1/nsi/editable-tables/${encodeURIComponent(tableKey)}/revisions/${encodeURIComponent(revisionId)}/template.csv`,
    `${tableKey}-rev-${revisionNumber}.csv`
  );
}
