import type { ConfiguredEquipment, EquipmentLibrary, EquipmentPassportBrief, EquipmentValue } from '@/api/hooks/useEquipmentLibrary';
import { formatNumber } from '@/components/route/geometryPresentation';

export const equipmentClasses: Record<string, string> = { lathe: 'Токарные', bandsaw: 'Ленточнопильные', drill: 'Сверлильные', mill: 'Фрезерные', grinder: 'Шлифовальные', slotter: 'Долбёжные', bender: 'Гибочные', process_station: 'Производственные участки', generic: 'Другое' };
export type EquipmentCard = { id: string; title: string; category: string; kind: string; rate: string | null; enabled: boolean; example: boolean; values: { title: string; value: string; unit: string; summary?: string }[]; configuration?: ConfiguredEquipment; passport?: EquipmentPassportBrief };
const number = (value: string) => Number.isFinite(Number(value)) ? formatNumber(Number(value)) : value;
export const equipmentUnit = (unit: string) => ({ mm: 'мм', rpm: 'об/мин', 'mm/rev': 'мм/об', 'mm/min': 'мм/мин', 'm/min': 'м/мин', kW: 'кВт', kg: 'кг', deg: '°', 'N*m': 'Н·м', N: 'Н', '1': 'шт.' } as Record<string,string>)[unit] ?? unit;
export function equipmentConditions(conditions: Record<string, unknown> = {}) {
  const labels: Record<string,string> = { gear: 'Передача', configuration: 'Исполнение', material: 'Материал', material_grade: 'Материал', mounting: 'Закрепление', axis: 'Ось', cut_angle_deg: 'Угол реза', angle_deg: 'Угол', tool: 'Инструмент', section: 'Сечение' };
  const values: Record<string,string> = { solid_round: 'круг', between_centers: 'в центрах', chuck: 'в патроне' };
  return Object.entries(conditions).filter(([key,value]) => !['selection','set_complete','conversion','meaning','load_definition','duty'].includes(key) && ['string','number'].includes(typeof value))
    .map(([key,value]) => `${labels[key] ? labels[key] + ': ' : ''}${values[String(value)] ?? String(value)}${key.endsWith('_deg') ? '°' : ''}`).join('; ');
}
export function equipmentValue(parameter: EquipmentValue, withUnit = false) {
  return parameter.facts.map(fact => {
    const value = fact.value != null ? number(fact.value) : fact.lower != null && fact.upper != null ? `${number(fact.lower)}–${number(fact.upper)}` : fact.upper != null ? `до ${number(fact.upper)}` : fact.lower != null ? `от ${number(fact.lower)}` : '—';
    const conditions = equipmentConditions(fact.conditions);
    return value + (withUnit ? ` ${equipmentUnit(parameter.unit)}` : '') + (conditions ? ` · ${conditions}` : '');
  }).join('; ');
}
export function equipmentCards(view: EquipmentLibrary): EquipmentCard[] {
  const current = view.catalog.equipment.map(configuration => ({
    id: configuration.machine.machine_id, title: configuration.machine.title,
    category: equipmentClasses[configuration.machine.equipment_class], kind: configuration.machine.equipment_class,
    rate: configuration.hourly_rate ?? null, enabled: configuration.enabled, example: configuration.reference, configuration,
    values: (view.class_fields[configuration.machine.equipment_class] ?? []).map(key => {
      const value = configuration.machine[key as keyof typeof configuration.machine];
      return { title: view.fields[key]?.title ?? '', value: Array.isArray(value) ? value.map(String).map(number).join('; ') : value == null ? '—' : number(String(value)), unit: equipmentUnit(view.fields[key]?.unit ?? '') };
    }),
  }));
  const configured = new Set(current.map(item => item.id));
  return [...(view.passports ?? []).filter(item => !configured.has(item.machine_id)).map(passport => ({
    id: passport.machine_id, title: passport.title, category: passport.category, kind: passport.equipment_class,
    rate: passport.hourly_rate, enabled: passport.enabled ?? true, example: false, passport,
    values: passport.parameters.map(parameter => ({ title: parameter.title, value: equipmentValue(parameter), unit: equipmentUnit(parameter.unit), summary: equipmentValue(parameter,true) })),
  })), ...current];
}
export const equipmentRate = (value: string | null) => value == null ? '—' : `${number(value)} ₽/ч`;
