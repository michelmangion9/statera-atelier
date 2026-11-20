// Liste des projets
import { h, put, clear, icon, sheet, uid, toast, fmtShort } from '../lib.js';
import { db } from '../db.js';
import { PHASES, phase } from '../data.js';

export const PROJECT_TYPES = ['Maison individuelle neuve', 'Extension', 'Surélévation', 'Rénovation', 'Réhabilitation', 'Architecture intérieure', 'Établissement recevant du public', 'Logements collectifs', 'Équipement public', 'Autre'];

export async function render(view) {
  let filter = 'cours', search = '';
  const [projects, points] = await Promise.all([db.all('projects'), db.all('points')]);
  const openBy = {};
  points.forEach((p) => { if (p.status !== 'leve') openBy[p.projectId] = (openBy[p.projectId] || 0) + 1; });

  const listBox = h('div');
  const draw = () => {
    clear(listBox);
    let rows = projects.slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    if (filter === 'cours') rows = rows.filter((p) => p.phase !== 'CLOS');
    if (filter === 'clos') rows = rows.filter((p) => p.phase === 'CLOS');
    if (search) { const s = search.toLowerCase(); rows = rows.filter((p) => [p.nom, p.client, p.commune, p.code].join(' ').toLowerCase().includes(s)); }
    if (!projects.length) {
      listBox.appendChild(h('div', { class: 'empty' },
        h('div', { class: 'title-sm' }, 'Aucun projet pour l’instant'),
        h('div', null, 'Créez votre premier dossier, ou chargez le projet d’exemple pour découvrir l’application.'),
        h('div', { class: 'actions' },
          h('button', { class: 'btn btn-primary', onclick: newProject }, icon('plus', 18), 'Nouveau projet'),
          h('button', { class: 'btn', onclick: loadDemo }, 'Projet d’exemple'))));
      return;
    }
    if (!rows.length) { listBox.appendChild(h('div', { class: 'empty' }, 'Aucun projet ne correspond.')); return; }
    listBox.appendChild(h('div', { class: 'list' }, rows.map((p) => h('a', { class: 'row', href: '#/p/' + p.id },
      h('span', { class: 'row-code' }, p.code || '—'),
      h('span', { class: 'row-main' },
        h('span', { class: 'row-t' }, p.nom || 'Sans nom'),
        h('span', { class: 'row-s' }, [p.client, p.commune, p.type].filter(Boolean).join(' · ') || '—')),
      openBy[p.id] ? h('span', { class: 'tag', title: 'Points ouverts' }, openBy[p.id] + ' pt' + (openBy[p.id] > 1 ? 's' : '')) : null,
      h('span', { class: p.phase === 'CLOS' ? 'tag tag-dash' : 'tag tag-fill' }, phase(p.phase).court),
      h('span', { class: 'chev' }, icon('chev', 18))))));
  };

  const segBtn = (id, label) => h('button', { 'aria-pressed': String(filter === id), onclick: (e) => { filter = id; e.currentTarget.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); draw(); } }, label);

  clear(view).appendChild(h('div', { class: 'page' },
    h('header', { class: 'page-head' },
      h('div', null, h('div', { class: 'eyebrow' }, 'STATERA Atelier'), h('h1', { class: 'title' }, 'Projets'),
        h('div', { class: 'sub' }, projects.length ? projects.length + ' dossier' + (projects.length > 1 ? 's' : '') + ' sur cet appareil' : 'Vos dossiers, notes, plans et chantiers')),
      h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', onclick: newProject }, icon('plus', 18), 'Nouveau projet'))),
    projects.length ? h('div', { class: 'flexb mb' },
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Filtre' }, segBtn('cours', 'En cours'), segBtn('clos', 'Clos'), segBtn('tous', 'Tous')),
      h('input', { class: 'input', type: 'search', placeholder: 'Rechercher un projet, un client, une commune…', 'aria-label': 'Rechercher', style: { maxWidth: '360px' }, oninput: (e) => { search = e.target.value; draw(); } })) : null,
    listBox));
  draw();

  async function loadDemo() {
    const { createDemo } = await import('../demo.js');
    const id = await createDemo();
    toast('Projet d’exemple chargé');
    location.hash = '#/p/' + id;
  }
}

export async function nextCode() {
  const y = new Date().getFullYear();
  const all = await db.all('projects');
  const nums = all.map((p) => (p.code || '').match(new RegExp('^' + y + '-(\\d+)'))).filter(Boolean).map((m) => Number(m[1]));
  return y + '-' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
}

export async function newProject() {
  const code = await nextCode();
  const f = {
    code: h('input', { class: 'input', value: code }),
    abbr: h('input', { class: 'input', placeholder: 'ex. OLM', maxlength: '6', style: { textTransform: 'uppercase' } }),
    nom: h('input', { class: 'input', placeholder: 'ex. Maison Ortoli' }),
    client: h('input', { class: 'input', placeholder: 'Nom du maître d’ouvrage' }),
    commune: h('input', { class: 'input' }),
    type: h('select', { class: 'select' }, PROJECT_TYPES.map((t) => h('option', null, t))),
    phase: h('select', { class: 'select' }, PHASES.filter((p) => p.id !== 'CLOS').map((p) => h('option', { value: p.id, selected: p.id === 'ESQ' || null }, p.court + ' · ' + p.nom)))
  };
  const fld = (label, el, cls) => h('label', { class: 'field ' + (cls || '') }, h('span', null, label), el);
  const s = sheet({
    title: 'Nouveau projet',
    body: [fld('N° d\u2019affaire', f.code),
      fld('Nom du projet', f.nom), fld('Maître d’ouvrage', f.client),
      h('div', { class: 'grid g2' }, fld('Commune', f.commune), fld('Phase', f.phase)), fld('Type', f.type),
      h('div', { class: 'alert alert-soft small' }, 'Dossier Drive : AAAA-NNN_NOM. Fichiers : AAMMJJ_AANNN_PHASE_TYPE_OBJET_IND.')],
    foot: [h('button', { class: 'btn btn-line', onclick: () => s.close() }, 'Annuler'), h('button', { class: 'btn btn-primary', onclick: create }, 'Créer le projet')]
  });
  async function create() {
    if (!f.nom.value.trim()) { f.nom.focus(); toast('Indiquez le nom du projet'); return; }
    const abbr = (f.abbr.value || f.nom.value.replace(/[^A-Za-z]/g, '').slice(0, 3)).toUpperCase();
    const p = { id: uid(), code: f.code.value.trim(), abbr, nom: f.nom.value.trim(), client: f.client.value.trim(), commune: f.commune.value.trim(), type: f.type.value, phase: f.phase.value, assignments: [], createdAt: new Date().toISOString() };
    await db.put('projects', p);
    s.close();
    location.hash = '#/p/' + p.id;
  }
}
export { fmtShort };
