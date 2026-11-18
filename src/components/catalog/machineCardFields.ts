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
