// Encre : traits au stylet (pression Apple Pencil) rendus avec perfect-freehand.
// Les coordonnées sont en « unités page » : la largeur vaut toujours 1000.
import { getStroke } from '../vendor/perfect-freehand.js';
import { h, uid } from './lib.js';

export const PENS = {
  stylo: { size: 3.2, thinning: 0.6, color: '#161616', opacity: 1 },
  feutre: { size: 7, thinning: 0.2, color: '#161616', opacity: 1 },
  surligneur: { size: 22, thinning: 0, color: '#F5D90A', opacity: 0.45 }
};

// Couleurs et épaisseurs (mémorisées sur l'appareil)
export const COLORS = [['#161616', 'Noir'], ['#74726C', 'Gris'], ['#C62828', 'Rouge'], ['#1E5AA8', 'Bleu'], ['#2E7D32', 'Vert'], ['#E07B00', 'Orange']];
export const HL_COLORS = [['#F5D90A', 'Jaune'], ['#7BD389', 'Vert'], ['#F59AC0', 'Rose'], ['#8EC5FF', 'Bleu'], ['#BFBDB6', 'Gris']];
export const WIDTHS = [['fin', 0.5, 'Fin'], ['moyen', 1, 'Moyen'], ['epais', 1.9, 'Épais'], ['tres', 3.2, 'Très épais']];
const PREF_KEY = 'statera-atelier-pen';
export const penPrefs = (() => {
  let v = { color: '#161616', hl: '#F5D90A', width: 'moyen', finger: false };
  try { Object.assign(v, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); } catch (e) { /* stockage indisponible */ }
  return v;
})();
function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(penPrefs)); } catch (e) { /* rien */ } }
// Couleur et taille du prochain trait pour un outil donné
export function strokeStyle(pen) {
  const base = PENS[pen] || PENS.stylo;
  const w = (WIDTHS.find((x) => x[0] === penPrefs.width) || WIDTHS[1])[1];
  return { color: pen === 'surligneur' ? penPrefs.hl : penPrefs.color, size: Math.round(base.size * w * 10) / 10 };
}
// Barre de choix : couleurs + épaisseurs (+ dessin au doigt en option)
export function penPicker({ light = false, withFinger = false, onFinger } = {}) {
  const el = h('div', { class: 'pen-strip' + (light ? ' light' : ''), role: 'group', 'aria-label': 'Couleur et épaisseur du trait' });
  let mode = 'stylo';
  const draw = () => {
    while (el.firstChild) el.removeChild(el.firstChild);
    const hl = mode === 'surligneur';
    const list = hl ? HL_COLORS : COLORS;
    const cur = hl ? penPrefs.hl : penPrefs.color;
    el.appendChild(h('span', { class: 'lbl-p' }, 'Couleur'));
    list.forEach(([c, n]) => el.appendChild(h('button', { class: 'swatch', type: 'button', 'aria-label': n, title: n, 'aria-pressed': String(cur === c), onclick: () => { if (hl) penPrefs.hl = c; else penPrefs.color = c; savePrefs(); draw(); } }, h('i', { style: { background: c } }))));
    el.appendChild(h('span', { class: 'sep' }));
    el.appendChild(h('span', { class: 'lbl-p' }, 'Trait'));
    WIDTHS.forEach(([id, k, n]) => el.appendChild(h('button', { class: 'wbtn', type: 'button', 'aria-label': n, title: n, 'aria-pressed': String(penPrefs.width === id), onclick: () => { penPrefs.width = id; savePrefs(); draw(); } }, h('b', { style: { height: Math.max(1.5, Math.min(14, 3.5 * k)) + 'px' } }))));
    if (withFinger) {
      el.appendChild(h('span', { class: 'sep' }));
      el.appendChild(h('button', { class: 'tool', type: 'button', 'aria-pressed': String(!!penPrefs.finger), title: 'Dessiner au doigt (sinon le doigt fait défiler)', onclick: () => { penPrefs.finger = !penPrefs.finger; savePrefs(); onFinger && onFinger(penPrefs.finger); draw(); } }, 'Doigt'));
    }
  };
  draw();
  return { el, setMode(m) { mode = m; draw(); } };
}

function avg(a, b) { return (a + b) / 2; }
export function outlineToPath(pts) {
  const len = pts.length;
  if (len < 4) return '';
  let a = pts[0], b = pts[1];
  const c = pts[2];
  let d = `M${a[0].toFixed(2)},${a[1].toFixed(2)} Q${b[0].toFixed(2)},${b[1].toFixed(2)} ${avg(b[0], c[0]).toFixed(2)},${avg(b[1], c[1]).toFixed(2)} T`;
  for (let i = 2, max = len - 1; i < max; i++) {
    a = pts[i]; b = pts[i + 1];
    d += `${avg(a[0], b[0]).toFixed(2)},${avg(a[1], b[1]).toFixed(2)} `;
  }
  return d + 'Z';
}
export function strokePath(s) {
  const pen = PENS[s.pen] || PENS.stylo;
  const simulate = !s.pressure;
  const out = getStroke(s.pts, {
    size: (s.size || pen.size) * (s.scale || 1),
    thinning: pen.thinning, smoothing: 0.5, streamline: 0.45,
    simulatePressure: simulate, last: true,
    start: { cap: true }, end: { cap: true }
  });
  return outlineToPath(out);
}
export function strokeEl(s) {
  const pen = PENS[s.pen] || PENS.stylo;
  return h('path', { d: strokePath(s), fill: s.color || pen.color, 'fill-opacity': pen.opacity, 'data-id': s.id });
}
export function renderStrokes(svg, strokes) {
  const g = svg.querySelector('g.strokes') || svg.appendChild(h('g', { class: 'strokes' }));
  while (g.firstChild) g.removeChild(g.firstChild);
  strokes.forEach((s) => g.appendChild(strokeEl(s)));
  return g;
}

// Dessine les traits sur un canvas 2D (exports PDF, vignettes)
export function drawStrokes(ctx, strokes, k) {
  ctx.save(); ctx.scale(k, k);
  for (const s of strokes) {
    const pen = PENS[s.pen] || PENS.stylo;
    ctx.globalAlpha = pen.opacity;
    ctx.fillStyle = s.color || pen.color;
    try { ctx.fill(new Path2D(strokePath(s))); } catch (e) { /* trait invalide ignoré */ }
  }
  ctx.restore();
}

// Surface de dessin autonome (croquis de note, photo annotée)
// el : conteneur positionné ; aspect : hauteur / largeur
export function sketchSurface(el, { strokes = [], aspect = 1.414, onChange, getPen, finger = () => true, styleFor = strokeStyle }) {
  const H = 1000 * aspect;
  const svg = h('svg', { viewBox: `0 0 1000 ${H}`, preserveAspectRatio: 'none' });
  el.appendChild(svg);
  let list = strokes.slice();
  let cur = null, penSeen = false;
  const undoStack = [];
  renderStrokes(svg, list);

  const toUnits = (e) => {
    const r = svg.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 1000, ((e.clientY - r.top) / r.height) * H, e.pressure || 0.5];
  };
  const mode = () => (getPen ? getPen() : 'stylo');
  // Safari : l'Apple Pencil ne doit pas faire défiler la page ; le doigt, si (sauf mode « Doigt »)
  const blockScroll = (e) => { if (finger() || Array.from(e.touches).some((t) => t.touchType === 'stylus')) e.preventDefault(); };
  svg.addEventListener('touchstart', blockScroll, { passive: false });
  svg.addEventListener('touchmove', blockScroll, { passive: false });

  svg.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'pen') penSeen = true;
    if (e.pointerType === 'touch' && (penSeen || !finger())) return; // paume ignorée avec l'Apple Pencil ; le doigt fait défiler
    const m = mode();
    if (m === 'gomme') { eraseAt(e); return; }
    svg.setPointerCapture(e.pointerId);
    cur = Object.assign({ id: uid(), pen: m, pts: [toUnits(e)], pressure: e.pointerType === 'pen' }, styleFor(m));
    cur.el = strokeEl(cur);
    svg.querySelector('g.strokes').appendChild(cur.el);
    e.preventDefault();
  });
  svg.addEventListener('pointermove', (e) => {
    if (!cur) { if (mode() === 'gomme' && e.buttons) eraseAt(e); return; }
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    evs.forEach((ev) => cur.pts.push(toUnits(ev)));
    cur.el.setAttribute('d', strokePath(cur));
  });
  const end = () => {
    if (!cur) return;
    const s = { id: cur.id, pen: cur.pen, color: cur.color, size: cur.size, pts: cur.pts.map((p) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10, Math.round(p[2] * 100) / 100]), pressure: cur.pressure };
    cur = null;
    if (s.pts.length > 1 || s.pen) { list.push(s); undoStack.push({ add: s.id }); onChange && onChange(list); }
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);

  function eraseAt(e) {
    const t = document.elementFromPoint(e.clientX, e.clientY);
    if (t && t.tagName === 'path' && t.dataset.id) {
      const s = list.find((x) => x.id === t.dataset.id);
      list = list.filter((x) => x.id !== t.dataset.id);
      undoStack.push({ del: s });
      renderStrokes(svg, list); onChange && onChange(list);
    }
  }
  return {
    svg,
    get strokes() { return list; },
    undo() {
      const u = undoStack.pop(); if (!u) return;
      if (u.add) list = list.filter((x) => x.id !== u.add);
      if (u.del) list.push(u.del);
      renderStrokes(svg, list); onChange && onChange(list);
    },
    clear() { undoStack.push(...list.map((s) => ({ del: s }))); list = []; renderStrokes(svg, list); onChange && onChange(list); }
  };
}

// Vignette SVG d'un croquis
export function miniSketch(strokes, aspect = 1.414, cls = 'mini') {
  const svg = h('svg', { viewBox: `0 0 1000 ${1000 * aspect}`, class: cls, preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true' });
  renderStrokes(svg, strokes || []);
  return svg;
}
