"""Capture a completed Metall calculation from a local server using read-only requests."""

import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
DEMO = PUBLIC / 'demo'


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n', 'utf-8')


def select(value, fields):
    return {key: value[key] for key in fields.split() if key in value}


def clean(value):
    if isinstance(value, dict):
        return {key: clean(item) for key, item in value.items()}
    if isinstance(value, list):
        return [clean(item) for item in value]
    if isinstance(value, str):
        value = re.sub(r'(?<![A-Za-z])[A-Za-z]:[\\/][^\n\r;"<>`]+', 'Сохранённый источник', value)
        return re.sub(r'(?<!\w)\.(?:temp|data|samples)[\\/][^\n\r;"<>`]+', 'Сохранённый источник', value)
    return value


def digest(data):
    return hashlib.sha256(data).hexdigest()


def export(api, run):
    def get(path):
        with urlopen(api + path, timeout=25) as response:
            return response.read()

    def data(path):
        return json.loads(get(path))

    files = {}

    def save(relative, content):
        target = PUBLIC / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        return content

    def asset(path, relative):
        content = save(relative, get(path))
        files[path.split('?')[0]] = relative
        return content

    prefix = '/api/v1/runs/' + run
    artifact = '/api/v1/artifacts/'
    raw = data(prefix + '/volume-round')
    cad = data(prefix + '/cad-route')
    decision = cad['route']['decision']
    assert raw['status'] == 'completed' and decision['method'] == 'agent'
    assert raw['step_sha256'] == decision['step_sha256']

    # Keep the shipped, reduced NSI data and replace the saved calculation and equipment.
    baseline = json.loads((DEMO / 'responses.json').read_text('utf-8'))
    responses = {path: value for path, value in baseline.items() if path.startswith('/api/v1/nsi/')}
    for path in ('equipment', 'equipment-configurator', 'equipment/hourly-rates', 'equipment/exchange/registry',
                 'settings/agents', 'settings/agents/models', 'calculation/settings', 'calculation/bar-lengths',
                 'nsi/cut-norms', 'estimation/profiles'):
        url = '/api/v1/' + path
        responses[url] = data(url)
    for mode in ('cad_route', 'volume_round', 'compact_round'):
        url = '/api/v1/settings/agents/roles?pipeline_mode=' + mode
        responses[url] = data(url)
    for machine in responses['/api/v1/equipment']['machines']:
        url = '/api/v1/equipment/passports/' + machine['machine_id']
        responses[url + '/exchange'] = data(url + '/exchange')
        responses[url + '/history'] = []
    for kind in ('lathe', 'bandsaw', 'drill', 'mill', 'grinder', 'generic'):
        url = '/api/v1/equipment/exchange/templates/' + kind
        responses[url] = data(url)

    drawing = raw['source_artifact_id']
    assert digest(asset(artifact + drawing, 'demo/drawing.pdf')) == raw['source_sha256']
    asset(artifact + drawing + '/preview', 'demo/drawing.png')
    stored = raw['artifacts']
    asset(artifact + stored['rough_step'], 'demo/rough.step')

    accepted = raw['model_revision']
    models = []
    for model in cad['route']['models']:
        revision = model['revision']
        view = f'{prefix}/cad-route/models/{revision}/view/'
        slug = f'shaft-v{revision}'
        directory = f'models/{slug}'
        step = asset(view + 'model.step', directory + '/model.step')
        checksum = digest(step)
        assert checksum == model['step_sha256']
        inspection = json.loads(asset(view + 'inspection.json', directory + '/inspection.json'))
        for name in [inspection['mesh_file'], *(part['mesh_file'] for part in inspection.get('cutaways', []))]:
            assert Path(name).name == name
            asset(view + name, directory + '/' + name)
        config = data(view + 'preview-config.json')
        assert config['annotations']['step_sha256'] == checksum
        config = select(config, 'title subtitle annotations annotationsWarning model_notes')
        config.update(home_url=f'../../#/runs/{run}', chat_model=None, modelNavigation=[],
                      download={'available': True, 'name': slug + '.step', 'bytes': len(step),
                                'sha256': checksum, 'url': 'model.step'})
        dump(PUBLIC / directory / 'preview-config.json', clean(config))
        if revision == accepted:
            files[artifact + stored['final_step']] = directory + '/model.step'
            models.append({'slug': slug, 'title': raw['title'], 'subtitle': f'Модель {revision} · принята в расчёт',
                           'stepBytes': len(step), 'dimensions': len(config['annotations'].get('dimensions', [])),
                           'limitations': model['limitations']})

    passports = [raw['passport'], cad['geometry_passport']]
    accepted_view = f'{prefix}/cad-route/models/{accepted}/view/'
    for passport in passports:
        for issue in passport.get('issues', []):
            for crop in issue.get('crops', []):
                url = crop.get('url')
                if url and url.startswith(artifact):
                    asset(url, f'demo/crops/{url.rsplit("/", 1)[-1]}.png')
                else:
                    name = crop['file']
                    assert Path(name).name == name and name.endswith('.png')
                    asset(accepted_view + name, f'models/shaft-v{accepted}/{name}')

    basis_url = prefix + '/volume-round/basis'
    files[basis_url] = 'demo/calculation-basis.md'
    files[artifact + stored['report']] = 'demo/route-and-estimate.md'

    def markdown(text):
        def replace(match):
            label, url = match.groups()
            file = files.get(url.split('?')[0])
            if not file:
                return label
            relative = file.removeprefix('demo/') if file.startswith('demo/') else '../' + file
            return f'[{label}]({relative})'
        return clean(re.sub(r'\[([^\]]*)\]\((/api/v1/[^)\s]+)\)', replace, text))

    save(files[basis_url], markdown(get(basis_url).decode('utf-8')).encode('utf-8'))
    save(files[artifact + stored['report']], markdown(get(artifact + stored['report']).decode('utf-8')).encode('utf-8'))

    state = select(raw, 'schema pipeline run_id revision status stage title filename source_artifact_id source_sha256 '
                   'model_revision step_sha256 decision quantity quantity_basis models steps warnings viewer_ready '
                   'stage_started_at volumes passport material_reference stock planning_stock operations_markdown '
                   'rough_basis model_notes planning_volumes planning_volume_issue cost_estimate calculation_basis message')
    state['artifacts'] = select(stored, 'report final_step rough_step')
    stock = raw['stock_selection']
    state['stock_selection'] = {
        **select(stock, 'warnings batch_plan_stale batch_plan_quantity'),
        'prescription': select(stock.get('prescription') or {}, 'prescription_status prescription_raw'),
        'evaluation': select(stock.get('evaluation') or {}, 'status limitations'),
        'recommendation': {'selected': select((stock.get('recommendation') or {}).get('selected') or {}, 'diameter_mm') or None},
    }
    time = raw['time_estimate']
    state['time_estimate'] = select(time, 'status quantity groups conditions unestimated_work issues operator_issues '
                                    'scenario_limitations estimated_machine_cycles planning_assumptions failure_kind '
                                    'scope excluded_work basis_quantity totals known_groups')
    state['time_estimate']['groups'] = [select(group, 'name equipment rate_class per_piece_minutes '
                                             'setup_per_batch_minutes basis assumptions known_per_piece_minutes '
                                             'known_setup_per_batch_minutes calculation_explanation') for group in time['groups']]
    state['calculation_locked'] = True

    cad_demo = select(cad, 'sequence title source_file quantity quantity_basis originals viewer_ready cad_events geometry_passport')
    cad_demo['route'] = select(cad['route'], 'run_id revision phase mode input_mode models message decision decisions review_count repair_count')
    for model in cad_demo['route']['models']:
        model['model_url'] = f'models/shaft-v{model["revision"]}/viewer.html'
    cad_demo['review'] = {**select(cad['review'], 'status model_revision step_sha256 summary findings limitations'), 'viewed': []}
    cad_demo['jobs'] = {jobid: select(job, 'id action status created_at started_at finished_at published_revision model_revision cancel_requested message')
                        for jobid, job in cad['jobs'].items()}
    cad_demo['calculations'] = [{**select(cad['calculations'][-1], 'model_revision quantity step_sha256'),
                                 'artifacts': state['artifacts']}]
    cad_demo['downstream'] = state

    run_info = select(data(prefix)['run'], 'id document_id parent_run_id trigger_type status started_at finished_at current_stage created_at')
    run_info.update(project_id='1', root_span_id=None)
    project = {'id': 1, 'name': 'Демонстрационный проект', 'customer': 'Обработка вала', 'status': 'approved',
               'deleted_at': None, 'created_at': run_info['created_at']}
    responses.update({'/api/v1/projects': [project], '/api/v1/projects/trash': [], '/api/v1/projects/1/runs': [run_info],
                      '/api/v1/runs': [run_info], '/api/v1/providers': [], prefix: {'run': run_info, 'artifacts': [], 'spans': [], 'events': []},
                      prefix + '/family': [run_info], prefix + '/cad-route': cad_demo, prefix + '/volume-round': state,
                      prefix + '/compact-round': None})

    events = []
    before = None
    while True:
        page = data(prefix + '/events?limit=500' + (f'&before_sequence={before}' if before else ''))
        for event in page['events']:
            if event['event_type'] in {'llm.started', 'llm.completed', 'llm.failed', 'run.started', 'run.completed'}:
                events.append({**select(event, 'id sequence_no run_id span_id event_type timestamp'),
                               'payload': select(event.get('payload') or {}, 'name stage')})
        previous, before = before, page['next_before_sequence']
        if before is None:
            break
        assert before != previous
    responses[prefix + '/events'] = {'events': events, 'next_before_sequence': None}

    dump(DEMO / 'events.json', events)
    dump(DEMO / 'models.json', clean(models))
    dump(DEMO / 'assets.json', files)
    dump(DEMO / 'responses.json', clean(responses))
    dump(DEMO / 'manifest.json', {
        'schema': 'metall-demo/2', 'run_id': run, 'state_revision': state['revision'], 'model_revision': accepted,
        'drawing_sha256': state['source_sha256'], 'step_sha256': state['step_sha256'], 'quantity': state['quantity'],
        'time_minutes': time['totals']['batch_minutes'], 'assessed_cost_rub': state['cost_estimate']['known_batch_rub'],
        'files': {file.relative_to(PUBLIC).as_posix(): digest(file.read_bytes())
                  for directory in (DEMO, *(PUBLIC / 'models' / f'shaft-v{m["revision"]}' for m in cad['route']['models']))
                  for file in directory.rglob('*') if file.is_file() and file.name != 'manifest.json'
                  and file.suffix in {'.json', '.step', '.jpg', '.png', '.pdf', '.md'}},
    })
    print(f'Exported completed run {run}, revision {state["revision"]}, model {accepted}.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', required=True)
    parser.add_argument('--api', default='http://127.0.0.1:5173')
    args = parser.parse_args()
    url = urlsplit(args.api)
    if url.hostname not in {'localhost', '127.0.0.1', '::1'} or url.scheme != 'http':
        parser.error('--api must be a local HTTP origin')
    if not re.fullmatch(r'[0-9a-f-]{36}', args.run):
        parser.error('--run must be a valid run identifier')
    export(args.api.rstrip('/'), args.run)
