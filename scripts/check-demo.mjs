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
const hundredths = value => Math.round(Number(value) * 100);
const examples = manifest.examples;
assert.deepEqual(examples.map(example => example.case), ['shaft', 'nozzle']);
assert.equal(examples[0].run_id, manifest.run_id);
assert.deepEqual(responses['/api/v1/runs'].map(run => run.id), examples.map(example => example.run_id));
assert.deepEqual(responses['/api/v1/projects/1/runs'], responses['/api/v1/runs']);
for (const [file, hash] of Object.entries(manifest.files)) assert.equal(sha(await read(file)), hash, `Snapshot changed: ${file}`);
for (const file of Object.values(assets)) assert.ok(manifest.files[file], `Untracked public asset: ${file}`);
for (const summary of responses['/api/v1/nsi/editable-tables']) {
  const detail = responses[`/api/v1/nsi/editable-tables/${summary.table_key}`];
  assert.equal(summary.row_count, detail.rows.length, summary.table_key);
}
assert.equal(responses['/api/v1/nsi/catalog/assortment'].count, responses['/api/v1/nsi/catalog/assortment'].rows.length);
const models = await json('demo/models.json');
assert.deepEqual(models.map(model => model.slug), examples.map(example => `${example.case}-v${example.model_revision}`));
const modelDirectories = [];
for (const example of examples) {
  const prefix = `/api/v1/runs/${example.run_id}`;
  const state = responses[`${prefix}/volume-round`];
  const cad = responses[`${prefix}/cad-route`];
  assert.deepEqual(cad.downstream, state);
  assert.equal(state.status, 'completed');
  assert.equal(state.calculation_locked, true);
  assert.equal(state.revision, example.state_revision);
  assert.equal(state.quantity, example.quantity);
  assert.equal(state.model_revision, example.model_revision);
  assert.equal(state.step_sha256, example.step_sha256);
  assert.equal(state.source_sha256, example.source_sha256 ?? example.drawing_sha256);
  assert.equal(cad.route.mode, 'automatic');
  assert.equal(cad.route.decision.method, 'agent');
  assert.equal(cad.route.decision.step_sha256, example.step_sha256);
  const drawing = `${example.directory}/drawing.pdf`;
  const artifact = `/api/v1/artifacts/${state.source_artifact_id}`;
  assert.equal(assets[artifact], drawing);
  assert.equal(assets[`${artifact}/preview`], `${example.directory}/drawing.png`);
  assert.equal(sha(await read(drawing)), example.drawing_sha256);
  if (example.case === 'nozzle') {
    assert.equal(example.redacted, true);
    assert.notEqual(example.drawing_sha256, state.source_sha256);
    assert.ok(!Object.values(manifest.files).includes(state.source_sha256), 'Private original is present');
    assert.equal(state.cost_estimate.status, 'estimated');
    assert.ok(state.cost_estimate.rows.every(row => row.rate));
  } else {
    assert.equal(state.cost_estimate.status, 'partial');
    assert.equal(state.cost_estimate.batch_rub, null);
  }
  assert.equal(state.material_reference.status, 'found');
  assert.ok(state.material_reference.chemical_composition.length && state.material_reference.hardness.length);
  assert.equal(state.calculation_basis.model_revision, state.model_revision);
  assert.ok(state.calculation_basis.sections.find(section => section.id === 'time').items.some(item => item.table));
  assert.deepEqual(state.time_estimate.totals.batch_minutes, example.time_minutes);
  assert.deepEqual(state.cost_estimate.known_batch_rub, example.assessed_cost_rub);
  for (const boundary of ['min', 'max']) {
    const { totals } = state.time_estimate;
    assert.equal(hundredths(totals.batch_minutes[boundary]), hundredths(totals.setup_per_batch_minutes[boundary]) + state.quantity * hundredths(totals.per_piece_minutes[boundary]));
    assert.equal(state.cost_estimate.rows.reduce((sum, row) => sum + hundredths((row.batch_rub ?? row.known_batch_rub)?.[boundary] ?? 0), 0), hundredths(example.assessed_cost_rub[boundary]));
  }
  for (const model of cad.route.models) {
    const slug = `${example.case}-v${model.revision}`;
    const directory = `models/${slug}`;
    modelDirectories.push(slug);
    const config = await json(`${directory}/preview-config.json`);
    const inspection = await json(`${directory}/inspection.json`);
    assert.equal(assets[`${prefix}/cad-route/models/${model.revision}/view/model.step`], `${directory}/model.step`);
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
  for (const document of ['estimate', 'route', 'basis']) {
    const file = `${example.directory}/print/${document}.pdf`;
    assert.equal(assets[`${prefix}/demo/print/${document}.pdf`], file);
    assert.ok((await read(file)).subarray(0, 5).equals(Buffer.from('%PDF-')));
  }
  assert.ok(manifest.files[`models/${example.case}-v${example.model_revision}/preview.jpg`]);
}
assert.deepEqual((await readdir(new URL('../public/models/', import.meta.url))).sort(), modelDirectories.sort());
async function publicFiles(directory) {
  for (const file of await readdir(directory, { withFileTypes: true })) {
    const filename = new URL(file.name + (file.isDirectory() ? '/' : ''), directory);
    if (file.isDirectory()) await publicFiles(filename);
    else assert.doesNotMatch(file.name, /\.(db|sqlite|exe|dll|py|env)$/i, `Runtime data in public: ${filename}`);
  }
}
await publicFiles(new URL('../public/', import.meta.url));
console.log(`PASS: ${examples.length} saved calculations, ${modelDirectories.length} revisions, printable PDFs, snapshot hashes and NSI counters`);
