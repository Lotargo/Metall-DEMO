import { useId } from 'react';
import { Button } from '@/components/ui/Button';

export function CompactRouteConfirmation({ revision, checkedRevision, onCheckedRevision, decision, onDecision, disabled, busy, stockProposal, restartDetails, geometryIssue, pendingAgents = 0, onReviewGeometry, onConfirm }: {
  revision: number; checkedRevision: number | null; onCheckedRevision: (revision: number | null) => void;
  decision: string; onDecision: (value: string) => void; disabled: boolean; busy: boolean;
  stockProposal: boolean; restartDetails: boolean; onConfirm: () => void;
  geometryIssue?: string | null; onReviewGeometry: () => void;
  pendingAgents?: number;
}) {
  const id = useId();
  return <section aria-label="Подтверждение и продолжение" className="space-y-3 border-t border-line pt-5">
    <h3 className="text-sm font-semibold">Продолжить обработку</h3>
    {pendingAgents > 0 && <p role="status" className="text-sm text-muted">Агенты решают вопросы: {pendingAgents}. Дождитесь завершения или отмените вызовы в разделе «Уточнения», затем подтвердите актуальные данные.</p>}
    <p className="text-sm">Сохранённые ответы и пропуски войдут в подтверждение. Открытые вопросы сохраняют неизвестность и ограничивают зависимые расчёты. Для продолжения подтвердите проверку текущих данных и нажмите «Подтвердить и рассчитать».</p>
    {geometryIssue && <div className="space-y-2 rounded-md bg-warning-soft p-3 text-sm">
      <p>Часть геометрических связей не установлена. При продолжении неизвестность сохранится, а зависимые расчёты могут остаться неполными.</p>
      <Button variant="outline" size="sm" disabled={busy} onClick={onReviewGeometry}>Проверить геометрические связи</Button>
    </div>}
    <label htmlFor={`${id}-decision`} className="block text-sm font-medium">Комментарий к подтверждению (необязательно)</label>
    <textarea id={`${id}-decision`} className="w-full rounded-md border border-control bg-surface px-3 py-2 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" rows={2} value={decision} disabled={disabled} onChange={event => onDecision(event.target.value)} />
    <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={checkedRevision === revision} disabled={disabled} onChange={event => onCheckedRevision(event.target.checked ? revision : null)} />Проверены паспорт, выбранная заготовка и эта редакция маршрута. Разрешаю детализацию.</label>
    {restartDetails && <p className="text-sm text-warning">Будет выполнена новая модельная детализация. Прежний результат сохранится в истории.</p>}
    <Button disabled={disabled || stockProposal || checkedRevision !== revision} loading={busy} onClick={onConfirm}>Подтвердить и рассчитать</Button>
    {checkedRevision !== revision && pendingAgents === 0 && <p className="text-xs text-muted">Для запуска подтвердите проверку текущих данных галочкой выше.</p>}
    {stockProposal && <p className="text-sm text-warning">Сначала примите решение по предложенной заготовке во вкладке «Заготовка».</p>}
  </section>;
}
