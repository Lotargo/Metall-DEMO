import { InfoBlock } from '@/components/ui/InfoBlock';
import type { components } from '@/api/schema';
import { formatNumber, formatText } from '@/utils/compactNumbers';
import { useCompactTableWidth } from './useCompactTableWidth';
import { estimateOperatorText } from './estimateOperatorText';
import { publicSourceText } from '@/utils/publicSource';
import './compact-full-route.css';

type FullRoute = components['schemas']['CompactFullRoute'];
type Row = components['schemas']['CompactFullRouteRow'];
type Transition = components['schemas']['RouteTransition'];
type Volume = components['schemas']['CompactWorkVolume'];

function RemovedVolume({ volume, operation = false }: { volume?: Volume | null; operation?: boolean }) {
  if (!volume || volume.state === 'not_applicable') return null;
  if (volume.known_mm3 == null) return <p className="mt-1 text-xs text-muted">Объём съёма не рассчитан</p>;
  const cubicCentimeters = Number(volume.known_mm3) / 1000;
  const number = cubicCentimeters > 0 && cubicCentimeters < 0.000001 ? '<0,000001' : formatNumber(cubicCentimeters, 6);
  return <div className="mt-2 space-y-1 text-xs text-ink">
    <p className="font-medium">{volume.state === 'partial' ? 'Известная часть съёма' : operation ? 'Съём по рассчитанным переходам' : 'Съём перехода, всего'} · <span className="tabular-nums">{number} см³</span></p>
    {volume.state === 'partial' && <p className="font-normal text-muted">Полный объём съёма не определён.</p>}
    {volume.conditional && <p className="font-normal text-muted">По расчётным допущениям</p>}
  </div>;
}

function AddedVolume({ value }: { value?: string | number | null }) {
  if (value == null || Number(value) <= 0) return null;
  return <p className="mt-2 text-xs font-medium">Добавлено покрытием · <span className="tabular-nums">{formatNumber(Number(value) / 1000, 6)} см³</span></p>;
}

export function routeOperationAnchor(number: number) {
  return `route-operation-${number}`;
}

function dimensionText(item: Transition['dimensions'][number]) {
  const unit = item.unit === 'mm' && !/мм|mm/i.test(item.literal) ? ' мм'
    : item.unit === 'deg' && !item.literal.includes('°') ? '°' : '';
  return item.literal + unit;
}

function dimensionSource(item: Transition['dimensions'][number]) {
  return estimateOperatorText(publicSourceText(item.source, ''));
}

function TransitionDimensions({ dimensions }: { dimensions: Transition['dimensions'] }) {
  return <dl className="route-dimensions" aria-label="Размеры по чертежу">
    {dimensions.map((item, index) => <div className="route-dimension-row" key={`${item.row_index}:${index}`}>
      <dt>{dimensionSource(item) || 'Место на чертеже не указано'}</dt>
      <dd>
        <p className="route-dimension-value">{dimensionText(item)}</p>
        {item.tolerance && <p className="route-dimension-detail">Допуск · {item.tolerance}</p>}
        {item.roughness && <p className="route-dimension-detail">{item.roughness}</p>}
      </dd>
    </div>)}
  </dl>;
}

function TransitionRows({ operation, transitions, narrow, inspection = false }: { operation: number; transitions: Transition[]; narrow: boolean; inspection?: boolean }) {
  const showSizes = !narrow && !inspection;
  const regimeRequired = transitions.some(work => work.regime_state !== 'not_required');
  const showRegime = showSizes && regimeRequired;
  return <table className="route-transitions w-full text-left">
    <caption className="sr-only">Переходы операции {operation}</caption>
    <colgroup><col />{showSizes && <col className="route-size-track" />}{showRegime && <col className="route-regime-track" />}<col className="route-time-track" /></colgroup>
    <thead><tr>
      <th scope="col">Переход</th>
      {showSizes && <th scope="col">Размеры и съём</th>}{showRegime && <th scope="col">Режим</th>}
      <th scope="col">Время</th>
    </tr></thead>
    <tbody>{transitions.map(work => {
      const dimensionSources = new Set(work.dimensions.map(dimensionSource).filter(Boolean));
      const sourceValues = inspection ? [...work.dimensions.map(item => item.source), ...work.sources] : work.sources;
      const sources = [...new Set(sourceValues.map(source => estimateOperatorText(publicSourceText(source, ''))).filter(source => source && (inspection || !dimensionSources.has(source))))];
      const quantity = work.quantity == null ? '' : formatNumber(work.quantity);
      const regime = work.regime.map(item => item.replace(/(: (?:≈ )?)([-\d.]+) /, (_, prefix: string, value: string) => `${prefix}${formatNumber(value)} `)).join(' · ');
      const regimeLabel = work.regime_state === 'not_required' ? 'Не требуется' : work.regime_state === 'not_applicable' ? 'Нет применимого режима' : 'Не назначен';
      const regimeContent = <><p>{regime || regimeLabel}</p>{work.regime_reason && work.regime_state !== 'not_required' && <p className="mt-1 text-xs text-muted">{publicSourceText(work.regime_reason, 'Режим требует уточнения')}</p>}</>;
      return <tr key={work.work_key} className="border-b border-line">
        <th scope="row" className="font-medium">
          <span className="mr-2 tabular-nums text-muted">{operation}.{work.number}</span>{work.description}
          {work.target && <p className="mt-1 font-normal text-ink-secondary">{work.target}</p>}
          {work.selection === 'conditional' && <p className="text-xs font-normal text-warning">Условный переход</p>}
          {work.reason && <p className="mt-1 text-xs font-normal text-muted">{publicSourceText(work.reason, 'Условия работы требуют уточнения')}</p>}
          {narrow && !inspection && <div className="mt-1 space-y-1 text-xs font-normal text-muted">
            {work.dimensions.length > 0 && <TransitionDimensions dimensions={work.dimensions} />}
            {quantity && <p>Количество · {quantity}</p>}
            {regimeRequired && <div>Режим · {regimeContent}</div>}
            <RemovedVolume volume={work.removed_volume} />
            <AddedVolume value={work.added_volume_mm3} />
          </div>}
          {(work.control || sources.length > 0) && <div className="route-work-notes">
            {work.control && <p><strong>Контроль:</strong> {publicSourceText(work.control, 'Требования контроля сохранены')}</p>}
            {sources.map(source => <p key={source}>{source}</p>)}
          </div>}
        </th>
        {showSizes && <td>{work.dimensions.length ? <TransitionDimensions dimensions={work.dimensions} /> : <p>—</p>}{quantity && <p className="text-muted">Количество · {quantity}</p>}<RemovedVolume volume={work.removed_volume} /><AddedVolume value={work.added_volume_mm3} /></td>}
        {showRegime && <td>{regimeContent}</td>}
        <td className="tabular-nums">
          {work.minutes_per_piece == null ? <><span className="text-muted">{work.time_included ? 'Учтено в операции' : 'Не оценено'}</span>
            {work.time_included && work.included_time && <p className="mt-1 text-xs text-muted">В общей оценке · {work.included_time.estimated ? '≈' : ''}{formatNumber(work.included_time.minutes)} {({ 'min/piece': 'мин/дет.', 'min/batch': 'мин/партию', 'min/inspection': 'мин/проверку' })[work.included_time.unit]}</p>}
          </> : <>
            <p>{work.time_state === 'estimated' || work.time_state === 'partial' ? '≈' : ''}{formatNumber(work.minutes_per_piece)} мин/дет.</p>
            {work.time_state === 'partial' && <p className="text-xs text-muted">Известная часть</p>}
          </>}
        </td>
      </tr>;
    })}</tbody>
  </table>;
}

export function RouteDuration({ row }: { row: Row }) {
  const { inspection, status } = row;
  const inspectedMinutes = inspection?.time_basis === 'per_inspected_piece' ? inspection.minutes : null;
  return <div className="space-y-1 tabular-nums">
    {row.minutes_per_piece != null && <p>{status === 'estimated' || status === 'partial' ? '≈' : ''}{formatNumber(row.minutes_per_piece)} мин/дет.</p>}
    {inspectedMinutes != null && <p>≈{formatNumber(inspectedMinutes)} мин/проверяемую дет.</p>}
    {row.setup_minutes_per_batch != null && <p>Наладка · ≈{formatNumber(row.setup_minutes_per_batch)} мин/партию</p>}
    {row.minutes_per_batch != null && <p className="font-medium">Учтено на партию · {status === 'estimated' || status === 'partial' ? '≈' : ''}{formatNumber(row.minutes_per_batch)} мин</p>}
    {status === 'estimated' && <p className="text-xs text-muted">Ориентир</p>}
    {status === 'partial' && <p className="text-xs text-muted">Частичная оценка</p>}
    {status === 'unknown' && <p className="font-medium text-warning">Не оценено</p>}
  </div>;
}

export function CompactFullRoute({ route, referenceOnly, part, designation, material, stock, revision, onEditOperation }: {
  route: FullRoute;
  referenceOnly: boolean;
  part?: string;
  designation?: string;
  material?: string;
  stock: string;
  revision?: number | null;
  onEditOperation?: (index: number) => void;
}) {
  const { ref, narrow } = useCompactTableWidth(560);
  if (!route.rows.length) return null;
  const open = route.rows.filter(row => ['partial', 'unknown'].includes(row.status) || row.coverage_gaps?.length);
  return <section ref={ref} className="compact-route-summary space-y-4 text-sm" aria-label="Операции полного маршрута">
    <header className="route-document-meta">
      <p className="font-semibold">{[part, designation].filter(Boolean).join(' · ') || 'Деталь'}</p>
      <p className="text-muted">Карта · редакция {revision ?? 'открыта'} · {material || 'Марка стали открыта'}</p>
      <p>Заготовка · {stock}</p>
      <p className="text-xs text-muted">Объём съёма указан в см³ на одну деталь.</p>
      {route.material_balance?.requires_review && <div role="note" className="route-open-conditions">
        <p className="font-semibold">Проверить массу по чертежу</p>
        <p>Указано {formatNumber(route.material_balance.drawing_mass_kg)} кг. Даже увеличенная цилиндрическая оболочка Ø{formatNumber(route.material_balance.envelope_diameter_mm)} × {formatNumber(route.material_balance.envelope_length_mm)} мм даёт не более {formatNumber(route.material_balance.envelope_mass_kg, 3)} кг при справочной плотности {formatNumber(route.material_balance.density_kg_m3)} кг/м³.</p>
        <p className="text-xs text-muted">Сравнение условное. Масса, геометрия и данные поставки требуют сверки.</p>
      </div>}
    </header>
    {referenceOnly && <p role="status" className="text-warning">Показан сохранённый маршрут. Для нового количества требуется пересмотр технологии.</p>}
    <div className="route-operation-list">
      {route.rows.map(row => {
        const equipment = publicSourceText(row.equipment.trim() || row.method.trim(), '');
        const inspection = row.inspection;
        const setups = row.setups ?? [];
        return <article className="route-operation-card" key={row.number} data-route-operation={row.number}>
          <header className="route-operation-header">
            <div className="route-operation-title">
              <span className="route-operation-number">{String(row.number).padStart(2, '0')}</span>
              <div><h3 id={routeOperationAnchor(row.number)} tabIndex={-1}>{row.title}</h3>
                {row.reason && <p className="route-operation-reason">{publicSourceText(row.reason, 'Условия операции требуют уточнения')}</p>}
                {onEditOperation && <button type="button" className="route-open-operation document-screen-only" onClick={() => onEditOperation(row.number - 1)}>Расчёты и формы</button>}
              </div>
            </div>
            <div className="route-operation-facts">
              <div><h4>Оборудование</h4><p>{equipment || 'Класс открыт'}</p></div>
              <div><h4>Трудоёмкость</h4><RouteDuration row={row} /></div>
            </div>
            <RemovedVolume volume={row.removed_volume} operation />
          </header>
          {inspection && <section className="route-inspection-block">
            <h4>Контроль</h4><p>{inspection.subject}</p>
            <p className="text-muted">
              {inspection.scope === 'all' ? 'Сплошной контроль' : inspection.scope === 'sample' ? 'Выборочный контроль' : 'Охват открыт'}
              {row.inspection_quantity != null && ` · ${formatNumber(row.inspection_quantity)} проверок`}
              {row.inspection_batch_minutes != null && ` · ${formatNumber(row.inspection_batch_minutes)} мин контроля на партию`}
            </p>
            {inspection.scope_source && <p className="route-work-notes">{publicSourceText(inspection.scope_source, 'Основание контроля сохранено')}</p>}
            {inspection.assumption && <p className="route-work-notes">{publicSourceText(inspection.assumption, 'Условия контроля требуют уточнения')}</p>}
          </section>}
          {setups.length > 0 && <div className="route-setups">{setups.map((setup, index) => <section key={setup.number ?? index} className="route-setup">
            <h4>{setup.number != null && `Установ ${setup.number} · `}{setup.title}</h4>
            {(setup.datum || setup.tooling) && <dl className="route-setup-facts">
              {setup.datum && <div><dt>База</dt><dd>{publicSourceText(setup.datum, 'База требует уточнения')}</dd></div>}
              {setup.tooling && <div><dt>Оснастка</dt><dd>{publicSourceText(setup.tooling, 'Оснастка требует уточнения')}</dd></div>}
            </dl>}
            {!inspection && setup.transitions.length > 0 && setup.transitions.every(work => work.regime_state === 'not_required') && <p className="route-work-notes mb-3">Режим резания для работ установа не требуется.</p>}
            <TransitionRows operation={row.number} transitions={setup.transitions} narrow={narrow} inspection={Boolean(inspection)} />
          </section>)}</div>}
          {!inspection && !setups.length && row.volume && <p className="route-operation-note">{formatText(row.volume)}</p>}
          {!!row.coverage_gaps?.length && <section className="route-open-conditions">
            <h4>Не покрытые переходами элементы · {row.coverage_gaps.length}</h4>
            <ul>{row.coverage_gaps.map(gap => <li key={gap.element_id}>{publicSourceText(gap.source, 'По чертежу')} · {publicSourceText(gap.reason, 'Работа требует уточнения')}</li>)}</ul>
          </section>}
        </article>;
      })}
    </div>
    {(route.order_reason || route.limitations?.length || open.length > 0 || route.excluded.length > 0) && <InfoBlock className="route-global-conditions" title="Условия маршрута">
      {route.order_reason && <p>{publicSourceText(route.order_reason, 'Порядок работ требует уточнения')}</p>}
      {route.limitations?.map((text,index) => <p key={index} className="text-muted">{estimateOperatorText(publicSourceText(text, ''))}</p>)}
      {open.length > 0 && <p className="text-muted">Открытые значения в операциях {open.map(row => String(row.number).padStart(2, '0')).join(', ')}.</p>}
      {route.excluded.length > 0 && <ul>{route.excluded.map(({ title, reason }, index) => <li key={index}>{title} · {publicSourceText(reason, 'Причина требует уточнения')}</li>)}</ul>}
    </InfoBlock>}
  </section>;
}
