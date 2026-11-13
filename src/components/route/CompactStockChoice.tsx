import type { components } from '@/api/schema';
import { Button } from '@/components/ui/Button';
import { asRecord, finiteNonnegative, formatNumber } from '@/utils/compactNumbers';

type State = components['schemas']['CompactState'];
type Origin = 'drawing' | 'recommendation';

export function stockChoiceView(state: State) {
  const selected = asRecord(state.stock.selected);
  const assigned = state.reading?.round_basis.prescribed_diameter_mm
    ?? state.reading?.recognized_parameters?.['stock.nominal_diameter']?.value;
  if (state.processing_passport?.kind === 'milling') return { assigned, diameter: null, geometry: {} };
  const diameter = state.stock_choice?.diameter_mm ?? assigned ?? selected.diameter_mm;
  const same = finiteNonnegative(selected.diameter_mm) !== null
    && Number(selected.diameter_mm) === Number(diameter);
  return { assigned, diameter, geometry: same ? selected : diameter != null ? { diameter_mm: diameter } : {} };
}

export function CompactStockChoice({ state, disabled, onChoose }: {
  state: State; disabled: boolean; onChoose: (origin: Origin) => void;
}) {
  const { assigned, diameter } = stockChoiceView(state);
  const recommendation = asRecord(state.stock.recommendation);
  const recommended = asRecord(recommendation.selected).diameter_mm;
  const result = asRecord(state.stock.service_result);
  const selectedEvidence = asRecord(result.selected_stock);
  const assignment = state.reading?.recognized_parameters?.['stock.nominal_diameter'];
  const assignmentLabel = assignment?.basis === 'manual' ? 'Назначение оператора' : 'Назначение на чертеже';
  const currentIs = (number: unknown) => number != null && diameter != null && Number(number) === Number(diameter);
  const calculated = state.stock_choice?.origin === 'recommendation' || assigned == null;
  const origin = calculated ? 'Расчёт по габаритам детали и сортаменту' : assignmentLabel;
  const effectiveEvidence = currentIs(selectedEvidence.nominal_diameter_mm) ? selectedEvidence : null;
  const effectiveText = (evidence: Record<string, unknown>) => evidence.diameter_requirement === 'as_supplied'
    ? `Сохраняется поверхность прутка. Номинальный диаметр по сортаменту — ${formatNumber(evidence.required_nominal_diameter_mm)} мм.`
    : evidence.effective_diameter_mm != null && evidence.required_effective_diameter_mm != null
    ? `Эффективный диаметр ${formatNumber(evidence.effective_diameter_mm)} мм при требуемом значении больше ${formatNumber(evidence.required_effective_diameter_mm)} мм.`
    : '';
  return <section aria-label="Выбор заготовки" className="space-y-3 text-sm">
    <h3 className="font-semibold">Заготовка на одну деталь{result.basis_status === 'contains_assumptions' && <span className="ml-2 font-normal text-muted">· подбор предварительный</span>}</h3>
    <table className="w-full"><caption className="sr-only">Выбор и назначение заготовки</caption><tbody>
      <tr><th scope="row" className="py-2 pr-3 text-left font-medium">Размер</th><td>{diameter != null ? `Круг Ø${formatNumber(diameter)} мм` : 'Диаметр заготовки пока не определён.'}</td></tr>
      {diameter != null && <tr><th scope="row" className="py-2 pr-3 text-left font-medium">Основание</th><td>{origin}
        {effectiveEvidence && effectiveText(effectiveEvidence) && <p className="text-muted">{effectiveText(effectiveEvidence)}</p>}</td></tr>}
    </tbody></table>
    <div className="flex flex-wrap gap-2">
      {recommended != null && !currentIs(recommended) && <Button variant="outline" disabled={disabled} onClick={() => onChoose('recommendation')}>Выбрать рассчитанный Ø{formatNumber(recommended)} мм</Button>}
      {assigned != null && !currentIs(assigned) && <Button variant="outline" disabled={disabled} onClick={() => onChoose('drawing')}>Вернуть назначенный Ø{formatNumber(assigned)} мм</Button>}
    </div>
    {((recommended != null && !currentIs(recommended)) || (assigned != null && !currentIs(assigned))) && <p className="text-xs text-muted">После выбора потребуются новая карта и подтверждение детализации. Назначенный диаметр останется доступен для выбора.</p>}
  </section>;
}
