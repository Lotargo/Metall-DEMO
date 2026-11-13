export const DEMO_RUN_ID = '7ea4be93-9a2b-4c9b-b50a-6943cf9048a0';
export const DEMO_RUN_PATH = `/runs/${DEMO_RUN_ID}`;
export const demoAsset = (file: string) => `${import.meta.env.BASE_URL}${file.replace(/^\//, '')}`;
export const DEMO_STORAGE = 'metall-demo.responses.v1';
export const DEMO_READ_ONLY = 'В демо показан сохранённый расчёт. Изменение инженерных данных и новый пересчёт доступны в полной версии Metall.';
export function demoNotice(message: string) {
  window.dispatchEvent(new CustomEvent('metall-demo:notice', { detail: message }));
}
