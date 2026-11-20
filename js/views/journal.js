// Journal du projet : notes, réflexions, rendez-vous et visites de chantier dans une seule liste.
// Chaque séance a les mêmes outils (écoute et dictée, croquis, plans, photos, décisions, compte rendu PDF) ;
// le type choisi change le titre, la numérotation et le modèle du compte rendu.
import { h, put, clear, icon, sheet, fmtDate } from '../lib.js';
import { db } from '../db.js';
import { NOTE_TYPES, noteType, VISIT_TYPES, visitType } from '../data.js';
import { miniSketch } from '../ink.js';

const GROUPS = [
  { id: 'notes', nom: 'Notes et réflexions', match: (e) => e.kind === 'note' && ['reflexion', 'libre', 'appel'].includes(e.type) },
  { id: 'rdv', nom: 'Rendez-vous', match: (e) => e.kind === 'note' && !['reflexion', 'libre', 'appel'].includes(e.type) },
  { id: 'chantier', nom: 'Réunions de chantier', match: (e) => e.kind === 'visite' && e.type === 'chantier' },
  { id: 'reception', nom: 'OPR · Réception · Levée', match: (e) => e.kind === 'visite' && e.type !== 'chantier' }
];

export function chooseType(p, plans) {
  const go = (fn) => () => { s.close(); fn(); };
  const row = (title, sub, fn) => h('button', { class: 'row', onclick: go(fn) }, h('span', { class: 'row-main' }, h('span', { class: 'row-t' }, title), h('span', { class: 'row-s' }, sub)), h('span', { class: 'chev' }, icon('chev', 18)));
  const note = (t) => () => { location.hash = '#/p/' + p.id + '/notes/new?type=' + t; };
  const visit = (t) => async () => { const { createVisit } = await import('./chantier.js'); createVisit(p, t, plans); };
  const s = sheet({ title: 'Nouvelle séance', body: [
    h('div', { class: 'small muted' }, 'Toutes les séances ont les mêmes outils : écoute et dictée, croquis sur feuille, photo ou plan, photos, décisions, actions, compte rendu PDF.'),
    h('h3', { class: 'section-t' }, 'Conception'),
    h('div', { class: 'list' },
      row('Note / réflexion', 'Pour toi : idées, croquis, points à creuser', note('reflexion')),
      row('RDV client', 'Rendez-vous avec le maître d’ouvrage', note('rdv')),
      row('Visite de site', 'Relevé, existant, terrain', note('site')),
      row('Présentation de phase', 'Esquisse, APS, APD… au client', note('presentation')),
      row('RDV urbanisme / mairie', 'Service instructeur, ABF, mairie', note('urbanisme')),
      row('Réunion BET / partenaires', 'Structure, thermique, géomètre…', note('bet')),
      row('Appel téléphonique', 'Trace d’un échange au téléphone', note('appel'))),
    h('h3', { class: 'section-t' }, 'Chantier'),
    h('div', { class: 'list' }, VISIT_TYPES.map((t) => row(t.nom, t.titre + ' · numérotée, points sur plans, diffusion par lot', visit(t.id)))) ] });
}

export async function render(body, ctx) {
  const { project: p, params } = ctx;
  const [notes, reunions] = await Promise.all([db.by('notes', 'projectId', p.id), db.by('reunions', 'projectId', p.id)]);
  const entries = [
    ...notes.map((n) => ({ kind: 'note', type: n.type, id: n.id, date: n.date || '', heure: n.heure || '', o: n })),
    ...reunions.map((r) => ({ kind: 'visite', type: r.type || 'chantier', id: r.id, date: r.date || '', heure: r.heure || '', o: r }))
  ].sort((a, b) => (b.date + b.heure).localeCompare(a.date + a.heure));
  let filter = 'tous';
  const listBox = h('div');
  const card = (e) => {
    if (e.kind === 'note') {
      const n = e.o; const open = (n.todos || []).filter((t) => t.text && !t.done).length;
      return h('a', { class: 'note-card', href: '#/p/' + p.id + '/notes/' + n.id },
        h('div', { class: 'flexb' }, h('span', { class: 'tag' }, noteType(n.type).court), h('span', { class: 'small muted' }, fmtDate(n.date) + (n.heure ? ' · ' + n.heure : ''))),
        h('div', { style: { fontSize: '18px', fontWeight: 500 } }, n.titre || noteType(n.type).nom),
        n.body ? h('div', { class: 'ex' }, n.body) : null,
        n.sketch && n.sketch.length ? miniSketch(n.sketch, n.sketchAspect || 0.62) : null,
        h('div', { class: 'small muted', style: { marginTop: 'auto' } }, [
          (n.decisions || []).filter((d) => d.text).length ? (n.decisions || []).filter((d) => d.text).length + ' décision(s)' : null,
          open ? open + ' action(s) ouverte(s)' : null,
          (n.sketches || []).length > 1 ? n.sketches.length + ' croquis' : null,
          (n.photos || []).length ? n.photos.length + ' photo(s)' : null].filter(Boolean).join(' · ') || ' '));
    }
    const r = e.o; const vt = visitType(r.type);
    const sent = Object.keys(r.sent || {});
    return h('a', { class: 'note-card note-card-visit', href: '#/p/' + p.id + '/chantier?r=' + r.id },
      h('div', { class: 'flexb' }, h('span', { class: 'tag tag-fill' }, vt.court + ' n°' + r.num), h('span', { class: 'small muted' }, fmtDate(r.date) + (r.heure ? ' · ' + r.heure : ''))),
      h('div', { style: { fontSize: '18px', fontWeight: 500 } }, vt.nom + ' n°' + r.num),
      r.general ? h('div', { class: 'ex' }, r.general) : r.avancement ? h('div', { class: 'ex' }, r.avancement) : null,
      r.sketch && r.sketch.length ? miniSketch(r.sketch, r.sketchAspect || 0.62) : null,
      h('div', { class: 'small muted', style: { marginTop: 'auto' } }, [(r.plans || []).length ? r.plans.length + ' plan(s)' : null, sent.length ? 'CR envoyé : ' + sent.map((k) => (k === 'moa' ? 'MOA' : 'lot ' + k)).join(', ') : 'CR non diffusé'].filter(Boolean).join(' · ')));
  };
  const draw = () => {
    const g = GROUPS.find((x) => x.id === filter);
    const list = g ? entries.filter(g.match) : entries;
    put(clear(listBox), !entries.length
      ? h('div', { class: 'empty' }, h('div', { class: 'title-sm' }, 'Journal vide'),
        h('div', null, 'Chaque note, réflexion, rendez-vous ou visite de chantier devient une séance datée, avec écoute et dictée, croquis, photos, décisions et compte rendu PDF.'),
        h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', onclick: () => chooseType(p, ctx.plans) }, icon('plus', 18), 'Nouvelle séance')))
      : list.length ? h('div', { class: 'note-cards' }, list.map(card)) : h('div', { class: 'empty' }, 'Rien dans cette catégorie.'));
  };
  const chip = (id, label) => h('button', { class: 'chip', 'aria-pressed': String(filter === id), onclick: (ev) => { filter = id; ev.currentTarget.parentElement.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', String(b === ev.currentTarget))); draw(); } }, label);
  const entBox = h('div', { class: 'mt' });
  put(clear(body),
    h('div', { class: 'flexb mb' },
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Type de séance' }, chip('tous', 'Tout'), GROUPS.filter((g) => entries.some(g.match)).map((g) => chip(g.id, g.nom))),
      h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', onclick: () => chooseType(p, ctx.plans) }, icon('plus', 18), 'Nouvelle séance'))),
    listBox, entBox);
  draw();
  // Entreprises du chantier (affectation des lots) : utile dès qu'il y a des visites ou des lots affectés
  if ((p.assignments || []).length || reunions.length || ['DCE', 'ACT', 'DET', 'AOR'].includes(p.phase)) {
    const { render: chantier } = await import('./chantier.js');
    await chantier(entBox, { ...ctx, params: { ...params, q: {} }, only: 'entreprises' });
  }
  if (params.q && params.q.new) chooseType(p, ctx.plans);
}
