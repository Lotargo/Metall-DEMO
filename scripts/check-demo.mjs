import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAnnotations } from '../viewer/preview-dimensions.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const sha = data => createHash('sha256').update(data).digest('hex');
const manifest = await json('public/demo/manifest.json');
const responses = await json('public/demo/responses.json');
const prefix = `/api/v1/runs/${manifest.run_id}/compact-round`;
const state = responses[prefix], table = responses[`${prefix}/estimate-table`], form = responses[`${prefix}/estimate-form`];
assert.equal(state.status, 'ready');
assert.equal(state.revision, manifest.state_revision);
assert.equal(state.route.operations.length, manifest.operations);
assert.equal(state.time_estimate.full_batch_minutes, manifest.time_minutes);
assert.equal(state.time_estimate.coverage_complete, true);
assert.equal(state.cost_estimate.total_state, 'complete');
assert.equal(state.cost_estimate.include_material_cost, false);
assert.match(state.material_evidence.source, /^https?:\/\//, 'Public material reference must remain a usable URL');
assert.equal(state.cost_estimate.totals[0].total, manifest.price_rub);
assert.equal(form.totals[0].total, manifest.price_rub);
assert.equal(table.order.totals[0].amount, manifest.price_rub);
assert.equal(table.drawing_revision, state.reading_revision);
assert.equal(table.route_revision, state.route_revision);
assert.equal(responses[`${prefix}/calculation-readiness`].revision, state.revision);
assert.equal(form.estimate_sha256.length, 64);
// Sum document positions exactly, without binary floating-point arithmetic.
const cents = value => { assert.match(value, /^\d+\.\d{2}$/); return BigInt(value.replace('.', '')); };
assert.equal(form.rows.reduce((sum, row) => sum + (row.amount === null ? 0n : cents(row.amount)), 0n), cents(manifest.price_rub));
assert.equal(form.rows.filter(row => row.status === 'unestimated').length, 0);
for (const [file, hash] of Object.entries(manifest.files)) assert.equal(sha(await readFile(path.join(root, 'public', file))), hash, `Snapshot changed: ${file}`);
for (const summary of responses['/api/v1/nsi/editable-tables']) {
  const detail = responses[`/api/v1/nsi/editable-tables/${summary.table_key}`];
  assert.equal(summary.row_count, detail.rows.length, summary.table_key);
}
assert.equal(responses['/api/v1/nsi/catalog/assortment'].count, responses['/api/v1/nsi/catalog/assortment'].rows.length);
const models = await json('public/demo/models.json');
assert.equal(models.length, 2);
for (const model of models) {
  const directory = `public/models/${model.slug}`;
  const config = await json(`${directory}/preview-config.json`);
  const inspection = await json(`${directory}/inspection.json`);
  const step = await readFile(path.join(root, directory, 'model.step'));
  assert.equal(sha(step), config.download.sha256);
  assert.equal(step.length, model.stepBytes);
  if (config.annotations) assert.equal(validateAnnotations(config.annotations, sha(step)), null);
  for (const file of [inspection.mesh_file, ...(inspection.cutaways ?? []).map(item => item.mesh_file)]) {
    assert.ok((await readFile(path.join(root, directory, file))).length > 0);
  }
  assert.equal(config.chat_model, null);
}
async function publicFiles(directory) {
  for (const file of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, file.name);
    if (file.isDirectory()) await publicFiles(filename);
    else assert.doesNotMatch(file.name, /\.(db|sqlite|exe|dll|py|env)$/i, `Runtime data in public: ${filename}`);
  }
}
await publicFiles(path.join(root, 'public'));
const html = await readFile(path.join(root, 'index.html'), 'utf8');
assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic/);
const app = await readFile(path.join(root, 'src/App.tsx'), 'utf8');
assert.match(app, /HashRouter/);
console.log(JSON.stringify({ status: 'passed', revision: state.revision, operations: state.route.operations.length,
  price_rub: manifest.price_rub, time_minutes: manifest.time_minutes, checked_files: Object.keys(manifest.files).length, models: models.length }, null, 2));
