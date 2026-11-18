export const DEMO_RUN_ID = '6c64f6c9-b4ec-416e-983d-80c2106e60dd';
export const DEMO_RUN_PATH = `/runs/${DEMO_RUN_ID}`;
export const demoAsset = (file: string) => `${import.meta.env.BASE_URL}${file.replace(/^\//, '')}`;
export const DEMO_STORAGE = 'metall-demo.responses.v2';
export const DEMO_READ_ONLY = 'В демо показан сохранённый расчёт. Изменение инженерных данных и новый пересчёт доступны в полной версии Metall.';
export function demoNotice(message: string) {
  window.dispatchEvent(new CustomEvent('metall-demo:notice', { detail: message }));
}

let assets: Record<string, string> = {};
export type DemoExample = { run_id: string; label: string };
let examples: readonly DemoExample[] = [];
export function registerDemoAssets(value: Record<string, string>, savedExamples: DemoExample[]) {
  assets = value;
  examples = savedExamples;
}
export function demoExamples() { return examples; }
export function demoFileFor(url: string): string | undefined {
  const path = url.split('?')[0];
  const file = assets[path];
  return file ? demoAsset(file) : undefined;
}
export function demoDocumentLink(url: string) {
  if (url.startsWith('/api/')) return demoFileFor(url);
  return url.startsWith('/runs/') ? `#${url}` : url;
}
export function demoModelFile(runId: string, revision: number) {
  return demoFileFor(`/api/v1/runs/${runId}/cad-route/models/${revision}/view/model.step`);
}
export function demoModelSource(runId: string, revision: number) {
  return demoModelFile(runId, revision)?.replace(/model\.step$/, '');
}
export function demoPrintFile(runId: string, document: string) {
  return demoFileFor(`/api/v1/runs/${runId}/demo/print/${document}.pdf`);
}
