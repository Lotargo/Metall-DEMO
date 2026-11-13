import type { MachineFile, ParameterId } from '@/api/machineExchange';

// These are display choices over the registered parameter IDs. The exchange
// registry supplies titles, units and the comparison rules.
export const shortMachineFields: Record<MachineFile['machine']['equipment_class'], readonly ParameterId[]> = {
  lathe: ['diameter_over_bed_mm', 'diameter_over_carriage_mm', 'workpiece_length_mm', 'distance_between_centers_mm', 'travel_z_mm', 'spindle_rpm'],
  drill: ['drill_diameter_mm', 'spindle_quill_travel_mm', 'spindle_rpm', 'feed_mm_per_rev'],
  bandsaw: ['cut_diameter_mm', 'band_speed_m_per_min'],
  mill: ['table_length_mm', 'table_width_mm', 'travel_x_mm', 'travel_y_mm', 'travel_z_mm', 'spindle_rpm'],
  grinder: ['grinding_diameter_mm', 'grinding_length_mm', 'workpiece_spindle_rpm', 'wheel_spindle_rpm'],
  generic: [],
};

export const machineFieldPurpose: Partial<Record<ParameterId, string>> = {
  diameter_over_bed_mm: 'Габарит вращения над станиной.',
  diameter_over_carriage_mm: 'Свободный диаметр в зоне суппорта.',
  workpiece_length_mm: 'Предельная длина заготовки в указанном установе.',
  distance_between_centers_mm: 'Расстояние между центрами. Полезная длина зависит от установа.',
  drill_diameter_mm: 'Предел сверления для указанного материала.',
  spindle_quill_travel_mm: 'Рабочий ход для сверления с учётом подхода.',
  cut_diameter_mm: 'Предел круглого сечения при указанном угле реза.',
  band_speed_m_per_min: 'Доступная скорость полотна для выбранного режима.',
  table_length_mm: 'Длина опорной поверхности для детали и крепежа.',
  table_width_mm: 'Ширина опорной поверхности для детали и крепежа.',
  travel_x_mm: 'Доступный ход для траектории по X.',
  travel_y_mm: 'Доступный ход для траектории по Y.',
  travel_z_mm: 'Доступный ход для траектории по Z.',
  spindle_rpm: 'Диапазон или ступени оборотов для выбранного режима.',
  feed_mm_per_rev: 'Доступная подача на оборот для выбранного режима.',
  grinding_diameter_mm: 'Предельный диаметр шлифования при указанном закреплении.',
  grinding_length_mm: 'Предельная длина шлифования при указанном закреплении.',
  workpiece_spindle_rpm: 'Доступные обороты детали при шлифовании.',
  wheel_spindle_rpm: 'Доступные обороты круга при шлифовании.',
};
