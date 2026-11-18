import { EngineeringText } from './EngineeringText';
import { operatorSourceText, type EngineeringItem } from '@/components/route/geometryPresentation';

export function EngineeringCards({ items, label }: { items: EngineeringItem[]; label: string }) {
  return <ol className="engineering-cards" aria-label={label}>{items.map((item, index) => <li key={index} className="engineering-card">
    <span className="engineering-card-number" aria-hidden="true">{index + 1}</span>
    <div className="engineering-card-copy">
      {item.context && <p className="engineering-card-context">{item.context}</p>}
      <EngineeringText value={item.text} literalMarkers />
      {item.source && <p className="engineering-card-source">{operatorSourceText(item.source)}</p>}
    </div>
  </li>)}</ol>;
}

export function RemarksSummary() {
  return <div className="engineering-remarks-summary">
    <p>Неуточнённые параметры чертежа, упрощения 3D-геометрии и замечания её проверки.</p>
    <p><strong>Результат предварительный.</strong> По перечисленным пунктам соответствие модели и требований чертежа ещё не подтверждено. Принятие модели сохраняет эти замечания.</p>
  </div>;
}
