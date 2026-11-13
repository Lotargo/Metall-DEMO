import { InfoBlock } from '@/components/ui/InfoBlock';
import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import type { useCompactRound } from '@/api/hooks/useCompactRound';
import type { components } from '@/api/schema';
import { coefficientForRequest } from '@/utils/estimateCoefficient';
import { publicSourceText } from '@/utils/publicSource';

type State = components['schemas']['CompactState'];
type Command = components['schemas']['CompactCostCommand'];
type RateField = 'labor_coefficient' | 'processing_markup_coefficient';
type LaborRateField = 'inspection_rate' | 'manual_rate';
type LaborRateDraft = { hourly_rate: string; source: string; revision: string };
type SettingsChange = Partial<Pick<Command, RateField | LaborRateField>>;
type Reload = ReturnType<typeof useCompactRound>['refetch'];

const coefficients: { field: RateField; label: string; hint: string; action: string }[] = [
  {
    field: 'labor_coefficient',
    label: 'Коэффициент трудоёмкости',
    hint: '1,00 сохраняет базовое время. 1,20 добавляет к трудоёмкости 20% применимого базового времени.',
    action: 'Сохранить трудоёмкость',
  },
  {
    field: 'processing_markup_coefficient',
    label: 'Коммерческая надбавка',
    hint: '1,00 сохраняет цену. При 1,20 надбавка к стоимости обработки составляет 20%.',
    action: 'Сохранить надбавку',
  },
];

const inputClass = 'ui-input';

export function CompactEstimateRateSettings({ state, reload, includeProcessingMarkup = true }: { state: State; reload: Reload; includeProcessingMarkup?: boolean }) {
  const client = useQueryClient();
  const [drafts, setDrafts] = useState<Partial<Record<RateField, string>>>({});
  const [busy, setBusy] = useState<keyof SettingsChange>();
  const [notice, setNotice] = useState<{ field: keyof SettingsChange; kind: 'saved' | 'error'; text: string }>();
  const [conflict, setConflict] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [rateDrafts, setRateDrafts] = useState<Partial<Record<LaborRateField, LaborRateDraft>>>({});
  const [editedBasis, setEditedBasis] = useState<Set<string>>(() => new Set());
  const canSave = state.details.length > 0 && !state.calculation_pending
    && state.quantity_review?.impact !== 'dependent' && ['ready', 'review'].includes(state.status);
  const disabled = !canSave || busy != null || conflict || reloading;

  async function save(field: keyof SettingsChange, change: SettingsChange) {
    if (disabled) return;
    setBusy(field);
    setNotice(undefined);
    try {
      const runId = state.source_run_id;
      const { data, error, response } = await apiClient.POST('/api/v1/runs/{run_id}/compact-round/cost-estimate', {
        params: { path: { run_id: runId } },
        body: {
          expected_revision: state.revision,
          ...(state.cost_estimate && { preserve_machine_rates: true }),
          ...change,
        },
      });
      if (!data) {
        setConflict(response.status === 409);
        throw new Error(response.status === 409
          ? 'Редакция расчёта изменилась. Обновите данные и проверьте значение.'
          : typeof error?.detail === 'string' ? error.detail : 'Не удалось сохранить значение.');
      }
      const key = ['compact-round', runId];
      await client.cancelQueries({ queryKey: key, exact: true });
      client.setQueryData<State>(key, current => current && current.revision > data.revision ? current : data);
      if (field === 'inspection_rate' || field === 'manual_rate') {
        setRateDrafts(current => ({ ...current, [field]: undefined }));
        setEditedBasis(current => new Set([...current].filter(key => !key.startsWith(`${field}:`))));
      }
      else setDrafts(current => ({ ...current, [field]: undefined }));
      setNotice({ field, kind: 'saved', text: 'Сохранено. Смета пересчитана.' });
    } catch (error) {
      setNotice({ field, kind: 'error', text: error instanceof Error ? error.message : 'Не удалось сохранить значение.' });
    } finally {
      setBusy(undefined);
    }
  }

  async function refresh() {
    setReloading(true);
    try {
      const { data } = await reload({ throwOnError: true });
      if (!data) throw new Error('Деталь недоступна');
      setConflict(false);
      setNotice(undefined);
    } catch {
      if (notice) setNotice({ ...notice, text: 'Не удалось обновить данные детали. Ввод сохранён.' });
    } finally {
      setReloading(false);
    }
  }

  function saveLaborRate(field: LaborRateField, rateFields: LaborRateDraft, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const hourly_rate = rateFields.hourly_rate.trim().replace(',', '.');
    const source = rateFields.source.trim();
    const revision = rateFields.revision.trim();
    if (!/^\d+(?:\.\d+)?$/.test(hourly_rate) || !Number.isFinite(Number(hourly_rate)) || !source || !revision) {
      setNotice({ field, kind: 'error', text: 'Укажите ставку от 0, источник и его редакцию.' });
      return;
    }
    void save(field, { [field]: { hourly_rate, source, revision } });
  }

  function feedback(field: keyof SettingsChange) {
    if (notice?.field !== field) return null;
    return <p id={`rate-settings-${field}-status`} role={notice.kind === 'error' ? 'alert' : 'status'}
      className={notice.kind === 'error' ? 'text-warning' : 'text-muted'}>{publicSourceText(notice.text, 'Не удалось сохранить значение. Проверьте ввод.')}</p>;
  }

  return <section className="space-y-4" aria-label="Параметры сметы детали">
    <p className="text-muted">Цена материала прутка не учитывается. Смета включает производственные работы.</p>
    {state.reading && <p className="text-muted">{[state.reading.part_name.text, state.reading.designation.text].filter(Boolean).join(' · ')}</p>}
    {!canSave && <p className="text-muted">Сохранение доступно после детализации и проверки текущего количества.</p>}
    <div className="grid gap-4 lg:grid-cols-2">
      {coefficients.filter(item => includeProcessingMarkup || item.field !== 'processing_markup_coefficient').map(({ field, label, hint, action }) => {
        const id = `rate-settings-${field}`;
        const saved = state.estimation_settings[field] ?? '1';
        const value = drafts[field] ?? saved.replace('.', ',');
        const candidate = coefficientForRequest(value, saved);
        return <form key={field} aria-busy={busy === field} className="min-w-0 space-y-2" onSubmit={event => {
          event.preventDefault();
          if (candidate == null) setNotice({ field, kind: 'error', text: 'Введите число не меньше 1.' });
          else if (candidate !== saved) void save(field, { [field]: candidate });
        }}>
          <label htmlFor={id} className="block font-semibold">{label}</label>
          <p id={`${id}-hint`} className="text-muted">{hint}</p>
          <div className="flex flex-wrap items-center gap-2">
            <input id={id} className={`${inputClass} w-24 tabular-nums`} inputMode="decimal" value={value}
              disabled={!canSave || busy != null || reloading} aria-invalid={notice?.field === field && notice.kind === 'error' && candidate == null || undefined}
              aria-describedby={`${id}-hint${notice?.field === field ? ` ${id}-status` : ''}`}
              onChange={event => {
                setDrafts(current => ({ ...current, [field]: event.target.value }));
                if (notice?.field === field && !conflict) setNotice(undefined);
              }} />
            <button className="secondary-action" type="submit" disabled={disabled || candidate === saved}>
              {busy === field ? 'Сохранение…' : action}
            </button>
          </div>
          {feedback(field)}
        </form>;
      })}
    </div>
    {([['inspection_rate', 'Ставка ОТК', 'Применяется к отдельному контролю ОТК.'], ['manual_rate', 'Ставка ручных работ', 'Применяется к очистке, удалению заусенцев и другим ручным работам с известным объёмом.']] as const).map(([field, label, hint]) => {
      const rate = state.estimation_settings[field];
      const draft = rateDrafts[field];
      const rateFields = draft ?? { hourly_rate: rate?.hourly_rate?.replace('.', ',') ?? '', source: rate?.source ?? '', revision: rate?.revision ?? '' };
      return <section key={field} className="space-y-2 border-t border-line pt-3" aria-label={label}>
        <h3 className="font-semibold">{label}{rate ? ` · ${rate.hourly_rate.replace('.', ',')} ₽/ч` : ' · не задана'}</h3>
        <form className="space-y-2" aria-busy={busy === field} onSubmit={event => saveLaborRate(field, rateFields, event)}>
          <p className="text-muted">{hint}</p>
          <label className="grid max-w-40 gap-1 font-medium">Ставка, ₽/ч
            <input className={inputClass} value={rateFields.hourly_rate} inputMode="decimal"
              disabled={!canSave || busy != null || reloading} onChange={event => setRateDrafts(current => ({ ...current, [field]: { ...rateFields, hourly_rate: event.target.value } }))} />
          </label>
          <div className="space-y-1 text-muted">
            <p>{publicSourceText(rateFields.source, 'Основание ставки не указано')}</p>
            {rateFields.revision && <p>{publicSourceText(rateFields.revision, 'Редакция основания сохранена')}</p>}
          </div>
          <InfoBlock title="Основание ставки">

            <div className="grid max-w-2xl gap-2 pt-3 sm:grid-cols-2">
              {([['source', 'Основание ставки'], ['revision', 'Дата или редакция документа']] as const).map(([part, title]) => {
                const key = `${field}:${part}`;
                const text = rateFields[part];
                const displayed = editedBasis.has(key) || !text.trim() ? text : publicSourceText(text, 'Основание не уточнено');
                return <label key={part} className="grid gap-1 font-medium">{title}
                  <input className={inputClass} value={displayed} maxLength={part === 'source' ? 400 : 120}
                    disabled={!canSave || busy != null || reloading} onChange={event => {
                      setEditedBasis(current => new Set(current).add(key));
                      setRateDrafts(current => ({ ...current, [field]: { ...rateFields, [part]: event.target.value } }));
                    }} />
                </label>;
              })}
            </div>
          </InfoBlock>
          <div className="flex flex-wrap gap-2">
            <button className="secondary-action" type="submit" disabled={disabled || !draft}>{busy === field ? 'Сохранение…' : `Сохранить ставку ${field === 'inspection_rate' ? 'ОТК' : 'ручных работ'}`}</button>
            {rate && <button className="secondary-action" type="button" disabled={disabled} onClick={() => void save(field, { [field]: null })}>Снять ставку {field === 'inspection_rate' ? 'ОТК' : 'ручных работ'}</button>}
          </div>
          {feedback(field)}
        </form>
      </section>;
    })}
    {conflict && <button type="button" className="secondary-action" disabled={reloading} onClick={() => void refresh()}>{reloading ? 'Обновление…' : 'Обновить данные детали'}</button>}
  </section>;
}
