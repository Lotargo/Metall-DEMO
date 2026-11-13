import { InfoBlock } from '@/components/ui/InfoBlock';
import { useState, type FormEvent } from 'react';
import type { components } from '@/api/schema';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { publicSourceText } from '@/utils/publicSource';
import { PublicSourceInput } from './PublicSourceInput';

type CostCommand = components['schemas']['CompactCostCommand'];
type Group = NonNullable<CostCommand['reserve_groups']>[number];
type Estimate = components['schemas']['EstimateSnapshot'];

export function CompactEstimateReserveEditor({ estimate, saved, disabled, save }: {
  estimate: Estimate;
  saved: Group[];
  disabled: boolean;
  save: (groups: Group[]) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const options = saved.map((group, index) => ({ group, label: `Группа ${index + 1} · ${group.currency}` }));
  if (estimate.quantity != null) for (const total of estimate.totals) {
    const { currency, price_basis } = total;
    if (!['source', 'estimate'].includes(price_basis) || saved.some(group => group.currency === currency && group.price_basis === price_basis)) continue;
    const cost_keys = estimate.lines.filter(line => line.computed_batch_amount != null && line.currency === currency
      && line.price_basis === price_basis && !['material', 'material-credit'].includes(line.category)).map(line => line.work_key);
    if (cost_keys.length) options.push({
      group: { id: `works-${currency}-${price_basis}`, cost_keys, method: 'manual_amount', currency, price_basis, source: '' },
      label: `Оценённые работы · ${currency} · ${price_basis === 'source' ? 'по источнику' : 'ориентир'}`,
    });
  }
  const option = options.find(item => item.group.id === selected) ?? options[0];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!option || disabled) return;
    const data = new FormData(event.currentTarget);
    const amount = String(data.get('reserve-amount') ?? '').trim().replace(',', '.');
    const source = String(data.get('reserve-source') ?? '').trim();
    if (!/^\d+(?:\.\d{1,3})?$/.test(amount) || !source) {
      setError('Укажите сумму от нуля и основание резерва.');
      return;
    }
    setError('');
    const { group } = option;
    const updated: Group = {
      id: group.id, cost_keys: group.cost_keys, method: 'manual_amount',
      currency: group.currency, price_basis: group.price_basis, amount, source,
    };
    const groups = saved.some(item => item.id === group.id)
      ? saved.map(item => item.id === group.id ? updated : item)
      : [...saved, updated];
    if (!await save(groups)) setError('Резерв не сохранён. Проверьте сообщение в условиях расчёта.');
  }

  return <InfoBlock className="text-sm" title="Резерв сметы">

    {!option || estimate.quantity == null ? <p className="mt-2 text-muted">Для резерва нужны оценённые работы и подтверждённое количество заказа.</p>
      : <form className="mt-3 space-y-3" key={option.group.id} onSubmit={event => void submit(event)}>
        <label className="block">
          <span className="block font-medium">Область резерва</span>
          <select value={option.group.id} onChange={event => { setSelected(event.target.value); setError(''); }}
            className="mt-1 max-w-full rounded-md border border-control bg-surface px-3 py-2">
            {options.map(item => <option key={item.group.id} value={item.group.id}>{item.label}</option>)}
          </select>
        </label>
        <p className="text-muted">Статей в основании · {option.group.cost_keys.length}</p>
        <Input label={`Сумма на заказ, ${option.group.currency}`} name="reserve-amount" inputMode="decimal"
          defaultValue={option.group.method === 'manual_amount' ? option.group.amount ?? '' : ''} />
        <PublicSourceInput label="Основание резерва" name="reserve-source" defaultValue={option.group.source} />
        {error && <p role="alert" className="text-warning">{publicSourceText(error, 'Не удалось сохранить резерв. Проверьте исходные значения.')}</p>}
        <Button type="submit" size="sm" disabled={disabled}>Сохранить резерв</Button>
      </form>}
  </InfoBlock>;
}
