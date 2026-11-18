import { http, HttpResponse } from 'msw';
import { setupWorker } from 'msw/browser';
import { DEMO_READ_ONLY, DEMO_STORAGE, demoAsset, demoNotice, registerDemoAssets, type DemoExample } from './config';

type JsonObject = Record<string, unknown>;
type Responses = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject => value !== null && typeof value === 'object' && !Array.isArray(value);
function json(data: unknown, init: { status?: number } = {}) {
  return new HttpResponse(JSON.stringify(data), { ...init, headers: { 'Content-Type': 'application/json' } });
}
export async function startDemo() {
  const [response, index, manifest] = await Promise.all(['responses.json', 'assets.json', 'manifest.json'].map(name => fetch(demoAsset(`demo/${name}?schema=3`), { cache: 'no-cache' })));
  if (![response, index, manifest].every(item => item.ok)) throw new Error('Не удалось загрузить демонстрационные примеры. Обновите страницу.');
  const baseline = await response.json() as Responses;
  const files = await index.json() as Record<string, string>;
  registerDemoAssets(files, (await manifest.json() as { examples: DemoExample[] }).examples);
  let overrides: Responses = {};
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(DEMO_STORAGE) ?? '{}');
    if (isObject(saved)) overrides = saved;
  } catch { /* An unavailable store does not prevent viewing the saved example. */ }
  const current = (path: string) => overrides[path] ?? baseline[path];
  function save(path: string, data: unknown) {
    overrides[path] = data;
    try { localStorage.setItem(DEMO_STORAGE, JSON.stringify(overrides)); }
    catch { demoNotice('Изменения доступны до закрытия страницы: браузер не разрешил локальное сохранение.'); }
    return json(data);
  }
  const worker = setupWorker(http.all('*/api/*', async ({ request }) => {
    const url = new URL(request.url), path = url.pathname, method = request.method;
    if (url.origin !== location.origin) return json({ detail: DEMO_READ_ONLY }, { status: 403 });
    if (method === 'GET') {
      if (files[path]) {
        const file = await fetch(demoAsset(files[path]));
        return new HttpResponse(await file.arrayBuffer(), { status: file.status, headers: file.headers });
      }
      if (path === '/api/v1/orchestrator/chat') {
        const runId = url.searchParams.get('run_id'), projectId = url.searchParams.get('project_id');
        const key = runId ? `run:${runId}` : projectId ? `project:${projectId}` : 'workspace';
        const cad = baseline[`/api/v1/runs/${runId}/cad-route`] as { title: string; route: { revision: number; models: unknown[]; decision: unknown }; jobs: Record<string, JsonObject> } | undefined;
        return json({ scope: { key, title: cad?.title ?? 'Рабочее пространство', kind: runId ? 'run' : projectId ? 'project' : 'workspace', run_id: runId, project_id: projectId },
          availability: { enabled: false, reason: 'В демо доступна история работ по сохранённому расчёту.' }, choice: null, chat: null, requests: [],
          context: { run: cad ? { status: 'completed', current_stage: 'done' } : null,
            cad: cad ? { phase: 'completed', revision: cad.route.revision, model: cad.route.models.at(-1), decision: cad.route.decision, jobs: Object.values(cad.jobs) } : undefined } });
      }
      if (path === '/api/v1/projects/trash') return json((current('/api/v1/projects') as JsonObject[]).filter(project => project.deleted_at));
      if (path === '/api/v1/projects') return json((current(path) as JsonObject[]).filter(project => !project.deleted_at));
      if (/^\/api\/v1\/projects\/\d+$/.test(path)) {
        const project = (current('/api/v1/projects') as JsonObject[]).find(item => String(item.id) === path.split('/').at(-1));
        return project ? json(project) : json({ detail: 'Проект не найден.' }, { status: 404 });
      }
      if (path === '/api/v1/runs') return json(url.searchParams.has('project_id') && url.searchParams.get('project_id') !== '1' ? [] : baseline[path]);
      if (path === '/api/v1/settings/agents/roles') return json(baseline[`${path}?pipeline_mode=${url.searchParams.get('pipeline_mode') ?? 'cad_route'}`] ?? []);
      const rate = /^\/api\/v1\/equipment\/passports\/([^/]+)\/hourly-rate$/.exec(path);
      if (rate) return json((current('/api/v1/equipment/hourly-rates') as JsonObject)[decodeURIComponent(rate[1])] ?? null);
      if (path.endsWith('/export.csv')) {
        const tableMatch = /^\/api\/v1\/nsi\/editable-tables\/([^/]+)\/export\.csv$/.exec(path);
        const section = tableMatch ? decodeURIComponent(tableMatch[1]) : path.includes('/assortment/') ? 'assortment' : url.searchParams.get('section') ?? 'materials';
        const catalogue = baseline['/api/v1/nsi/catalog'] as JsonObject;
        const detail = tableMatch ? baseline[`/api/v1/nsi/editable-tables/${section}`] : baseline['/api/v1/nsi/catalog/assortment'];
        const rows = ((tableMatch || section === 'assortment') && isObject(detail) ? detail.rows : catalogue[section] ?? []) as JsonObject[];
        const fields = [...new Set(rows.flatMap(row => Object.keys(row)))];
        const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
        return new HttpResponse('\uFEFF' + [fields, ...rows.map(row => fields.map(field => row[field]))].map(row => row.map(cell).join(';')).join('\r\n'), { headers: { 'Content-Type': 'text/csv;charset=utf-8', 'Content-Disposition': `attachment; filename="metall-demo-${section}.csv"` } });
      }
      if (path in baseline || path in overrides) return json(current(path));
      console.error('Demo GET is not configured:', path);
      return json({ detail: 'Эти данные не включены в демонстрационный набор.' }, { status: 404 });
    }
    const body: unknown = await request.json().catch(() => null);
    if (path === '/api/v1/projects' && method === 'POST' && isObject(body)) {
      const projects = structuredClone(current(path)) as JsonObject[];
      const created = { ...projects[0], ...body, id: Math.max(0, ...projects.map(item => Number(item.id))) + 1, status: 'draft', deleted_at: null, created_at: new Date().toISOString() };
      save(path, [...projects, created]);
      return json(created, { status: 201 });
    }
    const trash = /^\/api\/v1\/projects\/(\d+)\/(trash|restore)$/.exec(path);
    if (trash && method === 'POST') {
      const projects = structuredClone(current('/api/v1/projects')) as JsonObject[];
      const project = projects.find(item => String(item.id) === trash[1]);
      if (!project) return json({ detail: 'Проект не найден.' }, { status: 404 });
      project.deleted_at = trash[2] === 'trash' ? new Date().toISOString() : null;
      save('/api/v1/projects', projects);
      return json(project);
    }
    if (path === '/api/v1/settings/agents' && method === 'PUT' && isObject(body)) {
      const previous = current(path) as JsonObject;
      if (body.expected_revision !== previous.revision) return json({ detail: 'Обновите редакцию настроек.' }, { status: 409 });
      return save(path, { revision: Number(previous.revision) + 1, roles: body.roles, launch: body.launch });
    }
    demoNotice(DEMO_READ_ONLY);
    return json({ detail: DEMO_READ_ONLY }, { status: 409 });
  }));
  await worker.start({ quiet: true, serviceWorker: { url: demoAsset('mockServiceWorker.js'), options: { scope: import.meta.env.BASE_URL } },
    onUnhandledRequest(request, print) { if (new URL(request.url).pathname.startsWith('/api/')) print.error(); } });
}
