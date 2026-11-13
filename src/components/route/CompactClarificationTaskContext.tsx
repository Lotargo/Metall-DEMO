import type { components } from '@/api/schema';
import { Button } from '@/components/ui/Button';
import { publicSourceText } from '@/utils/publicSource';

type Task = components['schemas']['CompactClarificationTask'];
export type NumericFactTarget = NonNullable<components['schemas']['ClarificationTaskDefinition-Output']['numeric_target']>;
export type ClarificationPanel = 'stock' | 'passport' | 'preliminary' | 'full-route';
export type QueueCounts = { tasks: number; unclassified: number; sources: number };

export const purposeLabels = {
  fact: 'Факты чертежа', estimate_decision: 'Условия предварительной оценки',
  engineering_proposal: 'Технологические предложения', production_confirmation: 'Подтверждения для производства',
};
const dependencyLabels = {
  stock_selection: 'Подбор заготовки', preliminary_route: 'Предварительный маршрут',
  operation_calculation: 'Расчёт операции', production_acceptance: 'Производственная приёмка',
};

export function CompactClarificationTaskContext({ task, disabled, onOpenContext, onEditNumericFact, onRecordEvidence }: {
  task: Task; disabled: boolean;
  onOpenContext?: (panel: ClarificationPanel, operationIndex?: number) => void;
  onEditNumericFact?: (target: NumericFactTarget) => void;
  onRecordEvidence: () => void;
}) {
  const { definition } = task;
  const operations = [...new Set(definition.dependencies.filter(item => item.result === 'operation_calculation' && item.operation_index != null).map(item => item.operation_index!))];
  const action = definition.action;
  return <div className="space-y-3 text-sm">
    {definition.proposal && <div className="rounded-md bg-surface-muted p-3"><p className="font-medium">Предложенный вариант</p><p className="mt-1 whitespace-pre-wrap">{publicSourceText(definition.proposal, 'Предложение требует уточнения')}</p><p className="mt-2 text-xs text-muted">Предложение требует отдельной технологической проверки; комментарий не изменяет принятый маршрут.</p></div>}
    <ul className="space-y-2">{definition.dependencies.map((dependency, index) => <li key={index}>
      <p className="font-medium">{dependencyLabels[dependency.result]}{dependency.operation_index != null ? ` ${dependency.operation_index + 1}` : ''}</p>
      <p className="whitespace-pre-wrap">{publicSourceText(dependency.explanation, 'Влияние требует уточнения')}</p>
    </li>)}</ul>
    <div className="flex flex-wrap gap-2">
      {action === 'edit_passport' && definition.numeric_target && onEditNumericFact && <Button variant="outline" size="sm" disabled={disabled} onClick={() => onEditNumericFact(definition.numeric_target!)}>Указать численный факт в паспорте</Button>}
      {action === 'edit_passport' && !definition.numeric_target && onOpenContext && <Button variant="outline" size="sm" disabled={disabled} onClick={() => onOpenContext('passport')}>Открыть паспорт</Button>}
      {action === 'review_stock' && onOpenContext && <Button variant="outline" size="sm" disabled={disabled} onClick={() => onOpenContext('stock')}>Перейти к выбору заготовки</Button>}
      {action === 'review_route' && onOpenContext && <Button variant="outline" size="sm" disabled={disabled} onClick={() => onOpenContext('preliminary')}>Открыть предварительный маршрут</Button>}
      {action === 'review_operation' && onOpenContext && (operations.length
        ? operations.map(operation => <Button key={operation} variant="outline" size="sm" disabled={disabled} onClick={() => onOpenContext('full-route', operation)}>Открыть операцию {operation + 1}</Button>)
        : <Button variant="outline" size="sm" disabled={disabled} onClick={() => onOpenContext('full-route')}>Открыть полный маршрут</Button>)}
      {action === 'record_evidence' && <Button variant="outline" size="sm" disabled={disabled} onClick={onRecordEvidence}>Указать подтверждающие сведения</Button>}
    </div>
    {definition.numeric_target && <p className="text-xs text-muted">Численный факт сохраняется отдельной явной правкой паспорта. Текстовый ответ и пропуск не меняют расчётные числа.</p>}
  </div>;
}
