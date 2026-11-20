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
export const savePenPrefs = () => savePrefs();
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
  if (s.shape) {
    // Formes nettes : trait d'épaisseur constante, chaque côté tracé séparément pour garder des angles vifs
    const opt = { size: (s.size || pen.size) * (s.scale || 1), thinning: 0, smoothing: s.shape === 'ellipse' ? 0.5 : 0, streamline: 0, simulatePressure: false, last: true, start: { cap: true }, end: { cap: true } };
    if (s.shape === 'ellipse') return outlineToPath(getStroke(s.pts, opt));
    const segs = []; let curSeg = [s.pts[0]];
    for (let i = 1; i < s.pts.length; i++) {
      curSeg.push(s.pts[i]);
      const a = s.pts[i - 1], b = s.pts[i], c = s.pts[i + 1];
      if (c) { const t1 = Math.atan2(b[1] - a[1], b[0] - a[0]), t2 = Math.atan2(c[1] - b[1], c[0] - b[0]); let d = Math.abs(t1 - t2); if (d > Math.PI) d = 2 * Math.PI - d; if (d > 0.5) { segs.push(curSeg); curSeg = [b]; } }
    }
    segs.push(curSeg);
    return segs.filter((g) => g.length > 1).map((g) => { const a = g[0], b = g[g.length - 1]; return outlineToPath(getStroke([a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0.5], b, b], opt)); }).join(' ');
  }
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
  let cur = null, penSeen = false, shp = null;
  const undoStack = [];
  const tolUnits = () => { const r = svg.getBoundingClientRect(); return r.width ? (6 / r.width) * 1000 : 6; };
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
    const pen = m === 'regle' ? 'stylo' : m;
    cur = Object.assign({ id: uid(), pen, pts: [toUnits(e)], pressure: e.pointerType === 'pen' }, styleFor(pen));
    shp = shaper((st) => st.el.setAttribute('d', strokePath(st)), () => tolUnits());
    if (m === 'regle') { const p0 = toUnits(e); shp.ruler(cur, nearEnd(list, p0, tolUnits() * 3) || [p0[0], p0[1], 0.5]); }
    cur.el = strokeEl(cur);
    svg.querySelector('g.strokes').appendChild(cur.el);
    e.preventDefault();
  });
  svg.addEventListener('pointermove', (e) => {
    if (!cur) { if (mode() === 'gomme' && e.buttons) eraseAt(e); return; }
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    const last = toUnits(evs[evs.length - 1]);
    if (shp && shp.active) { shp.move(cur, last); return; }
    evs.forEach((ev) => cur.pts.push(toUnits(ev)));
    if (shp && shp.move(cur, last)) return;
    cur.el.setAttribute('d', strokePath(cur));
  });
  const end = () => {
    if (!cur) return;
    if (shp) shp.end();
    const s = { id: cur.id, pen: cur.pen, color: cur.color, size: cur.size, pts: cur.pts.map((p) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10, Math.round(p[2] * 100) / 100]), pressure: cur.pressure, shape: cur.shape };
    cur = null;
    if (s.pts.length > 1 || s.pen) { list.push(s); undoStack.push({ add: s.id }); onChange && onChange(list); }
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);

  function eraseAt(e) {
    const [x, y] = toUnits(e);
    const s = hitStroke(list, x, y, tolUnits() * 2.5);
    if (s) {
      list = list.filter((q) => q !== s);
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

// Gomme : trait le plus proche du point touché (tolérance en unités du dessin)
export function hitStroke(strokes, x, y, tol) {
  let best = null, bd = Infinity;
  for (const st of strokes) {
    const pts = st.pts || []; const r = tol + (st.size || 3) / 2;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[i + 1] || a;
      const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
      const t = L ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L)) : 0;
      const d = Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
      if (d < r && d < bd) { bd = d; best = st; }
    }
  }
  return best;
}

/* ---------- Traits droits et formes ----------
   Garder le stylet immobile ~½ s en fin de trait : le trait devient droit (aligné à 0°/45°/90° s'il en est proche),
   un rectangle ou une ellipse tracés à main levée deviennent nets. Outil « Règle » : chaque trait est droit d'office,
   et un trait qui part de l'extrémité du précédent s'y raccroche (contours de pièces). */
const HOLD_MS = 480;
const dense = (a, b, n = 24) => Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n, 0.5]);
export function snapAngle(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
  if (len < 1e-6) return b;
  const ang = Math.atan2(dy, dx), step = Math.PI / 4, near = Math.round(ang / step) * step;
  if (Math.abs(ang - near) < (6 * Math.PI) / 180) return [a[0] + Math.cos(near) * len, a[1] + Math.sin(near) * len, b[2]];
  return b;
}
export function recognize(pts) {
  if (pts.length < 3) return null;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const diag = Math.hypot(x1 - x0, y1 - y0) || 1;
  const a = pts[0], b = pts[pts.length - 1];
  const closed = Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.22 * diag && pts.length > 12;
  if (closed && (x1 - x0) > 0.08 * diag && (y1 - y0) > 0.08 * diag) {
    const edge = pts.reduce((m, p) => m + Math.min(Math.abs(p[0] - x0), Math.abs(p[0] - x1), Math.abs(p[1] - y0), Math.abs(p[1] - y1)), 0) / pts.length / diag;
    if (edge < 0.035) {
      const c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
      let out = []; for (let i = 0; i < 4; i++) out = out.concat(dense(c[i], c[i + 1], 12).slice(i ? 1 : 0));
      return { type: 'rect', pts: out };
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
    const rs = pts.map((p) => Math.hypot((p[0] - cx) / rx, (p[1] - cy) / ry));
    const mean = rs.reduce((m, r) => m + r, 0) / rs.length;
    const sd = Math.sqrt(rs.reduce((m, r) => m + (r - mean) ** 2, 0) / rs.length);
    if (sd < 0.14) return { type: 'ellipse', pts: Array.from({ length: 73 }, (_, i) => { const t = (i / 72) * Math.PI * 2; return [cx + rx * Math.cos(t), cy + ry * Math.sin(t), 0.5]; }) };
  }
  return { type: 'line', pts: dense(a, snapAngle(a, b)) };
}
// tol() : distance (en unités du dessin) en dessous de laquelle le stylet est considéré immobile
export function shaper(redraw, tol) {
  let timer = null, last = null, mode = null, anchor = null;
  const fire = (s) => {
    const r = recognize(s.pts);
    if (!r) return;
    s.pts = r.pts; s.pressure = true; s.shape = r.type;
    mode = r.type === 'line' ? 'line' : 'shape'; anchor = r.pts[0];
    redraw(s);
  };
  return {
    // à appeler après chaque point ajouté ; renvoie true si le tracé est piloté par la forme
    move(s, p) {
      if (mode === 'line') { s.pts = dense(anchor, snapAngle(anchor, p)); redraw(s); return true; }
      if (mode === 'shape') return true;
      if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > tol()) { last = p; clearTimeout(timer); timer = setTimeout(() => fire(s), HOLD_MS); }
      return false;
    },
    // outil Règle : trait droit dès le départ
    ruler(s, start) { mode = 'line'; anchor = start; s.pressure = true; s.shape = 'line'; s.pts = dense(start, start, 1); },
    end() { clearTimeout(timer); timer = null; },
    get active() { return mode; }
  };
}
// Raccroche le départ d'un trait « Règle » à l'extrémité d'un trait droit existant
export function nearEnd(strokes, p, dist) {
  let best = null, bd = dist;
  for (const s of strokes) {
    if (s.shape !== 'line' || !s.pts || !s.pts.length) continue;
    for (const q of [s.pts[0], s.pts[s.pts.length - 1]]) { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = [q[0], q[1], 0.5]; } }
  }
  return best;
}
