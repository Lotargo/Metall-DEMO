import type { GeometryDimension, VolumeState } from '@/api/hooks/useVolumeRound';

export function timeIssueMessages(time: VolumeState['time_estimate']): string[] {
  if (!time) return [];
  if (time.operator_issues) return time.operator_issues;
  if (!time.issues.length && !time.failure_kind) return [];
  return [time.failure_kind === 'technical_error'
    ? 'Расчёт времени не завершён. Повторите расчёт времени; известная часть сохранена.'
    : 'Часть исходных значений расчёта времени не принята. Проверьте расчётный сценарий; полный итог пока не определён.'];
}
import { publicSourceText } from '@/utils/publicSource';

export const formatNumber = (value: number | null | undefined) => value == null ? 'Не измерен' : new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: Math.abs(value) > 0 && Math.abs(value) < .01 ? 6 : 2,
}).format(value);

/** Display named engineering fields only; raw objects remain in saved artifacts. */
export function operatorText(value: unknown, fallback = 'Не указано'): string {
  if (value == null || value === '') return fallback;
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'string') return publicSourceText(value
    .replace(/на\s+[\p{L}\p{N}_.()-]+\.(?:png|jpe?g|webp)\b/giu, 'на сохранённом изображении')
    .replace(/(?<![\p{L}\p{N}_])без\s+ref\b/giu, 'без связи с измерением 3D-модели')
    .replace(/подходящего\s+ref\b/giu, 'подходящего измерения 3D-модели')
    .replace(/\bref\b/giu, 'связь с измерением 3D-модели')
    .replace(/\(?`?\b(?:cad_route|volume_round)\.[a-z_]+`?\)?/gu, '')
    .replace(/\b(?:face-\d+-[a-z-]+|overall-[xyz]|span-\d+)\b/gu, ''), fallback);
  if (Array.isArray(value)) return value.map(item => operatorText(item, '')).filter(Boolean).join('; ') || fallback;
  if (typeof value === 'object') {
    const item = value as Record<string, unknown>;
    return ['group', 'label', 'text', 'drawing_nominal', 'tolerance', 'roughness', 'designation', 'notes'].map(key => operatorText(item[key], '')).filter(Boolean).join(' · ') || fallback;
  }
  return fallback;
}

export function passportRows(state: VolumeState, fallback: GeometryDimension[] = []) {
  const main = (state.passport?.dimensions ?? fallback).filter(row => row.scope !== 'stock');
  const selected = new Set(main.map(row => row.ref));
  return { main, extra: (state.passport?.other_geometry_dimensions ?? []).filter(row => row.scope !== 'stock' && !selected.has(row.ref) && !!(row.drawing_nominal || row.drawing_source || row.designation || row.tolerance || row.roughness)) };
}

export function measurementLabel(row: GeometryDimension): string {
  if (row.representation === 'conditional') return 'Условно';
  if (row.representation === 'not_modeled') return 'Не построено';
  if (row.representation === 'requirement') return 'Требование';
  if (row.measurement_status === 'unavailable') return 'Не удалось измерить';
  if (row.nominal === null && !row.drawing_nominal?.trim() && !row.assumption) return 'Требует уточнения';
  return 'Нет измерения';
}

export function measurementExplanation(row: GeometryDimension): string {
  if (row.representation === 'conditional') return 'Элемент представлен условно. Измерения его упрощённой формы не подтверждают полное соответствие требованию чертежа.';
  if (row.representation === 'not_modeled') return 'Требование сохранено; соответствующий элемент не построен.';
  if (row.representation === 'requirement') return 'Сведения сохранены как требование. Его выполнение не подтверждается измерением номинального тела.';
  if (row.value != null) return '';
  if (row.measurement_status === 'unavailable') return 'Размер не удалось измерить по заданной геометрической связи. Это не подтверждает отсутствие элемента в модели.';
  if (row.nominal === null && !row.drawing_nominal?.trim() && !row.assumption) return 'Численное значение не установлено по исходным данным. Оно не заменяется нулём или размером условной геометрии.';
  return 'Связь этого размера с геометрией не задана. Это не означает, что сам элемент отсутствует в модели.';
}

export function uniqueNotes(items: unknown[]) {
  return [...new Set(items.map(item => operatorText(item, '')).filter(Boolean))];
}

export function materialLabel(value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'designation' in value) return operatorText(value.designation);
  return operatorText(value);
}

export function passportMatchesModel(state: VolumeState, model?: { revision: number; step_sha256: string }) {
  return !model || model.revision === state.model_revision && model.step_sha256 === (state.step_sha256 ?? state.passport?.step_sha256);
}

export const dimensionKey = (row: GeometryDimension) => JSON.stringify([row.ref, row.feature, row.name]);

export const operatorSourceText = (value: unknown) => operatorText(value, '').replace(/^notes\b/iu, 'Примечания к модели');

export type EngineeringItem = { text: string; context?: string; source?: string };

/** Origins describe where a remark was recorded, without inferring its severity. */
export function passportRemarks(notes: unknown[], unknowns: unknown[]): EngineeringItem[] {
  const items = new Map<string, EngineeringItem>();
  for (const [values, context] of [[notes, '3D-модель'], [unknowns, 'Требования чертежа']] as const) {
    for (const value of values) {
      const item = value && typeof value === 'object' ? value as Partial<EngineeringItem> : undefined;
      const text = operatorText(item?.text ?? value, '');
      if (!text) continue;
      const origin = item?.context ?? context;
      const previous = items.get(text);
      const origins = [...new Set([...(previous?.context?.split(' · ') ?? []), origin])];
      items.set(text, { text, context: origins.join(' · ') });
    }
  }
  return [...items.values()];
}
