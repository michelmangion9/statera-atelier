// Projet : en-tête, phases, onglets et synthèse
import { h, put, clear, icon, debounce, toast, fmtDate, fmtShort, daysUntil, fmtEuro, confirmBox, sheet, todayISO, nowTime, uid } from '../lib.js';
import { db, deleteProject } from '../db.js';
import { PHASES, phase, FOLDERS, fileName } from '../data.js';
import { PROJECT_TYPES } from './projects.js';

export const TABS = [
  { id: 'synthese', label: 'Synthèse', icon: 'info' },
  { id: 'notes', label: 'Notes', icon: 'note' },
  { id: 'plans', label: 'Plans', icon: 'plan' },
  { id: 'points', label: 'Points', icon: 'pin' },
  { id: 'fichiers', label: 'Fichiers', icon: 'folder' },
  { id: 'chantier', label: 'Chantier', icon: 'crane' }
];

export async function loadProject(id) {
  const p = await db.get('projects', id);
  if (!p) throw new Error('Projet introuvable sur cet appareil.');
  return p;
}

export async function render(view, params) {
  const p = await loadProject(params.projectId);
  const [notes, plans, points, files] = await Promise.all([
    db.by('notes', 'projectId', p.id), db.by('plans', 'projectId', p.id), db.by('points', 'projectId', p.id), db.by('files', 'projectId', p.id)
  ]);
  const counts = { notes: notes.length, plans: plans.length, points: points.filter((x) => x.status !== 'leve').length, fichiers: files.length };
  const body = h('div');
  const page = h('div', { class: 'page' },
    header(p),
    phaseTrack(p),
    h('nav', { class: 'ptabs', 'aria-label': 'Sections du projet' }, TABS.map((t) => h('a', { href: '#/p/' + p.id + (t.id === 'synthese' ? '' : '/' + t.id), 'aria-current': params.tab === t.id ? 'page' : null }, t.label, counts[t.id] ? h('span', { class: 'n' }, counts[t.id]) : null))),
    body);
  clear(view).appendChild(page);
  window.scrollTo(0, 0);

  const ctx = { project: p, notes, plans, points, files, view, params };
  switch (params.tab) {
    case 'notes': return (await import('./notes.js')).renderList(body, ctx);
    case 'plans': return (await import('./plans.js')).render(body, ctx);
    case 'points': return (await import('./points.js')).render(body, ctx);
    case 'fichiers': return (await import('./files.js')).render(body, ctx);
    case 'chantier': return (await import('./chantier.js')).render(body, ctx);
    default: return synthese(body, ctx);
  }
}

function header(p) {
  return h('header', { class: 'page-head' },
    h('div', null,
      h('a', { class: 'crumb', href: '#/projets' }, icon('back', 16), 'Projets', h('span', { class: 'dotsep' }), p.code || ''),
      h('h1', { class: 'title' }, p.nom),
      h('div', { class: 'sub' }, [p.client, p.commune, p.type].filter(Boolean).join(' · '))),
    h('div', { class: 'actions' },
      h('a', { class: 'btn', href: '#/p/' + p.id + '/notes/new' }, icon('note', 18), 'Note'),
      h('a', { class: 'btn btn-primary', href: '#/p/' + p.id + '/plans' }, icon('plan', 18), 'Plans')));
}

function phaseTrack(p) {
  const list = PHASES;
  const ci = list.findIndex((x) => x.id === p.phase);
  return h('div', { class: 'track', style: { gridTemplateColumns: 'repeat(' + list.length + ', minmax(64px, 1fr))' }, role: 'group', 'aria-label': 'Phase de la mission' },
    list.map((ph, i) => h('button', {
      class: i < ci ? 'done' : i === ci ? 'cur' : '',
      'aria-pressed': String(i === ci),
      title: ph.nom,
      onclick: async () => {
        if (i === ci) return;
        if (!(await confirmBox('Passer le projet en phase « ' + ph.nom + ' » ?', 'Changer de phase'))) return;
        p.phase = ph.id; await db.put('projects', p); window.dispatchEvent(new HashChangeEvent('hashchange'));
      }
    }, h('span', { class: 'dot' }, h('i'), i < list.length - 1 ? h('b') : null), h('span', { class: 'nm' }, ph.court))));
}

/* ---------------- Synthèse ---------------- */
async function synthese(body, ctx) {
  const { project: p, notes, plans, points, files } = ctx;
  p.urba = p.urba || {}; p.prog = p.prog || {};
  const saved = h('div', { class: 'saved', 'aria-live': 'polite' });
  const save = debounce(async () => { await db.put('projects', p); saved.textContent = 'Enregistré'; setTimeout(() => (saved.textContent = ''), 1600); window.dispatchEvent(new Event('statera:refresh-nav')); }, 500);

  const bind = (obj, key, el) => { el.value = obj[key] ?? ''; el.addEventListener('input', () => { obj[key] = el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value; save(); refreshChecks(); }); return el; };
  const inp = (obj, key, attrs = {}) => bind(obj, key, h('input', Object.assign({ class: 'input' }, attrs)));
  const area = (obj, key, attrs = {}) => bind(obj, key, h('textarea', Object.assign({ class: 'textarea' }, attrs)));
  const sel = (obj, key, opts) => bind(obj, key, h('select', { class: 'select' }, opts.map((o) => h('option', { value: Array.isArray(o) ? o[0] : o }, Array.isArray(o) ? o[1] : o))));
  const fld = (label, el, cls) => h('label', { class: 'field ' + (cls || '') }, h('span', null, label), el);

  const checks = h('div', { class: 'stack' });
  const refreshChecks = () => {
    clear(checks);
    const sdp = Number(p.prog.sdp) || 0;
    const bud = Number(p.prog.budget) || 0;
    if (sdp > 150) checks.appendChild(h('div', { class: 'alert' }, h('b', null, 'Surface de plancher > 150 m²'), ' — recours à l’architecte obligatoire pour le dépôt du permis.'));
    if (sdp && bud) checks.appendChild(h('div', { class: 'alert alert-soft' }, 'Ratio travaux : ', h('b', null, fmtEuro(Math.round(bud / sdp)) + ' / m²'), ' de surface de plancher.'));
    if (!p.client) checks.appendChild(h('div', { class: 'alert alert-soft' }, 'Maître d’ouvrage à renseigner.'));
  };

  const openPts = points.filter((x) => x.status !== 'leve');
  const todos = [];
  notes.forEach((n) => (n.todos || []).forEach((t) => { if (t.text && !t.done) todos.push({ ...t, note: n }); }));
  const recent = [
    ...notes.map((n) => ({ d: n.date || n.createdAt, t: n.titre || 'Note', s: 'Note', href: '#/p/' + p.id + '/notes/' + n.id })),
    ...points.map((x) => ({ d: (x.updatedAt || '').slice(0, 10), t: 'Point ' + x.num + ' · ' + (x.text || '').slice(0, 60), s: 'Point', href: '#/p/' + p.id + '/plans/' + x.planId + '?pt=' + x.id })),
    ...files.map((f) => ({ d: (f.createdAt || '').slice(0, 10), t: f.name, s: 'Fichier', href: '#/p/' + p.id + '/fichiers?f=' + f.folder }))
  ].sort((a, b) => (b.d || '').localeCompare(a.d || '')).slice(0, 6);

  const ents = await db.all('entreprises');
  const assignAlerts = (p.assignments || []).map((a) => ents.find((e) => e.id === a.entrepriseId)).filter((e) => e && e.decFin && daysUntil(e.decFin) < 0);

  const stat = (n, label, href) => h('a', { class: 'stat', href }, h('b', null, n), h('span', null, label));

  put(clear(body), h('div', { class: 'cols' },
    h('div', { class: 'stack' },
      h('section', { class: 'card stack' },
        h('div', { class: 'flexb' }, h('h2', { class: 'section-t', style: { margin: 0 } }, 'Identification'), saved),
        h('div', { class: 'grid g2' },
          fld('N° de dossier', inp(p, 'code')), fld('Code fichiers', inp(p, 'abbr', { maxlength: '6' })),
          fld('Nom du projet', inp(p, 'nom'), 'span2'),
          fld('Type', sel(p, 'type', PROJECT_TYPES)), fld('Mission', sel(p, 'mission', ['Mission complète', 'Jusqu’au permis', 'Architecture intérieure', 'Conseil / faisabilité', 'Suivi de chantier seul'])))),
      h('section', { class: 'card stack' },
        h('h2', { class: 'section-t', style: { margin: 0 } }, 'Maître d’ouvrage'),
        h('div', { class: 'grid g2' },
          fld('Nom', inp(p, 'client')), fld('Qualité', sel(p, 'clientQualite', ['Particulier', 'Professionnel / société', 'Maître d’ouvrage public'])),
          fld('E-mail', inp(p, 'clientEmail', { type: 'email', inputmode: 'email' })), fld('Téléphone', inp(p, 'clientTel', { type: 'tel', inputmode: 'tel' })),
          fld('Adresse du client', inp(p, 'clientAdresse'), 'span2'))),
      h('section', { class: 'card stack' },
        h('h2', { class: 'section-t', style: { margin: 0 } }, 'Terrain et urbanisme'),
        h('div', { class: 'grid g2' },
          fld('Adresse des travaux', inp(p, 'adresse'), 'span2'), fld('Commune', inp(p, 'commune')), fld('Parcelle(s)', inp(p, 'parcelle', { placeholder: 'ex. AB 123' })),
          fld('Document d’urbanisme', sel(p.urba, 'doc', ['', 'PLU', 'PLUi', 'Carte communale', 'RNU', 'PADDUC / loi Littoral', 'Autre'])), fld('Zone', inp(p.urba, 'zone')),
          fld('Servitudes', inp(p.urba, 'servitudes', { placeholder: 'ABF, littoral, PPR…' })), fld('Autorisation', sel(p.urba, 'autorisation', ['', 'Permis de construire', 'Déclaration préalable', 'Permis d’aménager', 'AT ERP', 'Sans autorisation'])),
          fld('Hauteur maximale', inp(p.urba, 'hauteur', { placeholder: 'ex. 7 m à l’égout' })), fld('Emprise maximale', inp(p.urba, 'emprise', { placeholder: 'ex. 30 %' })),
          fld('Notes réglementaires', area(p.urba, 'notes', { rows: 3 }), 'span2'))),
      h('section', { class: 'card stack' },
        h('h2', { class: 'section-t', style: { margin: 0 } }, 'Programme'),
        h('div', { class: 'grid g2' },
          fld('Surface de plancher (m²)', inp(p.prog, 'sdp', { type: 'number', inputmode: 'decimal' })), fld('Emprise au sol (m²)', inp(p.prog, 'emprise', { type: 'number', inputmode: 'decimal' })),
          fld('Niveaux', inp(p.prog, 'niveaux', { placeholder: 'ex. R+1' })), fld('Budget travaux HT (€)', inp(p.prog, 'budget', { type: 'number', inputmode: 'numeric' })),
          fld('Programme', area(p.prog, 'texte', { rows: 4, placeholder: 'Pièces, usages, attentes du client…' }), 'span2')))),
    h('div', { class: 'stack' },
      h('div', { class: 'grid g2' },
        stat(notes.length, 'Notes', '#/p/' + p.id + '/notes'), stat(plans.length, 'Plans', '#/p/' + p.id + '/plans'),
        stat(openPts.length, 'Points ouverts', '#/p/' + p.id + '/points'), stat(files.length, 'Fichiers', '#/p/' + p.id + '/fichiers')),
      checks,
      assignAlerts.length ? h('div', { class: 'alert' }, h('b', null, 'Décennale expirée'), ' : ' + assignAlerts.map((e) => e.nom).join(', ')) : null,
      validations(p),
      h('section', { class: 'card' },
        h('h2', { class: 'section-t' }, 'Actions à faire'),
        todos.length ? h('div', { class: 'items' }, todos.slice(0, 8).map((t) => h('a', { href: '#/p/' + p.id + '/notes/' + t.note.id, class: 'kv', style: { textDecoration: 'none' } }, h('span', null, t.text), h('span', { class: 'muted small' }, [t.who, t.due ? fmtShort(t.due) : ''].filter(Boolean).join(' · '))))) : h('div', { class: 'muted small' }, 'Aucune action en attente.')),
      h('section', { class: 'card' },
        h('h2', { class: 'section-t' }, 'Activité récente'),
        recent.length ? recent.map((r) => h('a', { href: r.href, class: 'kv', style: { textDecoration: 'none' } }, h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r.t), h('span', { class: 'muted small', style: { flexShrink: 0 } }, r.s + ' · ' + fmtShort(r.d)))) : h('div', { class: 'muted small' }, 'Rien pour l’instant.')),
      h('button', { class: 'btn btn-line', onclick: async () => { if (await confirmBox('Supprimer le projet « ' + p.nom + ' » et toutes ses données (notes, plans, points, fichiers) de cet appareil ?', 'Supprimer')) { await deleteProject(p.id); toast('Projet supprimé'); location.hash = '#/projets'; } } }, icon('trash', 18), 'Supprimer le projet'))));
  refreshChecks();
}

/* ---------------- Validation de phase signée ---------------- */
function validations(p) {
  const list = (p.validations || []).slice().sort((a, b) => (b.date + b.heure).localeCompare(a.date + a.heure));
  return h('section', { class: 'card' },
    h('div', { class: 'flexb', style: { marginBottom: '10px' } }, h('h2', { class: 'section-t', style: { margin: 0 } }, 'Validations signées'),
      h('button', { class: 'btn btn-sm btn-primary', onclick: () => validate(p) }, 'Faire valider ' + phase(p.phase).court)),
    list.length ? list.map((v) => h('div', { class: 'kv' }, h('span', null, v.phaseNom), h('span', { class: 'small muted' }, fmtShort(v.date) + ' · PDF dans 00_ADMIN'))) : h('div', { class: 'muted small' }, 'Aucune validation. À la fin d’une présentation, faites signer la phase sur la tablette : le PDF horodaté est rangé dans le dossier du projet.'));
}

async function validate(p) {
  const ph = phase(p.phase);
  const files = (await db.by('files', 'projectId', p.id)).filter((f) => f.folder === ph.dossier || f.phase === ph.id);
  const plans = (await db.by('plans', 'projectId', p.id)).filter((x) => !x.phase || x.phase === ph.id);
  const docs = [...plans.map((x) => ({ nom: x.nom, indice: x.indice, date: (x.createdAt || '').slice(0, 10), on: true })), ...files.filter((f) => f.mime === 'application/pdf').map((f) => ({ nom: f.name, indice: '', date: (f.createdAt || '').slice(0, 10), on: false }))];
  const decisions = h('textarea', { class: 'textarea', rows: 3, placeholder: 'Décisions prises pendant la présentation' });
  const reserves = h('textarea', { class: 'textarea', rows: 3, placeholder: 'Réserves éventuelles du client' });
  const ack = h('input', { type: 'checkbox' });
  const pad = h('div', { class: 'sketch-wrap finger', style: { height: '170px' } });
  const { sketchSurface } = await import('../ink.js');
  const surf = sketchSurface(pad, { aspect: 0.34, getPen: () => 'feutre', styleFor: () => ({ color: '#161616', size: 7 }) });
  const s = sheet({
    title: 'Validation · ' + ph.nom, wide: true,
    body: [
      h('div', { class: 'section-t' }, 'Documents présentés'),
      docs.length ? h('div', { class: 'items' }, docs.map((d) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: d.on, onchange: (e) => (d.on = e.target.checked) }), h('span', null, d.nom + (d.indice ? ' · ind. ' + d.indice : ''))))) : h('div', { class: 'muted small' }, 'Aucun plan ni PDF rattaché à cette phase. Ajoutez-les dans Plans ou Fichiers.'),
      h('label', { class: 'field' }, h('span', null, 'Décisions actées'), decisions),
      h('label', { class: 'field' }, h('span', null, 'Réserves du maître d’ouvrage'), reserves),
      h('label', { class: 'check' }, ack, h('span', null, 'Le maître d’ouvrage valide la phase « ' + ph.nom + ' » sur la base des documents cochés.')),
      h('div', { class: 'field' }, h('span', { class: 'lbl-s' }, 'Signature du maître d’ouvrage'), pad, h('button', { class: 'btn btn-sm btn-line', style: { alignSelf: 'flex-start' }, onclick: () => surf.clear() }, 'Effacer'))],
    foot: [h('button', { class: 'btn btn-line', onclick: () => s.close() }, 'Annuler'), h('button', { class: 'btn btn-primary', onclick: sign }, 'Signer et clôturer la phase')]
  });
  async function sign() {
    if (!ack.checked) { toast('Le client doit cocher la validation'); return; }
    if (!surf.strokes.length) { toast('Signature manquante'); return; }
    const c = document.createElement('canvas'); c.width = 900; c.height = 306;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    (await import('../ink.js')).drawStrokes(ctx, surf.strokes, 0.9);
    const v = { id: uid(), phase: ph.id, phaseNom: ph.nom, date: todayISO(), heure: nowTime(), docs: docs.filter((d) => d.on), decisions: decisions.value, reserves: reserves.value, signature: c.toDataURL('image/png') };
    toast('Génération du PDF…');
    const { buildValidationPDF } = await import('../pdfkit.js');
    const blob = await buildValidationPDF({ project: p, v, getSetting: db.setting });
    const name = fileName({ date: v.date, code: p.abbr, phase: ph.id, type: 'VAL', objet: 'Validation ' + ph.court, ind: 'A', ext: 'pdf' });
    await db.put('files', { id: uid(), projectId: p.id, folder: '00_ADMIN', name, mime: 'application/pdf', size: blob.size, blob, phase: ph.id, createdAt: new Date().toISOString(), source: 'validation' });
    p.validations = (p.validations || []).concat([{ ...v, signature: undefined, file: name }]);
    const idx = PHASES.findIndex((x) => x.id === ph.id);
    if (idx >= 0 && idx < PHASES.length - 2) p.phase = PHASES[idx + 1].id;
    await db.put('projects', p);
    s.close();
    toast('Phase validée · PDF rangé dans 00_ADMIN');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }
}
export { FOLDERS };
