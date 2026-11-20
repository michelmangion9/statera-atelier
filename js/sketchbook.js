// Carnet de croquis d'une note : plusieurs croquis, fond (feuille, photo ou plan du projet), calques.
import { h, put, clear, icon, uid, sheet, toast, confirmBox, promptBox, blobURL } from './lib.js';
import { db } from './db.js';
import { sketchSurface, penPicker, penPrefs, savePenPrefs } from './ink.js';
import { addPhotos } from './views/photo.js';

const L1 = () => ({ id: uid(), name: 'Calque 1', visible: true });

// Ancien format (n.sketch) → n.sketches
export function sketchesOf(n) {
  if (!Array.isArray(n.sketches)) {
    const l = L1();
    n.sketches = [{ id: uid(), titre: 'Croquis 1', aspect: n.sketchAspect || 0.62, bg: null, layers: [l], active: l.id, strokes: (n.sketch || []).map((s) => ({ ...s, layer: l.id })) }];
  }
  n.sketches.forEach((k) => { if (!k.layers || !k.layers.length) { const l = L1(); k.layers = [l]; k.active = l.id; } });
  return n.sketches;
}
export const visibleStrokes = (k) => { const hid = new Set(k.layers.filter((l) => l.visible === false).map((l) => l.id)); return (k.strokes || []).filter((s) => !hid.has(s.layer)); };
export const hasContent = (k) => (k.strokes && k.strokes.length) || k.bg;

export function sketchBook({ p, n, save }) {
  const list = sketchesOf(n);
  let cur = list[0];
  let pen = 'stylo';
  let surf = null;
  // Les traits de l'ancien champ restent synchronisés avec le premier croquis (vignettes, anciens exports)
  const persist = () => { const f = list[0]; n.sketch = visibleStrokes(f); n.sketchAspect = f.aspect; save(); };

  const bgCls = () => (penPrefs.bg === 'points' && !cur.bg ? 'sketch-dots' : '');
  const sk = h('div', { class: 'sketch-wrap' });
  const picker = penPicker({ light: true, withFinger: true, onFinger: (on) => document.querySelectorAll('.sketch-wrap').forEach((w) => w.classList.toggle('finger', on)) });
  const PEN_TOOLS = [['stylo', 'Stylo'], ['feutre', 'Feutre'], ['surligneur', 'Surligneur'], ['regle', 'Règle'], ['gomme', 'Gomme']];
  const makePenBtns = (pk) => { const bs = PEN_TOOLS.map(([id, label]) =>
    h('button', { class: 'tool', 'aria-pressed': String(pen === id), title: id === 'regle' ? 'Traits droits ; un trait qui part d’une extrémité s’y raccroche' : null, onclick: (e) => { pen = id; pk.setMode(id === 'regle' ? 'stylo' : id); bs.forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } }, label)); return bs; };

  const tabs = h('div', { class: 'sk-tabs', role: 'tablist' });
  const layerBtn = h('button', { class: 'tool', onclick: () => openLayers() });
  const bgBtn = h('button', { class: 'tool', onclick: () => openBg() });
  const opacity = h('input', { type: 'range', min: '15', max: '100', step: '5', 'aria-label': 'Intensité du fond', oninput: () => { if (cur.bg) { cur.bg.opacity = +opacity.value / 100; paintBg(sk); persist(); } } });
  const opWrap = h('label', { class: 'sk-op small muted' }, 'Fond', opacity);

  function surfOpts() {
    return { strokes: cur.strokes || [], aspect: cur.aspect || 0.62, getPen: () => pen, finger: () => !!penPrefs.finger,
      visible: (s) => { const l = cur.layers.find((x) => x.id === s.layer); return !l || l.visible !== false; },
      layer: () => cur.active,
      onChange: (s) => { cur.strokes = s.slice(); persist(); } };
  }
  function paintBg(box) {
    let img = box.querySelector('img.sk-bg');
    if (!cur.bg) { if (img) img.remove(); return; }
    if (!img) { img = h('img', { class: 'sk-bg', alt: '' }); box.prepend(img); }
    db.get('media', cur.bg.mediaId).then((m) => { if (m && m.blob) img.src = blobURL(m.id, m.blob); });
    img.style.opacity = String(cur.bg.opacity ?? 0.6);
  }
  function mount(box, opts = {}) {
    clear(box);
    box.className = 'sketch-wrap ' + bgCls() + (penPrefs.finger ? ' finger' : '');
    if (!opts.free) box.style.aspectRatio = String(1 / (cur.aspect || 0.62));
    paintBg(box);
    return sketchSurface(box, surfOpts());
  }
  function drawTabs() {
    clear(tabs);
    list.forEach((k, i) => tabs.appendChild(h('button', { class: 'sk-tab', role: 'tab', 'aria-selected': String(k === cur),
      onclick: () => { if (k === cur) return renameCur(); cur = k; refresh(); } }, k.titre || 'Croquis ' + (i + 1), k.bg ? h('span', { class: 'sk-tag' }, k.bg.kind === 'plan' ? 'plan' : 'photo') : null)));
    tabs.appendChild(h('button', { class: 'sk-tab sk-add', onclick: addSketch, 'aria-label': 'Nouveau croquis' }, icon('plus', 16), 'Croquis'));
  }
  function refresh() {
    drawTabs();
    const l = cur.layers.find((x) => x.id === cur.active) || cur.layers[0];
    put(clear(layerBtn), 'Calque : ' + l.name + (cur.layers.length > 1 ? ' (' + cur.layers.length + ')' : ''));
    put(clear(bgBtn), 'Fond : ' + (cur.bg ? (cur.bg.kind === 'plan' ? 'plan' : 'photo') : (penPrefs.bg === 'points' ? 'points' : 'uni')));
    opWrap.style.display = cur.bg ? '' : 'none';
    if (cur.bg) opacity.value = String(Math.round((cur.bg.opacity ?? 0.6) * 100));
    surf = mount(sk);
  }
  async function renameCur() {
    const v = await promptBox('Nom du croquis', cur.titre || ''); if (v && v.trim()) { cur.titre = v.trim(); persist(); drawTabs(); }
  }
  async function addSketch() {
    const l = L1();
    cur = { id: uid(), titre: 'Croquis ' + (list.length + 1), aspect: 0.62, bg: null, layers: [l], active: l.id, strokes: [] };
    list.push(cur); persist(); refresh();
    openBg(true);
  }
  async function delSketch() {
    if (!(await confirmBox('Supprimer « ' + cur.titre + ' » ?', 'Supprimer'))) return;
    const i = list.indexOf(cur); list.splice(i, 1);
    if (!list.length) { const l = L1(); list.push({ id: uid(), titre: 'Croquis 1', aspect: 0.62, bg: null, layers: [l], active: l.id, strokes: [] }); }
    cur = list[Math.max(0, i - 1)]; persist(); refresh();
  }

  /* ---------- Fond ---------- */
  async function setBg(blob, w, hh, kind, label) {
    const m = { id: uid(), projectId: p.id, kind: 'fond', name: label, blob, w, h: hh, strokes: [], createdAt: new Date().toISOString() };
    await db.put('media', m);
    cur.bg = { mediaId: m.id, kind, label, opacity: kind === 'plan' ? 0.55 : 0.75 };
    if (w && hh) cur.aspect = hh / w;
    if (cur.layers.length === 1 && !(cur.strokes || []).length) cur.layers[0].name = 'Croquis';
    persist(); refresh();
  }
  function openBg(fresh) {
    let s;
    const go = (fn) => async () => { s.close(); try { await fn(); } catch (e) { toast('Fond impossible : ' + (e.message || e)); } };
    const photo = (camera) => go(async () => {
      const [m] = await addPhotos(p.id, { camera });
      if (!m) return;
      cur.bg = { mediaId: m.id, kind: 'photo', label: m.name || 'Photo', opacity: 0.75 };
      if (m.w && m.h) cur.aspect = m.h / m.w;
      persist(); refresh();
    });
    s = sheet({ title: fresh ? 'Nouveau croquis : sur quoi dessiner ?' : 'Fond du croquis', body: [
      h('div', { class: 'list' },
        h('button', { class: 'row row-btn', onclick: go(() => { cur.bg = null; cur.aspect = cur.aspect || 0.62; penPrefs.bg = 'uni'; savePenPrefs(); persist(); refresh(); }) }, h('span', { class: 'row-main' }, h('span', { class: 'row-t' }, 'Feuille blanche'), h('span', { class: 'row-s' }, 'Croquis libre'))),
        h('button', { class: 'row row-btn', onclick: go(() => { cur.bg = null; penPrefs.bg = 'points'; savePenPrefs(); persist(); refresh(); }) }, h('span', { class: 'row-main' }, h('span', { class: 'row-t' }, 'Feuille à points'), h('span', { class: 'row-s' }, 'Repères discrets pour les proportions'))),
        h('button', { class: 'row row-btn', onclick: photo(true) }, icon('camera', 20), h('span', { class: 'row-main' }, h('span', { class: 'row-t' }, 'Prendre une photo'), h('span', { class: 'row-s' }, 'Dessiner sur le site, la façade, l’existant'))),
        h('button', { class: 'row row-btn', onclick: photo(false) }, icon('camera', 20), h('span', { class: 'row-main' }, h('span', { class: 'row-t' }, 'Choisir une photo'), h('span', { class: 'row-s' }, 'Depuis la photothèque ou les fichiers'))),
        h('button', { class: 'row row-btn', onclick: go(pickPlan) }, icon('fit', 20), h('span', { class: 'row-main' }, h('span', { class: 'row-t' }, 'Un plan du projet'), h('span', { class: 'row-s' }, 'Esquisser par-dessus un plan, une coupe, une façade')))),
      h('div', { class: 'small muted' }, 'Le fond reste intact : tes traits sont sur des calques au-dessus, et l’intensité du fond se règle.')] });
  }
  async function pickPlan() {
    const plans = (await db.by('plans', 'projectId', p.id)).filter((x) => x.blob || x.blobOf);
    if (!plans.length) { toast('Aucun plan importé dans ce projet (onglet Plans)'); return; }
    const { renderPlan, pageCount } = await import('./pdfkit.js');
    const box = h('div', { class: 'list' });
    const s = sheet({ title: 'Plan en fond', body: [box] });
    for (const pl of plans) {
      let np = 1; try { np = pl.srcPages && pl.srcPages.length ? pl.srcPages.length : await pageCount(pl); } catch (e) { /* plan illisible */ }
      for (let i = 0; i < np; i++) {
        box.appendChild(h('button', { class: 'row row-btn', onclick: async () => {
          s.close(); toast('Préparation du plan…');
          const { canvas } = await renderPlan(pl, i, 2400);
          const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
          await setBg(blob, canvas.width, canvas.height, 'plan', (pl.nom || pl.name || 'Plan') + (np > 1 ? ' · p.' + (i + 1) : ''));
        } }, h('span', { class: 'row-main' }, h('span', { class: 'row-t' }, (pl.nom || pl.name || 'Plan') + (np > 1 ? ' · page ' + (i + 1) : '')), h('span', { class: 'row-s' }, pl.indice ? 'Indice ' + pl.indice : ''))));
      }
    }
  }

  /* ---------- Calques ---------- */
  function openLayers() {
    const box = h('div', { class: 'list' });
    const draw = () => {
      clear(box);
      cur.layers.forEach((l) => {
        const nb = (cur.strokes || []).filter((x) => x.layer === l.id).length;
        box.appendChild(h('div', { class: 'row' },
          h('button', { class: 'btn btn-sm ' + (l.visible === false ? 'btn-line' : 'btn-primary'), onclick: () => { l.visible = l.visible === false; if (l.visible === false && cur.active === l.id) { const o = cur.layers.find((x) => x.visible !== false); if (o) cur.active = o.id; } persist(); surf.refresh(); draw(); refresh(); } }, l.visible === false ? 'Masqué' : 'Visible'),
          h('span', { class: 'row-main' }, h('span', { class: 'row-t' }, l.name), h('span', { class: 'row-s' }, nb + ' trait(s)')),
          h('button', { class: 'btn btn-sm ' + (cur.active === l.id ? 'btn-primary' : 'btn-line'), onclick: () => { cur.active = l.id; l.visible = true; persist(); draw(); refresh(); } }, cur.active === l.id ? 'Actif' : 'Dessiner ici'),
          h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { const v = await promptBox('Nom du calque', l.name); if (v && v.trim()) { l.name = v.trim(); persist(); draw(); refresh(); } } }, 'Renommer'),
          cur.layers.length > 1 ? h('button', { class: 'btn btn-icon btn-sm btn-ghost', 'aria-label': 'Supprimer le calque', onclick: async () => {
            if (nb && !(await confirmBox('Supprimer le calque « ' + l.name + ' » et ses ' + nb + ' trait(s) ?', 'Supprimer'))) return;
            cur.layers = cur.layers.filter((x) => x !== l); cur.strokes = (cur.strokes || []).filter((x) => x.layer !== l.id);
            if (cur.active === l.id) cur.active = cur.layers[0].id; persist(); draw(); refresh(); } }, icon('close', 16)) : null));
      });
    };
    draw();
    sheet({ title: 'Calques · ' + cur.titre, body: [box,
      h('div', { class: 'actions' },
        h('button', { class: 'btn btn-line', onclick: async () => { const v = await promptBox('Nom du nouveau calque', ['Existant', 'Projet', 'Variante', 'Mobilier', 'Cotes'][cur.layers.length - 1] || 'Calque ' + (cur.layers.length + 1)); if (!v || !v.trim()) return; const l = { id: uid(), name: v.trim(), visible: true }; cur.layers.push(l); cur.active = l.id; persist(); draw(); refresh(); } }, icon('plus', 16), 'Nouveau calque'),
        h('button', { class: 'btn btn-line', onclick: delSketch }, icon('trash', 16), 'Supprimer ce croquis')),
      h('div', { class: 'small muted' }, 'Les nouveaux traits vont sur le calque actif. Exemple : « Existant » en gris, « Projet » en rouge, « Variante B » à montrer ou masquer devant le client. Seuls les calques visibles partent dans le compte rendu.')] });
  }

  /* ---------- Plein écran ---------- */
  function openFull() {
    const pk = penPicker({ light: true, withFinger: true, onFinger: (on) => box.classList.toggle('finger', on) });
    pk.setMode(pen === 'regle' ? 'stylo' : pen);
    const box = h('div', { class: 'sketch-wrap' });
    const bs = makePenBtns(pk);
    let fs;
    const close = () => { full.remove(); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', fit); refresh(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const full = h('div', { class: 'full sk-full', role: 'dialog', 'aria-label': 'Croquis plein écran' },
      h('div', { class: 'sk-full-bar' },
        h('div', { class: 'toolbar' }, bs, h('button', { class: 'tool', 'aria-label': 'Annuler le dernier trait', onclick: () => fs.undo() }, icon('undo', 18)),
          h('button', { class: 'tool', onclick: () => { openLayers(); } }, 'Calques')),
        h('button', { class: 'btn btn-primary', onclick: close }, icon('check', 18), 'Terminer')),
      pk.el,
      h('div', { class: 'sk-full-stage' }, box),
      h('div', { class: 'small muted sk-full-hint' }, cur.titre + ' · garde le stylet immobile une demi-seconde en fin de trait : il devient droit (ou rectangle, cercle).'));
    document.body.appendChild(full);
    const fit = () => {
      const st = full.querySelector('.sk-full-stage').getBoundingClientRect(); const asp = cur.aspect || 0.62;
      const w = Math.min(st.width, st.height / asp);
      box.style.width = w + 'px'; box.style.height = w * asp + 'px';
    };
    requestAnimationFrame(() => { fit(); fs = mount(box, { free: true }); surf = fs; });
    window.addEventListener('resize', fit);
    document.addEventListener('keydown', onKey);
  }

  const el = h('section', { class: 'card stack' },
    h('div', { class: 'flexb' }, h('h2', { class: 'section-t', style: { margin: 0 } }, 'Croquis'),
      h('div', { class: 'toolbar' }, makePenBtns(picker), h('button', { class: 'tool', 'aria-label': 'Annuler le dernier trait', onclick: () => surf.undo() }, icon('undo', 18)),
        h('button', { class: 'tool', onclick: async () => { if (await confirmBox('Effacer les traits visibles de « ' + cur.titre + ' » ? Le fond est conservé.', 'Effacer')) surf.clear(); } }, 'Effacer'),
        h('button', { class: 'tool tool-strong', onclick: openFull }, icon('fit', 18), 'Agrandir'))),
    tabs,
    h('div', { class: 'flexb' }, picker.el, h('div', { class: 'toolbar' }, bgBtn, layerBtn, opWrap)),
    sk,
    h('div', { class: 'small muted' }, 'Touche l’onglet du croquis ouvert pour le renommer. Garde le stylet immobile une demi-seconde en fin de trait pour le rendre droit. Apple Pencil : paume ignorée ; au doigt, active « Doigt ».'));
  requestAnimationFrame(refresh);
  return el;
}

// Image composite (fond + calques visibles) pour le PDF
export async function sketchImage(k, width = 1600) {
  const { drawStrokes } = await import('./ink.js');
  const asp = k.aspect || 0.62;
  const c = document.createElement('canvas'); c.width = width; c.height = Math.round(width * asp);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  if (k.bg) {
    const m = await db.get('media', k.bg.mediaId);
    if (m && m.blob) { try { const bmp = await createImageBitmap(m.blob); ctx.globalAlpha = k.bg.opacity ?? 0.6; ctx.drawImage(bmp, 0, 0, c.width, c.height); ctx.globalAlpha = 1; } catch (e) { /* image illisible */ } }
  }
  drawStrokes(ctx, visibleStrokes(k), width / 1000);
  return c.toDataURL('image/jpeg', 0.88);
}
