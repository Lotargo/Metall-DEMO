import { useState, type FormEvent } from 'react';
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import type { paths } from '@/api/schema';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { publicSourceText } from '@/utils/publicSource';

const path = '/api/v1/calculation/bar-lengths';
const key = ['bar-lengths'];
const draftKey = ['bar-lengths-draft'];
const maxLengths = 20;
const maxMillimetres = 100_000;
const metres = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3, useGrouping: false });
type Publication = paths[typeof path]['get']['responses'][200]['content']['application/json'];
type Draft = { base: Publication; lengths: number[] };

export function useBarLengthsDraft() {
  return useQuery<Draft | null>({ queryKey: draftKey, queryFn: skipToken, initialData: null, enabled: false, gcTime: Infinity }).data;
}

function lengthInMillimetres(text: string) {
  if (!/^\d+(?:[,.]\d{1,3})?$/.test(text.trim())) return null;
  const [whole, fraction = ''] = text.trim().split(/[,.]/);
  const millimetres = Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
  return millimetres >= 1 && millimetres <= maxMillimetres ? millimetres : null;
}

function sameLengths(left: number[], right: number[]) {
  return left.length === right.length && left.every((length, index) => length === right[index]);
}

function lengthLabel(length: number) {
  return `${metres.format(length / 1000)} м`;
}

export function BarLengthsSettings() {
  const client = useQueryClient();
  const publication = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.GET(path, { signal });
      if (!data) throw new Error('Не удалось загрузить длины прутка.');
      return data;
    },
  });
  const draft = useBarLengthsDraft();
  const [text, setText] = useState('');
  const [inputError, setInputError] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<'save' | 'refresh'>();
  const [conflict, setConflict] = useState(false);
  if (publication.isPending) return <p role="status">Загружаем длины прутка…</p>;
  if (!publication.data) return <div className="space-y-2">
    <p role="alert" className="text-danger">Не удалось загрузить длины прутка.</p>
    <Button type="button" variant="outline" size="sm" loading={publication.isFetching} onClick={() => void publication.refetch()}>Повторить загрузку</Button>
  </div>;

  const current = publication.data;
  const lengths = draft?.lengths ?? current.lengths_mm;
  const stale = draft != null && draft.base.revision !== current.revision;

  function edit(next: number[]) {
    const base = draft?.base ?? current;
    client.setQueryData<Draft | null>(draftKey, () => sameLengths(next, base.lengths_mm) ? null : { base, lengths: next });
    setMessage('');
    setError('');
  }

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const length = lengthInMillimetres(text);
    if (length == null) {
      setInputError('Укажите длину от 0,001 до 100 м с точностью до миллиметра.');
      return;
    }
    if (lengths.includes(length)) {
      setInputError('Такая длина уже добавлена.');
      return;
    }
    if (lengths.length >= maxLengths) {
      setInputError('Можно задать до 20 длин.');
      return;
    }
    edit([...lengths, length].sort((a, b) => a - b));
    setText('');
    setInputError('');
  }

  async function save() {
    if (!draft || stale || conflict || busy || draft.lengths.length > maxLengths) return;
    setBusy('save');
    setError('');
    setMessage('');
    try {
      const { data, error: detail, response } = await apiClient.PUT(path, {
        body: { expected_revision: draft.base.revision, lengths_mm: draft.lengths },
      });
      if (!data) {
        if (response.status === 409) setConflict(true);
        throw new Error(typeof detail?.detail === 'string' ? detail.detail : 'Не удалось сохранить длины прутка.');
      }
      await client.cancelQueries({ queryKey: key, exact: true });
      client.setQueryData<Publication>(key, saved => saved && saved.revision > data.revision ? saved : data);
      client.setQueryData<Draft | null>(draftKey, latest => latest === draft ? null : latest);
      setMessage('Длины сохранены.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить длины прутка.');
    } finally {
      setBusy(undefined);
    }
  }

  async function refresh() {
    if (!draft || busy) return;
    setBusy('refresh');
    setError('');
    try {
      const { data } = await publication.refetch({ throwOnError: true });
      if (!data) throw new Error('Не удалось загрузить действующие длины.');
      const removed = new Set(draft.base.lengths_mm.filter(length => !draft.lengths.includes(length)));
      const added = draft.lengths.filter(length => !draft.base.lengths_mm.includes(length));
      const merged = [...new Set([...data.lengths_mm.filter(length => !removed.has(length)), ...added])].sort((a, b) => a - b);
      client.setQueryData<Draft | null>(draftKey, latest => {
        if (latest !== draft) return latest;
        return sameLengths(merged, data.lengths_mm) ? null : { base: data, lengths: merged };
      });
      setConflict(false);
      setMessage('Действующие длины загружены. Проверьте список перед сохранением.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить действующие длины.');
    } finally {
      setBusy(undefined);
    }
  }

  return <div className="space-y-4">
    <p className="text-ink-secondary text-pretty">Добавьте доступные длины поставки круглого прутка. При пустом списке подбор использует 6 и 12 м.</p>
    <section aria-label="Длины в подборе" className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md bg-surface-muted px-3 py-2">
      <h3 className="font-semibold">Длины в подборе</h3>
      <p className="tabular-nums">{current.effective_lengths_mm.map(lengthLabel).join(' · ')}{!current.lengths_mm.length && <span className="text-muted"> по умолчанию</span>}</p>
    </section>
    <section aria-label="Свои длины" className="space-y-3">
      <h3 className="font-semibold">Свои длины</h3>
      {lengths.length ? <ul className="flex flex-wrap gap-2">
        {lengths.map(length => <li key={length} className="flex items-center gap-2 rounded-md border border-line px-2.5 py-1">
          <span className="whitespace-nowrap tabular-nums">{lengthLabel(length)}</span>
          <Button type="button" size="xs" variant="ghost" aria-label={`Удалить длину ${lengthLabel(length)}`} disabled={!!busy}
            onClick={() => { edit(lengths.filter(item => item !== length)); setInputError(''); }}>×</Button>
        </li>)}
      </ul> : <p className="text-muted">Своих длин пока нет.</p>}
      <div className="flex flex-wrap items-start justify-between gap-3 border-t border-line pt-3">
        <form className="flex flex-wrap items-start gap-2" onSubmit={add}>
          <div className="w-44 max-w-full">
            <Input label="Длина, м" placeholder="Например, 7,5" inputMode="decimal" className="h-9 tabular-nums" value={text}
              disabled={!!busy} error={inputError || undefined}
              onChange={event => { setText(event.target.value); setInputError(''); }} />
          </div>
          <Button type="submit" variant="outline" size="sm" className="mt-5" disabled={!text.trim() || !!busy}>Добавить</Button>
        </form>
        <Button type="button" size="sm" className="sm:mt-5" loading={busy === 'save'}
          disabled={!draft || stale || conflict || !!busy || lengths.length > maxLengths} onClick={() => void save()}>Сохранить длины</Button>
      </div>
      {lengths.length > maxLengths && <p role="alert" className="text-danger">Сократите список до 20 длин перед сохранением.</p>}
      {error && <p role="alert" className="text-danger">{publicSourceText(error, 'Не удалось сохранить длины прутка. Проверьте список и повторите попытку.')}</p>}
      {message && <p role="status" className="text-ink-secondary">{message}</p>}
      {(conflict || stale) && draft && <div className="flex flex-wrap items-center gap-2">
        <p className="text-ink-secondary">Действующие длины изменились после начала правки.</p>
        <Button type="button" variant="outline" size="sm" loading={busy === 'refresh'} disabled={!!busy}
          onClick={() => void refresh()}>Обновить и перенести правки</Button>
      </div>}
    </section>
  </div>;
}
