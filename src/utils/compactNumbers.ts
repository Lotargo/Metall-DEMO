export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function finiteNonnegative(value: unknown): number | null {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && value.trim() === '')) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function formatText(value: unknown): string {
  if (value == null || value === '') return 'Не определено';
  const text = String(value);
  if (/^`?unknown`?$/i.test(text.trim())) return 'Не определено';
  return text.replace(/`UNKNOWN`|\bUNKNOWN\b/g, (_match, offset: number) => offset === 0 ? 'Не определено' : 'не определено');
}

export function formatNumber(value: unknown, digits = 3): string {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && value.trim() === '')) return 'Не определено';
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Не определено';
  if (number !== 0 && Math.abs(number) < 10 ** -digits) return number.toExponential(2).replace('.', ',');
  return number.toLocaleString('ru-RU', { maximumFractionDigits: digits });
}
