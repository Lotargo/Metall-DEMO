import type { components } from '@/api/schema';

const demonstrationOrigins = new Set(['mock', 'demo', 'fixture']);

/** Price provenance is retained in history; demonstration amounts have no business value. */
export function isDemonstrationPrice(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return ['basis', 'price_basis', 'origin', 'source'].some(key => {
    if (typeof row[key] !== 'string') return false;
    const tag = row[key].toLowerCase().trim().split(':', 1)[0];
    return demonstrationOrigins.has(tag) || [...demonstrationOrigins].some(origin => tag.startsWith(`${origin}-`));
  });
}

/** Use for monetary snapshots, never for a general drawing/material object. */
export function hasDemonstrationPrices(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasDemonstrationPrices);
  if (typeof value !== 'object' || value === null) return false;
  return isDemonstrationPrice(value) || Object.values(value).some(hasDemonstrationPrices);
}

export function hasHistoricalMaterialCost(estimate: components['schemas']['EstimateSnapshot'] | null | undefined) {
  if (!estimate) return false;
  if (estimate.material_supply?.status === 'applied') return true;
  const keys = new Set(estimate.inventory.items
    .filter(item => ['material', 'material-credit'].includes(item.category))
    .map(item => item.key));
  keys.add('material');
  return estimate.lines.some(line => keys.has(line.work_key) &&
    [line.computed_batch_amount, line.amount, line.unit_price, line.hourly_rate].some(value => value != null));
}
