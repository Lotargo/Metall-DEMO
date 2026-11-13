import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import type { components } from '@/api/schema';
import { publicSourceText } from '@/utils/publicSource';

type Profile = components['schemas']['EstimateProfile'];
type Norm = Profile['parameters'][string];
type Draft = { text: string; base: string | null };

export function TimeNormRow({ profile, parameter, number, label, unit, heading, conditions }: {
  profile: Profile;
  parameter: string;
  number: Norm | null;
  label: string;
  unit: string;
  heading: ReactNode;
  conditions: ReactNode;
}) {
  const id = useId();
  const client = useQueryClient();
  const [draft, setDraft] = useState<Draft>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string }>();
  const saved = number?.value ?? null;
  const value = draft?.text ?? saved?.replace('.', ',') ?? '';
  const candidate = value.trim().replace(',', '.') || null;
  const editable = number != null && number.lower == null && number.upper == null;
  const stale = draft != null && draft.base !== saved;
  const changed = draft != null && candidate !== saved;
  const feedback = stale ? {
    error: true,
    text: `Текущее значение изменилось: ${saved?.replace('.', ',') ?? 'не определено'}. Проверьте ввод перед сохранением.`,
  } : message;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editable || !changed || stale || busy) return;
    if (candidate != null && !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(candidate)) {
      setMessage({ error: true, text: 'Введите неотрицательное число или оставьте поле пустым.' });
      return;
    }
    setBusy(true);
    setMessage(undefined);
    const key = ['estimation-profiles'];
    try {
      const { data, error, response } = await apiClient.PUT('/api/v1/estimation/time-profiles/{profile_id}/parameters/{parameter}', {
        params: { path: { profile_id: profile.id, parameter } },
        body: { expected_sha256: profile.sha256, value: candidate },
      });
      if (!data) {
        if (response.status === 409) await client.invalidateQueries({ queryKey: key, exact: true });
        throw new Error(typeof error?.detail === 'string' ? error.detail : profile.kind === 'rate' ? 'Не удалось сохранить ставку.' : 'Не удалось сохранить норму.');
      }
      await client.cancelQueries({ queryKey: key, exact: true });
      client.setQueryData<Profile[]>(key, current => current?.map(item =>
        item.id === profile.id && item.sha256 === profile.sha256 ? data : item));
      setDraft(undefined);
      setMessage({ error: false, text: 'Сохранено.' });
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : 'Не удалось сохранить норму.' });
    } finally {
      setBusy(false);
    }
  }

  return <tr>
    {heading}
    <th scope="row" className="px-3 py-2 align-top font-normal"><label htmlFor={editable ? id : undefined}>{label}</label></th>
    <td className="px-3 py-2 align-top tabular-nums">
      {editable ? <form id={`${id}-form`} onSubmit={event => void save(event)} aria-busy={busy} className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <input id={id} inputMode="decimal" value={value} placeholder="Не определено" disabled={busy}
            className="ui-input w-28"
            aria-invalid={feedback?.error || undefined} aria-describedby={`${id}-unit${feedback ? ` ${id}-feedback` : ''}`}
            onChange={event => {
              setDraft({ text: event.target.value, base: saved });
              setMessage(undefined);
            }} />
          <span id={`${id}-unit`} className="text-ink-secondary">{unit}</span>
        </div>
        {number?.basis === 'assumption' && <p className="text-xs text-muted">Ориентир</p>}
        {feedback && <p id={`${id}-feedback`} role={feedback.error ? 'alert' : 'status'}
          className={feedback.error ? 'text-warning' : 'text-muted'}>{publicSourceText(feedback.text, 'Не удалось сохранить значение. Проверьте ввод.')}</p>}
      </form> : 'Не определено'}
    </td>
    {conditions}
    <td className="px-3 py-2 text-right align-top">
      {editable && <button type="submit" form={`${id}-form`} className="primary-action"
        disabled={!changed || stale || busy} aria-label={`Сохранить ${profile.kind === 'rate' ? 'ставку' : 'норму'} «${label}»`}>
        {busy ? 'Сохранение…' : 'Сохранить'}
      </button>}
    </td>
  </tr>;
}
