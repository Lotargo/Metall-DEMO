import { InfoBlock } from '@/components/ui/InfoBlock';
import type { components } from '@/api/schema';
import { formatNumber } from '@/utils/compactNumbers';
import { estimateOperatorText } from './estimateOperatorText';
import { publicSourceText } from '@/utils/publicSource';

type Settings = components['schemas']['EstimateSettings-Output'];
const currencyName = (value: string) => value === 'RUB' ? '₽' : value;
const money = (value: string | null, currency: string) => value == null ? 'Не определено'
  : `${Number(value).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencyName(currency)}`;
const basisNames = { source: 'По источнику', estimate: 'Ориентировочная оценка', mock: 'Демонстрационная оценка', unknown: 'Основание не установлено' };

function Source({ source }: { source: string }) {
  return <InfoBlock className="estimate-row-source text-xs" title="Источник"><div className="mt-2 space-y-2 break-words text-muted"><p className="whitespace-pre-wrap">{estimateOperatorText(publicSourceText(source)) ?? 'Сохранённое ручное основание.'}</p>
  </div></InfoBlock>;
}

export function CompactEstimateSavedSettings({ settings, articleLabel }: { settings: Settings; articleLabel: (key: string) => string }) {
  const manualLines = (settings.manual_lines ?? []).filter(line => line.work_key !== 'material');
  const reserveGroups = settings.reserve_groups ?? [];
  const dispositions = settings.work_dispositions ?? [];
  return <>
    {manualLines.length > 0 && <section className="space-y-3" aria-label="Сохранённые ручные статьи"><h3 className="font-medium">Сохранённые ручные статьи</h3><p className="text-xs text-muted">Исходные значения сохранённых условий. Рассчитанные суммы партии приведены в калькуляции.</p>
      <div className="estimate-table-scroll" tabIndex={0} role="region" aria-label="Таблица ручных статей"><table className="estimate-articles-table"><caption className="sr-only">Исходные параметры ручных статей</caption><thead><tr><th scope="col">Статья</th><th scope="col">Начисление</th><th scope="col">Время, мин</th><th scope="col">Цена и количество</th><th scope="col">Сумма</th><th scope="col">Основание</th></tr></thead><tbody>{manualLines.map(line => <tr key={line.id}>
        <th scope="row">{articleLabel(line.work_key)}</th><td>{line.frequency === 'per_batch' ? 'На партию' : 'На деталь'}</td><td className="estimate-number">{formatNumber(line.minutes)}</td>
        <td><dl className="estimate-cell-values"><div><dt>Ставка в час</dt><dd>{money(line.hourly_rate, line.currency)}</dd></div><div><dt>Цена единицы</dt><dd>{money(line.unit_price, line.currency)}</dd></div><div><dt>Количество</dt><dd>{formatNumber(line.quantity)}</dd></div></dl></td><td className="estimate-number">{money(line.amount, line.currency)}</td>
        <td><p>{basisNames[line.price_basis]}</p><p className="text-xs text-muted">{{ calculated: 'Задано для расчёта', estimated: 'Принято ориентировочно', unknown: 'Не определено', not_applicable: 'Не применяется' }[line.state]}</p><Source source={line.source} />{line.limitations.length > 0 && <ul className="mt-2 space-y-1 text-xs text-muted">{line.limitations.flatMap((item, index) => { const text = estimateOperatorText(publicSourceText(item, '')); return text ? [<li key={index}>{text}</li>] : []; })}</ul>}</td>
      </tr>)}</tbody></table></div>
    </section>}
    {reserveGroups.length > 0 && <section className="space-y-3" aria-label="Сохранённые условия резерва"><h3 className="font-medium">Сохранённые условия резерва</h3>
      <div className="estimate-table-scroll" tabIndex={0} role="region" aria-label="Таблица резервов"><table className="estimate-articles-table"><caption className="sr-only">Исходные условия резерва</caption><thead><tr><th scope="col">Способ</th><th scope="col">Статьи покрытия</th><th scope="col">Сумма</th><th scope="col">Верхняя сумма</th><th scope="col">Доля</th><th scope="col">Основание</th></tr></thead><tbody>{reserveGroups.map(group => <tr key={group.id}>
        <th scope="row">{{ scenario: 'Сценарий', manual_amount: 'Заданная сумма', manual_ratio: 'Заданная доля', unknown: 'Не определён' }[group.method]}</th><td><ul className="space-y-1">{group.cost_keys.map(key => <li key={key}>{articleLabel(key)}</li>)}</ul></td><td className="estimate-number">{money(group.amount, group.currency)}</td><td className="estimate-number">{money(group.upper_amount, group.currency)}</td><td className="estimate-number">{formatNumber(group.ratio, 6)}</td><td><p>{basisNames[group.price_basis]}</p><Source source={group.source} /></td>
      </tr>)}</tbody></table></div>
    </section>}
    {dispositions.length > 0 && <section className="space-y-3" aria-label="Сохранённые решения по статьям"><h3 className="font-medium">Сохранённые решения по статьям</h3>
      <div className="estimate-table-scroll" tabIndex={0} role="region" aria-label="Таблица решений по статьям"><table className="estimate-articles-table"><caption className="sr-only">Исключение статей и включение в другие работы</caption><thead><tr><th scope="col">Работа или статья</th><th scope="col">Решение</th><th scope="col">Включено в</th><th scope="col">Причина</th><th scope="col">Источник</th></tr></thead><tbody>{dispositions.map(item => <tr key={item.work_key}>
        <th scope="row">{articleLabel(item.work_key)}</th><td>{item.state === 'included' ? 'Учтено в другой статье' : 'Не применяется'}</td><td>{item.included_in ? articleLabel(item.included_in) : 'Не задано'}</td><td>{estimateOperatorText(publicSourceText(item.reason, '')) ?? 'Решение сохранено для этой статьи.'}</td><td><Source source={item.source} /></td>
      </tr>)}</tbody></table></div>
    </section>}
  </>;
}
