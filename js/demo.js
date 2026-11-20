// Projet d'exemple (données fictives) pour découvrir l'application
import { uid, todayISO } from './lib.js';
import { db } from './db.js';
import { planThumb } from './pdfkit.js';

const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export async function createDemo() {
  const already = (await db.all('projects')).find((x) => x.demo || x.nom === 'Projet d’exemple');
  if (already) return already.id;
  const ents = [
    { nom: 'Exemple Maçonnerie', lots: ['03'], contact: '[Contact]', email: 'maconnerie@exemple.fr', tel: '', decFin: addDays(200) },
    { nom: 'Exemple Menuiseries', lots: ['04', '14'], contact: '[Contact]', email: 'menuiseries@exemple.fr', tel: '', decFin: addDays(-20) },
    { nom: 'Exemple Électricité', lots: ['13'], contact: '[Contact]', email: 'elec@exemple.fr', tel: '', decFin: addDays(320) },
    { nom: 'Exemple Plomberie', lots: ['11', '12'], contact: '[Contact]', email: 'plomberie@exemple.fr', tel: '', decFin: addDays(150) }
  ].map((e) => ({ id: uid(), ...e, notes: 'Entreprise fictive du projet d’exemple.', createdAt: new Date().toISOString() }));
  for (const e of ents) await db.put('entreprises', e);

  const p = {
    id: uid(), demo: true, code: new Date().getFullYear() + '-000', abbr: 'DEM', nom: 'Projet d’exemple', client: 'Client exemple', clientQualite: 'Particulier',
    commune: '[Commune]', adresse: '[Adresse des travaux]', type: 'Maison individuelle neuve', mission: 'Mission complète', phase: 'DET',
    urba: { doc: 'PLU', zone: '[Zone]', autorisation: 'Permis de construire', hauteur: '[7 m à l’égout]', emprise: '[30 %]' },
    prog: { sdp: 112, niveaux: 'R+1', budget: 0, texte: 'Séjour au sud, cuisine ouverte, 4 chambres dont une au rez-de-chaussée. Données fictives.' },
    assignments: [{ lot: '03', entrepriseId: ents[0].id }, { lot: '04', entrepriseId: ents[1].id }, { lot: '13', entrepriseId: ents[2].id }, { lot: '11', entrepriseId: ents[3].id }],
    validations: [], createdAt: new Date().toISOString()
  };
  await db.put('projects', p);

  const res = await fetch(new URL('../assets/demo/plan-exemple.pdf', import.meta.url));
  const blob = new File([await res.blob()], 'plan-exemple.pdf', { type: 'application/pdf' });
  const plan = { id: uid(), projectId: p.id, nom: 'Plans EXE · RDC et R+1', phase: 'DCE', indice: 'C', echelle: '1/100', kind: 'pdf', mime: 'application/pdf', blob, pages: 2, createdAt: new Date().toISOString() };
  plan.thumb = await planThumb(plan);
  await db.put('plans', plan);

  const X = (v) => v / 1191, Y = (v) => v / 842;
  const pts = [
    [1, 500, 130, '03', 'encours', 'Reprendre l’arase du mur nord avant la pose des menuiseries.', addDays(7)],
    [2, 780, 560, '11', 'ouvert', 'Réaliser l’essai d’étanchéité du réseau d’eaux usées avant remblai.', addDays(5)],
    [3, 340, 630, '04', 'ouvert', 'Transmettre le calepinage de la baie du séjour pour validation de la maîtrise d’œuvre.', addDays(10)],
    [4, 200, 560, '13', 'ouvert', 'Positionner les prises du plan de travail selon le plan EXE indice C.', addDays(10)],
    [5, 700, 250, '03', 'leve', 'Réservation de la gaine VMC en dalle : conforme.', addDays(-3)],
    [6, 640, 460, 'GEN', 'ouvert', 'Nettoyage du chantier et évacuation des gravats à chaque fin de semaine.', '']
  ];
  for (const [num, x, y, lt, st, text, due] of pts) {
    await db.put('points', { id: uid(), projectId: p.id, planId: plan.id, page: 0, x: X(x), y: Y(y), num, lot: lt, nature: 'obs', status: st, text, due, photos: [], date: addDays(-7), leveAt: st === 'leve' ? addDays(-1) : '', createdAt: new Date().toISOString() });
  }
  // Annotations sur la page 1 : trait le long du mur nord et un texte
  const k = 1000 / 1191;
  const line = []; for (let i = 0; i <= 30; i++) line.push([(160 + i * 23.5) * k, 112 * k + Math.sin(i / 3) * 1.5, 0.5]);
  await db.put('pages', { key: plan.id + ':0', planId: plan.id, page: 0, strokes: [{ id: uid(), pen: 'feutre', pts: line, pressure: false }], texts: [{ id: uid(), x: X(560), y: Y(96), text: 'Arase à reprendre sur tout le linéaire' }] });

  await db.put('notes', {
    id: uid(), projectId: p.id, type: 'presentation', titre: 'Présentation de l’APS', date: addDays(-40), heure: '10:00', lieu: 'Agence', participants: 'Client exemple, M. Mangion', phase: 'APS',
    agenda: [{ text: 'Rappel du programme et du budget', done: true }, { text: 'Présentation des plans', done: true }, { text: 'Points à arbitrer', done: true }, { text: 'Validation de la phase', done: false }],
    body: 'Le client apprécie l’organisation du rez-de-chaussée. Souhaite une baie plus large au séjour et un cellier attenant à la cuisine. Budget à confirmer après estimation APD.',
    decisions: [{ text: 'Baie du séjour portée à 4,00 m.' }, { text: 'Étudier un cellier contre la cuisine.' }],
    todos: [{ text: 'Mettre à jour les plans (indice B)', who: 'MM', due: addDays(-30), done: true }, { text: 'Envoyer l’estimation APD', who: 'MM', due: addDays(3), done: false }],
    sketch: [{ id: uid(), pen: 'stylo', pts: [[120, 120, .5], [520, 118, .5], [522, 470, .5], [118, 472, .5], [120, 120, .5]], pressure: false }, { id: uid(), pen: 'stylo', pts: [[320, 120, .5], [320, 470, .5]], pressure: false }, { id: uid(), pen: 'feutre', pts: [[180, 520, .5], [460, 520, .5]], pressure: false }],
    sketchAspect: 0.62, photos: [], createdAt: new Date().toISOString()
  });
  await db.put('reunions', { id: uid(), projectId: p.id, num: 1, date: addDays(-7), heure: '08:30', presence: { moe: 'P', moa: 'P', '02': 'P', '09': 'A' }, general: 'Démarrage du gros œuvre. Installation de chantier conforme.', avancement: 'Fondations coulées, élévation des murs du rez-de-chaussée en cours.', autres: '', prochaine: todayISO(), prochaineHeure: '08:30', sent: { moa: addDays(-6), '02': addDays(-6) }, createdAt: new Date().toISOString() });
  window.dispatchEvent(new Event('statera:refresh-nav'));
  return p.id;
}
