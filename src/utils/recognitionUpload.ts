export type RecognitionUpload = {
  file: File;
  projectId: string;
  launchOptions?: { verification_enabled: boolean; auto_resolve_questions: boolean };
  quantity?: number;
  pipelineMode?: 'compact_round' | 'volume_round' | 'cad_route';
  stepFile?: File;
  reviewMode?: 'manual' | 'automatic';
};

export function recognitionUploadForm({ file, projectId, launchOptions, quantity, pipelineMode, stepFile, reviewMode }: RecognitionUpload) {
  const form = new FormData();
  form.append('source', file);
  form.append('project_id', projectId);
  form.append('document_id', file.name.replace(/\.[^/.]+$/, '') || 'drawing');
  if (quantity !== undefined) form.append('quantity', String(quantity));
  if (pipelineMode) form.append('pipeline_mode', pipelineMode);
  if (pipelineMode === 'cad_route') {
    if (stepFile) form.append('step', stepFile);
    form.append('review_mode', reviewMode ?? 'manual');
  }
  if (launchOptions) {
    form.append('verification_enabled', String(launchOptions.verification_enabled));
    form.append('auto_resolve_questions', String(launchOptions.auto_resolve_questions));
  }
  return form;
}
