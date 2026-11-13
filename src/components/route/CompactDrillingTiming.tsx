import { useId, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import type { components } from '@/api/schema';
import { cycleEndLabel } from '@/components/route/CompactCalculationResult';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { publicSourceText } from '@/utils/publicSource';
import { asRecord, finiteNonnegative, formatNumber, formatText } from '@/utils/compactNumbers';

type TimeWork = components['schemas']['OperationTimeWork-Input'];
type Draft = { revision: number; values: Record<string, string[]> };
const method = 'drilling.axial-cycle.constant-n/1';
const moveLabels: Record<string, string> = { approach: 'Подвод', dwell: 'Выдержка', retract: 'Вывод' };

function seconds(raw: string): string | null {
  const value = raw.trim().replace(',', '.');
  if (!/^(?:\d{1,10}(?:\.\d{0,6})?|\.\d{1,6})$/.test(value)) return null;
  return (value.startsWith('.') ? `0${value}` : value).replace(/\.$/, '');
}

export function CompactDrillingTiming({ detail, runId, operationIndex, revision, timeWorks, editable }: {
  detail: Record<string, unknown>;
  runId: string;
  operationIndex: number;
  revision: number;
  timeWorks: TimeWork[];
  editable: boolean;
}) {
  const queryClient = useQueryClient();
  const hintId = useId();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const cycles = (Array.isArray(detail.calculations) ? detail.calculations.map(asRecord) : [])
    .filter(cycle => cycle.method_id === method && typeof cycle.cycle_id === 'string');
  if (!cycles.length) return null;

  const results = Array.isArray(detail.time_work_results) ? detail.time_work_results.map(asRecord) : [];
  const groups = cycles.map((cycle, index) => {
    const measurement = asRecord(cycle.motion_measurement);
    const moves = Array.isArray(measurement.moves) ? measurement.moves.map(asRecord) : [];
    const address = moves.length && typeof measurement.sha256 === 'string' ? measurement.sha256 : null;
    const saved = address ? timeWorks.find(work => work.cycle_motion_sha256 === address) : undefined;
    const motionKey = `op:${operationIndex}:motion:${cycle.motion_measurement_index}`;
    const covered = !!address && timeWorks.some(work => work.scope === 'entire_operation' || work.covers?.includes(motionKey));
    const end = cycleEndLabel(cycle.frame_ref);
    const savedValues = moves.map((_, position) => String(saved?.cycle_motion_seconds?.[position] ?? '').replace('.', ','));
    return {
      cycle, address, moves, saved, savedValues, covered,
      label: `Цикл ${index + 1}${end ? ` · ${end}` : ''}`,
    };
  });
  const changed = groups.flatMap(group => {
    const address = group.address;
    const values = address ? draft?.values[address] : undefined;
    return address && values && !group.covered ? [{ ...group, address, values }] : [];
  });
  const invalid = changed.some(({ values }) => values.some(value => value.trim() && seconds(value) === null));
  const outdated = draft !== null && draft.revision !== revision;

  function update(address: string, position: number, value: string, savedValues: string[]) {
    setMessage('');
    setError('');
    setDraft(previous => {
      const values = { ...previous?.values };
      const next = [...(values[address] ?? savedValues)];
      next[position] = value;
      if (next.every((entry, index) => entry === savedValues[index])) delete values[address];
      else values[address] = next;
      return Object.keys(values).length ? { revision: previous?.revision ?? revision, values } : null;
    });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !changed.length || outdated || invalid || saving || !editable) return;
    const addresses = new Set(changed.map(group => group.address));
    const next: TimeWork[] = timeWorks.filter(work => !work.cycle_motion_sha256 || !addresses.has(work.cycle_motion_sha256));
    for (const { address, saved, label, values } of changed) {
      const measured = values.map(seconds);
      if (measured.every(value => value === null)) continue;
      next.push({
        id: saved?.id ?? `chrono-c3-${address}`,
        description: `Хронометраж C3 · ${label}`,
        method: 'direct', frequency: 'per_piece', scope: 'replace_work', repetitions: 1,
        cycle_motion_sha256: address, cycle_motion_seconds: measured,
        source: 'Замер оператора в карточке операции',
      });
    }
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const response = await apiClient.POST('/api/v1/runs/{run_id}/compact-round/time-estimate', {
        params: { path: { run_id: runId } },
        body: { expected_revision: draft.revision, operations: [{ operation_index: operationIndex, time_works: next }] },
      });
      if (!response.data || response.error) {
        if (response.response.status === 409) void queryClient.invalidateQueries({ queryKey: ['compact-round', runId] });
        const reason = asRecord(response.error).detail;
        setError(typeof reason === 'string' ? formatText(reason) : 'Не удалось сохранить замеры. Проверьте введённые значения.');
        return;
      }
      queryClient.setQueryData(['compact-round', runId], response.data);
      setDraft(null);
      setMessage('Замеры сохранены.');
    } catch {
      setError('Не удалось сохранить замеры. Проверьте подключение и повторите попытку.');
    } finally {
      setSaving(false);
    }
  }

  const canEdit = editable && groups.some(group => group.address && !group.covered);
  return <form className="space-y-3" aria-label="Хронометраж C3" aria-busy={saving} onSubmit={save}>
    <h4 className="font-medium">Хронометраж C3</h4>
    <p id={hintId} className="text-muted">Укажите секунды на деталь с учётом повторов. Смета учтёт сумму после заполнения всех строк цикла.</p>
    {groups.map(({ cycle, address, moves, saved, savedValues, covered, label }) => {
      const values = (address && draft?.values[address]) || savedValues;
      const parsed = values.map(seconds);
      const total = parsed.length && parsed.every(value => value !== null)
        ? parsed.reduce((sum, value) => sum + Number(value), 0)
        : null;
      const previousMinutes = finiteNonnegative(saved?.minutes?.value);
      const count = finiteNonnegative(cycle.repetitions);
      return <div className="space-y-1" key={String(cycle.cycle_id)}>
        <div className="max-w-full min-w-0 overflow-x-auto" tabIndex={0} aria-label={label}>
          <table className="w-full">
            <caption className="text-left">
              <span className="font-medium">{label}</span>
              {count !== null && <span className="block text-xs text-muted">Повторов на деталь · {formatNumber(count)}</span>}
            </caption>
            <thead><tr><th scope="col">Движение</th><th scope="col">Путь, мм</th><th scope="col">Замер, с</th></tr></thead>
            <tbody>{moves.map((move, position) => {
              const kind = String(move.kind);
              const title = `${moveLabels[kind] ?? 'Движение'}${Number(move.peck) > 1 ? ` · углубление ${move.peck}` : ''}`;
              const start = formatNumber(move.start_mm, 4);
              const end = formatNumber(move.end_mm, 4);
              return <tr key={position}>
                <th scope="row">{title}</th>
                <td className="tabular-nums">{start} → {end}</td>
                <td className="w-36">{address && editable && !covered ? <Input type="text" inputMode="decimal" className="tabular-nums" aria-label={`${label} · ${title}, секунды`} aria-describedby={hintId} placeholder="Нет замера" value={values[position]} disabled={saving || outdated} onChange={event => update(address, position, event.target.value, savedValues)} error={values[position].trim() && parsed[position] === null ? 'Введите неотрицательное число (до 6 знаков после запятой).' : undefined} /> : values[position] || 'Нет замера'}</td>
              </tr>;
            })}{!moves.length && <tr><th scope="row">Движения C3</th><td>Не определено</td><td>Нет замера</td></tr>}</tbody>
            {moves.length > 0 && <tfoot><tr><th scope="row" colSpan={2}>Итого по замерам</th><td className="tabular-nums">{formatNumber(total, 6)}</td></tr></tfoot>}
          </table>
        </div>
        {!address && <p className="text-xs text-muted">{cycle.complete === true ? 'Время движений покрыто расчётом C3.' : 'Ввод доступен после расчёта, который определит пути недостающих движений.'}</p>}
        {previousMinutes !== null && <p className="text-xs text-muted">Сохранённый замер группы · {formatNumber(previousMinutes * 60, 6)} с.</p>}
        {covered && <p className="text-xs text-muted">Эта группа входит в другой замер времени операции.</p>}
      </div>;
    })}
    {results.some(result => result.measurement_state === 'stale') && <p className="text-xs text-muted">Прежний замер относится к другому пути и не входит в расчёт.</p>}
    {outdated && <p role="status" className="text-warning">Операция обновилась. Сбросьте черновик перед вводом в новой редакции.</p>}
    {(canEdit || draft) && <div className="flex flex-wrap items-center gap-2">
      {canEdit && <Button type="submit" size="sm" loading={saving} disabled={!changed.length || outdated || invalid}>Сохранить замеры</Button>}
      {draft && <Button type="button" size="sm" variant="secondary" disabled={saving} onClick={() => { setDraft(null); setError(''); }}>Сбросить черновик</Button>}
    </div>}
    {!editable && groups.some(group => group.address) && <p className="text-xs text-muted">Замеры доступны для ввода в текущей сохранённой операции.</p>}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert" className="text-danger">{publicSourceText(error, 'Не удалось сохранить замеры. Проверьте исходные значения.')}</p>}
  </form>;
}
