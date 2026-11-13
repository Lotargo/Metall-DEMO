import { useId } from 'react';
import type { components } from '@/api/schema';

export type LaunchOptions = NonNullable<components['schemas']['CompactAgentSettings']['launch']>;
export const defaultLaunchOptions: LaunchOptions = { verification_enabled: true, auto_resolve_questions: false };

export function CompactLaunchOptions({ value, onChange, disabled = false }: {
  value: LaunchOptions;
  onChange: (value: LaunchOptions) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return <fieldset className="space-y-3" disabled={disabled}>
    <legend className="sr-only">Режимы запуска обработки</legend>
    <div>
      <label className="flex cursor-pointer items-start gap-2 text-sm font-medium">
        <input type="checkbox" className="mt-1 accent-accent" checked={value.verification_enabled}
          aria-describedby={`${id}-verify`} onChange={event => onChange({ ...value, verification_enabled: event.target.checked })} />
        Перепроверка чертежа
      </label>
      <p id={`${id}-verify`} className="mt-1 pl-6 text-xs text-muted">Верификатор проверяет чтение и исправляет найденные расхождения.</p>
    </div>
    <div>
      <label className="flex cursor-pointer items-start gap-2 text-sm font-medium">
        <input type="checkbox" className="mt-1 accent-accent" checked={value.auto_resolve_questions}
          aria-describedby={`${id}-resolve`} onChange={event => onChange({ ...value, auto_resolve_questions: event.target.checked })} />
        Автоматическое решение вопросов
      </label>
      <p id={`${id}-resolve`} className="mt-1 pl-6 text-xs text-muted">Агент исследует чертёж и источники. Обработка продолжается через полный маршрут до сметы. Допущения и неизвестные сохраняются в результатах.</p>
    </div>
  </fieldset>;
}
