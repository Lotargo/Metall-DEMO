import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Download, FileDown, Maximize2 } from 'lucide-react';
import type { CadRouteState } from '@/api/hooks/useCadRoute';
import type { GeometryDimension, VolumeState } from '@/api/hooks/useVolumeRound';
import { useCancelRun } from '@/api/hooks/useRuns';
import { getArtifactUrl } from '@/api/client';
import { demoModelFile, demoModelSource } from '@/demo/config';
import { WorkspaceDrawing } from '@/components/drawing/WorkspaceDrawing';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Tabs } from '@/components/ui/Tabs';
import { GeometryRecognitionProgress } from '@/components/trace/GeometryRecognitionProgress';
import { geometryRunLabel } from '@/utils/geometryProgress';
import { GeometryDescription, GeometryPassport } from './GeometryPassport';
import { ModelInspectionDialog } from './ModelInspectionDialog';
import { VolumeSummary } from './VolumeSummary';
import { PlanningAssumptions, VolumeEstimate } from './VolumeEstimate';
import { GeometryRouteDocument } from './GeometryRouteDocument';
import { GeometryBasisDocument } from './GeometryBasisDocument';
import { dimensionKey, operatorText, formatNumber, passportMatchesModel, passportRows, uniqueNotes, timeIssueMessages } from './geometryPresentation';
import './CompactRoundWorkspace.css';
import './volume-round.css';
import './run-documents.css';
import './geometry-documents.css';

const panels = [
  { id: 'description', label: 'Описание детали' }, { id: 'passport', label: 'Технический паспорт' },
  { id: 'stock', label: 'Заготовка' }, { id: 'route', label: 'Полный маршрут' },
  { id: 'estimate', label: 'Смета' }, { id: 'basis', label: 'Основания расчёта' }, { id: 'history', label: 'История' },
];
const cutLength = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 });

export function GeometryRunWorkspace({ state, document, cad, modelControls, onModelReady, runActions, actionBusy }: {
  state: VolumeState; document?: 'route' | 'estimate'; cad?: CadRouteState;
  modelControls?: ReactNode; onModelReady?: (ready: boolean) => void;
  runActions?: ReactNode; actionBusy?: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient(), cancel = useCancelRun();
  const [tabsElement, setTabsElement] = useState<HTMLDivElement | null>(null);
  const [inlineDrawing, setInlineDrawing] = useState<HTMLDivElement | null>(null);
  const [conditions, setConditions] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [selectionKey, setSelectionKey] = useState<string>();
  const header = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = header.current, workspace = element?.parentElement;
    if (!element || !workspace) return;
    const measure = () => {
      workspace.style.setProperty('--geometry-header-height', `${element.offsetHeight}px`);
      workspace.style.setProperty('--geometry-tabs-height', `${tabsElement?.offsetHeight ?? 0}px`);
    };
    measure(); const observer = new ResizeObserver(measure); observer.observe(element);
    if (tabsElement) observer.observe(tabsElement);
    return () => observer.disconnect();
  }, [tabsElement]);
  const requested = document || params.get('tab') || (cad?.route.phase === 'awaiting_review' ? 'passport' : 'description');
  const tab = requested === 'model' ? 'passport' : requested === 'full-route' ? 'route' : panels.some(item => item.id === requested) ? requested : 'description';
  const model = cad?.route.models.at(-1);
  const phase = cad?.route.phase ?? state.status;
  const active = !['completed', 'failed', 'interrupted', 'cancelled'].includes(phase);
  const stage = geometryRunLabel(state, cad);
  const timeFailure = state.time_estimate?.failure_kind ? timeIssueMessages(state.time_estimate).join(' ') : '';
  const source = model && cad?.viewer_ready ? demoModelSource(state.run_id, model.revision)
    : state.viewer_ready ? (state.preview_url ?? `/api/v1/runs/${state.run_id}/volume-round/view/viewer.html`).replace(/viewer\.html$/, '') : undefined;
  const sha = model?.step_sha256 ?? state.step_sha256 ?? state.passport?.step_sha256;
  const sameModel = passportMatchesModel(state, model);
  const currentPassport = cad?.geometry_passport?.schema === 'metall-engineering-passport/1'
    ? cad.geometry_passport : sameModel && state.passport ? state.passport : cad?.geometry_passport;
  const passportState = { ...state, model_revision: model?.revision ?? state.model_revision, step_sha256: sha,
    passport: currentPassport ? { condition: '', requirements: [], unknowns: [], unmatched_requirements: [], other_geometry_dimensions: [], ...currentPassport } : undefined };
  const measured = passportRows(passportState, cad?.geometry_passport?.dimensions);
  const selection = [...measured.main, ...measured.extra].find(row => `${source}:${dimensionKey(row)}` === selectionKey);
  const selectDimension = (row?: GeometryDimension) => { setSelectionKey(row ? `${source}:${dimensionKey(row)}` : undefined); setModelOpen(true); };
  const notes = [
    ...uniqueNotes(model?.limitations ?? state.model_notes ?? []).map(text => ({ text, context: model ? '3D-геометрия' : 'Подготовка модели' })),
    ...uniqueNotes(cad?.review?.model_revision === model?.revision ? cad?.review?.findings ?? [] : []).map(text => ({ text, context: 'Проверка по чертежу' })),
  ];
  const changeTab = (id: string) => {
    if (document) { navigate(`/runs/${state.run_id}?tab=${id}`); return; }
    setParams(previous => { const next = new URLSearchParams(previous); next.set('tab', id); return next; });
    tabsElement?.closest('.app-main')?.scrollTo({ top: 0 });
  };
  const download = model && source ? `${source}model.step` : state.artifacts.final_step ? getArtifactUrl(state.artifacts.final_step) : undefined;
  const cancelRun = () => cancel.mutate({ runId: state.run_id }, { onSettled: () => {
    void client.invalidateQueries({ queryKey: ['cad-route', state.run_id] });
    void client.invalidateQueries({ queryKey: ['volume-round', state.run_id] });
  } });
  return <article className="compact-round-workspace geometry-workspace flex min-w-0 flex-col bg-canvas text-ink">
    <header ref={header} className="geometry-run-header">
      <div className="min-w-0"><Link to="/projects" className="text-sm text-accent">← Проекты</Link>
        <h1>{state.title || state.filename}</h1>
        <p role="status">{stage ?? 'Расчёт'}{model && ` · Модель ${model.revision}`}</p>
        <GeometryRecognitionProgress state={state} cad={cad} onReview={() => changeTab('passport')} onCancel={cancelRun} cancelling={cancel.isPending} disabled={actionBusy} />
      </div>
      <div className="geometry-header-actions">
        {(download || state.artifacts.report) && <div className="geometry-download-actions" role="group" aria-label="Скачать результаты">
          {download && <a className="ui-button ui-button--outline ui-button--size-sm geometry-download-button" href={download} download><Download size={16} aria-hidden="true" />Скачать STEP</a>}
          {state.artifacts.report && <a className="ui-button ui-button--outline ui-button--size-sm geometry-download-button" href={getArtifactUrl(state.artifacts.report)} download aria-label="Скачать маршрут и расчёт"><FileDown size={16} aria-hidden="true" />Маршрут и расчёт</a>}
        </div>}
        {source && sha && <div className="geometry-model-thumbnail"><img src={`${source}preview.jpg`} alt="" />
          <button type="button" aria-label="Открыть 3D-модель и паспорт" aria-haspopup="dialog" onClick={() => setModelOpen(true)}><span>3D-модель</span><Maximize2 size={15} aria-hidden="true" /></button>
        </div>}
        <WorkspaceDrawing artifactId={cad?.originals.drawing?.artifact_id ?? state.source_artifact_id} pending={active} tabs={tabsElement} inlineTarget={inlineDrawing} tab={tab} visit={location.key} />
        <Button variant="outline" size="sm" onClick={() => { void client.invalidateQueries({ queryKey: ['cad-route', state.run_id] }); void client.invalidateQueries({ queryKey: ['volume-round', state.run_id] }); }}>Обновить</Button>
        {active && <Button variant="outline" size="sm" loading={cancel.isPending} disabled={actionBusy} onClick={cancelRun}>Отменить обработку</Button>}
      </div>
    </header>
    <div className="compact-work-area geometry-work-area">
      <div className="compact-workspace-nav" ref={setTabsElement}><Tabs id="geometry-run-tabs" aria-label="Разделы результата" items={panels} activeId={tab} onChange={changeTab} layout="scroll" /></div>
      {active && <div className="geometry-run-progress" role="status"><span>{stage}</span>{state.steps.length > 0 && <span>Этапов выполнено: {state.steps.filter(item => item.status === 'completed').length}</span>}{phase === 'awaiting_review' && tab !== 'passport' && <Button size="sm" onClick={() => changeTab('passport')}>Проверить модель</Button>}</div>}
      {(cancel.error || phase === 'failed' || phase === 'interrupted') && <p role="alert" className="geometry-run-notice">{operatorText(cancel.error?.message || timeFailure || cad?.route.message || state.message, 'Обработка остановлена. Сохранённый результат доступен; причину можно уточнить в чате.')}</p>}
      {state.results_stale && <p role="status" className="geometry-run-notice">Модель изменена. Расчёт сохранён для версии {state.model_revision} и требует обновления.</p>}
      {runActions}
      <div className="geometry-work-layout">
        <div className={`geometry-main-panel${['route', 'estimate', 'basis'].includes(tab) ? ' geometry-document-panel' : ''}`} role="tabpanel" id={`geometry-run-tabs-panel-${tab}`} aria-labelledby={`geometry-run-tabs-tab-${tab}`} tabIndex={0}>
          {tab === 'description' && <GeometryDescription state={passportState} fallback={cad?.geometry_passport?.dimensions} drawingTarget={setInlineDrawing} />}
          {tab === 'passport' && <GeometryPassport key={source ?? 'pending'} state={passportState} fallback={cad?.geometry_passport?.dimensions} selection={selection} onSelect={source && sha ? selectDimension : undefined} notes={notes} controls={modelControls} />}
          {tab === 'stock' && <div className="space-y-5"><h2>Заготовка</h2>
            <section className="compact-workspace-card space-y-3"><h3>Активная заготовка</h3>
              {state.stock ? <><p className="geometry-stock-size">Круг Ø{formatNumber(state.stock.diameter_mm)} × {cutLength.format(state.stock.cut_length_mm)} мм</p><p>{operatorText(state.stock.basis)}</p></> : <p>{state.stock_selection?.evaluation?.status === 'no_match' ? 'Подбор отклонил заготовку по условиям пригодности.' : 'Заготовка ещё не определена.'}</p>}
              {state.stock_selection?.prescription?.prescription_raw && <p><strong>Назначение чертежа:</strong> {operatorText(state.stock_selection.prescription.prescription_raw)}</p>}
              {state.stock_selection?.recommendation?.selected && <p><strong>Нормативная рекомендация:</strong> Ø{state.stock_selection.recommendation.selected.diameter_mm} мм</p>}
              {state.stock_selection?.batch_plan_stale && <p>План закупки относится к прежней партии {state.stock_selection.batch_plan_quantity} шт.</p>}
            </section>
            {!!state.stock_selection?.evaluation?.limitations?.length && <section className="geometry-requirements"><h3>Условия применимости</h3><ul>{uniqueNotes(state.stock_selection.evaluation.limitations).map((note, i) => <li key={i}>{note}</li>)}</ul></section>}
            {state.planning_stock && <section className="compact-workspace-card space-y-3"><h3>Отдельный предварительный вариант</h3><p className="geometry-stock-size">Круг Ø{formatNumber(state.planning_stock.diameter_mm)} × {cutLength.format(state.planning_stock.cut_length_mm)} мм</p><p>{operatorText(state.planning_stock.basis)}</p>
              <PlanningAssumptions items={state.planning_stock.assumptions} />
              {state.planning_volumes && <dl className="volume-totals">{Object.entries({ stock_mm3: 'Заготовка', rough_removed_mm3: 'Черновой съём', finish_removed_mm3: 'Чистовой съём', total_removed_mm3: 'Общий съём' }).map(([key, label]) => <div key={key}><dt>{label}, см³</dt><dd>{state.planning_volumes?.[key] == null ? 'Не определён' : formatNumber(state.planning_volumes[key]! / 1000)}</dd></div>)}</dl>}
              {state.planning_volume_issue && <p>{operatorText(state.planning_volume_issue)}</p>}
            </section>}
          </div>}
          {tab === 'route' && <GeometryRouteDocument state={state} />}
          {tab === 'estimate' && <VolumeEstimate key={state.revision} state={state} editable={state.status === 'completed' && !state.results_stale && !state.calculation_locked} />}
          {tab === 'basis' && <GeometryBasisDocument state={state} />}
          {tab === 'history' && <div className="space-y-5"><h2>История работы</h2>
            {cad?.route.decision && <p>В расчёт принята модель {cad.route.decision.accepted_revision}. {cad.route.decision.kind === 'user' ? 'Подтверждена оператором.' : cad.route.decision.kind === 'agent_no_findings' ? 'Просмотрена агентом.' : 'Исправлена после просмотра. Повторный просмотр не выполнялся.'}</p>}
            {cad?.review && <section className="geometry-requirements"><h3>Результат просмотра модели {cad.review.model_revision}</h3><ul>{uniqueNotes([...cad.review.findings, ...cad.review.limitations]).map((item, i) => <li key={i}>{item}</li>)}</ul></section>}
            {!!cad?.route.models.length && <section className="geometry-requirements"><h3>Версии модели</h3><ul>{cad.route.models.map(item => <li key={item.revision}>Модель {item.revision} · <a className="text-accent underline" href={demoModelFile(state.run_id, item.revision)} download>Скачать STEP</a></li>)}</ul></section>}
            {!!cad?.calculations?.length && <section className="geometry-requirements"><h3>Сохранённые расчёты</h3><ul>{cad.calculations.map((item, i) => <li key={i}>Модель {item.model_revision} · {item.quantity} шт. {item.artifacts.report && <a className="text-accent underline" href={getArtifactUrl(item.artifacts.report)} target="_blank" rel="noreferrer">Открыть отчёт</a>}</li>)}</ul></section>}
            {!!state.steps.length && <section className="geometry-requirements"><h3>Выполненные этапы</h3><ul>{state.steps.map((item, i) => <li key={i}>{operatorText(item.title)} · {formatNumber(item.seconds)} с</li>)}</ul></section>}
            {!!state.warnings.length && <Button size="sm" variant="outline" onClick={() => setConditions(true)}>Условия расчёта · {state.warnings.length}</Button>}
          </div>}
        </div>
        {['stock', 'route'].includes(tab) && <VolumeSummary state={state} showTime={tab === 'route'} />}
      </div>
    </div>
    {source && sha && modelOpen && <ModelInspectionDialog key={source} open onClose={() => setModelOpen(false)} source={source} sha={sha}
      state={passportState} fallback={cad?.geometry_passport?.dimensions} selection={selection} onSelect={selectDimension} onReady={onModelReady} controls={modelControls} notes={notes} />}
    <Modal isOpen={conditions} onClose={() => setConditions(false)} title="Условия расчёта"><ul className="volume-notes">{uniqueNotes(state.warnings).map((item, i) => <li key={i}>{item}</li>)}</ul></Modal>
  </article>;
}
