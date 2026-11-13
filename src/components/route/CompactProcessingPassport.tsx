import { InfoBlock } from '@/components/ui/InfoBlock';
import type { ReactNode } from 'react';
import type { components } from '@/api/schema';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { passportExplanation } from '@/utils/compactDrawingEvidence';
import { formatNumber } from '@/utils/compactNumbers';
import { publicSourceText } from '@/utils/publicSource';

export type ProcessingPassport = NonNullable<components['schemas']['CompactEdit']['processing_passport']>;
type PassportSize = NonNullable<ProcessingPassport['x']>;
type Slot = NonNullable<ProcessingPassport['slot']>;

const types = [
  { value: 'turning', label: 'Токарная' },
  { value: 'turning_milling', label: 'Токарно-фрезерная' },
  { value: 'milling', label: 'Фрезерная' },
];
const axes = ['x', 'y', 'z'] as const;
const slotRoles = [
  { value: 'unknown', label: 'Роль не установлена' },
  { value: 'overall', label: 'Полная длина паза' },
  { value: 'between_centers', label: 'Между центрами двух одинаковых круглых торцов' },
];
const emptySize = { value_mm: '', source: '' };

export function cartesianRolesChanged(current: ProcessingPassport | null, saved: ProcessingPassport | null, sourceChanged: boolean) {
  return !!current && (
    current.kind === 'milling' && saved?.kind !== 'milling'
    || current.kind !== 'turning' && axes.some(axis => current[axis] != null)
      && (saved?.kind === 'turning' || sourceChanged)
    || axes.some(axis => {
      const next = current[axis];
      const previous = saved?.[axis];
      return next?.value_mm !== previous?.value_mm || next?.source !== previous?.source;
    })
  );
}

function SizeField({ label, size, onChange, pageCount }: {
  label: string;
  size?: PassportSize | null;
  onChange?: (value: PassportSize | null) => void;
  pageCount?: number;
}) {
  if (!onChange) {
    return <tr className="border-b border-line align-top">
      <th scope="row" className="py-2 pr-3 text-left font-medium">{label}</th>
      <td className="py-2 pr-3 tabular-nums">{size ? formatNumber(size.value_mm) : 'Не определён (UNKNOWN)'}</td>
      <td className="break-words py-2">{passportExplanation(publicSourceText(size?.source, ''), pageCount)}</td>
    </tr>;
  }
  function update(field: keyof PassportSize, value: string) {
    const next = { ...(size ?? emptySize), [field]: value };
    onChange?.(next.value_mm === '' && !next.source ? null : next);
  }
  return <div className="grid gap-2 sm:grid-cols-2">
    <Input label={label} inputMode="decimal" value={size?.value_mm ?? ''}
      onChange={event => update('value_mm', event.target.value.replace(',', '.'))} />
    <Input label={`Источник: ${label}`} maxLength={1000} value={size?.source ?? ''}
      onChange={event => update('source', event.target.value)} />
  </div>;
}

function SizeTable({ children }: { children: ReactNode }) {
  return <table className="w-full"><thead><tr className="text-left">
    <th scope="col">Параметр</th><th scope="col">Значение</th><th scope="col">Пояснение</th>
  </tr></thead><tbody>{children}</tbody></table>;
}

export function CompactProcessingPassport({ value, editing, onChange, pageCount, actions }: {
  value: ProcessingPassport | null;
  editing: boolean;
  onChange: (next: ProcessingPassport) => void;
  pageCount?: number;
  actions?: ReactNode;
}) {
  const axial = value?.kind !== 'milling';
  const cartesian = value?.kind === 'milling' || value?.kind === 'turning_milling';
  const slot = value?.slot;
  const sizeFields = [
    ...(axial ? [{ key: 'through_bore' as const, label: 'Осевой сквозной проход Ø, мм' }] : []),
    ...(cartesian ? axes.map(key => ({ key, label: `Габарит ${key.toUpperCase()}, мм` })) : []),
  ];
  const sizeRows = value && sizeFields.map(({ key, label }) =>
    <SizeField key={key} label={label} size={value[key]} pageCount={pageCount} onChange={editing ? size => onChange({ ...value, [key]: size }) : undefined} />);
  return <section aria-labelledby="compact-processing-heading" className="compact-workspace-card space-y-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 id="compact-processing-heading" className="font-semibold">Тип обработки и роли размеров</h3>
      {!editing && actions}
    </div>
    {editing ? <Select label="Тип обработки" options={value ? types : [{ value: '', label: 'Не установлен' }, ...types]} value={value?.kind ?? ''}
      onChange={event => {
        const kind = event.target.value as ProcessingPassport['kind'] | '';
        if (kind) onChange({ ...value, kind });
      }} />
      : <p>{types.find(type => type.value === value?.kind)?.label ?? 'Тип обработки не установлен.'}</p>}
    {cartesian && <p className="text-muted">
      Укажите габариты по осям готовой детали и их места на чертеже. Пустые поля остаются неизвестными.
      {axial ? ' Осевые размеры сохраняют свои роли в расчёте круглой заготовки.' : ' Исходные осевые размеры доступны ниже для сверки.'}
    </p>}
    {editing ? <div className="space-y-3">{sizeRows}</div> : value && <SizeTable>{sizeRows}</SizeTable>}
    {!axial && value?.through_bore && <SizeTable><SizeField label="Исходный осевой проход Ø, мм" size={value.through_bore} pageCount={pageCount} /></SizeTable>}
    {value && cartesian && <InfoBlock className="space-y-3" title={<>Габарит прямого паза{slot?.overall_length_mm != null && ` · ${formatNumber(slot.overall_length_mm)} мм`}</>}>

      {editing && !slot && <Button size="sm" variant="outline" onClick={() => onChange({ ...value, slot: { length: emptySize, role: 'unknown' } })}>Указать размер паза</Button>}
      {editing && slot && <>
        <Select label="Роль размера паза" options={slotRoles} value={slot.role}
          onChange={event => onChange({ ...value, slot: { ...slot, role: event.target.value as Slot['role'], end_radius: null, overall_length_mm: null } })} />
        <SizeField label="Размер паза, мм" size={slot.length} onChange={length => onChange({ ...value, slot: { ...slot, length: length ?? emptySize, overall_length_mm: null } })} />
        {slot.role === 'between_centers' && <SizeField label="Радиус торца паза, мм" size={slot.end_radius} onChange={end_radius => onChange({ ...value, slot: { ...slot, end_radius, overall_length_mm: null } })} />}
        <Button size="sm" variant="outline" onClick={() => onChange({ ...value, slot: null })}>Убрать проверку паза</Button>
      </>}
      {!editing && slot && <>
        <p>{slotRoles.find(role => role.value === slot.role)?.label}. Полная длина {slot.overall_length_mm == null ? 'не определена (UNKNOWN)' : `${formatNumber(slot.overall_length_mm)} мм`}.</p>
        <SizeTable><SizeField label="Размер паза, мм" size={slot.length} pageCount={pageCount} />
          {slot.role === 'between_centers' && <SizeField label="Радиус торца паза, мм" size={slot.end_radius} pageCount={pageCount} />}</SizeTable>
        <p className="text-muted">Длина относится к геометрии паза. Рабочий ход фрезы рассчитывается по траектории операции.</p>
      </>}
      {!editing && !slot && <p className="text-muted">Размер и его роль не заданы.</p>}
    </InfoBlock>}
    {editing && actions}
  </section>;
}
