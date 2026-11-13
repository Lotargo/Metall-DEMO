import { useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Printer, RefreshCw } from 'lucide-react';
import type { components } from '@/api/schema';
import { useCompactFullRoute, useCompactReadiness } from '@/api/hooks/useCompactRound';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { asRecord, formatNumber } from '@/utils/compactNumbers';
import { publicSourceText } from '@/utils/publicSource';
import { CompactFullRoute, RouteDuration } from './CompactFullRoute';
import { CompactOperationResult, commonOperationLimitations } from './CompactOperationResult';
import { CompactDrillingTiming } from './CompactDrillingTiming';
import { CompactMachineEstimate } from './CompactMachineEstimate';
import { CompactStockRouteEvidence } from './CompactStockRouteEvidence';
import { CompactCuttingEvents, isRoundReading } from './CompactStockSelection';
import { stockChoiceView } from './CompactStockChoice';
import { CompactOperationsTable } from './CompactOperationsTable';
import { runDocumentLink } from '@/utils/runDocumentLinks';

type State = components['schemas']['CompactState'];
const views = [{ id: 'summary', label: 'Карта операций' }, { id: 'operation', label: 'Расчёты и формы' }, { id: 'preparation', label: 'Подготовка и итоги' }];

export function FullRouteWorkspace({ runId, value }: { runId: string; value: State }) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const printRoot = useRef<HTMLDivElement>(null);
  const preparePrint = useRef(() => {});
  const full = useCompactFullRoute(runId, value.revision, !!value.route);
  const check = useCompactReadiness(runId, value.revision, value.details.length > 0);
  const readiness = check.data?.revision === value.revision ? check.data : null;
  const referenceOnly = value.quantity_review?.impact === 'dependent';
  const view = views.some(item => item.id === params.get('view')) ? params.get('view')! : 'summary';
  const index = Number(params.get('operation') ?? 0);
  const selectedIndex = Number.isInteger(index) && index >= 0 && index < Math.max(value.route?.operations.length ?? 0, value.details.length) ? index : 0;
  const detail = value.details.find((item, i) => (item.operation_index ?? i) === selectedIndex);
  const selected = asRecord(stockChoiceView(value).geometry);
  const cutting = asRecord(asRecord(value).cutting_calculation);
  const limitations = commonOperationLimitations(value.details);
  const editable = !referenceOnly && !value.calculation_pending
    && value.quantity_review?.impact !== 'review_required' && ['ready', 'review'].includes(value.status);
  function selectView(next: string, operation?: number) {
    setParams(current => { const updated = new URLSearchParams(current); updated.set('view', next);
      if (operation != null) updated.set('operation', String(operation)); return updated; });
  }
  useEffect(() => {
    const match = /^#compact-operation-(\d+)$/.exec(location.hash);
    const operation = match ? Number(match[1]) : null;
    const validOperation = operation !== null && operation < Math.max(value.route?.operations.length ?? 0, value.details.length);
    const targetView = validOperation ? 'operation' : location.hash === '#compact-stock-route-evidence' ? 'preparation'
      : /^#route-operation-\d+$/.test(location.hash) ? 'summary' : null;
    if (!targetView) return;
    if (view !== targetView || validOperation && selectedIndex !== operation) {
      const next = new URLSearchParams(location.search);
      next.set('view', targetView);
      if (validOperation) next.set('operation', String(operation));
      navigate({ search: `?${next}`, hash: location.hash }, { replace: true });
      return;
    }
    const target = document.getElementById(location.hash.slice(1));
    target?.focus(); target?.scrollIntoView({ block: 'nearest' });
  }, [location.hash, location.search, selectedIndex, view, navigate, full.data, value.route?.operations.length, value.details.length]);
  useEffect(() => {
    const root = printRoot.current;
    let wasHidden: boolean | null = null;
    function prepare() {
      if (!root || wasHidden !== null) return;
      wasHidden = root.hidden;
      root.hidden = false;
    }
    function restore() {
      if (!root || wasHidden === null) return;
      root.hidden = wasHidden;
      wasHidden = null;
    }
    preparePrint.current = prepare;
    window.addEventListener('beforeprint', prepare);
    window.addEventListener('afterprint', restore);
    return () => { window.removeEventListener('beforeprint', prepare); window.removeEventListener('afterprint', restore); restore(); };
  }, []);
  function print() { preparePrint.current(); window.print(); }
  return <section className="route-document-workspace">
    <div className="document-toolbar document-screen-only">
      <Button variant="outline" icon={<RefreshCw size={16} />} onClick={() => { void full.refetch(); void check.refetch(); }}>Обновить маршрут</Button>
      <Button variant="outline" icon={<Printer size={16} />} disabled={!full.data} onClick={print}>Печать маршрута</Button>
      <Link className="secondary-action" to={`/runs/${encodeURIComponent(runId)}?tab=preliminary`}>Пересмотреть карту</Link>
      <span className="document-state">{value.route?.operations.length ?? value.details.length} операций · редакция {value.route_revision ?? value.revision}</span>
    </div>
    {referenceOnly && <p role="status" className="document-notice">Маршрут относится к прежним инженерным основаниям. Количество требует пересмотра технологии.</p>}
    <div className="document-sheet">
      <div className="document-screen-only"><Tabs id="full-route-document-tabs" aria-label="Разделы полного маршрута" layout="wrap" items={views} activeId={view} onChange={next => selectView(next)} /></div>
      <div className="document-panel route-print-summary" id="full-route-document-tabs-panel-summary" role="tabpanel" aria-labelledby="full-route-document-tabs-tab-summary" tabIndex={0} ref={printRoot} hidden={view !== 'summary'}>
        <h2 className="document-section-title document-screen-only">Карта операций</h2>
        {full.data && <CompactFullRoute route={full.data} referenceOnly={referenceOnly} part={value.reading?.part_name.text}
          designation={value.reading?.designation.text} material={value.reading?.material_grade ?? value.reading?.material.text}
          revision={value.route_revision} stock={selected.diameter_mm == null ? 'Размер открыт' : `Круг Ø${formatNumber(selected.diameter_mm)}${selected.cut_length_mm == null ? '' : ` × ${formatNumber(selected.cut_length_mm)}`} мм`}
          onEditOperation={operation => selectView('operation', operation)} />}
        {full.isPending && !!value.route && <p role="status">Загрузка карты операций…</p>}
        {full.isError && <p role="alert">Не удалось получить карту. Сохранённые расчёты доступны в разделе «Расчёты и формы».</p>}
        {!value.route && <p role="status">Полный маршрут станет доступен после составления и детализации карты.</p>}
        {full.isError && <CompactOperationsTable details={value.details} route={value.route} referenceOnly={referenceOnly} />}
      </div>
      <div className="document-panel document-screen-only" id="full-route-document-tabs-panel-operation" role="tabpanel" aria-labelledby="full-route-document-tabs-tab-operation" tabIndex={0} hidden={view !== 'operation'}>
        <div className="route-operation-layout">
          <nav className="route-operation-picker" aria-label="Операции маршрута">
            {value.route?.operations.map((operation, i) => <button type="button" key={i} className={i === selectedIndex ? 'is-current' : undefined}
              aria-current={i === selectedIndex ? 'true' : undefined} onClick={() => selectView('operation', i)}>
              <span>{String(i + 1).padStart(2, '0')}</span><strong>{operation.title}</strong>
            </button>)}
          </nav>
          <div className="route-operation-editor">
            {check.isError && <p role="status">Не удалось проверить расчётные основания.</p>}
            {value.details.map((item, i) => {
              const operation = typeof item.operation_index === 'number' ? item.operation_index : i;
              const operationInput = value.calculation_inputs.find(entry => entry.operation_index === operation);
              const row = full.data?.rows.find(entry => entry.number === operation + 1);
              return <div key={`${runId}:${operation}`} hidden={operation !== selectedIndex}>
                <CompactOperationResult operationIndex={operation} detail={asRecord(item)} referenceOnly={referenceOnly}
                  title={value.route?.operations[operation]?.title ?? `Операция ${operation + 1}`}
                  sharedLimitations={limitations} readiness={readiness?.operations.find(entry => entry.operation_index === operation)}
                  overview={row && <div className="route-operation-overview">
                    <div><h4>Оборудование</h4><p>{publicSourceText(row.equipment || row.method, 'Не назначено')}</p></div>
                    <div><h4>{referenceOnly ? 'Сохранённая трудоёмкость' : 'Трудоёмкость операции'}</h4><RouteDuration row={row} /></div>
                    <Link to={`${runDocumentLink(runId, 'estimate')}?section=works`}>Стоимость в смете →</Link>
                  </div>}>
                  <CompactDrillingTiming detail={asRecord(item)} runId={runId} operationIndex={operation} revision={value.revision}
                    timeWorks={operationInput?.time_works ?? []} editable={!!operationInput && editable} />
                </CompactOperationResult>
              </div>;
            })}
            {!detail && <p role="status">Для выбранной операции ещё нет сохранённой детализации.</p>}
          </div>
        </div>
      </div>
      <div className="document-panel document-screen-only space-y-5" id="full-route-document-tabs-panel-preparation" role="tabpanel" aria-labelledby="full-route-document-tabs-tab-preparation" tabIndex={0} hidden={view !== 'preparation'}>
        <h2 className="document-section-title">Подготовка и итоги</h2>
        {value.details.length > 0 && <CompactMachineEstimate runId={runId} value={value} referenceOnly={referenceOnly} />}
        {((value.processing_passport?.kind !== 'milling' && value.reading && isRoundReading(value.reading)) || Object.keys(cutting).length > 0)
          && <CompactCuttingEvents result={cutting.response} error={cutting.error} />}
        <CompactStockRouteEvidence stock={value.stock} />
        {limitations.length > 0 && <section><h3 className="font-semibold">Общие ограничения</h3><ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
          {limitations.map(item => <li key={item}>{publicSourceText(item, 'Применимость требует уточнения')}</li>)}
        </ul></section>}
      </div>
    </div>
  </section>;
}
