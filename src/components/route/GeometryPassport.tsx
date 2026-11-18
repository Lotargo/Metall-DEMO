import { useState, type ReactNode } from 'react';
import { Box, FileImage, Crosshair, Info } from 'lucide-react';
import type { GeometryDimension, VolumeState } from '@/api/hooks/useVolumeRound';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { EngineeringText } from '@/components/ui/EngineeringText';
import { EngineeringCards, RemarksSummary } from '@/components/ui/EngineeringCards';
import { dimensionKey, materialLabel, measurementExplanation, operatorText, passportRemarks, passportRows } from './geometryPresentation';
import { GeometryMeasurementValue } from './GeometryMeasurementValue';
import { EngineeringIssues } from './EngineeringIssues';

export function GeometryPassport({ state, fallback, controls, onSelect, selection, notes }: {
  state: VolumeState; fallback?: GeometryDimension[]; controls?: ReactNode;
  onSelect?: (row: GeometryDimension) => void; selection?: GeometryDimension; notes: unknown[];
}) {
  const { main, extra } = passportRows(state, fallback);
  const [all, setAll] = useState(false);
  const [explanation, setExplanation] = useState<GeometryDimension>();
  const [limitations, setLimitations] = useState(false);
  const rows = all ? [...main, ...extra] : main;
  const warnings = passportRemarks(notes, state.passport?.unknowns ?? []);
  const issues = state.passport?.issues ?? [];
  const remarksCount = issues.length || warnings.length;
  return <div className="geometry-passport space-y-5">
    <div className="geometry-section-heading"><div><h2>Технический паспорт</h2>
      {state.passport?.material != null && <p>Материал: <strong>{materialLabel(state.passport.material)}</strong></p>}</div>
      {!!remarksCount && <Button size="sm" variant="outline" onClick={() => setLimitations(true)}>Замечания и уточнения · {remarksCount}</Button>}
    </div>
    {controls}
    {!!rows.length && <section className="space-y-3" aria-label="Размеры и требования детали">
      <div className="geometry-section-heading"><div><h3>Размеры и требования</h3><p>Выберите размер, чтобы увидеть его на модели.</p></div>
        {!!extra.length && <div className="geometry-view-options" role="group" aria-label="Состав измерений">
          <button type="button" aria-pressed={!all} onClick={() => setAll(false)}>Паспорт</button>
          <button type="button" aria-pressed={all} onClick={() => setAll(true)}>Все измерения</button>
        </div>}
      </div>
      <div className="table-wrap"><table className="geometry-passport-table">
        <caption className="sr-only">Единая таблица размеров модели, допусков, шероховатости и требований чертежа</caption>
        <thead><tr><th scope="col">Элемент и размер</th><th scope="col">Чертёж</th><th scope="col">Модель</th><th scope="col">Допуск</th><th scope="col">Шероховатость</th><th scope="col">Обозначение</th></tr></thead>
        <tbody>{rows.map((row, i) => <tr key={`${row.ref}:${i}`} className={selection && dimensionKey(selection) === dimensionKey(row) ? 'is-linked' : undefined}>
          <th scope="row"><div className="geometry-dimension-cell"><button type="button" className="geometry-dimension-link" aria-pressed={!!selection && dimensionKey(selection) === dimensionKey(row)} onClick={() => onSelect?.(row)} disabled={!onSelect}>
            <strong>{operatorText(row.feature)}</strong><span>{operatorText(row.name)}</span>
          </button>{(row.notes || row.model_note || row.drawing_source || row.assumption || row.representation || row.measurement_status && row.measurement_status !== 'measured') && <button type="button" className="geometry-dimension-info" aria-label={`Пояснение: ${row.name}`} title="Примечание и источник" onClick={() => setExplanation(row)}><Info size={15} aria-hidden="true" /></button>}</div></th>
          <td>{row.drawing_nominal?.trim() ? <EngineeringText value={row.drawing_nominal} literalMarkers /> : '—'}</td>
          <td className="geometry-measured"><GeometryMeasurementValue row={row} /></td>
          <td>{row.tolerance?.trim() ? <EngineeringText value={row.tolerance} literalMarkers /> : '—'}</td><td>{row.roughness?.trim() ? <EngineeringText value={row.roughness} literalMarkers /> : '—'}</td>
          <td>{row.designation && <EngineeringText value={row.designation} literalMarkers />}</td>
        </tr>)}</tbody>
      </table></div>
    </section>}
    {!!state.passport?.requirements.length && <section className="geometry-requirements engineering-section"><h3>Технические требования</h3>
      <EngineeringCards label="Технические требования" items={state.passport.requirements.map(item => typeof item === 'string' ? { text: item } : item)} />
    </section>}
    {!!state.passport?.unmatched_requirements.length && <section className="geometry-requirements engineering-section"><h3>Требования без измерения в модели</h3><EngineeringCards label="Требования без измерения" items={state.passport.unmatched_requirements.map(item => ({ text: operatorText(item, 'Требование сохранено в исходном паспорте; связь с моделью не установлена.') }))} /></section>}
    <Modal isOpen={!!explanation} onClose={() => setExplanation(undefined)} title={explanation ? `${explanation.feature}: ${explanation.name}` : 'Примечание'}>
      {explanation?.notes && <EngineeringText value={explanation.notes} literalMarkers />}
      {explanation && measurementExplanation(explanation) && <p>{measurementExplanation(explanation)}</p>}
      {explanation?.model_note && <EngineeringText value={explanation.model_note} literalMarkers />}
      {explanation?.assumption && <div><p><strong>Принято для модели:</strong> {explanation.assumption.adopted_value} {explanation.unit}</p><EngineeringText value={[explanation.assumption.basis, explanation.assumption.affects].filter(Boolean).join('\n\n')} /></div>}
      {explanation?.drawing_source && <p className="mt-4 text-sm text-muted">Источник: {operatorText(explanation.drawing_source)}</p>}
    </Modal>
    <Modal isOpen={limitations} onClose={() => setLimitations(false)} title="Замечания к геометрии и требованиям" size="xl">
      {issues.length ? <EngineeringIssues issues={issues} runId={state.run_id} revision={state.model_revision} sha={state.step_sha256 ?? state.passport?.step_sha256} source={state.preview_url?.replace(/viewer\.html$/, '')} onClarify={() => setLimitations(false)} /> : <><RemarksSummary /><EngineeringCards label="Замечания и уточнения" items={warnings} /></>}
    </Modal>
  </div>;
}

export function GeometryDescription({ state, fallback, drawingTarget }: {
  state: VolumeState; fallback?: GeometryDimension[]; drawingTarget: (node: HTMLDivElement | null) => void;
}) {
  const { main } = passportRows(state, fallback);
  const features = [...new Set(main.map(row => row.feature))];
  return <div className="space-y-4"><h2 className="text-lg font-semibold">Описание детали</h2>
    <div className="workspace-description-layout"><div className="part-description-copy">
      <section className="compact-engineering-description part-description-card part-description-card--construction">
        <div className="part-description-card-heading"><span className="part-description-icon"><Box size={21} aria-hidden="true" /></span><div><h3>Конструкция детали</h3><p>Форма, поверхности и элементы</p></div></div>
        <div className="part-description-card-body part-description-prose">
          {state.passport?.description ? <EngineeringText value={state.passport.description} /> : features.length ? <><p>В модели выделены следующие элементы:</p><ul className="volume-notes">{features.map(name => <li key={name}>{operatorText(name)}</li>)}</ul></> : <p role="status">Описание появится после подготовки паспорта.</p>}
        </div>
      </section>
      {state.passport?.views_and_datums && <section className="compact-engineering-description part-description-card">
        <div className="part-description-card-heading"><span className="part-description-icon"><Crosshair size={21} aria-hidden="true" /></span><div><h3>Виды и базы</h3><p>Расположение и ориентирование</p></div></div>
        <div className="part-description-card-body part-description-prose"><EngineeringText value={state.passport.views_and_datums} /></div>
      </section>}
    </div>
    <section className="workspace-description-drawing part-description-card">
      <div className="part-description-card-heading"><span className="part-description-icon"><FileImage size={21} aria-hidden="true" /></span><div><h3>Исходный чертёж</h3><p>Нажмите на изображение, чтобы увеличить</p></div></div>
      <div className="part-description-drawing-body" ref={drawingTarget} />
    </section></div>
  </div>;
}
