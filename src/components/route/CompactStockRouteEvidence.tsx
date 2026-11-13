import { asRecord } from '@/utils/compactNumbers';
import type { components } from '@/api/schema';
import { publicSourceText } from '@/utils/publicSource';

type Stock = components['schemas']['CompactState']['stock'];
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && !!item.trim()) : [];
const records = (value: unknown) => Array.isArray(value) ? value.map(asRecord) : [];
const statuses: Record<string, string> = { pass: 'Выполнено', fail: 'Не выполнено', unknown: 'Не подтверждено' };

export function CompactStockRouteEvidence({ stock }: { stock: Stock }) {
  const recommendation = asRecord(stock.recommendation);
  const entries = [{ name: 'Выбранная заготовка', stock: asRecord(stock) }, { name: 'Рекомендация', stock: recommendation }].filter(entry => Object.keys(entry.stock).length > 0);
  const notes = new Map<string, { contexts: Set<string>; states: Set<string> }>();
  const note = (raw: unknown, context: string, status = '') => {
    if (typeof raw !== 'string' || !raw.trim()) return;
    const item = notes.get(raw) ?? { contexts: new Set<string>(), states: new Set<string>() };
    item.contexts.add(context); if (status) item.states.add(status); notes.set(raw, item);
  };
  entries.forEach(entry => {
    const result = asRecord(entry.stock.service_result);
    const standard = asRecord(entry.stock.standard_assessment);
    strings(entry.stock.limitations).forEach(message => note(message, entry.name));
    // These source annotations have no machine-readable subject. Keep their
    // literal wording here instead of guessing whether a paragraph is a process.
    Object.entries(asRecord(result.assumptions)).filter(([id]) => id !== 'supply-nominal-length').forEach(([, message]) => note(message, entry.name, 'Оценочное условие'));
    records(result.checks).filter(check => check.status !== 'pass').forEach(check => note(check.message, entry.name, statuses[String(check.status)] ?? 'Не определено'));
    note(asRecord(asRecord(entry.stock.selected).cut_norm_revision).comment, entry.name, 'Комментарий норм');
    if (standard.status === 'form_mismatch' || standard.status === 'unverified') note(standard.message, entry.name, 'Область стандарта');
  });
  return <section id="compact-stock-route-evidence" tabIndex={-1} className="space-y-3 border-t border-line pt-5 text-sm" aria-label="Условия подготовки и исходные ограничения подбора">
    <h3 className="font-semibold">Условия подготовки и исходные ограничения подбора</h3>
    <p className="text-muted">Сохранённые сведения о подготовке проката и границах предварительного подбора. Они не назначают дополнительные операции, потери или время автоматически.</p>
    {notes.size > 0 ? <div className="max-w-full min-w-0 overflow-x-auto" role="region" aria-label="Таблица условий подбора" tabIndex={0}>
      <table className="w-full min-w-[32rem]">
        <thead><tr><th scope="col" className="w-32">Относится к</th><th scope="col">Условие или ограничение</th><th scope="col" className="w-28">Статус</th></tr></thead>
        <tbody>{[...notes].map(([message, item]) => <tr key={message}><th scope="row">{[...item.contexts].join('; ')}</th><td className="whitespace-pre-wrap">{publicSourceText(message, 'Условия подбора требуют уточнения')}</td><td>{[...item.states].join('; ') || 'Исходное ограничение'}</td></tr>)}</tbody>
      </table>
    </div>
      : <p className="text-muted">Дополнительные условия и ограничения подбора в текущей редакции не записаны.</p>}
  </section>;
}
