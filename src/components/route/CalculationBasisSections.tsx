import type { VolumeState } from '@/api/hooks/useVolumeRound';
import { EngineeringText } from '@/components/ui/EngineeringText';
import { operatorText } from './geometryPresentation';

/** Shared saved-data projection for screen and print; no second calculation in React. */
export function CalculationBasisSections({ state, section }: { state: VolumeState; section?: 'volumes' | 'time' | 'cost' }) {
  const basis = state.calculation_basis;
  if (!basis) return <p role="status">Подробные основания ещё не загружены. Сохранённые пояснения доступны в принятых условиях.</p>;
  return <div className="calculation-basis-sections">{basis.sections.filter(item => !section || item.id === section).map(part => {
    const cardNotes = new Set(part.items.flatMap(card => card.notes));
    const generalNotes = [...new Set(part.notes)].filter(text => !cardNotes.has(text));
    return <section key={part.id} aria-label={part.title}>
    <h3 className="document-section-title">{part.title}</h3>
    {part.legend && <p className="calculation-basis-legend">{part.legend}</p>}
    <ul className="calculation-basis-list">{part.items.map((card, i) => <li key={i} className="calculation-basis-item">
      <div className="calculation-basis-heading"><h4>{operatorText(card.title)}</h4><span>{operatorText(card.origin)}</span></div>
      {card.lines.map((text, j) => <EngineeringText key={j} value={text} />)}
      {card.formulas.length > 0 && <div className="calculation-basis-formulas" aria-label="Формулы и подстановки">{card.formulas.map((text, j) => <p key={j}>{operatorText(text)}</p>)}</div>}
      {!!card.table?.length && <div className="table-wrap"><table className="calculation-basis-table">
        <caption className="sr-only">{operatorText(card.title)}</caption>
        <thead><tr>{card.table[0].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{card.table.slice(1).map(([name, ...values], row) => <tr key={row}>
          <th scope="row">{operatorText(name)}</th>
          {values.map((value, col) => <td key={col}>{operatorText(value)}</td>)}
        </tr>)}</tbody>
      </table></div>}
      {card.notes.length > 0 && <ul className="calculation-basis-notes">{card.notes.map((text, j) => <li key={j}><EngineeringText value={text} /></li>)}</ul>}
    </li>)}</ul>
    {generalNotes.length > 0 && <div className="document-notices"><h4 className="font-semibold">Границы расчёта</h4>{generalNotes.map((text, i) => <EngineeringText key={i} value={text} />)}</div>}
  </section>; })}</div>;
}
