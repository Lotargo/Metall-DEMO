import { InfoBlock } from '@/components/ui/InfoBlock';
import { useEffect, useState } from 'react';
import { Box, Crosshair, FileImage } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { apiClient } from '@/api/client';
import type { components } from '@/api/schema';
import { useCompactRound } from '@/api/hooks/useCompactRound';
import { useProcessingJournal } from '@/api/hooks/useProcessingJournal';
import { useCancelRun, useRunSnapshot } from '@/api/hooks/useRuns';
import { CompactMaterialEvidence, CompactPhysicalMaterialEvidence } from '@/components/route/CompactMaterialEvidence';
import { CompactStockRecognition, isRoundReading, updateRoundReading } from '@/components/route/CompactStockSelection';
import { asRecord as record, formatNumber as numeric, formatText as text } from '@/utils/compactNumbers';
import { WorkspaceDrawing } from '@/components/drawing/WorkspaceDrawing';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Tabs } from '@/components/ui/Tabs';
import { WorkspacePanel, workspaceTabs } from './WorkspaceSections';
import { CompactRecognitionProgress } from '@/components/trace/CompactRecognitionProgress';
import { uploadStartedAt } from '@/utils/processingTimer';
import { passportExplanation } from '@/utils/compactDrawingEvidence';
import { publicSourceText } from '@/utils/publicSource';
import { runDocumentLink } from '@/utils/runDocumentLinks';
import { CompactClarifications } from '@/components/route/CompactClarifications';
import { CompactStockChoice, stockChoiceView } from '@/components/route/CompactStockChoice';
import { CompactStockResult } from '@/components/route/CompactStockResult';
import { CompactMaterialSupplySettings } from '@/components/route/CompactMaterialSupplySettings';
import { CompactPreliminaryRouteTable } from '@/components/route/CompactPreliminaryRouteTable';
import { CompactProcessingPassport, cartesianRolesChanged, type ProcessingPassport } from '@/components/route/CompactProcessingPassport';
import { CompactGeometryEditor } from '@/components/route/CompactGeometryEditor';
import { CompactTechnicalPassport, type PassportBlock } from '@/components/route/CompactTechnicalPassport';
import './CompactRoundWorkspace.css';
import type { ClarificationPanel, NumericFactTarget } from '@/components/route/CompactClarificationTaskContext';

type State = components['schemas']['CompactState'];
type Reading = components['schemas']['CompactReading-Output'];
const stages: Record<State['status'], string> = {
  reading: 'Чтение чертежа', checking: 'Перепроверка распознавания', preliminary: 'Подготовка предварительной карты', review: 'Проверьте паспорт и маршрут',
  resolving: 'Поиск ответов на вопросы', detailing: 'Подробная проработка и расчёт', ready: 'Результат детализации', failed: 'Обработка остановлена', unsupported: 'За пределами текущего этапа', cancelled: 'Обработка отменена',
};
const fieldClass = 'w-full rounded-md border border-control bg-surface px-3 py-2 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';
const td = 'py-3 pr-4 align-top text-sm whitespace-pre-wrap';
const th = 'py-2 pr-4 text-left text-sm font-medium text-ink-secondary';
function errorText(error: unknown) {
  if (error instanceof Error) return publicSourceText(error.message, 'Не удалось выполнить действие. Обновите данные.');
  const detail = record(error).detail;
  if (Array.isArray(detail)) return 'Проверьте заполнение числовых полей паспорта. Для неизвестного числа оставьте поле пустым.';
  return typeof detail === 'string' ? publicSourceText(detail, 'Не удалось выполнить действие. Обновите данные.') : 'Не удалось выполнить действие. Обновите данные.';
}

function DescriptionText({ value }: { value: string }) {
  const paragraphs: string[] = [];
  for (const block of value.split(/\n+/u).filter(part => part.trim())) {
    let paragraph = '';
    for (const sentence of block.split(/(?<=[.!?])\s+(?=[А-ЯЁA-ZØ])/u)) {
      if (paragraph && paragraph.length + sentence.length > 380) {
        paragraphs.push(paragraph);
        paragraph = '';
      }
      paragraph += `${paragraph ? ' ' : ''}${sentence.trim()}`;
    }
    if (paragraph) paragraphs.push(paragraph);
  }
  return <div className="part-description-prose">{paragraphs.map((paragraph, index) =>
    <p key={index}>{paragraph}</p>)}</div>;
}


function restoreUnchangedEvidence(current: unknown, original: unknown, preserveBasisSource: boolean, path = ''): unknown {
  if (Array.isArray(current)) return current.map((item, index) => restoreUnchangedEvidence(item, Array.isArray(original) ? original[index] : undefined, preserveBasisSource, `${path}/${index}`));
  if (current === null || typeof current !== 'object' || original === null || typeof original !== 'object') return current;
  const previous = record(original);
  const result = Object.fromEntries(Object.entries(current).map(([key, item]) => [key, restoreUnchangedEvidence(item, previous[key], preserveBasisSource, `${path}/${key}`)]));
  const keys = Object.keys(result).filter(key => key !== 'source' && key !== 'basis');
  if (typeof result.source === 'string' && !(path === '/round_basis' && preserveBasisSource)
    && keys.length > 0 && Object.keys(result).length === Object.keys(previous).length
    && keys.every(key => JSON.stringify(result[key]) === JSON.stringify(previous[key]))) return original;
  return result;
}

function cartesianRoleSource(reading: Reading | null, bore: ProcessingPassport['through_bore']) {
  if (!reading) return '';
  const { diameter_mm, diameter_upper_deviation_mm, length_mm, length_upper_deviation_mm, source } = reading.round_basis;
  return JSON.stringify([
    reading.dimensions, reading.views_and_datums,
    diameter_mm, diameter_upper_deviation_mm, length_mm, length_upper_deviation_mm, source, bore,
  ]);
}

export function CompactRoundWorkspace({ runId, state }: { runId: string; state: State }) {
  const journal = useProcessingJournal(runId);
  const query = useCompactRound(runId, journal.connection === 'error');
  const snapshot = useRunSnapshot(runId, false);
  const queryClient = useQueryClient();
  const cancel = useCancelRun();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const tab = workspaceTabs.find(item => item.id === searchParams.get('tab'))?.id ?? 'description';
  const [draft, setDraft] = useState<Reading | null>(null);
  const [editScope, setEditScope] = useState<PassportBlock | 'all'>('all');
  const [processingDraft, setProcessingDraft] = useState<ProcessingPassport | null>(null);
  const [confirmedRoleBasis, setConfirmedRoleBasis] = useState<string | null>(null);
  const [editRevision, setEditRevision] = useState(0);
  const [minimumDiameter, setMinimumDiameter] = useState('');
  const [comment, setComment] = useState('');
  const [decision, setDecision] = useState('');
  const [checkedRevision, setCheckedRevision] = useState<number | null>(null);
  const [restartDetails, setRestartDetails] = useState(false);
  const [basisSourceEdited, setBasisSourceEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [openQuestions, setOpenQuestions] = useState<number | null>(null);
  const [numericTarget, setNumericTarget] = useState<NumericFactTarget | null>(null);
  const [inlineDrawing, setInlineDrawing] = useState<HTMLDivElement | null>(null);
  const [tabsElement, setTabsElement] = useState<HTMLDivElement | null>(null);
  const value = query.data ?? state;
  const pageCount = value.image_artifact_id ? 1 : undefined;
  const cleanDraft = draft && value.reading ? restoreUnchangedEvidence(draft, value.reading, basisSourceEdited) as Reading : draft;
  const reading = draft ?? value.reading;
  const savedProcessing = value.processing_passport ?? null;
  const passportProcessing = draft ? processingDraft : savedProcessing;
  const milling = passportProcessing?.kind === 'milling';
  const draftRoleSource = cartesianRoleSource(cleanDraft, processingDraft?.through_bore);
  const changedRoleSource = draft !== null && draftRoleSource !== cartesianRoleSource(value.reading, savedProcessing?.through_bore);
  const needsRoleConfirmation = draft !== null && cartesianRolesChanged(processingDraft, savedProcessing, changedRoleSource);
  const roleBasis = needsRoleConfirmation ? JSON.stringify([
    processingDraft?.kind, processingDraft?.x, processingDraft?.y, processingDraft?.z,
    draftRoleSource,
  ]) : null;
  const rolesConfirmed = roleBasis !== null && confirmedRoleBasis === roleBasis;
  const hasEnvelope = !!reading && ((draft !== null && numericTarget !== null) || isRoundReading(reading) || (['diameter_mm', 'diameter_upper_deviation_mm', 'length_mm', 'length_upper_deviation_mm'] as const).some(key => reading.round_basis[key] != null));
  const processing = ['reading', 'checking', 'resolving', 'preliminary', 'detailing'].includes(value.status);
  const stage = processing ? journal.stage ?? (value.status === 'reading' && !value.image_artifact_id ? 'Подготовка чертежа' : stages[value.status])
    : value.status === 'review' && value.route && !value.stock_proposal && !value.details.length ? 'Ожидается подтверждение маршрута' : stages[value.status];
  const startedAt = uploadStartedAt(runId, snapshot.data?.run.created_at);
  const stopped = value.status === 'cancelled';
  const selected = record(stockChoiceView(value).geometry);
  const profile = record(value.material_properties.profile);
  const confirmation = record(value.confirmation);
  const hasDetailedResult = value.details.length > 0;
  const quantityReview = value.quantity_review;
  const referenceOnly = quantityReview?.impact === 'dependent';
  const hasRouteQuestions = !!value.route && (value.route.questions.length > 0 || value.route.operations.some(operation => operation.questions.length > 0));
  const editingPassport = draft !== null;
  const globalDraft = editScope === 'all' ? draft : null;
  const canEditReading = !busy && !processing && !stopped && !value.calculation_pending;
  useEffect(() => {
    const tabs = tabsElement;
    const viewport = tabs?.closest<HTMLElement>('.app-main');
    if (!tabs || !viewport) return;
    const updateScrollPadding = () => viewport.style.setProperty('--compact-tabs-height', `${tabs.offsetHeight + 8}px`);
    updateScrollPadding();
    const observer = new ResizeObserver(updateScrollPadding);
    observer.observe(tabs);
    return () => {
      observer.disconnect();
      viewport.style.removeProperty('--compact-tabs-height');
    };
  }, [tabsElement]);
  useEffect(() => {
    if (!['estimate', 'material'].includes(tab) || !location.hash.startsWith(`#${tab}-`)) return;
    const anchor = [...document.querySelectorAll<HTMLElement>(`#compact-round-tabs-panel-${tab} [id^="${tab}-"]`)]
      .find(element => `#${encodeURIComponent(element.id)}` === location.hash);
    anchor?.focus();
    anchor?.scrollIntoView({ block: 'nearest' });
  }, [tab, location.hash]);
  useEffect(() => {
    if (!numericTarget || !editingPassport) return;
    const field = document.getElementById(`compact-numeric-${numericTarget}`);
    field?.focus();
    field?.scrollIntoView({ block: 'nearest' });
  }, [numericTarget, tab, editingPassport]);
  function setTab(panel: string, anchor?: string) {
    if (panel === 'estimate' || panel === 'full-route') {
      if (draft) { setError('Сохраните или отмените правки данных детали перед переходом к документу.'); return; }
      navigate(runDocumentLink(runId, panel === 'estimate' ? 'estimate' : 'route', anchor));
      return;
    }
    const area = tabsElement?.parentElement;
    const viewport = area?.closest<HTMLElement>('.app-main');
    if (panel !== tab && area && viewport) {
      const offset = area.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
      if (offset < 0) viewport.scrollTop += offset;
    }
    setSearchParams(previous => {
      const next = new URLSearchParams(previous);
      next.set('tab', panel);
      return next;
    }, { replace: true });
  }

  function openContext(panel: ClarificationPanel, operationIndex?: number) {
    setTab(panel, operationIndex == null ? undefined : `compact-operation-${operationIndex}`);
  }
  function editNumericFact(target: NumericFactTarget) {
    if (!value.reading || milling || dirty || !canEditReading) return;
    startEdit(value.reading, target === 'prescribed_diameter_mm' ? 'all' : 'envelope');
    setNumericTarget(target); setTab(target === 'prescribed_diameter_mm' ? 'stock' : 'passport');
  }
  function startEdit(reading: Reading, scope: PassportBlock | 'all' = 'all') {
    setDraft(structuredClone(reading));
    setEditScope(scope);
    setProcessingDraft(savedProcessing);
    setConfirmedRoleBasis(null);
    setBasisSourceEdited(false);
    setEditRevision(value.revision);
    setMinimumDiameter(value.stock_constraint?.value ?? '');
  }
  const alternatives = Array.isArray(value.material_properties.alternatives)
    ? value.material_properties.alternatives.filter(item => ['analog', 'substitute'].includes(String(record(item).relation_kind)) && record(item).material_id !== value.material_properties.resolved_material_id) : [];
  const tech = record(profile.technological);
  const hardness = record(record(profile.condition).hardness);
  const hardnessText = hardness.value != null ? `${numeric(hardness.value)} ${text(hardness.scale)}`
    : hardness.min_value != null || hardness.max_value != null
      ? `${hardness.min_value != null ? `от ${numeric(hardness.min_value)} ` : ''}${hardness.max_value != null ? `до ${numeric(hardness.max_value)} ` : ''}${text(hardness.scale)}` : null;
  const materialRows = [
    ['Твёрдость по справочнику', hardnessText], ['Самозакаливаемость, конструктор', reading?.self_hardening],
  ].filter(([, content]) => content != null && content !== '');

  async function perform(action: () => Promise<{ error?: unknown }>) {
    if (draft && !dirty) setDraft(null);
    setBusy(true); setError('');
    try {
      const result = await action();
      if (result.error) throw new Error(errorText(result.error));
      setCheckedRevision(null);
      await query.refetch();
      return true;
    } catch (e) { setError(errorText(e)); return false; }
    finally { setBusy(false); }
  }
  async function save() {
    if (!draft || !canEditReading || needsRoleConfirmation && !rolesConfirmed) return;
    const ok = await perform(() => apiClient.PUT('/api/v1/runs/{run_id}/compact-round', {
      params: { path: { run_id: runId } }, body: {
        expected_revision: editRevision, reading: cleanDraft!, quantity: value.quantity,
        minimum_stock_diameter_mm: minimumDiameter === '' ? null : minimumDiameter.replace(',', '.'),
        processing_passport: processingDraft,
        confirm_cartesian_roles: rolesConfirmed,
      },
    }));
    if (ok) setDraft(null);
  }
  const dirty = draft !== null && (JSON.stringify(cleanDraft) !== JSON.stringify(value.reading)
    || JSON.stringify(processingDraft) !== JSON.stringify(savedProcessing)
    || minimumDiameter.replace(',', '.') !== (value.stock_constraint?.value ?? ''));
  const roleConfirmation = needsRoleConfirmation && <label className="flex items-start gap-2 rounded-md bg-surface-muted p-3 text-sm">
    <input type="checkbox" className="mt-1" checked={rolesConfirmed} onChange={event => setConfirmedRoleBasis(event.target.checked ? roleBasis : null)} />
    <span>Подтверждаю роли X, Y и Z по чертежу. Неустановленные роли оставляю пустыми.</span>
  </label>;
  function isEditing(block: PassportBlock) {
    return !!draft && (editScope === 'all' || editScope === block);
  }
  function passportActions(block: PassportBlock) {
    if (!reading || globalDraft) return block === 'processing' ? roleConfirmation : null;
    if (draft && editScope === block) return <div className="space-y-3">
      {roleConfirmation}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" loading={busy} disabled={!canEditReading || !dirty || needsRoleConfirmation && !rolesConfirmed} onClick={save}>Сохранить изменения</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => { setDraft(null); setError(''); }}>Отмена</Button>
      </div>
    </div>;
    return <Button size="sm" variant="outline" disabled={!canEditReading || !!draft} onClick={() => {
      setNumericTarget(null);
      setError('');
      startEdit(reading, block);
    }}>Редактировать</Button>;
  }
  const cancelProcessing = () => perform(() => cancel.mutateAsync({ runId, scope: 'family' }).then(() => ({})));
  function refreshWorkspace() {
    void query.refetch();
    void queryClient.invalidateQueries({ queryKey: ['compact-clarifications', runId], exact: true });
  }
  const emptyReading = processing ? 'Чтение чертежа ещё не завершено. Данные появятся после обработки.'
    : stopped ? 'Обработка отменена. Данные этого раздела не были сохранены.'
      : value.status === 'failed' ? 'Обработка остановилась до сохранения данных. Причина указана выше.'
        : 'Данные чертежа пока не получены.';
  return <div className="compact-round-workspace flex min-w-0 flex-col bg-canvas text-ink">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-surface px-4 py-4 sm:px-6">
      <div className="min-w-0 flex-[1_1_18rem]"><Link to="/projects" className="text-sm text-accent">← Проекты</Link>
        <h1 className="mt-1 break-words text-lg font-semibold">{value.reading?.part_name.text || 'Новый чертёж'}{value.reading?.designation.text ? ` · ${value.reading.designation.text}` : ''}</h1>
        <p role="status" className="mt-1 text-sm text-muted">{value.calculation_pending ? 'Пересчёт сохранённых входов' : quantityReview && value.status === 'review' ? 'Количество партии обновлено' : stage}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!!draft} onClick={() => setTab('full-route')}>Полный маршрут</Button>
        <Button variant="outline" disabled={!!draft} onClick={() => setTab('estimate')}>Смета</Button>
        <WorkspaceDrawing artifactId={value.image_artifact_id} pending={processing} tabs={tabsElement}
          inlineTarget={inlineDrawing} tab={tab} visit={location.key} />
        <Button variant="outline" onClick={refreshWorkspace} disabled={busy}>Обновить</Button>
        {processing && <Button variant="outline" loading={cancel.isPending} onClick={cancelProcessing}>Отменить обработку</Button>}
      </div>
    </header>
    <div className="border-b border-line bg-surface px-4 sm:px-6">
      <CompactRecognitionProgress key={runId} state={value} journal={journal} uploadStart={startedAt}
        onReview={() => setTab(value.route ? 'preliminary' : 'passport')}
        onCancel={cancelProcessing} cancelling={cancel.isPending} error={error} />
    </div>
    <section className="compact-work-area min-w-0 flex-1 px-4 pb-6 sm:px-6">
        <div ref={setTabsElement} className="compact-workspace-nav">
          <Tabs id="compact-round-tabs" aria-label="Рабочие данные" layout="wrap" items={workspaceTabs.filter(item => !['estimate', 'full-route'].includes(item.id)).map(item => item.id === 'questions' ? { ...item, count: openQuestions ?? undefined } : item)} activeId={tab} onChange={setTab} />
        </div>
        {(error || value.message && value.status !== 'ready' && !(quantityReview && value.status === 'review')) && <p role={error || value.status === 'failed' ? 'alert' : 'status'} className={`my-4 rounded-md p-3 text-sm ${error || value.status === 'failed' ? 'bg-warning-soft' : 'bg-surface-muted'}`}>{publicSourceText(error || value.message, 'Обработка требует проверки исходных данных.')}</p>}
        {query.error && <p role="alert" className="my-3 text-sm text-danger">Не удалось обновить состояние. {errorText(query.error)}</p>}
        {reading && (draft || ['description', 'passport', 'stock', 'material'].includes(tab)) && <div className="mt-4 space-y-2 border-b border-line pb-4">
          <div className="flex flex-wrap justify-between gap-3"><p className="text-sm font-medium">{dirty ? 'Есть несохранённые изменения' : draft ? 'Редактирование данных' : 'Данные чертежа'}</p>
            {!draft && <Button variant="outline" size="sm" disabled={!canEditReading} onClick={() => { setNumericTarget(null); startEdit(reading); }}>Исправить данные</Button>}
            {globalDraft && <div className="flex gap-2"><Button size="sm" loading={busy} disabled={!canEditReading || !dirty || needsRoleConfirmation && !rolesConfirmed} onClick={save}>Сохранить</Button><Button variant="outline" size="sm" disabled={busy} onClick={() => setDraft(null)}>Отмена</Button></div>}
            {draft && !globalDraft && tab !== 'passport' && <Button variant="outline" size="sm" onClick={() => setTab('passport')}>Вернуться к правке паспорта</Button>}
          </div>
          {dirty && <p className="text-sm text-muted">{milling
            ? 'Сохранение фрезерного паспорта отправит прежнюю карту и расчёты в историю. Для габаритов X, Y и Z автоматический подбор заготовки недоступен.'
            : 'Сохранение обновит подбор заготовки и снимет применимость прежней карты и расчётов.'}</p>}

          {draft && editRevision !== value.revision && <p role="alert" className="text-sm text-warning">Данные обновились после начала правки. Черновик сохранён на экране; сравните его с новой редакцией перед сохранением.</p>}
        </div>}
        <WorkspacePanel id="description" active={tab}>
          <h2 className="text-lg font-semibold">Описание детали</h2>
          <div className={value.image_artifact_id ? 'workspace-description-layout' : undefined}>
          <div className="part-description-copy">
          {reading ? <>
          <section className="compact-engineering-description part-description-card part-description-card--construction" aria-labelledby="compact-description-heading">
            <div className="part-description-card-heading">
              <span className="part-description-icon" aria-hidden="true"><Box size={21} /></span>
              <div><h3 id="compact-description-heading">Конструкция детали</h3><p>Форма, поверхности и элементы</p></div>
            </div>
            <div className="part-description-card-body">
              {globalDraft ? <><label htmlFor="compact-description" className="mb-2 block text-sm">Описание и базы</label><textarea id="compact-description" name="description" aria-describedby="compact-description-hint" className={fieldClass} rows={9} value={globalDraft.description} onChange={e => setDraft({ ...globalDraft, description: e.target.value })} /><p id="compact-description-hint" className="mt-2 text-sm text-muted">Связный текст: форма детали, основные поверхности и элементы, их взаимное расположение и существенные особенности по чертежу. Неустановленные назначение и технологию оставьте неизвестными.</p></> : <DescriptionText value={text(reading.description)} />}
            </div>
          </section>
          <section className="compact-engineering-description part-description-card" aria-labelledby="compact-datums-heading">
            <div className="part-description-card-heading">
              <span className="part-description-icon" aria-hidden="true"><Crosshair size={21} /></span>
              <div><h3 id="compact-datums-heading">Виды и базы</h3><p>Расположение и ориентирование</p></div>
            </div>
            <div className="part-description-card-body">
              {globalDraft ? <><label htmlFor="compact-datums" className="sr-only">Виды и связи с базами</label><textarea id="compact-datums" name="views_and_datums" className={fieldClass} rows={5} value={globalDraft.views_and_datums} onChange={e => setDraft({ ...globalDraft, views_and_datums: e.target.value })} /></> : <DescriptionText value={text(passportExplanation(reading.views_and_datums, pageCount))} />}
            </div>
          </section>

          </> : <p className="text-sm text-muted">{emptyReading}</p>}
          </div>
          {value.image_artifact_id && <section className="workspace-description-drawing part-description-card" aria-labelledby="workspace-source-sheet">
            <div className="part-description-card-heading">
              <span className="part-description-icon" aria-hidden="true"><FileImage size={21} /></span>
              <div><h3 id="workspace-source-sheet">Исходный чертёж</h3><p>Нажмите на изображение, чтобы увеличить</p></div>
            </div>
            <div className="part-description-drawing-body" ref={setInlineDrawing} />
          </section>}
          </div>
        </WorkspacePanel>
        <WorkspacePanel id="passport" active={tab}>
          <h2 className="text-lg font-semibold">Технический паспорт</h2>
          {reading ? <>
          <CompactProcessingPassport value={passportProcessing} editing={isEditing('processing')} pageCount={pageCount}
            onChange={setProcessingDraft} actions={passportActions('processing')} />
          <CompactTechnicalPassport reading={reading} isEditing={isEditing} actions={passportActions} onChange={setDraft}
            milling={milling} hasEnvelope={hasEnvelope} pageCount={pageCount} onEditBasisSource={() => setBasisSourceEdited(true)}>
            <CompactGeometryEditor state={value} busy={busy} pageCount={pageCount}
              unavailable={stopped ? 'Обработка отменена.' : processing || value.calculation_pending
                ? 'Дождитесь завершения обработки.' : draft ? 'Завершите текущую правку паспорта.' : null}
              onSave={body => perform(() => apiClient.POST('/api/v1/runs/{run_id}/compact-round/geometry/correction', {
                params: { path: { run_id: runId } }, body,
              }))} />
          </CompactTechnicalPassport>

          </> : <p className="text-sm text-muted">{emptyReading}</p>}
        </WorkspacePanel>
        <WorkspacePanel id="stock" active={tab}>
          <h2 className="text-lg font-semibold">Заготовка</h2>
          {reading ? <>
          <section className="space-y-3 text-sm">
            <h3 className="font-semibold">Данные заготовки на чертеже</h3>
            <CompactStockRecognition reading={reading} onChange={globalDraft ? setDraft : undefined} section="stock" pageCount={pageCount} />
            {globalDraft && !milling && isRoundReading(reading) && <div className="grid gap-3 sm:grid-cols-2">
              <Input id="compact-numeric-prescribed_diameter_mm" label="Назначенный диаметр проката, мм" inputMode="decimal" value={globalDraft.round_basis.prescribed_diameter_mm ?? globalDraft.recognized_parameters?.['stock.nominal_diameter']?.value ?? ''} onChange={e => setDraft(updateRoundReading(globalDraft, 'prescribed_diameter_mm', e.target.value))} />
              <Input label="Минимальный диаметр с учётом обработки, мм" inputMode="decimal" value={minimumDiameter} onChange={e => setMinimumDiameter(e.target.value)} helperText="Отдельное условие подбора заготовки. Габарит готовой детали сохраняется." />
            </div>}
          </section>
          {!milling && isRoundReading(reading) && <CompactStockChoice state={value} disabled={busy || dirty || processing || stopped || !!value.calculation_pending} onChoose={origin => { void perform(() => apiClient.POST('/api/v1/runs/{run_id}/compact-round/stock/choose', {
            params: { path: { run_id: runId } }, body: { expected_revision: value.revision, origin },
          })); }} />}

          {value.stock_proposal && <div className="space-y-3 rounded-md bg-warning-soft p-4 text-sm"><h2 className="font-semibold">Нужна другая заготовка</h2><p>{text(value.stock_proposal.reason)}</p>
            {record(record(value.stock_proposal.stock).selected).diameter_mm ? <><p>Предлагается круг Ø{text(record(record(value.stock_proposal.stock).selected).diameter_mm)} мм. После выбора потребуется новая карта и подтверждение детализации.</p>
              <Button variant="outline" disabled={busy || dirty || stopped} onClick={() => perform(() => apiClient.POST('/api/v1/runs/{run_id}/compact-round/stock/accept', { params: { path: { run_id: runId } }, body: { expected_revision: value.revision } }))}>Выбрать предложенную заготовку</Button></>
              : <p>Подходящий размер не найден или данных недостаточно. Уточните паспорт и справочник проката.</p>}
          </div>}
          {milling ? <p className="text-sm text-muted">Подбор заготовки по фрезерным габаритам пока недоступен.</p>
            : <CompactStockResult state={value} geometry={selected} showDiameter={!isRoundReading(reading)}
              onOpenRoute={() => { setTab('full-route', 'compact-stock-route-evidence'); }} />}

          </> : <p className="text-sm text-muted">{emptyReading}</p>}
        </WorkspacePanel>
        <WorkspacePanel id="material" active={tab}>
          <h2 className="text-lg font-semibold">Свойства материала</h2>
          {reading ? <div className="compact-material-layout">
          <section className="compact-workspace-card space-y-4" aria-label="Марка и физические свойства">
            <h3 className="font-semibold">Марка и физические свойства</h3>
            <p className="text-sm">На чертеже: {text(reading.material.text)}. Марка для справочника: {text(reading.material_grade)}.</p>
            {globalDraft && <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Марка материала для справочника" value={globalDraft.material_grade ?? ''} onChange={e => setDraft({ ...globalDraft, material_grade: e.target.value || null })} />
              <Input label="Самозакаливаемость: значение конструктора" value={globalDraft.self_hardening ?? ''} onChange={e => setDraft({ ...globalDraft, self_hardening: e.target.value || null })} />
            </div>}
            {globalDraft && <p className="text-sm text-muted">Справочные свойства относятся к сохранённой марке. После сохранения изменений карточка будет обновлена.</p>}
          <div>{reading.hardness.text.trim() && <p className="mb-3 text-sm">Требование чертежа к твёрдости: {reading.hardness.text}.</p>}{materialRows.length > 0 && <table className="w-full"><tbody>{materialRows.map(([label, content]) => <tr key={String(label)} className="border-b border-line"><th className={th} scope="row">{String(label)}</th><td className={td}>{text(content)}</td></tr>)}</tbody></table>}</div>
          <CompactPhysicalMaterialEvidence evidence={value.material_evidence} />
          {alternatives.length > 0 && <InfoBlock title={<>Справочные варианты материала · {alternatives.length}</>}><ul className="mt-3 space-y-2 text-sm">{alternatives.map((item, i) => <li key={i}>{text(record(item).grade)}: {record(item).relation_kind === 'analog' ? 'справочный аналог' : 'справочный заменитель'}</li>)}</ul><p className="mt-2 text-sm text-muted">Применимость заменителя требует проверки. Исходная марка детали сохраняется.</p></InfoBlock>}
          {!editingPassport && <CompactMaterialSupplySettings value={value} />}
          </section>
          <div className="compact-workspace-card">
            <CompactMaterialEvidence evidence={value.material_evidence} weldability={tech.weldability_class} />
          </div>
          </div> : <p className="text-sm text-muted">{emptyReading}</p>}
        </WorkspacePanel>
        <WorkspacePanel id="questions" active={tab}>
          <h2 className="text-lg font-semibold">Уточнения</h2>
          <CompactClarifications runId={runId} state={value} disabled={busy || processing || stopped || dirty} onOpenCountChange={setOpenQuestions} onOpenContext={openContext} onEditNumericFact={editNumericFact} onSaved={() => { if (draft && !dirty) setDraft(null); setCheckedRevision(null); void query.refetch(); }} />
          {dirty && <p className="text-sm text-warning">Сначала сохраните или отмените изменения данных чертежа.</p>}
        </WorkspacePanel>
        <WorkspacePanel id="preliminary" active={tab}>
          <h2 className="text-lg font-semibold">Предварительный маршрут</h2>
          {value.route && <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><p className="text-muted">Операций: {value.route.operations.length}{hasDetailedResult ? ' · детализация сохранена' : ' · перед детализацией требуется подтверждение'}</p>{hasRouteQuestions && <Button variant="ghost" size="sm" onClick={() => setTab('questions')}>Уточнения маршрута →</Button>}</div>}
          {!value.route && <p className="text-sm text-muted">{processing ? 'Предварительный маршрут ещё не получен.' : stopped ? 'Обработка отменена. Предварительный маршрут не был сохранён.' : 'Предварительный маршрут пока не сформирован.'}</p>}
          {reading && <>
          {dirty && <p className="text-sm text-warning">Сначала сохраните или отмените изменения паспорта.</p>}
          {referenceOnly && <div className="space-y-2 text-sm text-warning"><p>Изменение количества затрагивает технологию. Прежняя карта сохранена для сравнения.</p><Button disabled={busy || dirty || processing || stopped} onClick={() => perform(() => apiClient.POST('/api/v1/runs/{run_id}/compact-round/plan', { params: { path: { run_id: runId } }, body: { expected_revision: value.revision } }))}>Подготовить карту для нового количества</Button></div>}
          {!value.route && !processing && <Button disabled={busy || dirty || stopped || value.status === 'unsupported'} onClick={() => perform(() => apiClient.POST('/api/v1/runs/{run_id}/compact-round/plan', { params: { path: { run_id: runId } }, body: { expected_revision: value.revision } }))}>Подготовить предварительную карту</Button>}
          {value.route && <CompactPreliminaryRouteTable route={value.route} />}

          {value.route && <section aria-label="Пересмотреть карту" className="border-t border-line pt-4"><h3 className="text-sm font-semibold">Пересмотр карты</h3><div className="mt-3 space-y-3"><label htmlFor="compact-comment" className="block text-sm font-medium">Замечания к маршруту</label><textarea id="compact-comment" name="route_comment" className={fieldClass} rows={3} value={comment} onChange={e => setComment(e.target.value)} />
            {value.detail_route_review && <div className="space-y-1 text-sm" role="status">
              <p>Операция {value.detail_route_review.operation_index + 1} · {value.detail_route_review.reason}</p>
              <p>{value.detail_route_review.proposal}</p>
              <Button variant="outline" size="sm" onClick={() => setComment(value.detail_route_review?.proposal ?? '')}>Использовать предложение</Button>
            </div>}
            <Button variant="outline" disabled={processing || busy || dirty || stopped || !comment.trim()} onClick={() => perform(() => apiClient.POST('/api/v1/runs/{run_id}/compact-round/rework', { params: { path: { run_id: runId } }, body: { expected_revision: value.revision, comment } }))}>Переработать карту</Button>
          </div></section>}
          {hasDetailedResult && <section aria-label="Сохранённое подтверждение" className="space-y-3 border-t border-line pt-5 text-sm">
            <h3 className="font-semibold">Детализация сохранена</h3>
            <p>{typeof confirmation.summary_text === 'string' ? confirmation.summary_text : 'Сохранённый результат и его основания доступны во вкладке «Полный маршрут».'}</p>
            {typeof confirmation.accepted_limitations === 'string' && !!confirmation.accepted_limitations.trim() && <InfoBlock title="Сохранённый комментарий"><p className="mt-2 whitespace-pre-wrap">{confirmation.accepted_limitations}</p></InfoBlock>}
            <Button variant="outline" disabled={processing || busy || dirty || stopped} onClick={() => { setRestartDetails(current => !current); setCheckedRevision(null); }}>{restartDetails ? 'Отменить повторный запуск' : 'Повторить детализацию'}</Button>
          </section>}
          {!!value.route?.operations.length && !value.detail_route_review && (!hasDetailedResult || restartDetails) && <div className="space-y-3 border-t border-line pt-5">
            <p className="text-sm">Сохранённые ответы и пропуски войдут в подтверждение. Открытые вопросы сохраняют неизвестность и ограничивают зависимые расчёты.</p>
            <label htmlFor="compact-decision" className="block text-sm font-medium">Комментарий к подтверждению (необязательно)</label><textarea id="compact-decision" className={fieldClass} rows={2} value={decision} onChange={e => setDecision(e.target.value)} />
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={checkedRevision === value.revision} onChange={e => setCheckedRevision(e.target.checked ? value.revision : null)} />Проверены паспорт, выбранная заготовка и эта редакция маршрута. Разрешаю детализацию.</label>
            {restartDetails && <p className="text-sm text-warning">Будет выполнена новая модельная детализация. Прежний результат сохранится в истории.</p>}
            <Button disabled={processing || busy || dirty || stopped || !!value.stock_proposal || checkedRevision !== value.revision} onClick={async () => { const ok = await perform(() => apiClient.POST('/api/v1/runs/{run_id}/compact-round/confirm', { params: { path: { run_id: runId } }, body: { expected_revision: checkedRevision ?? value.revision, confirm_inputs: true, accepted_limitations: decision, restart_details: restartDetails } })); if (ok) { setRestartDetails(false); setDecision(''); } }}>Подтвердить и рассчитать</Button>
            {checkedRevision !== value.revision && <p className="text-xs text-muted">Для запуска подтвердите проверку текущих данных галочкой выше.</p>}
          </div>}

          </>}
          {value.stock_proposal && <p className="text-sm text-warning">Требуется решение по предложенной заготовке во вкладке «Заготовка».</p>}
        </WorkspacePanel>

    </section>
  </div>;
}
