// Photos : prise de vue, réduction, annotation au stylet
import { h, put, icon, uid, downscaleImage, pickFiles, blobURL, toast, confirmBox } from '../lib.js';
import { db } from '../db.js';
import { sketchSurface, renderStrokes, penPicker } from '../ink.js';

export async function addPhotos(projectId, { camera = false } = {}) {
  const files = await pickFiles({ accept: 'image/*', multiple: !camera, capture: camera ? 'environment' : undefined });
  const out = [];
  for (const f of files) {
    const { blob, w, hgt } = await downscaleImage(f, 2200, 0.85).then((r) => ({ blob: r.blob, w: r.w, hgt: r.h }));
    const m = { id: uid(), projectId, kind: 'photo', name: f.name, blob, w, h: hgt, strokes: [], createdAt: new Date().toISOString() };
    await db.put('media', m);
    out.push(m);
  }
  return out;
}

// Vignette : image + annotations superposées
export function photoThumb(m, { onClick, label } = {}) {
  const aspect = m.w && m.h ? m.h / m.w : 0.75;
  const svg = h('svg', { viewBox: `0 0 1000 ${1000 * aspect}`, preserveAspectRatio: 'xMidYMid slice', style: { position: 'absolute', inset: 0, width: '100%', height: '100%' }, 'aria-hidden': 'true' });
  renderStrokes(svg, m.strokes || []);
  return h('button', { class: 'photo', type: 'button', 'aria-label': label || 'Ouvrir la photo', onclick: onClick },
    h('img', { src: blobURL(m.id, m.blob), alt: '' }), svg);
}

// Éditeur plein écran : annoter une photo au stylet
export function openPhotoEditor(m, { onSave, onDelete } = {}) {
  let pen = 'feutre';
  const aspect = m.w && m.h ? m.h / m.w : 0.75;
  const box = h('div', { class: 'ped-box' }, h('img', { src: blobURL(m.id, m.blob), alt: 'Photo à annoter' }));
  const stage = h('div', { class: 'ped-stage' }, box);
  const tools = [['stylo', 'Stylo'], ['feutre', 'Feutre'], ['surligneur', 'Surligneur'], ['gomme', 'Gomme']];
  const picker = penPicker({});
  picker.setMode(pen);
  const toolBtns = tools.map(([id, label]) => h('button', { class: 'tool', 'aria-pressed': String(id === pen), onclick: (e) => { pen = id; picker.setMode(id); toolBtns.forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } }, label));
  const root = h('div', { class: 'full', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Annoter la photo' },
    h('div', { class: 'v-top dark' },
      h('button', { class: 'tool', onclick: () => close(false), 'aria-label': 'Fermer sans enregistrer' }, icon('close', 18)),
      h('div', { class: 'v-title' }, h('b', null, 'Annoter la photo'), h('span', null, 'Dessinez au stylet ou au doigt')),
      h('div', { class: 'toolbar' }, toolBtns, h('button', { class: 'tool', onclick: () => surf.undo(), 'aria-label': 'Annuler le dernier trait' }, icon('undo', 18)),
        onDelete ? h('button', { class: 'tool', onclick: async () => { if (await confirmBox('Supprimer cette photo ?', 'Supprimer')) { await db.del('media', m.id); root.remove(); onDelete(); } }, 'aria-label': 'Supprimer la photo' }, icon('trash', 18)) : null,
        h('button', { class: 'tool', 'aria-pressed': 'true', onclick: () => close(true) }, 'Enregistrer')),
      picker.el),
    stage);
  document.body.appendChild(root);
  const fit = () => {
    const r = stage.getBoundingClientRect();
    const W = Math.min(r.width - 24, (r.height - 24) / aspect);
    box.style.width = W + 'px'; box.style.height = W * aspect + 'px';
  };
  fit(); window.addEventListener('resize', fit);
  const surf = sketchSurface(box, { strokes: m.strokes || [], aspect, getPen: () => pen });
  async function close(save) {
    window.removeEventListener('resize', fit);
    if (save) { m.strokes = surf.strokes; await db.put('media', m); toast('Photo enregistrée'); onSave && onSave(m); }
    root.remove();
  }
}
