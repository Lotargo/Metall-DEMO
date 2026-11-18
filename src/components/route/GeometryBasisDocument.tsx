import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Printer } from 'lucide-react';
import type { VolumeState } from '@/api/hooks/useVolumeRound';
import { Tabs } from '@/components/ui/Tabs';
import { EngineeringText } from '@/components/ui/EngineeringText';
import { EstimateConditions } from './VolumeEstimate';
import { CalculationBasisSections } from './CalculationBasisSections';
import { demoFileFor } from '@/demo/config';

const sections = [{ id: 'volumes', label: 'Объёмы' }, { id: 'time', label: 'Время' }, { id: 'cost', label: 'Стоимость' }, { id: 'assumptions', label: 'Принятые условия' }, { id: 'excluded', label: 'Что не учтено' }];
export function GeometryBasisDocument({ state }: { state: VolumeState }) {
  const [section, setSection] = useState('volumes');
  if (!state.calculation_basis && !state.time_estimate) return <p role="status">Основания появятся после получения геометрии и расчёта.</p>;
  const quantitative = section === 'volumes' || section === 'time' || section === 'cost';
  return <div className="geometry-document-workspace">
    <div className="document-toolbar"><h2>Основания расчёта</h2><div className="calculation-basis-actions"><a className="ui-button ui-button--outline ui-button--size-sm" href={demoFileFor(`/api/v1/runs/${encodeURIComponent(state.run_id)}/volume-round/basis`)} download="calculation-basis.md"><Download size={16} aria-hidden="true" />Скачать основания</a><Link className="ui-button ui-button--outline ui-button--size-sm" to={`/runs/${state.run_id}/basis/print`}><Printer size={16} aria-hidden="true" />Печатная форма оснований</Link></div></div>
    {state.time_estimate?.scope && <section className="document-sheet"><div className="document-panel"><h3 className="document-section-title">Область оценки</h3><EngineeringText value={state.time_estimate.scope} /></div></section>}
    <div className="document-sheet"><Tabs id="geometry-basis-tabs" aria-label="Содержание оснований" layout="scroll" items={sections} activeId={section} onChange={setSection} />
      <div className="document-panel" role="tabpanel" id={`geometry-basis-tabs-panel-${section}`} aria-labelledby={`geometry-basis-tabs-tab-${section}`} tabIndex={0}>
        {quantitative ? <CalculationBasisSections state={state} section={section} /> : <EstimateConditions state={state} section={section as 'assumptions' | 'excluded'} />}
        {section === 'excluded' && !state.time_estimate?.excluded_work?.length && <p>Исключённые работы не указаны в сохранённом расчёте.</p>}
        {section === 'assumptions' && !state.time_estimate && <p>Оценка времени ещё не получена. Условия геометрии приведены в объёмах.</p>}
      </div>
    </div>
  </div>;
}
