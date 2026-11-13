import { useCallback, useId, useState, useSyncExternalStore, type FormEvent } from 'react';
import { notifyManager, skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { EquipmentRequestError, equipmentRequest, type MachineRate } from '@/api/machineExchange';
import { publicSourceText } from '@/utils/publicSource';
import './machine-data.css';

export const MACHINE_RATE_COMPOSITION = 'Труд оператора, работа оборудования, энергия, накладные расходы и обычные расходники.';

export function formatMachineHourlyRate(value: MachineRate['terms']['hourly_rate']) {
  return value === null ? 'UNKNOWN · Ставка не установлена' : `${value.replace('.', ',')} ₽/ч`;
}

type RateDraft = { value: string; expectedVersion: number };
type RateError = { kind: 'invalid' | 'conflict' | 'request'; message: string };
const draftQueryName = 'machine-hourly-rate-draft';
const draftStoragePrefix = `metall-demo.${draftQueryName}:`;

function readDraft(key: string): RateDraft | null {
  try {
    const stored = JSON.parse(sessionStorage.getItem(key) ?? 'null') as Partial<RateDraft> | null;
    if (!stored || typeof stored.value !== 'string' || typeof stored.expectedVersion !== 'number') return null;
    return Number.isInteger(stored.expectedVersion) && stored.expectedVersion >= 0
      ? { value: stored.value, expectedVersion: stored.expectedVersion } : null;
  } catch {
    return null;
  }
}

export function useHasMachineRateDraft() {
  const cache = useQueryClient().getQueryCache();
  const subscribe = useCallback((listener: () => void) => {
    const notify = notifyManager.batchCalls(listener);
    return cache.subscribe(event => {
      if (event.query.queryKey[0] === draftQueryName) notify();
    });
  }, [cache]);
  return useSyncExternalStore(subscribe, () => {
    if (cache.findAll({ queryKey: [draftQueryName] }).some(query => query.state.data != null)) return true;
    try {
      return Object.keys(sessionStorage).some(key => key.startsWith(draftStoragePrefix) && readDraft(key) !== null);
    } catch {
      return false;
    }
  });
}

type RateFormProps = { machineId: string; compact?: boolean };

export function MachineHourlyRate({ machineId, compact }: RateFormProps) {
  return <MachineHourlyRateForm key={machineId} machineId={machineId} compact={compact} />;
}

function MachineHourlyRateForm({ machineId, compact = false }: RateFormProps) {
  const client = useQueryClient();
  const fieldId = useId();
  const path = `passports/${encodeURIComponent(machineId)}/hourly-rate`;
  const rateKey = ['machine-hourly-rate', machineId];
  const draftKey = [draftQueryName, machineId];
  const storageKey = `${draftStoragePrefix}${machineId}`;
  const query = useQuery({ queryKey: rateKey, queryFn: () => equipmentRequest<MachineRate>(path), retry: false });
  const { data: draft } = useQuery<RateDraft | null>({
    queryKey: draftKey,
    queryFn: skipToken,
    initialData: () => readDraft(storageKey),
    enabled: false,
    gcTime: Infinity,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<RateError | null>(null);
  const [notice, setNotice] = useState('');
  const rate = query.data;
  const text = draft?.value ?? rate?.terms.hourly_rate ?? '';
  const conflict = Boolean(draft && (error?.kind === 'conflict' || (rate && rate.version !== draft.expectedVersion)));

  function storeDraft(next: RateDraft | null) {
    try {
      if (next) sessionStorage.setItem(storageKey, JSON.stringify(next));
      else sessionStorage.removeItem(storageKey);
    } catch {
      // The draft remains available in the current app session.
    }
    client.setQueryData(draftKey, next);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rate || !draft || conflict || busy) return;
    setError(null);
    setNotice('');
    const value = draft.value.trim();
    if (value && !/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(value)) {
      setError({ kind: 'invalid', message: 'Введите неотрицательную ставку в рублях за час или оставьте поле пустым.' });
      return;
    }
    setBusy(true);
    try {
      const saved = await equipmentRequest<MachineRate>(path, {
        expected_version: draft.expectedVersion,
        hourly_rate: value ? value.replace(',', '.') : null,
      }, 'PUT');
      await client.cancelQueries({ queryKey: rateKey, exact: true });
      client.setQueryData<MachineRate>(rateKey, current => current && current.version > saved.version ? current : saved);
      void client.invalidateQueries({ queryKey: ['machine-hourly-rates'] });
      if (client.getQueryData(draftKey) === draft) storeDraft(null);
      setNotice(compact ? 'Ставка сохранена.' : 'Ставка сохранена. Для применения к детали пересчитайте стоимость в смете.');
    } catch (cause) {
      const kind = cause instanceof EquipmentRequestError && cause.status === 409 ? 'conflict' : 'request';
      setError({ kind, message: cause instanceof Error ? cause.message : 'Не удалось сохранить ставку.' });
    } finally {
      setBusy(false);
    }
  }

  async function refreshDraft() {
    if (!draft || busy) return;
    setBusy(true);
    try {
      const latest = await query.refetch({ throwOnError: true });
      if (!latest.data || client.getQueryData(draftKey) !== draft) return;
      storeDraft({ ...draft, expectedVersion: latest.data.version });
      setError(null);
      setNotice('Текущая редакция загружена. Сравните её с черновиком перед сохранением.');
    } catch {
      setError({ kind: 'conflict', message: 'Не удалось загрузить текущую редакцию. Черновик сохранён.' });
    } finally {
      setBusy(false);
    }
  }

  const invalid = error?.kind === 'invalid';
  return <form className="machine-hourly-rate" onSubmit={event => void save(event)} aria-busy={busy}>
    <div className="machine-rate-values">
      <div>
        <label htmlFor={fieldId}>Стоимость часа работы</label>
        <div className="machine-value-cell">
          <input className="ui-input" id={fieldId} inputMode="decimal" placeholder="Ставка не установлена" value={text}
            disabled={busy || !rate} aria-invalid={invalid || undefined}
            aria-describedby={compact
              ? (invalid ? `${fieldId}-error` : undefined)
              : `${fieldId}-help${invalid ? ` ${fieldId}-error` : ''}`}
            onChange={event => {
              if (!rate) return;
              storeDraft({ value: event.target.value, expectedVersion: draft?.expectedVersion ?? rate.version });
              if (error?.kind !== 'conflict') setError(null);
              setNotice('');
            }} />
          <span className="machine-value-unit">₽/ч</span>
        </div>
      </div>
      {rate && <dl className="machine-rate-source">
        <div><dt>Текущая ставка в парке</dt><dd>{formatMachineHourlyRate(rate.terms.hourly_rate)}</dd></div>
        {!compact && <>
          <div><dt>Коммерческая редакция</dt><dd>{rate.version}</dd></div>
          <div><dt>Основание ставки</dt><dd>{publicSourceText(rate.terms.source, 'Основание ставки отсутствует')}</dd></div>
        </>}
      </dl>}
    </div>
    {!compact && <>
      <p id={`${fieldId}-help`} className="machine-table-hint">0 ₽/ч задаёт нулевую ставку. Пустое поле оставляет ставку неизвестной.</p>
      <p className="machine-table-hint">Состав тарифа. {MACHINE_RATE_COMPOSITION}</p>
      <p className="machine-table-hint">Сохранение меняет ставку этого станка. Для применения к детали используется отдельный пересчёт стоимости.</p>
    </>}
    {query.isLoading && <p role="status" className="machine-table-hint">Загрузка ставки…</p>}
    {query.isError && !conflict && <div role="alert" className="passport-error">
      <p>Не удалось загрузить ставку.</p>
      <button type="button" className="secondary-action" onClick={() => void query.refetch()}>Повторить загрузку</button>
    </div>}
    {error && error.kind !== 'conflict' && <p role="alert" className="passport-error" id={`${fieldId}-error`}>{publicSourceText(error.message, 'Не удалось сохранить ставку.')}</p>}
    {conflict && <div role="alert" className="passport-error">
      <p>{error?.kind === 'conflict' ? publicSourceText(error.message, 'Ставка изменилась после начала правки. Черновик сохранён.') : 'Ставка изменилась после начала правки. Черновик сохранён.'}</p>
      <button type="button" className="secondary-action" disabled={busy}
        onClick={() => void refreshDraft()}>Обновить ставку, сохранив ввод</button>
    </div>}
    {notice && <p role="status" className="machine-table-hint">{notice}</p>}
    {draft && <div className="passport-actions">
      {!compact && <span className="machine-table-hint">Черновик · редакция {draft.expectedVersion}</span>}
      <button type="submit" disabled={busy || !rate || conflict} className="secondary-action">
        {busy ? 'Обработка…' : 'Сохранить ставку'}
      </button>
      <button type="button" className="secondary-action" disabled={busy} onClick={() => {
        storeDraft(null);
        setError(null);
        setNotice('');
      }}>Сбросить черновик ставки</button>
    </div>}
  </form>;
}
