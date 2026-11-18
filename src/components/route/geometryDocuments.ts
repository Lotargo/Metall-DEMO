import type { Range, VolumeState } from '@/api/hooks/useVolumeRound';
import { formatNumber } from './geometryPresentation';

export function rangeText(value: Range | undefined, unit = '') {
  return value && Number.isFinite(value.min) && Number.isFinite(value.max)
    ? `${formatNumber(value.min)}–${formatNumber(value.max)}${unit ? ` ${unit}` : ''}` : 'Не оценено';
}

function perPiece(batch: Range, quantity: number): Range {
  return batch && quantity > 0 ? { min: batch.min / quantity, max: batch.max / quantity } : null;
}

export function estimateTotals(state: VolumeState) {
  const cost = state.cost_estimate;
  const fullTime = state.time_estimate?.totals;
  const knownTime = state.time_estimate?.known_groups;
  const batchCost = cost?.batch_rub ?? cost?.known_batch_rub ?? null;
  const batchTime = fullTime?.batch_minutes ?? knownTime?.batch_minutes ?? null;
  return {
    cost: {
      batch: batchCost,
      perPiece: perPiece(batchCost, state.quantity),
      assessedOnly: cost?.batch_rub == null && batchCost !== null,
    },
    time: {
      batch: batchTime,
      perPiece: fullTime?.effective_per_piece_minutes ?? perPiece(batchTime, state.quantity),
      processing: fullTime?.per_piece_minutes ?? knownTime?.per_piece_minutes,
      setup: fullTime?.setup_per_batch_minutes ?? knownTime?.setup_per_batch_minutes,
      assessedOnly: fullTime?.batch_minutes == null && batchTime !== null,
    },
  };
}

export const assessedCostLabel = 'Итог по оценённым работам';
export const oncePerRunLabel = 'Разовые работы и общие циклы';

export function estimateTimeLabel(quantity: number, assessedOnly: boolean) {
  const label = assessedOnly ? 'Оценённое время' : 'Время';
  const scope = quantity === 1 ? 'на 1 деталь' : `партии · ${quantity} шт.`;
  return `${label} ${scope} (ориентировочно)`;
}

export function costRow(state: VolumeState, name: string, index: number) {
  const rows = state.cost_estimate?.rows ?? [];
  if (rows[index]?.name === name) return rows[index];
  const matches = rows.filter(row => row.name === name);
  return matches.length === 1 ? matches[0] : undefined;
}
export function estimateStatus(state: VolumeState) {
  if (state.results_stale) return 'Расчёт требует обновления после изменения модели';
  if (state.time_estimate?.failure_kind) return 'Оценка остановлена. Сохранена известная часть результата';
  if (state.time_estimate?.status === 'estimated' && state.cost_estimate?.status === 'estimated') {
    return 'Предварительный расчёт по принятому сценарию';
  }
  return estimateTotals(state).cost.batch ? 'Смета по оценённым работам' : 'Стоимость работ пока не оценена';
}

// Split only top-level document headings; fenced examples and nested headings
// stay in their original Markdown section, including formulas and source links.
export function routeSections(markdown: string) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const headings: { line: number; level: number; title: string; end: number }[] = [];
  let fence: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(lines[i]);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = undefined;
      continue;
    }
    if (fence) continue;
    const atx = /^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(lines[i]);
    if (atx) headings.push({ line: i, level: atx[1].length, title: atx[2], end: i + 1 });
    else if (lines[i].trim() && i + 1 < lines.length && /^ {0,3}(=+|-+)\s*$/.test(lines[i + 1])) {
      headings.push({ line: i, level: lines[i + 1].trim()[0] === '=' ? 1 : 2, title: lines[i].trim(), end: i + 2 }); i++;
    }
  }
  const level = Math.min(...headings.map(h => h.level));
  const sections = headings.filter(h => h.level === level);
  if (!sections.length) return markdown.trim() ? [{ title: 'Технология изготовления', body: markdown.trim() }] : [];
  const intro = lines.slice(0, sections[0].line).join('\n').trim();
  return [ ...(intro ? [{ title: 'Общие условия', body: intro }] : []), ...sections.map((h, i) => ({
    title: h.title, body: lines.slice(h.end, sections[i + 1]?.line ?? lines.length).join('\n').trim(),
  })) ];
}
