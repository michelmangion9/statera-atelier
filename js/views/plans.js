// Plans du projet : import de PDF ou d'images, vignettes, propriétés
import { h, put, clear, icon, uid, sheet, toast, pickFiles, blobURL, fmtShort, confirmBox } from '../lib.js';
import { db } from '../db.js';
import { PHASES } from '../data.js';
import { planThumb, pageCount } from '../pdfkit.js';

export async function importPlanBlobs(project, files, { askMeta = true } = {}) {
  const created = [];
  for (const f of files) {
    const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    const isImg = /^image\//.test(f.type);
    if (!isPdf && !isImg) { toast('Format non pris en charge : ' + f.name); continue; }
    const base = f.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
    toast('Lecture de « ' + f.name + ' »…');
    let blob;
    try { blob = new Blob([await f.arrayBuffer()], { type: f.type || (isPdf ? 'application/pdf' : 'image/jpeg') }); }
    catch (e) { toast('Fichier inaccessible : ' + f.name + ' (s’il est sur Google Drive, attends la fin du téléchargement)'); continue; }
    const plan = { id: uid(), projectId: project.id, nom: base, phase: project.phase, indice: 'A', kind: isPdf ? 'pdf' : 'image', mime: blob.type, blob, size: blob.size, createdAt: new Date().toISOString() };
    try { plan.pages = await pageCount(plan); } catch (e) { toast('PDF illisible : ' + f.name + ' — ' + ((e && e.message) || e)); continue; }
    try { plan.thumb = await planThumb(plan); } catch (e) { plan.thumb = null; }
    if (askMeta) { const ok = await editPlan(plan, true); if (!ok) continue; }
    try { await db.put('plans', plan); } catch (e) { toast((e && e.message) || 'Enregistrement impossible'); continue; }
    created.push(plan);
  }
  return created;
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
  const sorted = plans.slice().sort((a, b) => PHASES.findIndex((x) => x.id === b.phase) - PHASES.findIndex((x) => x.id === a.phase) || (a.nom || '').localeCompare(b.nom || ''));
  put(clear(body), 
    h('div', { class: 'flexb mb' },
      h('div', { class: 'small muted' }, 'Ouvrez un plan pour l’annoter, poser des points numérotés par lot, ou exporter le plan annoté.'),
      h('button', { class: 'btn btn-primary', onclick: add }, icon('plus', 18), 'Importer un plan')),
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
              if (!(await confirmBox('Supprimer le plan « ' + pl.nom + ' »' + (n ? ' et ses ' + n + ' point(s)' : '') + ' ?', 'Supprimer'))) return;
              for (const x of points.filter((y) => y.planId === pl.id)) await db.del('points', x.id);
              for (const pg of await db.by('pages', 'planId', pl.id)) await db.del('pages', pg.key);
              await db.del('plans', pl.id); window.dispatchEvent(new HashChangeEvent('hashchange'));
            } }, icon('trash', 16))),
          h('div', { class: 'small muted' }, 'Ajouté le ' + fmtShort(pl.createdAt))))))
  );
}
