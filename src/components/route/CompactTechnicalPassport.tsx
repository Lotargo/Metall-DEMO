import type { ReactNode } from 'react';
import type { components } from '@/api/schema';
import { CompactStockRecognition, isRoundReading, updateRoundReading } from '@/components/route/CompactStockSelection';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { hasOtherDrawingPage, passportExplanation } from '@/utils/compactDrawingEvidence';
import { formatNumber, formatText } from '@/utils/compactNumbers';
import { estimateOperatorText } from './estimateOperatorText';
import { publicSourceText } from '@/utils/publicSource';

type Reading = components['schemas']['CompactReading-Output'];
export type PassportBlock = 'processing' | 'summary' | 'envelope' | 'recognized' | 'dimensions' | 'requirements';
const cells = [
  ['part_name', 'Наименование'], ['designation', 'Обозначение'], ['drawing_mass', 'Масса на чертеже'],
  ['material', 'Материал на чертеже'], ['general_roughness', 'Общая шероховатость'],
  ['general_tolerances', 'Общие допуски'], ['hardness', 'Твёрдость'], ['coating', 'Покрытие'],
  ['welding_standards', 'ГОСТы на сварку'],
] as const;
const sizes = [
  ['diameter_mm', 'Максимальный диаметр'], ['diameter_upper_deviation_mm', 'Верхнее отклонение диаметра'],
  ['length_mm', 'Длина детали'], ['length_upper_deviation_mm', 'Верхнее отклонение длины'],
] as const;
const dimensions = [
  ['kind', 'Тип'], ['text', 'Размер'], ['tolerance', 'Допуск'],
  ['roughness', 'Шероховатость'], ['location', 'Место'],
] as const;
const dimensionKinds: Record<string, string> = {
  diameter: 'Диаметр', radius: 'Радиус', thread: 'Резьба', length: 'Длина',
  linear: 'Линейный размер', width: 'Ширина', depth: 'Глубина', thickness: 'Толщина',
  chamfer: 'Фаска', angle: 'Угол', radial_runout: 'Радиальное биение', runout: 'Биение',
  flatness: 'Плоскостность', parallelism: 'Параллельность', perpendicularity: 'Перпендикулярность',
  position: 'Позиционный допуск', roughness: 'Шероховатость', other: 'Прочий размер',
};
const field = 'w-full rounded-md border border-control bg-surface px-3 py-2 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';
const th = 'py-2 pr-4 text-left text-sm font-medium text-ink-secondary';
const td = 'py-3 pr-4 align-top text-sm whitespace-pre-wrap break-words';
const table = 'w-full';
const rowClass = 'border-b border-line';

function PassportCard({ title, editing, actions, children }: { title: string; editing: boolean; actions: ReactNode; children: ReactNode }) {
  return <section aria-label={title} className="compact-workspace-card space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">{title}</h3>
      {!editing && actions}
    </div>
    {children}
    {editing && actions}
  </section>;
}

export function CompactTechnicalPassport({ reading, isEditing, actions, onChange, milling, hasEnvelope, pageCount, onEditBasisSource, children }: {
  reading: Reading;
  isEditing: (block: PassportBlock) => boolean;
  actions: (block: PassportBlock) => ReactNode;
  onChange: (next: Reading) => void;
  milling: boolean;
  hasEnvelope: boolean;
  pageCount?: number;
  onEditBasisSource: () => void;
  children?: ReactNode;
}) {
  const sourcePages = [
    ...cells.map(([key]) => reading[key].source),
    ...reading.dimensions.flatMap(row => [row.source, row.location]),
    ...reading.requirements.map(row => row.source),
    ...Object.values(reading.recognized_parameters ?? {}).map(parameter => parameter.source),
    reading.round_basis.source,
  ];
  const multiSheet = sourcePages.some(hasOtherDrawingPage)
    || reading.dimensions.some(row => (row.observation?.view.page ?? 1) > 1);
  const singleSheet = pageCount === 1 && !multiSheet ? 1 : undefined;
  const explanation = (value?: string) => passportExplanation(estimateOperatorText(publicSourceText(value, '')) ?? '', singleSheet);
  const generalRoughness = reading.general_roughness.text.trim();
  const hasGeneralRoughness = generalRoughness && !/^(unknown|не определено|не указано|не задано|—|-)$/i.test(generalRoughness);
  const envelopeTitle = milling ? 'Исходные осевые размеры' : 'Габариты детали для расчёта';
  const basis = reading.round_basis;
  const editingDimensions = isEditing('dimensions');
  const editingRequirements = isEditing('requirements');
  return <>
    <PassportCard title="Основные сведения о детали" editing={isEditing('summary')} actions={actions('summary')}>
    <table className="compact-passport-table">
      <caption className="sr-only">Основные сведения о детали</caption>
      <thead><tr>{['Параметр', 'Значение', 'Пояснение'].map(label => <th key={label} scope="col" className={th}>{label}</th>)}</tr></thead>
      <tbody>{cells.map(([key, label]) => <tr key={key} className={rowClass}>
        <th scope="row" className={th}>{label}</th>
        <td className={td}>{isEditing('summary')
          ? <input aria-label={label} className={field} value={reading[key].text} onChange={event => onChange({ ...reading, [key]: { text: event.target.value, source: 'Правка оператора' } })} />
          : formatText(reading[key].text)}</td>
        <td className={td}>{explanation(reading[key].source)}
          {key === 'general_roughness' && hasGeneralRoughness && <p>Применяется к поверхностям без отдельного обозначения.</p>}</td>
      </tr>)}</tbody>
    </table>
    </PassportCard>

    {hasEnvelope && <PassportCard title={envelopeTitle} editing={isEditing('envelope')} actions={!milling && actions('envelope')}>
      <table className="compact-passport-table">
        <caption className="sr-only">{envelopeTitle}</caption>
        <thead><tr>{['Параметр', 'Значение, мм', 'Пояснение'].map(label => <th key={label} scope="col" className={th}>{label}</th>)}</tr></thead>
        <tbody>{sizes.map(([key, label], index) => <tr key={key} className={rowClass}>
          <th scope="row" className={th}>{label}</th>
          <td className={`${td} tabular-nums`}>{isEditing('envelope') && !milling
            ? <Input id={`compact-numeric-${key}`} label={`${label}, мм`} inputMode="decimal" value={basis[key] ?? ''} onChange={event => onChange(updateRoundReading(reading, key, event.target.value))} />
            : formatNumber(basis[key])}</td>
          {index === 0 && <td rowSpan={sizes.length} className={td}>{isEditing('envelope') && !milling
            ? <Input label="Основание расчётных размеров" value={basis.source} onChange={event => { onEditBasisSource(); onChange({ ...reading, round_basis: { ...basis, source: event.target.value } }); }} />
            : explanation(basis.source)}</td>}
        </tr>)}</tbody>
      </table>
      {!milling && (basis.diameter_upper_deviation_mm == null || basis.length_upper_deviation_mm == null) && <p className="text-sm text-muted">
        Неизвестные отклонения ограничивают проверку предельных размеров.{basis.diameter_mm != null && basis.length_mm != null
          ? ' Предварительный подбор по известным номиналам доступен.' : ' Для предварительного подбора нужны номинальные диаметр и длина.'}</p>}
      {!milling && !isRoundReading(reading) && <p className="text-sm text-muted">Это габариты готовой детали. Они не подтверждают форму заготовки; её выбор выполняется отдельно во вкладке «Заготовка».</p>}
    </PassportCard>}
    <CompactStockRecognition reading={reading} onChange={isEditing('recognized') ? onChange : undefined}
      section="part" pageCount={singleSheet} actions={actions('recognized')} />

    <PassportCard title="Размеры" editing={editingDimensions} actions={actions('dimensions')}>
      <div className="overflow-x-auto" role="region" tabIndex={0} aria-label="Таблица размеров">
        <table className={`${table} compact-dimensions-table`}>
          <caption className="sr-only">Размеры и требования к поверхностям</caption>
          <thead><tr>{dimensions.map(([key, label]) => <th key={key} scope="col" className={th}>{label}</th>)}
            <th scope="col" className={th}>Пояснение</th>{editingDimensions && <th scope="col" className={th}>Правка</th>}</tr></thead>
          <tbody>{reading.dimensions.map((row, index) => <tr key={index} className={rowClass}>
            {dimensions.map(([key, label]) => <td key={key} className={td}>{editingDimensions
              ? <input aria-label={`${label} ${index + 1}`} name={`dimension-${index}-${key}`} className={`${field} min-w-24`} value={row[key]}
                onChange={event => onChange({ ...reading, dimensions: reading.dimensions.map((current, i) => i === index ? { ...current, [key]: event.target.value, source: 'Правка оператора' } : current) })} />
              : key === 'roughness' && !row.roughness.trim() && hasGeneralRoughness
                ? <>{generalRoughness}<span className="block text-xs text-muted">Общее требование</span></>
                : key === 'kind' ? dimensionKinds[row.kind] ?? 'Размер'
                  : formatText(key === 'location' ? explanation(row[key]) : row[key])}</td>)}
            <td className={td}>{explanation(row.source) !== explanation(row.location) && explanation(row.source)}
              {row.observation?.view.label && !row.source.includes(row.observation.view.label)
                && !row.location.includes(row.observation.view.label) && <p>{singleSheet !== 1 && `Лист ${row.observation.view.page} · `}{row.observation.view.label}</p>}
            </td>
            {editingDimensions && <td className={td}><Button variant="ghost" size="sm" aria-label={`Удалить размер ${index + 1}`}
              onClick={() => onChange({ ...reading, dimensions: reading.dimensions.filter((_, i) => i !== index) })}>Удалить</Button></td>}
          </tr>)}</tbody>
        </table>
      </div>
      {editingDimensions && <Button variant="outline" size="sm" onClick={() => onChange({ ...reading, dimensions: [...reading.dimensions, {
        kind: '', text: '', tolerance: '', roughness: '', location: '', source: 'Правка оператора',
      }] })}>Добавить размер</Button>}
    </PassportCard>
    {children}
    <PassportCard title="Технические требования" editing={editingRequirements} actions={actions('requirements')}>
      <table className={table}>
        <thead><tr>{['№', 'Требование', 'Пояснение'].map(label => <th key={label} scope="col" className={th}>{label}</th>)}
          {editingRequirements && <th scope="col" className={th}>Правка</th>}</tr></thead>
        <tbody>{reading.requirements.map((row, index) => <tr key={index} className={rowClass}>
          <th scope="row" className={th}>{index + 1}</th>
          <td className={td}>{editingRequirements
            ? <textarea aria-label={`Требование ${index + 1}`} className={field} value={row.text}
              onChange={event => onChange({ ...reading, requirements: reading.requirements.map((current, i) => i === index ? { ...current, text: event.target.value, source: 'Правка оператора' } : current) })} />
            : row.text}</td>
          <td className={td}>{explanation(row.source)}</td>
          {editingRequirements && <td className={td}><Button variant="ghost" size="sm" aria-label={`Удалить требование ${index + 1}`}
            onClick={() => onChange({ ...reading, requirements: reading.requirements.filter((_, i) => i !== index) })}>Удалить</Button></td>}
        </tr>)}</tbody>
      </table>
      {editingRequirements && <Button variant="outline" size="sm" onClick={() => onChange({ ...reading, requirements: [...reading.requirements, { text: '', source: 'Правка оператора' }] })}>Добавить требование</Button>}
    </PassportCard>
  </>;
}
