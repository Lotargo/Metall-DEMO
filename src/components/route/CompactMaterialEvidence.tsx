import { InfoBlock } from '@/components/ui/InfoBlock';
import type { components } from '@/api/schema';
import { asRecord, formatNumber } from '@/utils/compactNumbers';
import { publicSourceText } from '@/utils/publicSource';

type Evidence = components['schemas']['MaterialEvidenceSnapshot'];
type Value = components['schemas']['EvidenceValue-Output'];
type Row = components['schemas']['MaterialEvidenceRow'];
const th = 'py-2 pr-4 text-left text-xs font-medium text-muted';
const td = 'py-2 pr-4 align-top text-sm';
const conditionLabels: Record<string, string> = {
  assortment: 'Сортамент', standard: 'Стандарт', direction: 'Направление образца',
  heat_treatment: 'Термообработка', condition: 'Состояние', temperature_c: 'Температура, °C', scale: 'Шкала',
};
const propertyLabels: Record<string, string> = {
  size_mm: 'Размер', tensile_strength_mpa: 'Предел прочности', yield_strength_mpa: 'Предел текучести',
  elongation_percent: 'Относительное удлинение', reduction_of_area_percent: 'Относительное сужение',
  impact_toughness_kj_m2: 'Ударная вязкость', hardness: 'Твёрдость', density: 'Плотность',
  specific_heat: 'Удельная теплоёмкость', thermal_conductivity: 'Теплопроводность',
  thermal_expansion: 'Коэффициент теплового расширения', young_modulus: 'Модуль Юнга',
  electrical_resistivity: 'Удельное электрическое сопротивление', resistivity: 'Удельное электрическое сопротивление',
};
const unitLabels: Record<string, string> = { mm: 'мм', MPa: 'МПа', 'kJ/m2': 'кДж/м²', 'kg/m3': 'кг/м³', '1': '' };


function sourceText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function evidenceNumber(value: Value) {
  if (value.basis === 'unknown') return 'Численное значение не определено';
  const unit = value.unit in unitLabels ? unitLabels[value.unit] : value.unit;
  const suffix = unit ? ` ${unit}` : value.unit === '1' ? '' : ' (единица не указана)';
  if (value.value != null) return `${formatNumber(value.value)}${suffix}`;
  const bounds = [
    value.lower != null ? `${value.lower_inclusive ? 'от' : 'более'} ${formatNumber(value.lower)}` : '',
    value.upper != null ? `${value.upper_inclusive ? 'до' : 'менее'} ${formatNumber(value.upper)}` : '',
  ].filter(Boolean).join(' ');
  return bounds ? `${bounds}${suffix}` : 'Численное значение не определено';
}

function Conditions({ conditions }: { conditions: Record<string, string> }) {
  const entries = Object.entries(conditions).filter(([, value]) => value.trim());
  if (!entries.length) return null;
  return <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">{entries.map(([key, value]) =>
    <div key={key}><dt className="inline font-medium">{conditionLabels[key] ?? 'Условие применения'}: </dt><dd className="inline whitespace-pre-wrap">{publicSourceText(value, 'Не определено')}</dd></div>)}</dl>;
}

function EvidenceValue({ value }: { value: Value }) {
  const source = publicSourceText(value.source, '');
  const raw = publicSourceText(value.raw, '');
  return <>
    <p className="tabular-nums">{evidenceNumber(value)}{value.basis === 'assumption' && <span className="text-warning"> · принято ориентировочно</span>}</p>
    <div className="material-value-basis">
        {raw && raw !== evidenceNumber(value) && <p className="whitespace-pre-wrap">По справочнику: {raw}</p>}
        {source && <p>{source}</p>}
        {value.standard && !source.includes(value.standard) && <p>{value.standard}</p>}
        <Conditions conditions={value.conditions} />
        {value.limitations.length > 0 && <ul className="list-disc space-y-1 pl-4">{value.limitations.map((item, index) => <li key={index}>{publicSourceText(item, 'Применимость требует уточнения')}</li>)}</ul>}
    </div>
  </>;
}

function EvidenceRows({ title, rows }: { title: string; rows: Row[] }) {
  return <InfoBlock className="border-t border-line pt-3" title={<>{title} · {rows.length}</>}>
    <div className="mt-3 space-y-5">{rows.length === 0 ? <p className="text-muted">В сохранённой карточке нет записей.</p> : rows.map((row, index) =>
      <section key={`${row.locator}-${index}`} className="space-y-2">
        <h3 className="font-medium">{publicSourceText(row.label, `Справочные данные ${index + 1}`)}</h3>
        <Conditions conditions={row.conditions} />
        {Object.keys(row.values).length > 0 ? <div className="engineering-table-scroll overflow-x-auto" tabIndex={0} aria-label={`Свойства: ${row.label || title}`}><table className="material-evidence-table w-full"><caption className="sr-only">{title}: {row.label || `запись ${index + 1}`}</caption>
          <thead><tr><th scope="col" className={th}>Свойство</th><th scope="col" className={th}>Значение и основание</th></tr></thead>
          <tbody>{Object.entries(row.values).map(([key, value]) => <tr key={key} className="border-b border-line">
            <th scope="row" className={`${td} w-2/5 text-left font-normal`}>{propertyLabels[key] ?? 'Дополнительное свойство'}</th><td className={td}><EvidenceValue value={value} /></td>
          </tr>)}</tbody></table><p className="engineering-scroll-hint">Таблицу можно прокрутить по горизонтали.</p></div> : <p className="text-muted">Численные свойства не определены.</p>}
      </section>)}
    </div>
  </InfoBlock>;
}

export function CompactPhysicalMaterialEvidence({ evidence }: { evidence: Evidence | null | undefined }) {
  if (!evidence?.physical.length) return <p className="text-sm text-muted">Табличные физические свойства пока не получены.</p>;
  return <EvidenceRows title="Физические свойства по справочнику" rows={evidence.physical} />;
}

export function CompactMaterialEvidence({ evidence, weldability }: { evidence: Evidence | null | undefined; weldability?: unknown }) {
  if (!evidence) return <>
    <h3 className="font-semibold">Состав и справочные свойства материала</h3>
    {sourceText(weldability) && <p className="mt-2 text-sm">Свариваемость · {sourceText(weldability)}</p>}
    <p className="mt-2 text-sm text-muted">Расширенная карточка материала пока не получена.</p>
  </>;
  const classification = sourceText(evidence.classification.text);
  const classes = Array.isArray(evidence.classification.classes) ? evidence.classification.classes.map(asRecord) : [];
  const classNames = [...new Set(classes.map(item => [sourceText(item.group), sourceText(item.name)].filter(Boolean).join(' · ')).filter(Boolean))];
  return <section aria-labelledby="compact-material-reference">
    <h3 id="compact-material-reference" className="font-semibold">Состав и справочные свойства материала</h3>
    <div className="mt-3 space-y-4 text-sm">
      <dl className="space-y-1"><div><dt className="inline font-medium">Запрошенная марка: </dt><dd className="inline">{evidence.requested_grade || 'Не определена'}</dd></div>
        <div><dt className="inline font-medium">Найденная марка: </dt><dd className="inline">{evidence.resolved_grade || 'Не определена'}</dd></div></dl>
      <p className="text-muted">Справочные свойства зависят от состояния поставки и не являются измерением партии. Ни одна строка не выбирается для расчёта только по факту её наличия в карточке.</p>
      <section className="space-y-2"><h3 className="font-medium">Классификация</h3><p>{classification || 'Не определена'}</p>
        {classNames.length > 0 && <ul className="space-y-1 text-muted">{classNames.map(item => <li key={item}>{item}</li>)}</ul>}
      </section>
      {sourceText(weldability) && <p>Свариваемость: {sourceText(weldability)}</p>}
      <section><h3 className="mb-2 font-medium">Химический состав</h3>
        {Object.keys(evidence.composition).length > 0 ? <table className="w-full"><caption className="sr-only">Химический состав</caption>
          <thead><tr><th scope="col" className={th}>Элемент</th><th scope="col" className={th}>Содержание</th></tr></thead><tbody>{Object.entries(evidence.composition).map(([key, value]) =>
            <tr key={key} className="border-b border-line"><th scope="row" className={`${td} w-2/5 text-left font-normal`}>{key}</th><td className={td}><EvidenceValue value={value} /></td></tr>)}</tbody></table>
          : <p className="text-muted">Химический состав в сохранённой карточке не определён.</p>}
      </section>
      <EvidenceRows title="Механические свойства" rows={evidence.mechanical} />
      <EvidenceRows title="Твёрдость" rows={evidence.hardness} />
      <InfoBlock className="border-t border-line pt-3" title="Формы поставки по справочнику">
        <p className="mt-2 text-xs text-muted">Перечень справочника не подтверждает пригодность формы заготовки для этой детали.</p>
        {evidence.supply.length > 0 ? <ul className="mt-3 space-y-3">{evidence.supply.map((item, index) => {
          const standards = Array.isArray(item.standards) ? item.standards.map(standard => typeof standard === 'string' ? standard : sourceText(asRecord(standard).designation)).filter(Boolean) : [];
          return <li key={index}><p>{[sourceText(item.code), sourceText(item.name)].filter(Boolean).join(' · ') || sourceText(item.raw) || 'Форма не указана'}</p>
            {standards.length > 0 && <p className="text-xs text-muted">{standards.join('; ')}</p>}</li>;
        })}</ul> : <p className="mt-2 text-muted">Сведения о формах поставки отсутствуют.</p>}
      </InfoBlock>
      <p className="border-t border-line pt-3 text-xs text-muted">Источник: {publicSourceText(evidence.source, 'Справочник материалов')}</p>
      {evidence.limitations.length > 0 && <section className="space-y-2"><h3 className="font-medium">Ограничения справочных данных</h3><ul className="list-disc space-y-1 pl-4 text-muted">{evidence.limitations.map((item, index) => <li key={index}>{publicSourceText(item, 'Применимость требует уточнения')}</li>)}</ul></section>}
    </div>
  </section>;
}
