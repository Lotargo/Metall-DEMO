import * as THREE from 'three';
import { dimensionText } from './preview-dimensions.mjs';
const ns = 'http://www.w3.org/2000/svg';
const node = (type, attrs = {}, text) => { const n = document.createElementNS(ns, type); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v)); if (text !== undefined) n.textContent = text; return n; };
const clamp = (v, low, high) => Math.max(low, Math.min(v, high));
export class DimensionOverlay {
  constructor(stage) { this.stage = stage; this.svg = node('svg', { id: 'dimension-overlay', 'aria-hidden': 'true' }); stage.append(this.svg); }
  draw(dimensions, camera, activeId) {
    const width = this.stage.clientWidth, height = this.stage.clientHeight; this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`); this.svg.replaceChildren();
    if (!dimensions.length || width < 50 || height < 50) return;
    camera.updateMatrixWorld();
    const project = p => { const v = new THREE.Vector3(...p).project(camera); return { x: (v.x + 1) * width / 2, y: (1 - v.y) * height / 2 }; };
    const defs = node('defs'), marker = node('marker', { id: 'dim-arrow', viewBox: '0 0 10 10', refX: 5, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' });
    marker.append(node('path', { d: 'M 1 1 L 9 5 L 1 9', fill: 'none', stroke: '#5b7d95', 'stroke-width': 1.3 })); defs.append(marker); this.svg.append(defs);
    const items = dimensions.map((d, i) => {
      const a = project(d.anchor), points = d.points?.map(project), side = dimensions.length > 8 ? (i % 2 ? 'right' : 'left') : d.side || (i % 2 ? 'right' : 'left');
      const collapsed = points && Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) < 14;
      const text = `${d.kind === 'linear' && collapsed ? `${d.compactName || 'L'} ` : ''}${dimensionText(d)}`;
      const w = Math.min(width / 2 - 16, Math.max(38, text.length * 6.5 + 18));
      return { d, a, points, side, collapsed, text, w, x: side === 'left' ? 12 + w / 2 : width - 12 - w / 2, y: clamp(a.y, 62, height - 70) };
    });
    for (const side of ['left', 'right']) {
      const lane = items.filter(i => i.side === side).sort((a, b) => a.y - b.y);
      const bottomLimit = height - (side === 'right' ? 145 : 75);
      const gap = Math.min(28, (bottomLimit - 56) / Math.max(lane.length, 1)); let next = 56;
      for (const item of lane) { item.y = Math.max(item.y, next + gap / 2); next = item.y + gap / 2; }
      let bottom = bottomLimit; for (const item of [...lane].reverse()) { item.y = Math.min(item.y, bottom - gap / 2); bottom = item.y - gap / 2; }
    }
    for (const item of items) {
      const { d, a, points, side, x, y, w } = item;
      const g = node('g', { class: `dimension-annotation${activeId === d.id ? ' is-selected' : ''}`, 'data-dimension-id': d.id, 'data-feature-id': d.featureId, 'data-anchor-x': a.x.toFixed(3), 'data-anchor-y': a.y.toFixed(3) });
      g.append(node('title', {}, d.name));
      const color = d.mismatch ? '#9a3434' : '#54758d';
      const line = (p, q, arrows = false) => g.append(node('line', { x1: p.x, y1: p.y, x2: q.x, y2: q.y, stroke: color, 'stroke-width': 1, ...(arrows ? { 'marker-start': 'url(#dim-arrow)', 'marker-end': 'url(#dim-arrow)' } : {}) }));
      let target = a;
      if (d.kind === 'linear' && points && !item.collapsed) {
        const dx = points[1].x - points[0].x, dy = points[1].y - points[0].y, length = Math.hypot(dx, dy);
        let normal = { x: -dy / length, y: dx / length }; if (normal.x * (side === 'left' ? -1 : 1) < 0) normal = { x: -normal.x, y: -normal.y };
        const offset = dimensions.length > 8 ? 12 : 24;
        const first = { x: points[0].x + normal.x * offset, y: points[0].y + normal.y * offset }, last = { x: points[1].x + normal.x * offset, y: points[1].y + normal.y * offset };
        line(points[0], first); line(points[1], last); line(first, last, true); target = { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 };
      }
      const edge = side === 'left' ? x + w / 2 : x - w / 2, elbow = edge + (side === 'left' ? 12 : -12);
      g.append(node('path', { d: `M ${target.x} ${target.y} L ${elbow} ${y} L ${edge} ${y}`, fill: 'none', stroke: color, 'stroke-width': .9, opacity: .8 }));
      g.append(node('circle', { cx: target.x, cy: target.y, r: 2, fill: color }));
      const label = node('g', { class: 'dimension-label', transform: `translate(${x},${y})` });
      label.append(node('rect', { x: -w / 2, y: -10, width: w, height: 20, rx: 4, fill: '#fffffffa', stroke: '#c8d6e1', 'stroke-width': .8 }));
      label.append(node('text', { x: 0, y: 3.8, 'text-anchor': 'middle', fill: color, 'font-size': width < 500 ? 10 : 11, 'font-weight': 550 }, item.text));
      g.append(label); this.svg.append(g);
    }
  }
}
