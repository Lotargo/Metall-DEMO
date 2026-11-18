import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { validateAnnotations } from '../viewer/preview-dimensions.mjs';

const read = file => readFile(new URL(`../public/${file}`, import.meta.url));
const json = async file => JSON.parse(await read(file));
const sha = data => createHash('sha256').update(data).digest('hex');
const manifest = await json('demo/manifest.json');
const responses = await json('demo/responses.json');
const assets = await json('demo/assets.json');
const prefix = `/api/v1/runs/${manifest.run_id}`;
const state = responses[`${prefix}/volume-round`];
const cad = responses[`${prefix}/cad-route`];
assert.deepEqual(responses['/api/v1/runs'].map(run => run.id), [manifest.run_id]);
assert.deepEqual(cad.downstream, state);
assert.equal(state.status, 'completed');
assert.equal(state.calculation_locked, true);
assert.equal(state.revision, manifest.state_revision);
assert.equal(state.quantity, manifest.quantity);
assert.equal(state.model_revision, manifest.model_revision);
assert.equal(state.step_sha256, manifest.step_sha256);
assert.equal(state.source_sha256, manifest.drawing_sha256);
assert.equal(cad.route.mode, 'automatic');
assert.equal(cad.route.decision.method, 'agent');
assert.equal(cad.route.decision.step_sha256, manifest.step_sha256);
assert.equal(sha(await read('demo/drawing.pdf')), manifest.drawing_sha256);
assert.equal(state.material_reference.status, 'found');
assert.ok(state.material_reference.chemical_composition.length && state.material_reference.hardness.length);
assert.equal(state.calculation_basis.model_revision, state.model_revision);
assert.ok(state.calculation_basis.sections.find(section => section.id === 'time').items.some(item => item.table));
assert.deepEqual(state.time_estimate.totals.batch_minutes, manifest.time_minutes);
assert.equal(state.cost_estimate.status, 'partial');
assert.equal(state.cost_estimate.batch_rub, null);
assert.deepEqual(state.cost_estimate.known_batch_rub, manifest.assessed_cost_rub);
const hundredths = value => Math.round(Number(value) * 100);
for (const boundary of ['min', 'max']) {
  const { totals } = state.time_estimate;
  assert.equal(hundredths(totals.batch_minutes[boundary]), hundredths(totals.setup_per_batch_minutes[boundary]) + state.quantity * hundredths(totals.per_piece_minutes[boundary]));
  assert.equal(state.cost_estimate.rows.reduce((sum, row) => sum + hundredths((row.batch_rub ?? row.known_batch_rub)?.[boundary] ?? 0), 0), hundredths(manifest.assessed_cost_rub[boundary]));
}
for (const [file, hash] of Object.entries(manifest.files)) assert.equal(sha(await read(file)), hash, `Snapshot changed: ${file}`);
for (const file of Object.values(assets)) assert.ok(manifest.files[file], `Untracked public asset: ${file}`);
for (const summary of responses['/api/v1/nsi/editable-tables']) {
  const detail = responses[`/api/v1/nsi/editable-tables/${summary.table_key}`];
  assert.equal(summary.row_count, detail.rows.length, summary.table_key);
}
assert.equal(responses['/api/v1/nsi/catalog/assortment'].count, responses['/api/v1/nsi/catalog/assortment'].rows.length);
const models = await json('demo/models.json');
assert.deepEqual(models.map(model => model.slug), [`shaft-v${state.model_revision}`]);
const modelDirectories = cad.route.models.map(model => `shaft-v${model.revision}`);
assert.deepEqual((await readdir(new URL('../public/models/', import.meta.url))).sort(), modelDirectories.sort());
for (const model of cad.route.models) {
  const directory = `models/shaft-v${model.revision}`;
  const config = await json(`${directory}/preview-config.json`);
  const inspection = await json(`${directory}/inspection.json`);
  const step = await read(`${directory}/model.step`);
  assert.equal(sha(step), model.step_sha256);
  assert.equal(sha(step), config.download.sha256);
  assert.equal(step.length, config.download.bytes);
  assert.equal(validateAnnotations(config.annotations, sha(step)), null);
  for (const file of [inspection.mesh_file, ...(inspection.cutaways ?? []).map(item => item.mesh_file)]) {
    assert.ok((await read(`${directory}/${file}`)).length > 0);
  }
  assert.equal(config.chat_model, null);
}
for (const document of ['estimate', 'route', 'basis']) assert.ok((await read(`demo/print/${document}.pdf`)).subarray(0, 5).equals(Buffer.from('%PDF-')));
async function publicFiles(directory) {
  for (const file of await readdir(directory, { withFileTypes: true })) {
    const filename = new URL(file.name + (file.isDirectory() ? '/' : ''), directory);
    if (file.isDirectory()) await publicFiles(filename);
    else assert.doesNotMatch(file.name, /\.(db|sqlite|exe|dll|py|env)$/i, `Runtime data in public: ${filename}`);
  }
}
await publicFiles(new URL('../public/', import.meta.url));
console.log(`PASS: one saved calculation, ${modelDirectories.length} revisions, three printable PDFs, snapshot hashes and NSI counters`);
