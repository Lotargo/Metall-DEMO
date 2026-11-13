import { InfoBlock } from '@/components/ui/InfoBlock';
import { useId, useState, type FormEvent } from 'react';
import { apiClient } from '@/api/client';
import type { components } from '@/api/schema';
import { Input, Select } from '@/components/ui/Input';
import { formatNumber } from '@/utils/compactNumbers';
import { publicSourceText } from '@/utils/publicSource';
import { PublicSourceInput } from './PublicSourceInput';

type State = components['schemas']['CompactState'];
type Estimate = components['schemas']['EstimateSnapshot'];
type Norm = components['schemas']['EstimateTimeNorm-Input'];
type Rate = components['schemas']['ReferenceEstimateRate-Input'];
type Target = { key: string; label: string; basis: string; category: string };

const frequencies = {
  per_event: 'На событие',
  per_piece: 'На деталь',
  per_setup: 'На установ',
  per_batch: 'На партию',
};

export function EstimateNormDetails({ norm }: { norm: NonNullable<components['schemas']['EstimateLine-Output']['time_norm']> }) {
  return <div className="text-xs text-muted">
    <p>{norm.execution === 'manual' ? 'Ручное действие' : 'Автоматическое движение'} · {frequencies[norm.frequency].toLowerCase()}</p>
    <p>{formatNumber(norm.minutes, 6)} мин{norm.events_per_piece != null && ` × ${norm.events_per_piece} на деталь`}{norm.setup_count != null && ` × ${norm.setup_count} на партию`}</p>
    <p>{norm.status === 'assumption' ? 'Условная норма' : 'По источнику'}</p>
  </div>;
}

function NormFields({ target, norm }: { target: Target; norm?: Norm }) {
  const setup = target.category === 'setup';
  const motion = target.category === 'motion';
  const [frequency, setFrequency] = useState<Norm['frequency']>(norm?.frequency ?? (setup ? 'per_setup' : motion ? 'per_event' : 'per_piece'));
  return <>
    <Input label="Длительность, мин" name="minutes" inputMode="decimal" required defaultValue={norm?.minutes} />
    <Select label="Частота" name="frequency" value={frequency} onChange={event => setFrequency(event.target.value as Norm['frequency'])}
      options={Object.entries(frequencies).filter(([key]) => setup ? ['per_setup', 'per_batch'].includes(key) : (key !== 'per_setup' || target.category === 'tool-change') && (!motion || key !== 'per_batch'))
        .map(([value, label]) => ({ value, label }))} />
    {frequency === 'per_event' && <Input key="event" label="Событий на деталь" name="count" type="number" min="1" step="1" required defaultValue={norm?.events_per_piece ?? 1} />}
    {frequency === 'per_setup' && <Input key="setup" label="Установов на партию" name="count" type="number" min="1" step="1" required defaultValue={norm?.setup_count ?? ''} />}
    <Select label="Выполнение" name="execution" defaultValue={norm?.execution ?? (motion ? 'automatic' : 'manual')}
      options={[{ value: 'manual', label: 'Ручное' }, { value: 'automatic', label: 'Автоматическое' }]} />
    <Select label="Статус" name="status" defaultValue={norm?.status ?? 'assumption'}
      options={[{ value: 'assumption', label: 'Условная оценка' }, { value: 'source', label: 'Подтверждено источником' }]} />
  </>;
}

export function CompactEstimateScenarioInputs({ estimate, value, runId, disabled, refresh }: {
  estimate: Estimate;
  value: State;
  runId: string;
  disabled: boolean;
  refresh: () => Promise<unknown>;
}) {
  const bases = Object.entries(estimate.operation_bases ?? {});
  const inventory = new Map(estimate.inventory.items.map(work => [work.key, work]));
  const targets = bases.flatMap(([index, basis]) => (basis.norm_targets ?? []).flatMap(key => {
    const work = inventory.get(key);
    if (!work) return [];
    const action = { auxiliary: basis.reference_sha256 ? 'Установка, зажим и снятие детали' : 'Вспомогательные действия', setup: 'Наладка', control: 'Контроль' }[work.category] ?? work.description;
    return [{ key, basis: basis.basis_sha256, label: `${value.route?.operations[Number(index)]?.title ?? index} · ${action}`, category: work.category }];
  }));
  const references = new Map(bases.flatMap(([, basis]) => basis.reference_sha256 ? [[basis.reference_sha256, basis.reference_title] as const] : []));
  const norms = value.estimation_settings.work_time_norms ?? [];
  const rates = value.estimation_settings.reference_rates ?? [];
  const [selection, setSelection] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const errorId = useId();
  const target = targets.find(item => item.key === selection) ?? (selection ? undefined : targets[0]);
  const reference = selection.startsWith('reference:') ? selection.slice(10) : !target && !selection ? references.keys().next().value : undefined;
  const norm = target && norms.find(item => item.work_key === target.key && item.basis_sha256 === target.basis);
  const rate = rates.find(item => item.reference_sha256 === reference);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const field = (name: string) => String(data.get(name) ?? '').trim();
    const removing = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'remove';
    const minutes = field('minutes').replace(',', '.');
    const source = field('source');
    const revision = field('revision');
    if (!removing && (!/^\d+(?:\.\d+)?$/.test(minutes) || !source || !revision)) {
      setError('Укажите неотрицательное число, источник и редакцию.');
      return;
    }
    const frequency = field('frequency') as Norm['frequency'];
    const body = target ? {
      work_time_norms: [
        ...norms.filter(item => item.work_key !== target.key),
        ...removing ? [] : [{
          work_key: target.key, basis_sha256: target.basis, minutes, frequency,
          events_per_piece: frequency === 'per_event' ? Number(field('count')) : null,
          setup_count: frequency === 'per_setup' ? Number(field('count')) : null,
          execution: field('execution') as Norm['execution'], status: field('status') as Norm['status'],
          source, revision,
        }],
      ],
    } : reference ? {
      reference_rates: [
        ...rates.filter(item => item.reference_sha256 !== reference),
        ...removing ? [] : [{ reference_sha256: reference, hourly_rate: minutes, source, revision } satisfies Rate],
      ],
    } : null;
    if (!body) return;
    setPending(true);
    setError('');
    setSaved(false);
    try {
      const { data: result, error: failure } = await apiClient.POST('/api/v1/runs/{run_id}/compact-round/cost-estimate', {
        params: { path: { run_id: runId } },
        body: { expected_revision: value.revision, processing_markup_coefficient: value.estimation_settings.processing_markup_coefficient ?? '1', ...body },
      });
      if (!result) throw new Error(typeof failure?.detail === 'string' ? failure.detail : 'Проверьте частоту и числовые поля. Смета сохранена в прежней редакции.');
      await refresh();
      setSaved(true);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Смету не удалось обновить.');
    } finally {
      setPending(false);
    }
  }

  if (!targets.length && !references.size) return null;
  return <InfoBlock className="space-y-2" title="Нормы и ставки расчётного сценария">

    <p className="text-sm text-muted">Норма заполняет выбранную статью сметы. Время, покрытое циклом, учитывается отдельно. Ставка эталона включает труд, оборудование, инструмент и накладные расходы.</p>
    {disabled && <p className="text-sm text-muted">Дождитесь расчёта или сохраните изменения коэффициента.</p>}
    <form onSubmit={event => void submit(event)} aria-describedby={error ? errorId : undefined} aria-busy={pending}>
      <fieldset className="grid gap-2 sm:grid-cols-2" disabled={disabled || pending}>
        <div className="sm:col-span-2"><Select label="Статья сметы" value={target?.key ?? (reference ? `reference:${reference}` : '')}
          onChange={event => { setSelection(event.target.value); setError(''); setSaved(false); }}
          options={[
            ...(!target && !reference ? [{ value: '', label: 'Выберите статью' }] : []),
            ...targets.map(item => ({ value: item.key, label: item.label })),
            ...[...references].map(([sha, title]) => ({ value: `reference:${sha}`, label: `Ставка · ${title}` })),
          ]} /></div>
        {(target || reference) && <div key={`${target?.key ?? reference}:${value.revision}`} className="contents">
          {target ? <NormFields target={target} norm={norm} /> : <Input label="Ставка, ₽/ч" name="minutes" inputMode="decimal" required defaultValue={rate?.hourly_rate} />}
          <PublicSourceInput label="Источник" name="source" required defaultValue={norm?.source ?? rate?.source} />
          <PublicSourceInput label="Дата или версия основания" name="revision" required defaultValue={norm?.revision ?? rate?.revision} />
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className="secondary-action">Сохранить и пересчитать</button>
            {(norm || rate) && <button type="submit" value="remove" formNoValidate className="secondary-action">Убрать значение</button>}
          </div>
        </div>}
      </fieldset>
      {error && <p id={errorId} role="alert" className="passport-error">{publicSourceText(error, 'Не удалось обновить смету. Проверьте исходные значения.')}</p>}
      {(pending || saved) && <p role="status">{pending ? 'Пересчёт сметы…' : 'Смета сохранена.'}</p>}
    </form>
  </InfoBlock>;
}
