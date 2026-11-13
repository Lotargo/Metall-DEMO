"""Explicit, offline refresh from Metall evidence. Not needed to build or run the demo."""

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', type=Path, required=True)
args = parser.parse_args()
source = args.source.resolve()
root = Path(__file__).resolve().parents[1]
out = root / 'public' / 'demo'
out.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(source / 'mvp' / 'src'))

from metall_mvp.domain.compact_round import CompactState, compact_clarifications
from metall_mvp.workflows.compact_full_route import full_route
from metall_mvp.workflows.compact_readiness import calculation_readiness
from metall_mvp.workflows.compact_estimate_table import estimate_price_table
from metall_mvp.workflows.compact_estimate_form import (
    assemble_form, form_articles, validate_layout, _form_digest,
)
from metall_mvp.domain.machine_contracts import exchange_from_passport, coverage_report, machine_template
from metall_mvp.domain.machine_passports import MachinePassport
from metall_mvp.domain.machine_parameters import registry_document
from metall_mvp.domain.machine_regimes import registry as regime_registry
from fastapi.encoders import jsonable_encoder


def read(relative):
    return json.loads((source / relative).read_text(encoding='utf-8'))


def clean(value):
    if isinstance(value, dict):
        return {k: clean(v) for k, v in value.items()}
    if isinstance(value, list):
        return [clean(v) for v in value]
    if isinstance(value, str):
        value = re.sub(r'(?<![A-Za-z])[A-Za-z]:[\\/][^\n\r;"<>]+', 'Сохранённый источник', value)
        value = re.sub(r'(?<!\w)\.(?:temp|samples)[\\/][^\n\r;"<>]+', 'Сохранённый источник', value)
        return value
    return value


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')


snap = read('.temp/open-data-ui/overview/after.json')
raw = snap['compact']['data']
state = CompactState.model_validate(raw)
run_id = state.source_run_id
prefix = f'/api/v1/runs/{run_id}'
compact = prefix + '/compact-round'
assert state.revision == 20 and state.status == 'ready'
assert state.time_estimate.coverage_complete and state.cost_estimate.total_state == 'complete'
assert str(state.cost_estimate.totals[0].total) == '2651.87'
estimate = state.cost_estimate
articles = form_articles(state, estimate)
layout = validate_layout({'form_version': 'metall-estimate/1', 'materials': [], 'works': [a.key for a in articles]}, articles)
form = assemble_form(state, estimate, articles, layout, _form_digest(estimate), date(2026, 11, 13))
table = estimate_price_table(state, estimate)
assert form.totals[0].total == table.order.totals[0].amount

responses = {compact: clean(raw)}
# Full native trace, prompts, CLI sessions and provider usage are not demo inputs.
responses[compact]['evidence'] = {}
for key, endpoint in {
    'equipment': '/api/v1/equipment', 'configurator': '/api/v1/equipment-configurator',
    'agents': '/api/v1/settings/agents', 'nsi': '/api/v1/nsi/editable-tables',
    'lengths': '/api/v1/calculation/bar-lengths', 'cut_norms': '/api/v1/nsi/cut-norms',
    'profiles': '/api/v1/estimation/profiles',
}.items():
    assert snap[key]['ok']
    responses[endpoint] = clean(snap[key]['data'])
for suffix, model in {
    'full-route': full_route(state), 'calculation-readiness': calculation_readiness(state),
    'clarifications': compact_clarifications(state), 'estimate-table': table, 'estimate-form': form,
}.items():
    responses[compact + '/' + suffix] = clean(model.model_dump(mode='json'))

project = dict(snap['projects']['data'][0], name='Демонстрационный проект', customer='Пример расчёта изготовления детали', status='approved')
responses['/api/v1/projects'] = [project]
responses['/api/v1/projects/1'] = project
run = dict(snap['run']['data']['run'], project_id='1')
responses['/api/v1/runs'] = [run]
responses[prefix] = {'run': run, 'artifacts': [], 'spans': [], 'events': []}
responses[prefix + '/family'] = [run]
responses[compact + '/history'] = []
responses['/api/v1/providers'] = []
responses['/api/v1/projects/trash'] = []

fixture = read('web/scripts/fixtures/ui-refactor.json')['responses']
for endpoint, saved in fixture.items():
    if '/nsi/' in endpoint and endpoint not in responses and saved['status'] == 200:
        responses[endpoint] = clean(saved['body'])
# Use honest counters for the reduced reference catalogue.
catalog = responses['/api/v1/nsi/catalog']
for key in ['materials', 'standards', 'machines', 'material_candidates', 'source_documents', 'prices']:
    if isinstance(catalog.get(key), list) and isinstance(catalog.get('summary'), dict) and key in catalog['summary']:
        catalog['summary'][key] = len(catalog[key])
assortment = responses['/api/v1/nsi/catalog/assortment']
assortment['count'] = len(assortment['rows'])
for summary in responses['/api/v1/nsi/editable-tables']:
    endpoint = '/api/v1/nsi/editable-tables/' + summary['table_key']
    if endpoint in responses:
        detail = responses[endpoint]
        detail.update(summary)
        detail['row_count'] = len(detail['rows'])
        summary['row_count'] = detail['row_count']
    summary['created_by'] = 'Демонстрационный набор'
    summary['working_csv_path'] = None
    summary['default_snapshot_path'] = None

rates = {pin['machine_id']: {'machine_id': pin['machine_id'], 'version': pin['version'], 'terms': pin['terms']}
         for pin in raw['cost_estimate']['machine_rate_pins'].values()}
for machine in responses['/api/v1/equipment']['machines']:
    machine_id = machine.get('machine_id')
    if machine_id and machine_id not in rates:
        rates[machine_id] = {'machine_id': machine_id, 'version': 1, 'terms': {'hourly_rate': '1000', 'currency': 'RUB', 'source': 'Справочная ставка демонстрационного набора'}}
responses['/api/v1/equipment/hourly-rates'] = rates
responses['/api/v1/equipment/exchange/registry'] = jsonable_encoder({**registry_document(), 'working_regimes': regime_registry()})
for raw_machine in snap['equipment']['data']['machines']:
    machine = MachinePassport.model_validate(raw_machine)
    package = exchange_from_passport(machine)
    path = '/api/v1/equipment/passports/' + machine.machine_id
    responses[path + '/exchange'] = clean({'catalog_revision': snap['equipment']['data']['revision'], 'passport_version': machine.version,
        'status': 'from_passport', 'package': package.model_dump(mode='json'), 'coverage': coverage_report(package), 'configuration_id': None})
    responses[path + '/history'] = []
for cls in ['lathe', 'bandsaw', 'drill', 'mill', 'grinder', 'generic']:
    responses['/api/v1/equipment/exchange/templates/' + cls] = machine_template(cls).model_dump(mode='json')

events = []
for event in snap['run']['data']['events']:
    if event['event_type'] in ['run.started', 'run.completed', 'run.needs_review', 'compact.state.updated']:
        payload = event.get('payload') or {}
        events.append({**event, 'payload': {k: payload[k] for k in ['stage', 'revision'] if k in payload}})
dump(out / 'events.json', events)

for artifact in snap['run']['data']['artifacts']:
    if artifact['id'] == state.image_artifact_id:
        image = Path(artifact['object_ref'])
        shutil.copyfile(image, out / 'drawing.png')
    if artifact['kind'] == 'source_document':
        shutil.copyfile(Path(artifact['object_ref']), out / 'drawing.pdf')

models = []
for slug, relative, title, subtitle in [
    ('drive-shaft', 'cad-metall/verification/native-2026-11-11', 'Вал приводной II-175', 'II-175.01.00.002 В-17'),
    ('stepped-part', 'mvp/.data/cad-metall/example-stepped-shaft', 'Ступенчатая деталь', 'Тело вращения, скругление и поперечное отверстие'),
]:
    directory = source / relative
    target = root / 'public' / 'models' / slug
    target.mkdir(parents=True, exist_ok=True)
    inspection = json.loads((directory / 'inspection.json').read_text(encoding='utf-8'))
    filenames = ['model.step', 'inspection.json', inspection['mesh_file'], *[c['mesh_file'] for c in inspection.get('cutaways', [])]]
    annotations_file = directory / 'dimensions.json'
    annotations = json.loads(annotations_file.read_text(encoding='utf-8')) if annotations_file.exists() else None
    if annotations:
        filenames.append('dimensions.json')
    for filename in filenames:
        shutil.copyfile(directory / filename, target / filename)
    step = (target / 'model.step').read_bytes()
    config = {'title': title, 'subtitle': subtitle, 'annotations': annotations, 'annotationsWarning': None,
              'home_url': '../../#/models', 'chat_model': None, 'modelNavigation': [],
              'model_notes': (annotations or {}).get('notes', []),
              'download': {'available': True, 'name': slug + '.step', 'bytes': len(step), 'sha256': hashlib.sha256(step).hexdigest(), 'url': 'model.step'}}
    dump(target / 'preview-config.json', config)
    models.append({'slug': slug, 'title': title, 'subtitle': subtitle, 'stepBytes': len(step),
                   'dimensions': len((annotations or {}).get('dimensions', [])),
                   'limitations': (annotations or {}).get('notes', [])})

viewer_source = root / 'viewer'
viewer_source.mkdir(exist_ok=True)
for filename in ['preview.html', 'preview.css', 'preview-viewer.mjs', 'preview-controls.mjs', 'preview-dimensions.mjs', 'preview-overlay.mjs', 'preview-icons.svg']:
    if filename == 'preview-viewer.mjs':
        text = (source / 'cad-metall/tools' / filename).read_text(encoding='utf-8')
        (viewer_source / filename).write_text(text.replace('THREE.PCFSoftShadowMap', 'THREE.PCFShadowMap'), encoding='utf-8')
    else:
        shutil.copyfile(source / 'cad-metall/tools' / filename, viewer_source / filename)

dump(out / 'responses.json', responses)
dump(out / 'models.json', models)
sha = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
manifest = {'schema': 'metall-demo/1', 'date': '2026-11-13', 'source_commit': sha, 'run_id': run_id,
            'state_revision': state.revision, 'price_rub': '2651.87', 'time_minutes': str(state.time_estimate.full_batch_minutes),
            'quantity': state.quantity, 'operations': len(state.route.operations),
            'reference_catalogue': 'Reduced saved UI reference data; independent from the engineering snapshot.',
            'transformations': ['One demo project; no native trace, prompts or sessions', 'Internal local paths removed',
                                'UI projections derived offline from the same state', 'Reduced reference catalogue counters match delivered rows'],
            'files': {str(p.relative_to(root / 'public')).replace('\\', '/'): hashlib.sha256(p.read_bytes()).hexdigest()
                      for directory in [out, root / 'public/models'] for p in directory.rglob('*')
                      if p.is_file() and p.suffix in {'.json', '.step', '.jpg', '.png', '.pdf'} and p.name != 'manifest.json'}}
dump(out / 'manifest.json', manifest)
print(json.dumps({'responses': len(responses), 'models': len(models), 'revision': state.revision, 'price_rub': manifest['price_rub']}))
