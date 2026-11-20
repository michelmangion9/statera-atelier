// Visionneuse de plan : PDF ou image, zoom au doigt, annotations au stylet, textes,
// points numérotés rattachés à un lot et à l'entreprise du chantier, photos annotées.
import { h, put, clear, icon, uid, debounce, toast, clamp, fmtShort, todayISO, confirmBox, promptBox, shareOrDownload, sheet } from '../lib.js';
import { db } from '../db.js';
import { LOTS, lot as lotOf, POINT_STATUS, POINT_NATURE, phase, fileName, fileCode, destFor } from '../data.js';
import { renderPlan, renderPdfRegion } from '../pdfkit.js';
import { strokeEl, strokePath, renderStrokes, penPicker, strokeStyle, shaper, nearEnd, hitStroke } from '../ink.js';
import { addPhotos, photoThumb, openPhotoEditor } from './photo.js';
import { loadProject } from './project.js';

const W = 1000; // largeur de la feuille en unités (= px CSS à l'échelle 1)

export async function renderViewer(view, params) {
  const p = await loadProject(params.projectId);
  const plan = await db.get('plans', params.planId);
  if (!plan) { location.replace('#/p/' + p.id + '/plans'); return; }
  const entreprises = await db.all('entreprises');
  let points = (await db.by('points', 'projectId', p.id));
  const pagesMap = {};
  (await db.by('pages', 'planId', plan.id)).forEach((pg) => (pagesMap[pg.key] = pg));

  const nPages = plan.pages || 1;
  let pageIndex = 0;
  if (params.q.pt) { const pt = points.find((x) => x.id === params.q.pt); if (pt) pageIndex = pt.page || 0; }
  if (params.q.page) pageIndex = clamp(Number(params.q.page) || 0, 0, nPages - 1);

  let mode = 'nav';           // nav | stylo | feutre | surligneur | texte | point | gomme
  let s = 1, tx = 0, ty = 0;  // transformation de la feuille
  let H = 707;                // hauteur de la feuille en unités
  let selId = params.q.pt || null;
  let lotFilter = 'tous', showLeves = true, showInk = true;
  let penSeen = false;
  let renderedW = 0, renderToken = 0;
  const undo = [];

  const pageKey = () => plan.id + ':' + pageIndex;
  // Visite en cours (ouverte depuis une réunion / OPR / réception) : ses annotations vont sur son propre calque
  const visit = params.q.v ? await db.get('reunions', params.q.v) : null;
  const pageData = () => {
    const pd = (pagesMap[pageKey()] = pagesMap[pageKey()] || { key: pageKey(), planId: plan.id, page: pageIndex, strokes: [], texts: [] });
    if (!pd.layers || !pd.layers.length) pd.layers = [{ id: 'base', name: 'Calque 1', visible: true }];
    if (visit && !pd.layers.some((l) => l.visiteId === visit.id)) pd.layers.push({ id: 'v-' + visit.id, name: 'Visite n°' + visit.num + ' · ' + fmtShort(visit.date), visible: true, visiteId: visit.id, visiteNum: visit.num });
    if (!pd.active || !pd.layers.some((l) => l.id === pd.active)) pd.active = visit ? 'v-' + visit.id : pd.layers[pd.layers.length - 1].id;
    return pd;
  };
  const layerOf = (o) => o.layer || 'base';
  const isVisible = (o) => { const l = pageData().layers.find((x) => x.id === layerOf(o)); return !l || l.visible !== false; };
  const savePage = debounce(() => db.put('pages', pageData()), 400);

  /* ---------- DOM ---------- */
  const canvasHolder = h('div', { style: { position: 'absolute', inset: 0 } });
  const detailBox = h('div', { style: { position: 'absolute', inset: 0, pointerEvents: 'none' } });
  const sheetEl = h('div', { class: 'v-sheet', style: { width: W + 'px' } }, canvasHolder, detailBox);
  // Couche nette : traits (SVG vectoriel), textes et points sont dessinés à la résolution de l'écran, sans agrandissement flou
  const inkSvg = h('svg', { class: 'ink v-ink', preserveAspectRatio: 'none' });
  const textsBox = h('div', { class: 'v-over' });
  const pinsBox = h('div', { class: 'v-over' });
  const hint = h('div', { class: 'hintbar', hidden: true });
  const stage = h('div', { class: 'v-stage', role: 'application', 'aria-label': 'Plan ' + plan.nom }, sheetEl, inkSvg, textsBox, pinsBox, hint);
  const titleSub = h('span');
  const panel = h('aside', { class: 'v-panel', 'aria-label': 'Point sélectionné', hidden: true });

  const TOOLS = [
    ['nav', 'Naviguer', 'hand'], ['point', 'Point', 'pin'], ['stylo', 'Stylo', 'pen'], ['feutre', 'Feutre', 'marker'],
    ['surligneur', 'Surligneur', 'highlight'], ['regle', 'Règle', 'fit'], ['texte', 'Texte', 'text'], ['gomme', 'Gomme', 'eraser']
  ];
  const toolBtns = TOOLS.map(([id, label, ic]) => h('button', { class: 'tool', 'aria-pressed': String(mode === id), 'data-mode': id, title: label, onclick: () => setMode(id) }, ic ? icon(ic, 18) : null, h('span', { class: ic ? 'tool-l' : '' }, label)));
  const picker = penPicker({});
  picker.el.hidden = true;
  const lotSel = h('select', { class: 'select', 'aria-label': 'Filtrer les points par lot' });
  const layerLbl = h('span', { class: 'tool-l' });
  const layerBtn = h('button', { class: 'tool', title: 'Calques', 'aria-label': 'Calques', onclick: () => openLayers() }, icon('layers', 18), layerLbl);
  const pageLbl = h('span', { class: 'info' });
  const countLbl = h('span', { class: 'info' });

  const root = h('div', { class: 'viewer' },
    h('div', { class: 'v-top dark' },
      h('a', { class: 'tool', href: visit ? '#/p/' + p.id + '/chantier?r=' + visit.id : '#/p/' + p.id + '/plans', 'aria-label': visit ? 'Retour à la visite' : 'Retour aux plans' }, icon('back', 18)),
      h('div', { class: 'v-title' }, h('b', null, plan.nom), titleSub, visit ? h('a', { class: 'v-visit', href: '#/p/' + p.id + '/chantier?r=' + visit.id }, 'Visite n°' + visit.num + ' · ' + fmtShort(visit.date)) : null),
      h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Outils' }, toolBtns,
        h('button', { class: 'tool', title: 'Annuler', 'aria-label': 'Annuler la dernière annotation', onclick: doUndo }, icon('undo', 18)),
        layerBtn,
        h('button', { class: 'tool', onclick: exportPlan, title: 'Exporter le plan annoté', 'aria-label': 'Exporter le plan annoté' }, icon('share', 18))),
      picker.el),
    stage,
    h('div', { class: 'v-bot dark' },
      h('div', { class: 'toolbar' },
        nPages > 1 ? h('button', { class: 'tool', 'aria-label': 'Page précédente', onclick: () => goPage(pageIndex - 1) }, icon('back', 16)) : null,
        pageLbl,
        nPages > 1 ? h('button', { class: 'tool', 'aria-label': 'Page suivante', onclick: () => goPage(pageIndex + 1) }, icon('chev', 16)) : null),
      h('div', { class: 'toolbar' }, lotSel,
        h('button', { class: 'tool', 'aria-pressed': 'true', onclick: (e) => { showLeves = !showLeves; e.currentTarget.setAttribute('aria-pressed', String(showLeves)); drawPins(); } }, 'Levés'),
        countLbl),
      h('div', { class: 'toolbar' },
        h('button', { class: 'tool', 'aria-label': 'Dézoomer', onclick: () => zoomAt(stage.clientWidth / 2, stage.clientHeight / 2, 1 / 1.4) }, '−'),
        h('button', { class: 'tool', 'aria-label': 'Ajuster à l’écran', onclick: fit }, icon('fit', 18)),
        h('button', { class: 'tool', 'aria-label': 'Zoomer', onclick: () => zoomAt(stage.clientWidth / 2, stage.clientHeight / 2, 1.4) }, '+'))),
    panel);
  clear(view).appendChild(root);

  /* ---------- Page ---------- */
  async function loadPage() {
    const token = ++renderToken;
    renderedW = 0;
    clear(canvasHolder);
    titleSub.textContent = [plan.phase, plan.indice ? 'ind. ' + plan.indice : null, plan.echelle, nPages > 1 ? 'page ' + (pageIndex + 1) + ' / ' + nPages : null].filter(Boolean).join(' · ');
    pageLbl.textContent = nPages > 1 ? 'Page ' + (pageIndex + 1) + ' / ' + nPages : (plan.kind === 'pdf' ? 'PDF' : 'Image');
    const first = await renderPlan(plan, pageIndex, 1400);
    if (token !== renderToken) return;
    H = W * first.h / first.w;
    sheetEl.style.height = H + 'px';
    first.canvas.className = 'pdf';
    clear(detailBox);
    canvasHolder.appendChild(first.canvas);
    renderedW = first.canvas.width;
    drawInk(); drawTexts(); drawPins(); fillLotFilter(); updLayerLbl();
    const sel = selId && points.find((x) => x.id === selId);
    if (sel && (sel.page || 0) === pageIndex) { fit(); centerOn(sel); openPanel(sel); } else fit();
  }
  // Netteté : fond de page jusqu'à 4096 px, puis rendu de la seule zone visible à la résolution de l'écran
  let detailJob = null;
  const sharpen = debounce(async () => {
    const dpr = window.devicePixelRatio || 1;
    const token = renderToken;
    const want = clamp(Math.round(W * s * dpr * 1.1 / 200) * 200, 1400, 4096);
    if (want > renderedW * 1.15) {
      const r = await renderPlan(plan, pageIndex, want);
      if (token !== renderToken) return;
      r.canvas.className = 'pdf';
      canvasHolder.replaceChildren(r.canvas);
      renderedW = r.canvas.width;
    }
    if (plan.kind !== 'pdf' || W * s * dpr <= renderedW * 1.05) { clear(detailBox); return; }
    const st = stage.getBoundingClientRect();
    const x0 = clamp(-tx / s, 0, W), y0 = clamp(-ty / s, 0, H);
    const x1 = clamp((st.width - tx) / s, 0, W), y1 = clamp((st.height - ty) / s, 0, H);
    if (x1 - x0 < 1 || y1 - y0 < 1) return;
    const rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    const pxW = Math.min(4096, Math.round(rect.w * s * dpr)), pxH = Math.min(4096, Math.round(rect.h * s * dpr));
    if (detailJob && detailJob.task) { try { detailJob.task.cancel(); } catch (e) { /* rien */ } }
    const job = (detailJob = {});
    try {
      const c = await renderPdfRegion(plan, pageIndex, rect, W, pxW, pxH, job);
      if (job !== detailJob || token !== renderToken) return;
      c.className = 'detail';
      Object.assign(c.style, { left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' });
      detailBox.replaceChildren(c);
    } catch (e) { /* rendu annulé par un nouveau zoom */ }
  }, 260);
  function goPage(i) {
    if (i < 0 || i >= nPages) return;
    pageIndex = i; selId = null; closePanel(); undo.length = 0; loadPage();
  }

  /* ---------- Transformation ---------- */
  function apply() {
    sheetEl.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    const st = stage.getBoundingClientRect();
    inkSvg.setAttribute('viewBox', `${-tx / s} ${-ty / s} ${st.width / s} ${st.height / s}`);
    placeOverlay();
    sharpen();
  }
  function placeOverlay() {
    pinsBox.querySelectorAll('.pin').forEach((el) => { el.style.left = (tx + Number(el.dataset.x) * W * s) + 'px'; el.style.top = (ty + Number(el.dataset.y) * H * s) + 'px'; });
    textsBox.querySelectorAll('.vtext').forEach((el) => { el.style.left = (tx + Number(el.dataset.x) * W * s) + 'px'; el.style.top = (ty + Number(el.dataset.y) * H * s) + 'px'; el.style.fontSize = clamp(15 * Math.sqrt(s / (fitScale || s)), 11, 26) + 'px'; });
  }
  let fitScale = 0;
  function fit() {
    const r = stage.getBoundingClientRect();
    s = Math.min(r.width / W, r.height / H) * 0.94; fitScale = s;
    tx = (r.width - W * s) / 2; ty = (r.height - H * s) / 2;
    apply();
  }
  function zoomAt(cx, cy, k) {
    const ns = clamp(s * k, 0.15, 40);
    k = ns / s;
    tx = cx - (cx - tx) * k; ty = cy - (cy - ty) * k; s = ns;
    apply();
  }
  function centerOn(pt) {
    const r = stage.getBoundingClientRect();
    if (s < 1.2) { s = Math.max(s, Math.min(2.2, s * 2.2)); }
    const panelW = window.innerWidth > 900 ? 0 : 0;
    tx = (r.width - panelW) / 2 - pt.x * W * s;
    ty = r.height / 2 - pt.y * H * s;
    apply();
  }
  const toUnits = (e) => { const r = stage.getBoundingClientRect(); return [(e.clientX - r.left - tx) / s, (e.clientY - r.top - ty) / s, e.pressure || 0.5]; };

  /* ---------- Encre ---------- */
  function drawInk() {
    const pd = pageData();
    const g = renderStrokes(inkSvg, showInk ? pd.strokes.filter(isVisible) : []);
    // calques des visites précédentes : légèrement estompés
    if (visit) g.querySelectorAll('path').forEach((el) => { const st = pd.strokes.find((x) => x.id === el.dataset.id); const l = st && pd.layers.find((x) => x.id === layerOf(st)); if (l && l.visiteNum && l.visiteNum < visit.num) el.setAttribute('fill-opacity', String(Number(el.getAttribute('fill-opacity') || 1) * 0.45)); });
  }
  function drawTexts() {
    clear(textsBox);
    if (showInk) pageData().texts.filter(isVisible).forEach((t) => textsBox.appendChild(h('div', { class: 'vtext', 'data-id': t.id, 'data-x': t.x, 'data-y': t.y }, t.text)));
    placeOverlay();
  }
  function updLayerLbl() { const pd = pageData(); const l = pd.layers.find((x) => x.id === pd.active); layerLbl.textContent = l ? l.name : ''; }
  // Calques : afficher / masquer, renommer, ajouter, choisir le calque actif
  function openLayers() {
    const pd = pageData();
    const box = h('div', { class: 'list' });
    const draw = () => {
      clear(box);
      pd.layers.forEach((l) => {
        const n = pd.strokes.filter((x) => layerOf(x) === l.id).length + pd.texts.filter((x) => layerOf(x) === l.id).length;
        box.appendChild(h('div', { class: 'row' },
          h('button', { class: 'btn btn-sm ' + (l.visible === false ? 'btn-line' : 'btn-primary'), 'aria-label': l.visible === false ? 'Afficher' : 'Masquer', onclick: () => { l.visible = l.visible === false; savePage(); drawInk(); drawTexts(); draw(); } }, l.visible === false ? 'Masqué' : 'Visible'),
          h('span', { class: 'row-main' }, h('span', { class: 'row-t' }, l.name), h('span', { class: 'row-s' }, n + ' annotation(s)' + (l.visiteId ? ' · calque de visite' : ''))),
          h('button', { class: 'btn btn-sm ' + (pd.active === l.id ? 'btn-primary' : 'btn-line'), onclick: () => { pd.active = l.id; l.visible = true; savePage(); updLayerLbl(); drawInk(); drawTexts(); draw(); } }, pd.active === l.id ? 'Actif' : 'Dessiner ici'),
          h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { const v = await promptBox('Nom du calque', l.name); if (v && v.trim()) { l.name = v.trim(); savePage(); updLayerLbl(); draw(); } } }, 'Renommer')));
      });
    };
    draw();
    sheet({ title: 'Calques · page ' + (pageIndex + 1), body: [box,
      h('div', { class: 'actions' },
        h('button', { class: 'btn btn-line', onclick: async () => { const v = await promptBox('Nom du nouveau calque', 'Calque ' + (pd.layers.length + 1)); if (!v || !v.trim()) return; const l = { id: uid(), name: v.trim(), visible: true }; pd.layers.push(l); pd.active = l.id; savePage(); updLayerLbl(); draw(); } }, icon('plus', 16), 'Nouveau calque'),
        h('button', { class: 'btn btn-line', onclick: () => { showInk = !showInk; drawInk(); drawTexts(); toast(showInk ? 'Annotations affichées' : 'Annotations masquées'); } }, 'Tout afficher / masquer')),
      h('div', { class: 'small muted' }, 'Les nouveaux traits vont sur le calque actif. Ouvert depuis une visite, chaque visite a son calque : les visites précédentes restent visibles, estompées, et se masquent ici.')] });
  }

  /* ---------- Points ---------- */
  function fillLotFilter() {
    const used = [...new Set(points.filter((x) => x.planId === plan.id).map((x) => x.lot || '—'))].sort();
    put(clear(lotSel), h('option', { value: 'tous' }, 'Tous les lots'), used.map((l) => h('option', { value: l }, l === '—' ? 'Généralités' : 'Lot ' + l + ' · ' + lotOf(l).code)));
    lotSel.value = used.includes(lotFilter) ? lotFilter : 'tous';
  }
  lotSel.addEventListener('change', () => { lotFilter = lotSel.value; drawPins(); });
  function visiblePoints() {
    return points.filter((x) => x.planId === plan.id && (x.page || 0) === pageIndex && (lotFilter === 'tous' || (x.lot || '—') === lotFilter) && (showLeves || x.status !== 'leve'));
  }
  function drawPins() {
    clear(pinsBox);
    const vis = visiblePoints();
    vis.forEach((pt) => {
      const btn = h('button', { 'aria-label': 'Point ' + pt.num + (pt.lot ? ', lot ' + pt.lot : '') + ', ' + (POINT_STATUS.find((x) => x.id === pt.status) || POINT_STATUS[0]).nom }, h('b', null, pt.num), h('i', null, pt.lot ? lotOf(pt.lot).code : 'GÉN'));
      const el = h('div', { class: 'pin' + (pt.status === 'leve' ? ' leve' : '') + (pt.id === selId ? ' sel' : '') + (visit && pt.visiteId && pt.visiteId !== visit.id ? ' prev' : ''), 'data-x': pt.x, 'data-y': pt.y, style: { '--lc': pt.lot ? lotOf(pt.lot).color : '#161616' } }, btn);
      btn.addEventListener('pointerdown', (e) => pinDown(e, pt, el));
      pinsBox.appendChild(el);
    });
    placeOverlay();
    const open = points.filter((x) => x.planId === plan.id && x.status !== 'leve').length;
    countLbl.textContent = open + ' ouvert' + (open > 1 ? 's' : '');
  }
  let drag = null;
  function pinDown(e, pt, el) {
    e.stopPropagation(); e.preventDefault();
    if (mode === 'gomme') return;
    if (selId !== pt.id) { select(pt); return; }
    drag = { pt, el, id: e.pointerId, moved: false, sx: e.clientX, sy: e.clientY };
    el.setPointerCapture?.(e.pointerId);
    const mv = (ev) => {
      if (Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy) > 6) drag.moved = true;
      if (!drag.moved) return;
      const [x, y] = toUnits(ev);
      pt.x = clamp(x / W, 0, 1); pt.y = clamp(y / H, 0, 1);
      el.dataset.x = pt.x; el.dataset.y = pt.y; placeOverlay();
    };
    const up = async () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      if (drag && drag.moved) { await db.put('points', pt); toast('Point ' + pt.num + ' déplacé'); }
      drag = null;
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  }
  function select(pt) { selId = pt.id; drawPins(); openPanel(pt); }

  async function createPoint(x, y) {
    const num = points.reduce((m, q) => Math.max(m, q.num || 0), 0) + 1;
    const assigned = p.assignments || [];
    const defLot = lotFilter !== 'tous' && lotFilter !== '—' ? lotFilter : (assigned[0] ? assigned[0].lot : '');
    const pt = { id: uid(), projectId: p.id, planId: plan.id, page: pageIndex, x: clamp(x / W, 0, 1), y: clamp(y / H, 0, 1), num, lot: defLot, nature: p.phase === 'AOR' ? 'res' : 'obs', status: 'ouvert', text: '', due: '', photos: [], createdAt: new Date().toISOString(), date: todayISO(), visiteId: visit ? visit.id : undefined };
    await db.put('points', pt);
    points.push(pt);
    select(pt);
    setTimeout(() => panel.querySelector('textarea')?.focus(), 80);
  }

  /* ---------- Panneau du point ---------- */
  function closePanel() { panel.hidden = true; root.classList.remove('with-panel'); selId = null; drawPins(); requestAnimationFrame(() => { const r = stage.getBoundingClientRect(); if (r.width) apply(); }); }
  function openPanel(pt) {
    root.classList.add('with-panel'); panel.hidden = false;
    const save = debounce(async () => { await db.put('points', pt); drawPins(); }, 350);
    const assigned = p.assignments || [];
    const entOf = (l) => { const a = assigned.find((x) => x.lot === l); return a && entreprises.find((e) => e.id === a.entrepriseId); };
    const lotSelect = h('select', { class: 'select', 'aria-label': 'Lot' },
      h('option', { value: '' }, 'Généralités · tous les intervenants'),
      assigned.length ? h('optgroup', { label: 'Entreprises du chantier' }, assigned.map((a) => { const e = entreprises.find((x) => x.id === a.entrepriseId); return h('option', { value: a.lot }, 'Lot ' + a.lot + ' · ' + lotOf(a.lot).nom + (e ? ' — ' + e.nom : '')); })) : null,
      h('optgroup', { label: assigned.length ? 'Autres lots' : 'Lots' }, LOTS.filter((l) => !assigned.some((a) => a.lot === l.id)).map((l) => h('option', { value: l.id }, 'Lot ' + l.id + ' · ' + l.nom))));
    lotSelect.value = pt.lot || '';
    const entLine = h('div', { class: 'small muted' });
    const refreshEnt = () => { const e = entOf(pt.lot); entLine.textContent = pt.lot ? (e ? e.nom + (e.email ? ' · ' + e.email : '') : 'Aucune entreprise affectée à ce lot sur ce chantier (onglet Chantier).') : 'Point repris dans le CR de chaque lot.'; };
    lotSelect.addEventListener('change', () => { pt.lot = lotSelect.value; refreshEnt(); save(); fillLotFilter(); });
    refreshEnt();
    const seg = (list, key, after) => h('div', { class: 'seg', role: 'group', style: { display: 'flex' } }, list.map((o) => h('button', { 'aria-pressed': String(pt[key] === o.id), style: { flex: 1 }, onclick: (e) => { pt[key] = o.id; e.currentTarget.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); after && after(o.id); save(); } }, o.nom)));
    const text = h('textarea', { class: 'textarea', rows: 4, placeholder: 'Observation : écrire ou dicter…', 'aria-label': 'Observation' }, pt.text || '');
    text.addEventListener('input', () => { pt.text = text.value; save(); });
    const due = h('input', { class: 'input', type: 'date', value: pt.due || '', 'aria-label': 'Échéance' });
    due.addEventListener('input', () => { pt.due = due.value; save(); });
    const photos = h('div', { class: 'photos' });
    const drawPhotos = async () => {
      clear(photos);
      for (const id of pt.photos || []) {
        const m = await db.get('media', id);
        if (m) photos.appendChild(photoThumb(m, { onClick: () => openPhotoEditor(m, { onSave: drawPhotos, onDelete: () => { pt.photos = pt.photos.filter((x) => x !== id); save(); drawPhotos(); } }) }));
      }
      photos.appendChild(h('button', { class: 'photo photo-add', type: 'button', onclick: async () => {
        const ms = await addPhotos(p.id, { camera: true });
        if (!ms.length) return;
        pt.photos = (pt.photos || []).concat(ms.map((m) => m.id)); save(); await drawPhotos();
        openPhotoEditor(ms[0], { onSave: drawPhotos });
      } }, icon('camera', 22), 'Photo'));
    };
    put(clear(panel), 
      h('div', { class: 'sheet-h' },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
          h('span', { class: 'pt-num' + (pt.status === 'leve' ? ' leve' : '') }, h('b', null, pt.num), h('i', null, pt.lot ? lotOf(pt.lot).code : 'GÉN')),
          h('h2', { class: 'title-sm' }, 'Point ' + pt.num)),
        h('button', { class: 'btn btn-icon btn-ghost', 'aria-label': 'Fermer le point', onclick: closePanel }, icon('close'))),
      h('div', { class: 'sheet-b' },
        h('div', { class: 'field' }, h('span', { class: 'lbl-s' }, 'Lot · entreprise'), lotSelect, entLine),
        h('div', { class: 'field' }, h('span', { class: 'lbl-s' }, 'Nature'), seg(POINT_NATURE, 'nature')),
        h('div', { class: 'field' }, h('span', { class: 'lbl-s' }, 'Statut'), seg(POINT_STATUS, 'status', (v) => { pt.leveAt = v === 'leve' ? todayISO() : ''; })),
        h('label', { class: 'field' }, h('span', null, 'Observation'), text),
        h('label', { class: 'field' }, h('span', null, 'Échéance'), due),
        h('div', { class: 'field' }, h('span', { class: 'lbl-s' }, 'Photos annotées'), photos),
        h('div', { class: 'small muted' }, 'Créé le ' + fmtShort(pt.date || pt.createdAt) + (pt.leveAt ? ' · levé le ' + fmtShort(pt.leveAt) : '') + ' · touchez à nouveau la pastille puis glissez pour la déplacer.')),
      h('div', { class: 'sheet-f' },
        h('button', { class: 'btn btn-line', onclick: async () => {
          if (!(await confirmBox('Supprimer le point ' + pt.num + ' ?', 'Supprimer'))) return;
          await db.del('points', pt.id); points = points.filter((x) => x.id !== pt.id); closePanel();
        } }, icon('trash', 16), 'Supprimer'),
        h('button', { class: 'btn btn-primary', onclick: closePanel }, 'Terminé')));
    drawPhotos();
  }

  /* ---------- Gestes ---------- */
  const ptrs = new Map();
  let gesture = null, stroke = null, tap = null;
  function setMode(m) {
    mode = m;
    toolBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    stage.classList.toggle('erasing', m === 'gomme');
    const drawing = ['stylo', 'feutre', 'surligneur', 'regle'].includes(m);
    picker.el.hidden = !drawing;
    if (drawing) picker.setMode(m === 'regle' ? 'stylo' : m);
    requestAnimationFrame(() => { if (renderedW) apply(); });
    const hints = { regle: 'Traits droits ; partez d’une extrémité pour enchaîner. Avec les autres stylos : gardez le stylet immobile ½ s pour redresser le trait', point: 'Touchez le plan pour poser un point', texte: 'Touchez le plan pour écrire un texte', gomme: 'Touchez un trait ou un texte pour l’effacer' };
    hint.hidden = !hints[m]; hint.textContent = hints[m] || '';
    stage.style.cursor = m === 'nav' ? 'grab' : 'crosshair';
  }
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.pin')) return;
    if (e.pointerType === 'pen') penSeen = true;
    stage.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (ptrs.size === 2) { cancelStroke(); tap = null; startPinch(); return; }
    if (ptrs.size > 2) return;
    const drawMode = ['stylo', 'feutre', 'surligneur', 'regle'].includes(mode);
    const canDraw = e.pointerType === 'pen' || e.pointerType === 'mouse' || (e.pointerType === 'touch' && !penSeen);
    if (drawMode && canDraw) { startStroke(e); return; }
    if (mode === 'gomme') { eraseAt(e); gesture = { erase: true }; return; }
    tap = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId };
    gesture = { pan: true, sx: e.clientX, sy: e.clientY, tx, ty };
  });
  stage.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (gesture && gesture.pinch && ptrs.size >= 2) { movePinch(); return; }
    if (stroke && e.pointerId === stroke.pid) {
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      const last = toUnits(evs[evs.length - 1]);
      if (stroke.shp.active) { stroke.shp.move(stroke, last); return; }
      evs.forEach((ev) => stroke.pts.push(toUnits(ev)));
      if (stroke.shp.move(stroke, last)) return;
      stroke.el.setAttribute('d', strokePath(stroke));
      return;
    }
    if (gesture && gesture.erase) { eraseAt(e); return; }
    if (gesture && gesture.pan) {
      if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8) tap = null;
      tx = gesture.tx + (e.clientX - gesture.sx); ty = gesture.ty + (e.clientY - gesture.sy); apply();
    }
  });
  const endPtr = (e) => {
    ptrs.delete(e.pointerId);
    if (stroke && e.pointerId === stroke.pid) finishStroke();
    if (tap && tap.id === e.pointerId && Date.now() - tap.t < 600 && ptrs.size === 0) onTap(e);
    tap = null;
    if (ptrs.size < 2 && gesture && gesture.pinch) {
      gesture = null;
      const rest = [...ptrs.values()][0];
      if (rest) gesture = { pan: true, sx: rest.x, sy: rest.y, tx, ty };
    } else if (ptrs.size === 0) gesture = null;
  };
  stage.addEventListener('pointerup', endPtr);
  stage.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); cancelStroke(); gesture = null; tap = null; });
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey || e.deltaMode === 1) {
      // pincement du pavé tactile ou molette de souris : zoom
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.12 : 0.01)));
    } else {
      // défilement à deux doigts : déplacement
      tx -= e.deltaX; ty -= e.deltaY; apply();
    }
  }, { passive: false });

  function startPinch() {
    const [a, b] = [...ptrs.values()];
    gesture = { pinch: true, d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, s, tx, ty };
  }
  function movePinch() {
    const [a, b] = [...ptrs.values()];
    const r = stage.getBoundingClientRect();
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const ns = clamp(gesture.s * d / gesture.d, 0.15, 40);
    const k = ns / gesture.s;
    const ox = gesture.cx - r.left, oy = gesture.cy - r.top;
    s = ns;
    tx = ox - (ox - gesture.tx) * k + (cx - gesture.cx);
    ty = oy - (oy - gesture.ty) * k + (cy - gesture.cy);
    apply();
  }
  function startStroke(e) {
    const pen = mode === 'regle' ? 'stylo' : mode;
    stroke = Object.assign({ id: uid(), pen, pts: [toUnits(e)], pressure: e.pointerType === 'pen', pid: e.pointerId }, strokeStyle(pen));
    stroke.shp = shaper((st) => st.el.setAttribute('d', strokePath(st)), () => 7 / s);
    if (mode === 'regle') { const p0 = toUnits(e); stroke.shp.ruler(stroke, nearEnd(pageData().strokes, p0, 20 / s) || [p0[0], p0[1], 0.5]); }
    stroke.el = strokeEl(stroke);
    (inkSvg.querySelector('g.strokes') || inkSvg.appendChild(h('g', { class: 'strokes' }))).appendChild(stroke.el);
    if (!showInk) { showInk = true; drawInk(); drawTexts(); inkSvg.querySelector('g.strokes').appendChild(stroke.el); }
  }
  function cancelStroke() { if (stroke) { stroke.shp.end(); stroke.el.remove(); stroke = null; } }
  function finishStroke() {
    stroke.shp.end();
    const st = { id: stroke.id, layer: pageData().active, pen: stroke.pen, color: stroke.color, size: stroke.size, pressure: stroke.pressure, shape: stroke.shape, pts: stroke.pts.map((q) => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10, Math.round(q[2] * 100) / 100]) };
    stroke = null;
    pageData().strokes.push(st);
    undo.push({ add: st.id });
    savePage();
  }
  function eraseAt(e) {
    const pd = pageData();
    const t = document.elementFromPoint(e.clientX, e.clientY);
    // traits : le plus proche du doigt ou du stylet, sur les calques visibles
    const [x, y] = toUnits(e);
    const st = !(t && t.classList && t.classList.contains('vtext')) && hitStroke(pd.strokes.filter(isVisible), x, y, 14 / s);
    if (st) {
      pd.strokes = pd.strokes.filter((q) => q !== st); undo.push({ delStroke: st }); drawInk(); savePage();
    } else if (t && t.classList && t.classList.contains('vtext')) {
      const tt = pd.texts.find((x) => x.id === t.dataset.id);
      pd.texts = pd.texts.filter((x) => x !== tt); undo.push({ delText: tt }); t.remove(); savePage();
    }
  }
  function doUndo() {
    const u = undo.pop(); if (!u) { toast('Rien à annuler'); return; }
    const pd = pageData();
    if (u.add) pd.strokes = pd.strokes.filter((x) => x.id !== u.add);
    if (u.delStroke) pd.strokes.push(u.delStroke);
    if (u.addText) pd.texts = pd.texts.filter((x) => x.id !== u.addText);
    if (u.delText) pd.texts.push(u.delText);
    drawInk(); drawTexts(); savePage();
  }
  async function onTap(e) {
    const [x, y] = toUnits(e);
    if (x < 0 || y < 0 || x > W || y > H) return;
    if (mode === 'point') { await createPoint(x, y); return; }
    if (mode === 'texte') {
      const hit = e.target.closest && e.target.closest('.vtext');
      const pd = pageData();
      if (hit) {
        const t = pd.texts.find((q) => q.id === hit.dataset.id);
        const v = await promptBox('Modifier le texte', t.text, { multiline: true });
        if (v !== null) { t.text = v; if (!v.trim()) pd.texts = pd.texts.filter((q) => q !== t); drawTexts(); savePage(); }
        return;
      }
      const v = await promptBox('Texte sur le plan', '', { multiline: true });
      if (v && v.trim()) { const t = { id: uid(), layer: pageData().active, x: x / W, y: y / H, text: v.trim() }; pd.texts.push(t); undo.push({ addText: t.id }); drawTexts(); savePage(); }
      return;
    }
    if (selId && mode === 'nav') closePanel();
  }

  /* ---------- Export ---------- */
  async function exportPlan() {
    toast('Export du plan annoté…');
    const { exportAnnotatedPlan } = await import('../pdfkit.js');
    // seuls les calques visibles partent dans la copie annotée
    const vis = {};
    for (const [k, pd] of Object.entries(pagesMap)) { const ok = (o) => { const l = (pd.layers || []).find((x) => x.id === (o.layer || 'base')); return !l || l.visible !== false; }; vis[k] = Object.assign({}, pd, { strokes: (pd.strokes || []).filter(ok), texts: (pd.texts || []).filter(ok) }); }
    const blob = await exportAnnotatedPlan({ plan, pages: vis, points: points.filter((x) => x.planId === plan.id) });
    const ph = phase(plan.phase || p.phase);
    // Copie annotée : « <nom d'origine>_NOTE_AAMMJJ.pdf », à côté du PDF d'origine dans le Drive (qui n'est jamais modifié)
    const d0 = new Date(), stamp = String(d0.getFullYear()).slice(2) + String(d0.getMonth() + 1).padStart(2, '0') + String(d0.getDate()).padStart(2, '0');
    const stem = (plan.fileName || '').replace(/\.[^.]+$/, '');
    const name = stem ? stem + (plan.pageLabel ? '_' + plan.pageLabel.replace(/[^A-Za-z0-9]+/g, '-').toUpperCase() : (plan.srcPages && plan.srcPages.length === 1 ? '_P' + (plan.srcPages[0] + 1) : '')) + '_NOTE_' + stamp + '.pdf'
      : fileName({ date: todayISO(), code: fileCode(p), phase: ph.id, type: 'PLN', objet: plan.nom + ' note', ind: plan.indice || 'A', ext: 'pdf' });
    await db.put('files', { id: uid(), projectId: p.id, ...destFor('emis', p, ph.id), driveParent: plan.drive && plan.drive.parent, name, mime: 'application/pdf', size: blob.size, blob, phase: ph.id, createdAt: new Date().toISOString(), source: 'plan' });
    toast(plan.drive && plan.drive.parent ? 'Copie annotée ajoutée à côté du PDF d’origine dans le Drive' : 'Rangé dans ' + destFor('emis', p, ph.id).folder + ' › ' + destFor('emis', p, ph.id).sub);
    await shareOrDownload(blob, name, plan.nom + ' · ' + p.nom);
  }

  const onKey = (e) => {
    if (e.target.matches('input, textarea, select')) return;
    if (e.key === 'Escape' && !panel.hidden) closePanel();
    if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); doUndo(); }
  };
  const onResize = debounce(fit, 150);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);
  setMode(params.q.mode || 'nav');
  await loadPage();
  return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); };
}
