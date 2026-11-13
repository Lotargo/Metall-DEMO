function decimalKey(value: string) {
  const [integer, fraction = ''] = value.split('.');
  return `${integer.replace(/^0+/, '') || '0'}.${fraction.replace(/0+$/, '')}`;
}

export function coefficientForRequest(text: string, saved: string) {
  const raw = text.trim().replace(',', '.');
  if (raw === saved) return saved;
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw) || Number(raw) < 1 || !Number.isFinite(Number(raw))) return null;
  // The money snapshot hashes the persisted Decimal representation.
  return decimalKey(raw) === decimalKey(saved) ? saved : raw;
}
