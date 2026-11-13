import type { ReactNode } from 'react';

export const workspaceTabs = [
  { id: 'description', label: 'Описание детали' },
  { id: 'passport', label: 'Технический паспорт' },
  { id: 'stock', label: 'Заготовка' },
  { id: 'material', label: 'Свойства материала' },
  { id: 'questions', label: 'Уточнения' },
  { id: 'preliminary', label: 'Предварительный маршрут' },
  { id: 'full-route', label: 'Полный маршрут' },
  { id: 'estimate', label: 'Смета' },
] as const;

export function WorkspacePanel({ id, active, children }: { id: string; active: string; children: ReactNode }) {
  return <div role="tabpanel" id={`compact-round-tabs-panel-${id}`} aria-labelledby={`compact-round-tabs-tab-${id}`}
    hidden={active !== id} tabIndex={0} className="space-y-5 pt-5">{children}</div>;
}
