// Plans du projet : import de PDF ou d'images, vignettes, propriétés
import { h, put, clear, icon, uid, sheet, toast, pickFiles, blobURL, fmtShort, confirmBox } from '../lib.js';
import { db } from '../db.js';
import { PHASES } from '../data.js';
import { planThumb, pageCount, pageThumb, pageTitle } from '../pdfkit.js';

export async function importPlanBlobs(project, files, { askMeta = true } = {}) {
  const created = [];
  for (const f of files) {
    const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    const isImg = /^image\//.test(f.type);
    if (!isPdf && !isImg) { toast('Format non pris en charge : ' + f.name); continue; }
    let base = f.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
    // Nommage STATERA : AAMMJJ_CODE_PHASE_TYPE_OBJET_IND → intitulé, phase et indice préremplis
    const nm = f.name.replace(/\.[^.]+$/, '').match(/^(\d{6})_([A-Z0-9-]+)_([A-Z]{2,4})_([A-Z]{2,4})_(.+)_([A-Z]{1,3})$/i);
    let phaseId = project.phase, ind = 'A';
    if (nm) {
      base = nm[5].replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\B\w/g, (c) => c.toLowerCase());
      if (PHASES.some((x) => x.id === nm[3].toUpperCase())) phaseId = nm[3].toUpperCase();
      ind = nm[6].toUpperCase();
    }
    toast('Lecture de « ' + f.name + ' »…');
    let blob;
    try { blob = new Blob([await f.arrayBuffer()], { type: f.type || (isPdf ? 'application/pdf' : 'image/jpeg') }); }
    catch (e) { toast('Fichier inaccessible : ' + f.name + ' (s’il est sur Google Drive, attends la fin du téléchargement)'); continue; }
    const plan = { id: uid(), projectId: project.id, nom: base, phase: phaseId, indice: ind, fileName: f.name, kind: isPdf ? 'pdf' : 'image', mime: blob.type, blob, size: blob.size, createdAt: new Date().toISOString() };
    let total = 1;
    try { total = await pageCount(plan); } catch (e) { toast('PDF illisible : ' + f.name + ' — ' + ((e && e.message) || e)); continue; }
    if (f._drive) plan.drive = f._drive; // provenance : le PDF d'origine dans le Drive (jamais modifié)
    // Plusieurs pages : on choisit lesquelles importer (une page = un plan, par défaut)
    let groups = [null];
    if (isPdf && total > 1) {
      const choice = await choosePages(plan, total);
      if (!choice) continue;
      groups = choice.split ? choice.pages.map((k) => [k]) : [choice.pages];
    }
    let first = null;
    for (const g of groups) {
      const pl = Object.assign({}, plan, { id: uid(), srcPages: g, pages: g ? g.length : total });
      if (first) { delete pl.blob; pl.blobOf = first.id; }
      if (g && g.length === 1) { const t = await pageTitle(pl, g[0]); pl.nom = t ? base + ' · ' + t : base + ' · p.' + (g[0] + 1); pl.pageLabel = t; }
      try { pl.thumb = await planThumb(pl); } catch (e) { pl.thumb = null; }
      if (askMeta && groups.length === 1) { const ok = await editPlan(pl, true); if (!ok) continue; }
      try { await db.put('plans', pl); created.push(pl); if (!first) first = pl; } catch (e) { toast((e && e.message) || 'Enregistrement impossible'); }
    }
  }
  return created;
}

// Choix des pages d'un PDF à importer (vignettes)
function choosePages(plan, total) {
  return new Promise((res) => {
    const sel = new Set([0]);
    let split = true, done = false;
    const grid = h('div', { class: 'page-pick' });
    const count = h('span', { class: 'small muted' });
    const upd = () => { count.textContent = sel.size + ' page(s) sur ' + total; };
    for (let k = 0; k < total; k++) {
      const cell = h('button', { class: 'pp-cell', type: 'button', 'aria-pressed': String(sel.has(k)), onclick: () => { sel.has(k) ? sel.delete(k) : sel.add(k); cell.setAttribute('aria-pressed', String(sel.has(k))); upd(); } },
        h('div', { class: 'pp-img' }, h('span', { class: 'small muted' }, '…')), h('span', { class: 'pp-n' }, 'Page ' + (k + 1)), h('span', { class: 'pp-t small muted' }));
      grid.appendChild(cell);
    }
    upd();
    (async () => { // vignettes et titres chargés progressivement (PDF AutoCAD lourds)
      for (let k = 0; k < total && !done; k++) {
        const cell = grid.children[k];
        try { const c = await pageThumb(plan, k, 240); c.className = 'pp-canvas'; const box = cell.querySelector('.pp-img'); box.innerHTML = ''; box.appendChild(c); } catch (e) { /* vignette indisponible */ }
        pageTitle(plan, k).then((t) => { cell.querySelector('.pp-t').textContent = t; });
      }
    })();
    const splitSel = h('div', { class: 'seg', role: 'group' },
      h('button', { 'aria-pressed': 'true', onclick: (e) => { split = true; e.currentTarget.nextSibling.setAttribute('aria-pressed', 'false'); e.currentTarget.setAttribute('aria-pressed', 'true'); } }, 'Une page = un plan'),
      h('button', { 'aria-pressed': 'false', onclick: (e) => { split = false; e.currentTarget.previousSibling.setAttribute('aria-pressed', 'false'); e.currentTarget.setAttribute('aria-pressed', 'true'); } }, 'Un seul plan multipage'));
    const s = sheet({
      title: 'Pages à importer · ' + plan.nom, wide: true,
      body: [h('div', { class: 'flexb' }, h('div', { class: 'actions' },
          h('button', { class: 'btn btn-sm btn-line', onclick: () => { for (let k = 0; k < total; k++) sel.add(k); grid.querySelectorAll('.pp-cell').forEach((c) => c.setAttribute('aria-pressed', 'true')); upd(); } }, 'Tout'),
          h('button', { class: 'btn btn-sm btn-line', onclick: () => { sel.clear(); grid.querySelectorAll('.pp-cell').forEach((c) => c.setAttribute('aria-pressed', 'false')); upd(); } }, 'Aucune')), count),
        splitSel, grid],
      foot: [h('button', { class: 'btn btn-line', onclick: () => s.close() }, 'Annuler'),
        h('button', { class: 'btn btn-primary', onclick: () => { if (!sel.size) { toast('Choisis au moins une page'); return; } done = true; res({ pages: [...sel].sort((a, b) => a - b), split }); s.close(); } }, 'Importer')],
      onClose: () => { if (!done) { done = true; res(null); } }
    });
  });
}
export function editPlan(plan, isNew) {
  return new Promise((res) => {
    const nom = h('input', { class: 'input', value: plan.nom });
    const ind = h('input', { class: 'input', value: plan.indice || 'A', maxlength: '3', style: { textTransform: 'uppercase' } });
    const ph = h('select', { class: 'select' }, PHASES.map((p) => h('option', { value: p.id, selected: p.id === plan.phase || null }, p.court + ' · ' + p.nom)));
    const ech = h('input', { class: 'input', value: plan.echelle || '', placeholder: 'ex. 1/100' });
    let ok = false;
    const s = sheet({
      title: isNew ? 'Nouveau plan' : 'Propriétés du plan',
      body: [h('label', { class: 'field' }, h('span', null, 'Intitulé'), nom),
        h('div', { class: 'grid g3' }, h('label', { class: 'field' }, h('span', null, 'Phase'), ph), h('label', { class: 'field' }, h('span', null, 'Indice'), ind), h('label', { class: 'field' }, h('span', null, 'Échelle'), ech)),
        h('div', { class: 'small muted' }, plan.kind === 'pdf' ? (plan.pages || 1) + ' page(s) PDF' : 'Image')],
      foot: [h('button', { class: 'btn btn-line', onclick: () => s.close() }, 'Annuler'), h('button', { class: 'btn btn-primary', onclick: () => { plan.nom = nom.value.trim() || plan.nom; plan.indice = ind.value.toUpperCase(); plan.phase = ph.value; plan.echelle = ech.value; ok = true; s.close(); } }, isNew ? 'Ajouter' : 'Enregistrer')],
      onClose: () => res(ok)
    });
  });
}

export function render(body, { project: p, plans, points }) {
  const openBy = {};
  points.forEach((x) => { if (x.status !== 'leve') openBy[x.planId] = (openBy[x.planId] || 0) + 1; });
  const add = async () => {
    const files = await pickFiles({ accept: 'application/pdf,image/*', multiple: true });
    if (!files.length) return;
    const c = await importPlanBlobs(p, files);
    if (c.length) { toast(c.length + ' plan(s) ajouté(s)'); window.dispatchEvent(new HashChangeEvent('hashchange')); }
  };
  function driveBtn() {
    return h('button', { class: 'btn btn-line', onclick: async () => {
      const gd = await import('../gdrive.js');
      if (!gd.available()) { toast('Disponible sur la version en ligne'); return; }
      if (!(await gd.ensureToken())) { gd.signIn(location.hash); return; }
      if (!p.drive || !p.drive.id) { if (!await gd.linkProject(p)) return; }
      const f = await gd.pickFromDrive(p);
      if (!f) return;
      const c = await importPlanBlobs(p, [f]);
      if (c.length) { toast('Plan importé depuis le Drive'); window.dispatchEvent(new HashChangeEvent('hashchange')); }
    } }, icon('folder', 18), 'Depuis le Drive');
  }
  const sorted = plans.slice().sort((a, b) => PHASES.findIndex((x) => x.id === b.phase) - PHASES.findIndex((x) => x.id === a.phase) || (a.nom || '').localeCompare(b.nom || ''));
  put(clear(body), 
    h('div', { class: 'flexb mb' },
      h('div', { class: 'small muted' }, 'Les plans de base du projet. Pour poser des points de chantier, ouvre une réunion de chantier dans le Journal : chaque visite reprend ses plans, avec son propre calque.'),
      h('div', { class: 'actions' }, driveBtn(), h('button', { class: 'btn btn-primary', onclick: add }, icon('plus', 18), 'Importer un plan'))),
    !plans.length ? h('div', { class: 'empty' }, h('div', { class: 'title-sm' }, 'Aucun plan'),
      h('div', null, 'Importez un PDF (export AutoCAD, planche de permis, plan EXE) ou une photo de plan.'),
      h('button', { class: 'btn btn-primary', onclick: add }, icon('plus', 18), 'Importer un plan'))
      : h('div', { class: 'plan-cards' }, sorted.map((pl) => h('div', { class: 'plan-card' },
        h('a', { class: 'thumb', href: '#/p/' + p.id + '/plans/' + pl.id, 'aria-label': 'Ouvrir ' + pl.nom }, pl.thumb ? h('img', { src: blobURL(pl.id + 't', pl.thumb), alt: '' }) : icon('plan', 40)),
        h('div', { class: 'meta' },
          h('a', { href: '#/p/' + p.id + '/plans/' + pl.id, style: { fontSize: '16px', fontWeight: 500, textDecoration: 'none' } }, pl.nom),
          h('div', { class: 'flexb' },
            h('span', { class: 'small muted' }, [pl.phase, pl.indice ? 'ind. ' + pl.indice : null, pl.echelle, (pl.pages || 1) > 1 ? pl.pages + ' pages' : null].filter(Boolean).join(' · ')),
            openBy[pl.id] ? h('span', { class: 'tag tag-fill' }, openBy[pl.id] + ' pt') : null),
          h('div', { class: 'actions', style: { marginTop: '6px' } },
            h('a', { class: 'btn btn-sm btn-primary', href: '#/p/' + p.id + '/plans/' + pl.id }, 'Ouvrir'),
            h('button', { class: 'btn btn-sm btn-line', onclick: async () => { if (await editPlan(pl, false)) { await db.put('plans', pl); window.dispatchEvent(new HashChangeEvent('hashchange')); } } }, 'Propriétés'),
            h('button', { class: 'btn btn-sm btn-ghost btn-icon', 'aria-label': 'Supprimer le plan', onclick: async () => {
              const n = points.filter((x) => x.planId === pl.id).length;
              if (!(await confirmBox('Retirer le plan « ' + pl.nom + ' » de l’Atelier' + (n ? ' avec ses ' + n + ' point(s)' : '') + ' ? Le PDF du Drive n’est pas touché.', 'Retirer'))) return;
              for (const x of points.filter((y) => y.planId === pl.id)) await db.del('points', x.id);
              for (const pg of await db.by('pages', 'planId', pl.id)) await db.del('pages', pg.key);
              const heirs = plans.filter((x) => x.blobOf === pl.id);
              if (heirs.length && pl.blob) { const [h0, ...rest] = heirs; h0.blob = pl.blob; delete h0.blobOf; await db.put('plans', h0); for (const r of rest) { r.blobOf = h0.id; await db.put('plans', r); } }
              await db.del('plans', pl.id); window.dispatchEvent(new HashChangeEvent('hashchange'));
            } }, icon('trash', 16))),
          h('div', { class: 'small muted' }, 'Ajouté le ' + fmtShort(pl.createdAt))))))
  );
}
