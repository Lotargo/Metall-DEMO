import type { components } from '@/api/schema';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { CompactStockBatch, stockMissingLabels } from '@/components/route/CompactStockSelection';
import { CompactStockEvidence } from '@/components/route/CompactStockEvidence';
import { asRecord, formatNumber } from '@/utils/compactNumbers';

type State = components['schemas']['CompactState'];

const batchOnlyInputs = new Set(['quantity', 'quantity.value', 'calculation_inputs.allowed_supply_lengths_mm']);

export function CompactStockResult({ state, geometry, onOpenRoute, showCalculationDetails = false, showDiameter = true }: {
  state: State; geometry: Record<string, unknown>; onOpenRoute?: () => void; showCalculationDetails?: boolean; showDiameter?: boolean;
}) {
  const lengths = useQuery({
    queryKey: ['bar-lengths'],
    queryFn: async () => {
      const { data } = await apiClient.GET('/api/v1/calculation/bar-lengths');
      return data;
    },
  });
  const rows: [string, unknown, string][] = [
    ['Длина прутка поставки', geometry.supply_length_mm, 'мм'],
    ['Длина отрезка на деталь', geometry.cut_length_mm, 'мм'],
    ['Пропил на отрезку', geometry.kerf_mm, 'мм'],
    ['Припуск на один торец', geometry.face_allowance_mm, 'мм'],
    ['Масса заготовки на деталь, оценка', geometry.cut_mass_kg, 'кг'],
  ];
  if (showDiameter) rows.unshift(['Диаметр отрезка', geometry.diameter_mm, 'мм']);
  if (showCalculationDetails) rows.push(
    ['Расчётный остаток по радиусу', geometry.remaining_radial_surplus_mm, 'мм'],
  );
  const known = rows.filter(([, value]) => value != null && value !== '');
  const result = asRecord(state.stock.service_result);
  const basis = state.reading?.round_basis;
  const missing = new Set(Array.isArray(result.missing_inputs)
    ? result.missing_inputs.filter((key): key is string => typeof key === 'string' && !batchOnlyInputs.has(key))
      .map(key => stockMissingLabels[key] ?? key)
    : []);
  if (basis?.diameter_mm == null) missing.add('Диаметр детали');
  if (basis?.length_mm == null) missing.add('Длина детали');
  const hasGeometry = geometry.diameter_mm != null && geometry.cut_length_mm != null;
  const savedBarLength = geometry.supply_length_mm;
  return <div className="mt-4 space-y-4">
    {!!lengths.data?.effective_lengths_mm.length && <p className="text-sm tabular-nums">Доступные длины поставки: {lengths.data.effective_lengths_mm.map(length => `${formatNumber(length / 1000)} м`).join(' · ')}.</p>}
    {known.length > 0 && <table className="w-full text-sm">
      <caption className="text-left font-semibold">Размеры выбранной заготовки</caption>
      <thead><tr className="text-left"><th scope="col">Параметр</th><th scope="col">Значение</th></tr></thead>
      <tbody>{(showCalculationDetails ? rows : known).map(([label, value, unit]) => <tr key={label}>
        <th scope="row" className="py-2 pr-3 text-left font-medium">{label}</th>
        <td className="tabular-nums">{formatNumber(value)}{value != null && ` ${unit}`}</td>
      </tr>)}</tbody>
    </table>}
    {!hasGeometry && <p className="text-sm text-muted">
      {geometry.cut_length_mm == null && 'Расчётная длина отрезка не подтверждена. '}
      {missing.size > 0 ? `Для подбора нужны ${[...missing].join(', ').toLocaleLowerCase('ru-RU')}.`
        : result.status === 'infeasible' ? 'По сохранённым ограничениям расчётный размер не найден.'
          : 'Сохранённый расчёт размера для текущей редакции отсутствует.'}
    </p>}
    {!result.batch_plan && savedBarLength != null && <p className="text-sm">Сохранённый вариант поставки · пруток {formatNumber(savedBarLength)} мм
        {geometry.supply_mass_kg != null && ` · расчётная масса прутка ${formatNumber(geometry.supply_mass_kg)} кг`}.</p>}
    <CompactStockBatch result={result} quantity={state.quantity} supplyLength={savedBarLength} supplyMass={geometry.supply_mass_kg} />
    {showCalculationDetails && <>
      <CompactStockEvidence result={result} recommendation={state.stock.recommendation} />
    </>}
    {onOpenRoute && <button type="button" className="secondary-action" onClick={onOpenRoute}>Основания подбора в маршруте</button>}
  </div>;
}
