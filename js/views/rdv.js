// Mode rendez-vous client : résumé du projet à montrer sur la tablette, fiche A4 à imprimer,
// raccourcis Google (Drive, Agenda, Maps, Gmail, Meet). Aucun compte Google n'est requis : ce sont des liens.
import { h, put, clear, icon, debounce, toast, fmtDate, fmtShort, fmtEuro, todayISO, blobURL, shareOrDownload } from '../lib.js';
import { db } from '../db.js';
import { PHASES, phase, fileName, fileCode } from '../data.js';
import { logoSVG as brandLogo } from '../brand.js';

const PHASE_TEXT = {
  FAI: 'Analyse du terrain, des règles d’urbanisme et du programme.',
  ESQ: 'Premières intentions : implantation, volumes, organisation des espaces.',
  APS: 'Plans précisés, aspect extérieur, première estimation des travaux.',
  APD: 'Projet arrêté : surfaces, matériaux, estimation définitive.',
  PC: 'Dossier de demande d’autorisation d’urbanisme et instruction.',
  PRO: 'Plans et descriptifs détaillés pour la construction.',
  DCE: 'Dossier de consultation des entreprises, lot par lot.',
  ACT: 'Analyse des offres et choix des entreprises.',
  DET: 'Suivi du chantier : visites, comptes rendus, situations.',
  AOR: 'Réception des travaux et levée des réserves.',
  CLOS: 'Projet clos, garanties en cours.'
};

export const gcal = ({ title, start, end, location, details, guests }) => {
  const f = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const u = new URL('https://calendar.google.com/calendar/render');
  u.searchParams.set('action', 'TEMPLATE'); u.searchParams.set('text', title);
  if (start) u.searchParams.set('dates', f(start) + '/' + f(end || new Date(start.getTime() + 3600e3)));
  if (location) u.searchParams.set('location', location);
  if (details) u.searchParams.set('details', details);
  if (guests) u.searchParams.set('add', guests);
  return u.toString();
};
const gmail = ({ to, su, body }) => 'https://mail.google.com/mail/?view=cm&fs=1' + (to ? '&to=' + encodeURIComponent(to) : '') + '&su=' + encodeURIComponent(su) + '&body=' + encodeURIComponent(body);
const gmaps = (q) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);

export async function render(view, { project: p }) {
  const [notes, plans, points, files] = await Promise.all([db.by('notes', 'projectId', p.id), db.by('plans', 'projectId', p.id), db.by('points', 'projectId', p.id), db.by('files', 'projectId', p.id)]);
  p.rdv = p.rdv || { agenda: '', suite: '' };
  const save = debounce(() => db.put('projects', p), 400);
  const ph = phase(p.phase); const idx = PHASES.findIndex((x) => x.id === ph.id);
  const lastNotes = notes.slice().sort((a, b) => (b.date + (b.heure || '')).localeCompare(a.date + (a.heure || ''))).slice(0, 3);
  const decisions = lastNotes.flatMap((n) => (n.decisions || []).filter((d) => d.text).map((d) => ({ text: d.text, date: n.date })));
  const todos = notes.flatMap((n) => (n.todos || []).filter((t) => t.text && !t.done).map((t) => ({ text: t.text, who: t.who })));
  const site = [p.adresse, p.commune].filter(Boolean).join(', ');
  const area = (key, ph2) => { const t = h('textarea', { class: 'textarea rdv-area', rows: 4, placeholder: ph2 }); t.value = p.rdv[key] || ''; t.addEventListener('input', () => { p.rdv[key] = t.value; save(); }); return t; };

  const driveInput = h('input', { class: 'input', type: 'url', placeholder: 'Coller le lien du dossier Drive du projet', value: p.driveUrl || '' });
  driveInput.addEventListener('change', () => { p.driveUrl = driveInput.value.trim(); save(); drawG(); });
  const gBox = h('div', { class: 'rdv-google' });
  const drawG = () => {
    const next = new Date(); next.setDate(next.getDate() + 14); next.setHours(10, 0, 0, 0);
    const resume = 'Bonjour,\n\nVoici le résumé de notre rendez-vous du ' + fmtDate(todayISO()) + ' pour le projet ' + p.nom + '.\n\nPhase en cours : ' + ph.nom + '.\n' +
      (p.rdv.agenda ? '\nPoints abordés :\n' + p.rdv.agenda + '\n' : '') + (p.rdv.suite ? '\nProchaines étapes :\n' + p.rdv.suite + '\n' : '') + '\nBien cordialement,\nMichel Mangion\nSTATERA Architecture';
    const g = (href, ic, label, sub) => h('a', { class: 'gbtn', href, target: '_blank', rel: 'noopener' }, icon(ic, 22), h('span', null, h('b', null, label), h('small', null, sub)));
    put(clear(gBox),
      p.driveUrl ? g(p.driveUrl, 'folder', 'Dossier Drive', 'Ouvrir le dossier du projet') : h('label', { class: 'gbtn gbtn-in' }, icon('folder', 22), h('span', null, h('b', null, 'Dossier Drive'), driveInput)),
      g(gcal({ title: 'RDV ' + p.nom + ' · STATERA', start: next, location: site, details: 'Projet ' + (p.code || '') + ' · ' + p.nom + (p.rdv.suite ? '\n\nÀ préparer :\n' + p.rdv.suite : ''), guests: p.clientEmail }), 'calendar', 'Prochain RDV', 'Créer dans Google Agenda'),
      site ? g(gmaps(site), 'pin', 'Le terrain', 'Voir dans Google Maps') : null,
      g(gmail({ to: p.clientEmail, su: 'Résumé de notre rendez-vous · ' + p.nom, body: resume }), 'mail', 'Envoyer le résumé', 'Brouillon Gmail au client'),
      g('https://meet.google.com/new', 'phone', 'Visio', 'Lancer un Google Meet'));
  };

  async function printSheet() {
    toast('Préparation de la fiche…');
    const { buildRdvPDF } = await import('../pdfkit.js');
    const blob = await buildRdvPDF({ project: p, decisions, todos, plans, getSetting: db.setting });
    const name = fileName({ date: todayISO(), code: fileCode(p), phase: p.phase, type: 'CR', objet: 'Fiche-RDV', ind: 'A', ext: 'pdf' });
    const { uid } = await import('../lib.js');
    await db.put('files', { id: uid(), projectId: p.id, folder: ph.dossier, sub: '02_Travail', name, mime: 'application/pdf', size: blob.size, blob, phase: p.phase, createdAt: new Date().toISOString(), source: 'note' });
    shareOrDownload(blob, name);
  }

  const page = h('div', { class: 'rdv' },
    h('header', { class: 'rdv-head' },
      h('div', { class: 'rdv-logo' }, brandLogo()),
      h('div', { class: 'rdv-actions' },
        h('button', { class: 'btn btn-line', onclick: printSheet }, icon('download', 18), 'Fiche A4'),
        h('a', { class: 'btn btn-line btn-icon', href: '#/p/' + p.id, 'aria-label': 'Quitter le mode rendez-vous' }, icon('close', 18)))),
    h('section', { class: 'rdv-hero' },
      h('div', { class: 'eyebrow' }, 'Rendez-vous du ' + fmtDate(todayISO())),
      h('h1', { class: 'rdv-title' }, p.nom),
      h('div', { class: 'rdv-sub' }, [p.client, site].filter(Boolean).join(' · '))),
    h('section', { class: 'rdv-phases' },
      PHASES.filter((x) => x.id !== 'CLOS').map((x, i) => h('div', { class: 'rdv-ph' + (i < idx ? ' done' : i === idx ? ' now' : '') }, h('b', null, x.court), h('span', null, x.nom))),
      h('p', { class: 'rdv-phtext' }, h('b', null, 'Où en est-on : '), ph.nom.toLowerCase() + '. ' + (PHASE_TEXT[ph.id] || ''))),
    h('div', { class: 'rdv-grid' },
      h('section', { class: 'rdv-card' }, h('h2', null, 'Le projet'),
        [['Programme', p.type], ['Surface de plancher', p.prog && p.prog.sdp ? p.prog.sdp + ' m²' : ''], ['Niveaux', p.prog && p.prog.niveaux], ['Budget travaux HT', p.prog && p.prog.budget ? fmtEuro(Number(p.prog.budget)) : ''], ['Parcelle', p.parcelle]].filter(([, v]) => v).map(([k, v]) => h('div', { class: 'kv' }, h('span', null, k), h('span', null, v))),
        (p.prog && p.prog.texte) ? h('p', { class: 'small', style: { whiteSpace: 'pre-wrap', marginTop: '10px' } }, p.prog.texte) : null),
      h('section', { class: 'rdv-card' }, h('h2', null, 'Décidé ensemble'),
        decisions.length ? h('ul', { class: 'rdv-list' }, decisions.slice(0, 8).map((d) => h('li', null, d.text, h('small', null, ' · ' + fmtShort(d.date))))) : h('p', { class: 'muted small' }, 'Les décisions notées dans les comptes rendus apparaîtront ici.'),
        todos.length ? h('div', null, h('h3', null, 'En attente'), h('ul', { class: 'rdv-list' }, todos.slice(0, 6).map((t) => h('li', null, t.text, t.who ? h('small', null, ' · ' + t.who) : null)))) : null),
      h('section', { class: 'rdv-card' }, h('h2', null, 'Aujourd’hui'), area('agenda', 'Points à aborder, questions du client…')),
      h('section', { class: 'rdv-card' }, h('h2', null, 'La suite'), area('suite', 'Prochaines étapes, documents à fournir, date du prochain rendez-vous…'))),
    plans.length ? h('section', { class: 'rdv-card' }, h('h2', null, 'Plans à montrer'),
      h('div', { class: 'rdv-plans' }, plans.slice(0, 8).map((pl) => h('a', { class: 'rdv-plan', href: '#/p/' + p.id + '/plans/' + pl.id }, pl.thumb ? h('img', { src: blobURL(pl.id + 't', pl.thumb), alt: '' }) : h('div', { class: 'ph' }), h('span', null, pl.nom || 'Plan'))))) : null,
    h('section', { class: 'rdv-card' }, h('h2', null, 'Google'), gBox,
      h('p', { class: 'small muted' }, 'Liens directs vers ton compte Google : rien n’est envoyé sans ta validation. La synchronisation automatique du Drive viendra avec la connexion Google.')));
  drawG();
  clear(view).appendChild(page);
  window.scrollTo(0, 0);
}
