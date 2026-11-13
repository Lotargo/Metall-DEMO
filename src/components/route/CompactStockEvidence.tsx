import { InfoBlock } from '@/components/ui/InfoBlock';
import { stockMissingLabels } from '@/components/route/CompactStockSelection';
import { asRecord, formatNumber } from '@/utils/compactNumbers';

export const stockReasonLabels: Record<string, string> = {
  SUPPLY_NOT_ALLOWED: 'Длина поставки отсутствует среди разрешённых вариантов.',
  MACHINE_CUT_DIAMETER_EXCEEDED: 'Диаметр превышает заданное ограничение подбора.',
  MINIMUM_PIECE_LENGTH: 'Длина заготовки меньше установленного минимума.',
  EFFECTIVE_DIAMETER_NOT_GREATER: 'Эффективный диаметр не превышает требуемый диаметр детали.',
  PIECE_EXCEEDS_AVAILABLE_SUPPLY: 'Заготовка не размещается в длине поставки с заданными потерями.',
  PRESCRIBED_NOMINAL_REPLACEMENT: 'Замена назначенного номинала требует отдельного выбора.',
};
const checkLabels: Record<string, string> = {
  MATERIAL_CONFLICT: 'Есть известный конфликт материала поставки.',
  INCOMPLETE_NORM_ROWS: 'Часть строк сортамента неполна; минимум среди всех вариантов не подтверждён.',
  NO_FEASIBLE_STOCK: 'По известным размерам и ограничениям подходящий вариант не найден.',
  PART_LENGTH_NOMINAL_BASIS: 'Длина принята по номиналу; верхний предел детали не подтверждён.',
  PART_DIAMETER_NOMINAL_BASIS: 'Наружный размер принят по номиналу; верхний предел детали не подтверждён.',
};
const statusLabels: Record<string, string> = { pass: 'Выполнено', fail: 'Не выполнено', unknown: 'Не подтверждено' };
const resultLabels: Record<string, string> = { complete: 'Рассчитан', partial: 'Рассчитан частично', infeasible: 'Пригодная поставка не найдена', unsupported: 'Форма пока не поддерживается' };
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const records = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.map(asRecord) : [];
const strings = (value: unknown): string[] => Array.isArray(value) ? value.map(text).filter(Boolean) : [];

export function CompactStockEvidence({ result, recommendation, onOpenRoute }: {
  result: unknown; limitations?: unknown; recommendation?: unknown; cutNormComment?: unknown; onOpenRoute?: () => void;
}) {
  const response = asRecord(result), recommended = asRecord(asRecord(recommendation).service_result);
  const entries = [{ name: 'Выбранная заготовка', response }];
  if (Object.keys(recommended).length > 0 && recommended.input_sha256 !== response.input_sha256) entries.push({ name: 'Рекомендация', response: recommended });
  if (!entries.some(entry => Object.keys(entry.response).length > 0)) return null;
  const checks = entries.flatMap(entry => records(entry.response.checks).filter(check => checkLabels[text(check.code)] && check.status !== 'pass').map(check => ({ context: entry.name, check })));
  const missing = entries.flatMap(entry => strings(entry.response.missing_inputs).map(id => ({ context: entry.name, id })));
  const rejected = entries.flatMap(entry => records(entry.response.rejected_candidates).map(candidate => ({ context: entry.name, candidate })));
  const alternatives = entries.flatMap(entry => records(entry.response.alternatives).map(alternative => ({ context: entry.name, alternative })));
  const otherFailed = entries.some(entry => records(entry.response.checks).some(check => check.status === 'fail' && !checkLabels[text(check.code)]));
  const profileUnknown = entries.some(entry => records(entry.response.checks).some(check => check.code === 'PROFILE_LIMITATION' || check.code === 'PREPARATION_CONDITIONS_UNKNOWN'));
  const nominalSupply = entries.some(entry => Object.prototype.hasOwnProperty.call(asRecord(entry.response.assumptions), 'supply-nominal-length'));
  const minimumPurchasePolicy = entries.some(entry => entry.response.selection_policy === 'min-purchase-length-then-bars/1');
  return <section className="space-y-3 text-sm" aria-label="Обоснование подбора">
    <h3 className="font-semibold">Обоснование подбора</h3>
    <p>Размер проверяется по габаритам детали и доступному прокату. Раскладка сохраняет длину заготовки, припуски, пропил и остатки каждого прутка.</p>
    {minimumPurchasePolicy && <p>Среди проверенных вариантов выбирается минимум закупаемой длины, затем минимум числа прутков.</p>}
    {nominalSupply && <p className="text-muted">Закупка и остатки рассчитаны по номинальной длине прутков; фактическая минимальная длина поставки не подтверждена.</p>}
    <div className="max-w-full min-w-0 overflow-x-auto" tabIndex={0}><table className="w-full"><caption className="sr-only">Результат и ограничения подбора</caption><thead><tr><th>Вариант</th><th>Результат</th><th>Основание</th></tr></thead><tbody>
      {entries.map(entry => <tr key={entry.name}><th scope="row">{entry.name}</th><td>{resultLabels[text(entry.response.status)] || 'Не определён'}</td><td>{entry.response.basis_status === 'contains_assumptions' ? 'Предварительный подбор с оценочными исходными данными.' : 'По сохранённым входам подбора.'}</td></tr>)}
      {checks.map(({ context, check }, index) => <tr key={`check-${index}`}><th scope="row">{context}</th><td>{statusLabels[text(check.status)] || 'Не определено'}</td><td>{checkLabels[text(check.code)]}</td></tr>)}
      {missing.map(({ context, id }, index) => <tr key={`missing-${index}`}><th scope="row">{context}</th><td>Нужны данные</td><td>{stockMissingLabels[id] || 'Дополнительное условие подбора'}.</td></tr>)}
    </tbody></table></div>
    {otherFailed && <p className="text-warning">Есть дополнительная невыполненная проверка подбора. Исходная причина сохранена в основаниях маршрута.</p>}
    {profileUnknown && <p className="text-muted">Часть условий расчётного профиля не подтверждена; дополнительные потери могут быть не учтены.</p>}
    {alternatives.length > 0 && <div className="max-w-full min-w-0 overflow-x-auto" tabIndex={0}><table className="w-full"><caption className="text-left font-medium">Дополнительные варианты</caption><thead><tr><th>Вариант</th><th>Диаметр, мм</th><th>Эффективный диаметр, мм</th><th>Основание</th></tr></thead><tbody>{alternatives.map(({ context, alternative }, index) => {
      const stock = asRecord(alternative.selected_stock);
      return <tr key={index}><th scope="row">{context} · {index + 1}</th><td>{formatNumber(stock.nominal_diameter_mm)}</td><td>{formatNumber(stock.effective_diameter_mm)}</td><td>{stockReasonLabels[text(alternative.reason_code)] || 'Дополнительный вариант по сохранённому расчёту.'}{alternative.requires_confirmation === true && ' Требуется отдельный выбор.'}</td></tr>;
    })}</tbody></table></div>}
    {rejected.length > 0 && <InfoBlock title={<>Отклонённые варианты · {rejected.length}</>}><div className="max-w-full min-w-0 overflow-x-auto" tabIndex={0}><table className="mt-3 w-full"><caption className="sr-only">Отклонённые варианты подбора</caption><thead><tr><th>Вариант</th><th>Длина поставки, мм</th><th>Причина</th></tr></thead><tbody>{rejected.map(({ context, candidate }, index) => <tr key={index}><th scope="row">{context} · {index + 1}</th><td>{formatNumber(candidate.supply_length_mm)}</td><td>{strings(candidate.reason_codes).map(code => stockReasonLabels[code] || 'Дополнительное ограничение; исходная проверка сохранена в маршруте.').join(' ') || 'Причина не определена.'}</td></tr>)}</tbody></table></div></InfoBlock>}
    {onOpenRoute && <button type="button" className="secondary-action" onClick={onOpenRoute}>Условия подготовки и исходные основания в маршруте</button>}
  </section>;
}
