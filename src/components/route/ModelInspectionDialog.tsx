import { useState, type ReactNode } from 'react';
import type { GeometryDimension, VolumeState } from '@/api/hooks/useVolumeRound';
import { Modal } from '@/components/ui/Modal';
import { EngineeringText } from '@/components/ui/EngineeringText';
import { EngineeringCards, RemarksSummary } from '@/components/ui/EngineeringCards';
import { PartModelViewer } from './PartModelViewer';
import { dimensionKey, materialLabel, measurementExplanation, operatorText, passportRemarks, passportRows } from './geometryPresentation';
import { GeometryMeasurementValue } from './GeometryMeasurementValue';
import { EngineeringIssues } from './EngineeringIssues';

export function ModelInspectionDialog({ open, onClose, source, sha, state, fallback, selection, onSelect, onReady, controls, notes }: {
  open: boolean; onClose: () => void; source: string; sha: string; state: VolumeState;
  fallback?: GeometryDimension[]; selection?: GeometryDimension; onSelect: (row?: GeometryDimension) => void;
  onReady?: (ready: boolean) => void; controls?: ReactNode; notes: unknown[];
}) {
  const [all, setAll] = useState(false);
  const [face, setFace] = useState<number | null>(null);
  const { main, extra } = passportRows(state, fallback);
  const rows = all ? [...main, ...extra] : main;
  const dimensions = [...main, ...extra];
  const detail = selection ?? dimensions.find(row => face && row.face_ids?.includes(face));
  const warnings = passportRemarks(notes, state.passport?.unknowns ?? []);
  return <Modal isOpen={open} onClose={onClose} title="3D-модель и технический паспорт" size="screen" footer={controls}>
    <div className="model-inspection-layout">
      <aside className="model-inspection-dimensions" aria-label="Размеры модели">
        <div className="model-inspection-sidebar-heading"><h4>Размеры</h4><button type="button" aria-pressed={all} onClick={() => setAll(!all)}>Все размеры · {dimensions.length}</button></div>
        <ul>{rows.map((row, i) => <li key={`${row.ref}:${i}`}><button type="button" aria-pressed={selection ? dimensionKey(selection) === dimensionKey(row) : !!face && !!row.face_ids?.includes(face)} onClick={() => { setFace(null); onSelect(row); }}>
          <span>{operatorText(row.feature)}<small>{operatorText(row.name)}</small></span><strong><GeometryMeasurementValue row={row} /></strong>
        </button></li>)}</ul>
      </aside>
      <div className="model-inspection-canvas"><PartModelViewer source={source} sha={sha} selection={selection} dimensions={dimensions} allDimensions={all} onReady={onReady} onClose={onClose} onFace={id => { setFace(id); onSelect(undefined); if (id && !rows.some(row => row.face_ids?.includes(id)) && extra.some(row => row.face_ids?.includes(id))) setAll(true); }} /></div>
      <aside className="model-inspection-passport" aria-label="Данные технического паспорта">
        <h4>Паспорт</h4>
        {state.passport?.material != null && <p className="model-inspection-material">{materialLabel(state.passport.material)}</p>}
        {detail && <section><h5>{operatorText(detail.feature)}</h5><p>{operatorText(detail.name)}</p><dl>
          <div><dt>Модель</dt><dd><GeometryMeasurementValue row={detail} inlineUnit /></dd></div>
          <div><dt>Чертёж</dt><dd>{detail.drawing_nominal?.trim() ? <EngineeringText value={detail.drawing_nominal} literalMarkers /> : '—'}</dd></div>
          <div><dt>Допуск</dt><dd>{detail.tolerance?.trim() ? <EngineeringText value={detail.tolerance} literalMarkers /> : '—'}</dd></div>
          <div><dt>Шероховатость</dt><dd>{detail.roughness?.trim() ? <EngineeringText value={detail.roughness} literalMarkers /> : '—'}</dd></div>
          {detail.designation && <div><dt>Обозначение</dt><dd><EngineeringText value={detail.designation} literalMarkers /></dd></div>}
        </dl>{detail.notes && <EngineeringText value={detail.notes} literalMarkers />}
        {measurementExplanation(detail) && <p>{measurementExplanation(detail)}</p>}
        {detail.model_note && <EngineeringText value={detail.model_note} literalMarkers />}
        {detail.assumption && <div><p><strong>Принято для модели:</strong> {detail.assumption.adopted_value} {detail.unit}</p><EngineeringText value={[detail.assumption.basis, detail.assumption.affects].filter(Boolean).join('\n\n')} /></div>}
        {detail.drawing_source && <small>Источник: {operatorText(detail.drawing_source)}</small>}</section>}
        {!!state.passport?.requirements.length && <section><h5>Технические требования</h5><EngineeringCards label="Технические требования модели" items={state.passport.requirements.map(item => typeof item === 'string' ? { text: item } : item)} /></section>}
        {!!state.passport?.unmatched_requirements.length && <section><h5>Требования без измерения в модели</h5><EngineeringCards label="Требования без измерения" items={state.passport.unmatched_requirements.map(item => ({ text: operatorText(item) }))} /></section>}
        {state.passport?.issues?.length ? <section><h5>Замечания и уточнения</h5><EngineeringIssues issues={state.passport.issues} runId={state.run_id} revision={state.model_revision} sha={sha} source={source} onClarify={onClose} /></section> : !!warnings.length && <section><h5>Замечания и уточнения</h5><RemarksSummary /><EngineeringCards label="Замечания к модели" items={warnings} /></section>}
      </aside>
    </div>
  </Modal>;
}
