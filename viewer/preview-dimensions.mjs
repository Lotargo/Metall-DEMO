export const formatNumber = value => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3, useGrouping: false }).format(value);
export const dimensionText = item => {
  const quantity = item.quantity || (/^(?:диаметр|diameter)(?:\s|$)/i.test(item.name || '') ? 'diameter' : /^(?:радиус|radius)(?:\s|$)/i.test(item.name || '') ? 'radius' : null);
  const prefix = item.prefix ?? ({ diameter: 'Ø', radius: 'R' }[quantity] || '');
  return `${prefix}${formatNumber(item.actual)}${item.suffix || ''}`;
};
export const surfaceLabel = type => ({ plane: 'Плоскость', cylinder: 'Цилиндр', cone: 'Конус', torus: 'Скругление', sphere: 'Сфера', bspline: 'Сплайн', revolution: 'Поверхность вращения', extrusion: 'Выдавливание' }[type] || 'Поверхность');

const finitePoint = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
export function validateAnnotations(graph, sha256) {
  if (!graph || graph.schema !== 'cad-metall-dimensions/1') return 'Неизвестный формат размерных аннотаций';
  if (graph.step_sha256 !== sha256) return 'Размерные аннотации относятся к другой редакции STEP';
  if (!Array.isArray(graph.features) || !Array.isArray(graph.dimensions)) return 'Неверный список размерных аннотаций';
  if (graph.features.length > 1000 || graph.dimensions.length > 1000) return 'Превышен предел размерных аннотаций';
  const features = new Set(), dimensions = new Set();
  for (const f of graph.features) {
    if (typeof f.id !== 'string' || !f.id || features.has(f.id) || typeof f.title !== 'string' || !Array.isArray(f.faceIds) || !f.faceIds.every(Number.isInteger)) return 'Неверная привязка элемента к граням';
    features.add(f.id);
  }
  for (const d of graph.dimensions) {
    if (typeof d.id !== 'string' || !d.id || dimensions.has(d.id) || !features.has(d.featureId) || !Number.isFinite(d.actual) || !finitePoint(d.anchor) || typeof d.name !== 'string') return 'Неверное значение или привязка размера';
    if (d.points && (!Array.isArray(d.points) || d.points.length !== 2 || !d.points.every(finitePoint))) return 'Неверные точки размерной линии';
    if (d.expected !== null && d.expected !== undefined && !Number.isFinite(d.expected)) return 'Неверный номинал чертежа';
    dimensions.add(d.id);
  }
  return null;
}

export function geometryDimensions(inspection) {
  const b = inspection.summary.bounds_mm;
  const mid = [0, 1, 2].map(i => (b[i] + b[i + 3]) / 2);
  const features = [{ id: 'body', title: 'Вся деталь', faceIds: [], bounds: b }], dimensions = [];
  for (let axis = 0; axis < 3; axis++) {
    const first = [...mid], second = [...mid]; first[axis] = b[axis]; second[axis] = b[axis + 3];
    dimensions.push({ id: `extent-${axis}`, featureId: 'body', name: `Габарит по ${'XYZ'[axis]}`, compactName: 'XYZ'[axis], actual: b[axis + 3] - b[axis],
      anchor: mid, points: [first, second], kind: 'linear', side: axis === 1 ? 'right' : 'left', basis: 'geometry', units: 'мм' });
  }
  const seen = new Map();
  for (const face of inspection.faces) {
    const id = `face-${face.id}`, title = `${surfaceLabel(face.surface)}${face.radius !== undefined ? ` Ø${formatNumber(face.radius * 2)}` : face.minor_radius !== undefined ? ` R${formatNumber(face.minor_radius)}` : ''}`;
    features.push({ id, title: `${title} · грань ${face.id}`, faceIds: [face.id], bounds: face.bounds_mm });
    const anchor = face.centroid_mm || [0, 1, 2].map(i => (face.bounds_mm[i] + face.bounds_mm[i + 3]) / 2);
    const radius = face.minor_radius ?? face.radius;
    if (radius === undefined) continue;
    const radial = face.surface === 'torus', key = `${face.surface}:${radius.toFixed(6)}:${(face.axis || []).map(v => Math.abs(v).toFixed(5)).join(',')}`;
    if (seen.has(key)) { const d = seen.get(key); d.faceIds.push(face.id); continue; }
    const d = { id: `radius-${face.id}`, featureId: id, faceIds: [face.id], name: radial ? 'Радиус скругления' : 'Диаметр поверхности',
      actual: radial ? radius : radius * 2, prefix: radial ? 'R' : 'Ø', anchor, side: dimensions.length % 2 ? 'left' : 'right', kind: 'leader', basis: 'geometry', units: 'мм' };
    dimensions.push(d); seen.set(key, d);
  }
  return { schema: 'cad-metall-dimensions/1', features, dimensions, basis: 'geometry' };
}

export function ownerForFace(graph, id) {
  const features = graph.features.filter(f => f.id !== 'body' && f.faceIds.includes(Number(id)));
  const volume = f => f.bounds ? [0, 1, 2].reduce((v, i) => v * Math.max(.001, f.bounds[i + 3] - f.bounds[i]), 1) : Infinity;
  return features.sort((a, b) => volume(a) - volume(b))[0] || graph.features.find(f => f.id === 'body') || graph.features[0];
}
export function dimensionsFor(graph, featureId, faceId) {
  return graph.dimensions.filter(d => d.featureId === featureId || (faceId && d.faceIds?.includes(Number(faceId))));
}
