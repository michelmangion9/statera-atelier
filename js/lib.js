// Petits outils DOM et utilitaires — aucune dépendance

const SVG_TAGS = new Set(['svg', 'path', 'g', 'circle', 'rect', 'line', 'ellipse', 'polyline', 'polygon', 'image', 'text']);
export function h(tag, attrs, ...kids) {
  const el = SVG_TAGS.has(tag) ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.setAttribute('class', v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value' && 'value' in el) el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (k === 'html') el.innerHTML = v; // réservé aux icônes internes
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else if (k instanceof Node) el.appendChild(k);
    else el.appendChild(document.createTextNode(String(k)));
  }
}
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export function put(el, ...kids) { append(el, kids); return el; }
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

export const uid = () => (Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
export const debounce = (fn, ms = 400) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Icônes (traits fins, 24 px)
const ICONS = {
  projets: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  entreprises: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5M16 5a3 3 0 0 1 0 6M18 15c2 .6 3 2.3 3 5"/>',
  reglages: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  pen: '<path d="M4 20l4-1 11-11-3-3L5 16z"/>',
  marker: '<path d="M14 4l6 6-8 8H6v-6z"/><path d="M4 21h7"/>',
  highlight: '<path d="M9 15l-3 3v2h4l3-3"/><path d="M9 15l7-11 4 3-7 11z"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  pin: '<path d="M12 21s-6-6.2-6-11a6 6 0 0 1 12 0c0 4.8-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>',
  eraser: '<path d="M8 20h12M5 15l8-8 6 6-5 5H9z"/>',
  hand: '<path d="M8 13V5a1.5 1.5 0 0 1 3 0v6M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V6a1.5 1.5 0 0 1 3 0v8c0 4-2.5 7-6 7-2.5 0-4-1.2-5.5-3.5L3.7 14a1.5 1.5 0 0 1 2.5-1.6L8 15"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  share: '<path d="M12 3v13M7 8l5-5 5 5M5 14v6h14v-6"/>',
  download: '<path d="M12 3v13M7 11l5 5 5-5M5 20h14"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  folder: '<path d="M3 7h7l2 2h9v10H3z"/>',
  file: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/>',
  note: '<path d="M4 4h12l4 4v12H4z"/><path d="M8 11h8M8 15h6"/>',
  plan: '<path d="M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2z"/><path d="M9 3v16M15 5v16"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  crane: '<path d="M5 21V4h13M5 8h15M15 4v4M19 8v5M3 21h8"/>',
  info: '<rect x="4" y="3" width="16" height="18"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  zoom: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/>',
  mail: '<rect x="3" y="5" width="18" height="14"/><path d="M3 6l9 7 9-7"/>',
  phone: '<path d="M5 3h4l2 5-3 2a12 12 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A18 18 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16"/><path d="M3 10h18M8 3v4M16 3v4"/>'
};
export function icon(name, size = 20) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('width', size); s.setAttribute('height', size); s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.5');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name] || '';
  return s;
}

// Dates
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
export const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
export const nowTime = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
export function fmtDate(iso, withDay = false) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y) return iso;
  const dt = new Date(y, m - 1, d);
  return (withDay ? JOURS[dt.getDay()] + ' ' : '') + d + ' ' + MOIS[m - 1] + ' ' + y;
}
export const fmtShort = (iso) => { if (!iso) return ''; const [y, m, d] = iso.slice(0, 10).split('-'); return d + '/' + m + '/' + y.slice(2); };
export const yymmdd = (iso) => { const s = (iso || todayISO()).slice(0, 10).split('-'); return s[0].slice(2) + s[1] + s[2]; };
export function daysUntil(iso) { if (!iso) return null; const t = new Date(iso + 'T00:00:00'); const n = new Date(); n.setHours(0, 0, 0, 0); return Math.round((t - n) / 86400000); }
export const fmtSize = (b) => b < 1024 ? b + ' o' : b < 1048576 ? (b / 1024).toFixed(0) + ' Ko' : (b / 1048576).toFixed(1).replace('.', ',') + ' Mo';
export const fmtEuro = (n) => (n == null || n === '' || isNaN(n)) ? '' : Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €';
export function slug(s) { return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

// Toast
export function toast(msg, ms = 2600) {
  const box = document.getElementById('toast');
  const el = h('div', null, msg);
  box.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// Feuille latérale (iPad) / feuille basse (téléphone)
export function sheet({ title, body, foot, onClose, wide }) {
  const layer = document.getElementById('layer');
  const scrim = h('div', { class: 'scrim' });
  const closeBtn = h('button', { class: 'btn btn-icon btn-ghost', 'aria-label': 'Fermer' }, icon('close'));
  const panel = h('section', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: wide ? { width: 'min(620px, 100%)' } : null },
    h('div', { class: 'sheet-h' }, h('h2', { class: 'title-sm' }, title), closeBtn),
    h('div', { class: 'sheet-b' }, body),
    foot ? h('div', { class: 'sheet-f' }, foot) : null);
  const close = () => { scrim.remove(); panel.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  scrim.addEventListener('click', close); closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  layer.append(scrim, panel);
  setTimeout(() => { const f = panel.querySelector('input, textarea, select'); if (f && window.matchMedia('(min-width: 900px)').matches) f.focus(); }, 60);
  return { close, panel };
}

export function confirmBox(message, okLabel = 'Confirmer') {
  return new Promise((res) => {
    const layer = document.getElementById('layer');
    const scrim = h('div', { class: 'scrim' });
    const done = (v) => { scrim.remove(); box.remove(); res(v); };
    const box = h('div', { class: 'modal', role: 'alertdialog', 'aria-modal': 'true' },
      h('div', { class: 'sheet-b' }, h('p', { style: { margin: 0, fontSize: '16px', lineHeight: 1.5 } }, message)),
      h('div', { class: 'sheet-f' },
        h('button', { class: 'btn btn-line', onclick: () => done(false) }, 'Annuler'),
        h('button', { class: 'btn btn-primary', onclick: () => done(true) }, okLabel)));
    scrim.addEventListener('click', () => done(false));
    layer.append(scrim, box);
  });
}

export function promptBox(title, value = '', { multiline = false, label = '' } = {}) {
  return new Promise((res) => {
    const inp = multiline ? h('textarea', { class: 'textarea', 'aria-label': label || title }, value) : h('input', { class: 'input', value, 'aria-label': label || title });
    let result = null;
    const s = sheet({
      title,
      body: [label ? h('label', { class: 'field' }, h('span', null, label), inp) : inp],
      foot: [h('button', { class: 'btn btn-line', onclick: () => s.close() }, 'Annuler'),
        h('button', { class: 'btn btn-primary', onclick: () => { result = inp.value; s.close(); } }, 'Valider')],
      onClose: () => res(result)
    });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !multiline) { result = inp.value; s.close(); } });
    setTimeout(() => inp.focus(), 80);
  });
}

// Fichiers
export function pickFiles({ accept = '*/*', multiple = false, capture } = {}) {
  return new Promise((res) => {
    const inp = h('input', { type: 'file', accept, multiple: multiple || null, capture: capture || null, style: { position: 'fixed', left: '-9999px' } });
    inp.addEventListener('change', () => { res(Array.from(inp.files || [])); inp.remove(); });
    document.body.appendChild(inp);
    inp.click();
  });
}
export function downloadBlob(blob, name) {
  if (framed) {
    if (blob.type === 'application/pdf') { import('./pdfkit.js').then((m) => m.showPdf(blob, name)); return; }
    toast('Téléchargement indisponible dans l\u2019aperçu : utilisez la version installée.'); return;
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const framed = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
export async function shareOrDownload(blob, name, text) {
  if (framed && (blob.type === 'application/pdf' || /\.pdf$/i.test(name))) {
    // Aperçu intégré (fenêtre sans téléchargement ni partage) : affichage du PDF dans l'application
    const { showPdf } = await import('./pdfkit.js');
    showPdf(blob, name); return 'previewed';
  }
  const file = new File([blob], name, { type: blob.type || 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name, text: text || '' }); return 'shared'; }
    catch (e) { if (e && e.name === 'AbortError') return 'aborted'; }
  }
  downloadBlob(blob, name);
  return 'downloaded';
}
const urlCache = new Map();
export function blobURL(id, blob) {
  if (!blob) return '';
  const k = id + ':' + blob.size;
  if (!urlCache.has(k)) urlCache.set(k, URL.createObjectURL(blob));
  return urlCache.get(k);
}
export function blobToDataURL(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); }); }
export async function dataURLToBlob(d) { const r = await fetch(d); return r.blob(); }

// Réduit une photo (appareil iPad : 12 Mpx) à une taille raisonnable
export async function downscaleImage(file, max = 2000, quality = 0.85) {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
    return { blob, w: c.width, h: c.height };
  } catch (e) {
    return { blob: file, w: 0, h: 0 };
  }
}

export function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector('script[data-src="' + src + '"]')) return res();
    const s = h('script', { src, 'data-src': src });
    s.onload = res; s.onerror = () => rej(new Error('Chargement impossible : ' + src));
    document.head.appendChild(s);
  });
}
