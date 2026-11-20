// Projets : la liste vient du Google Drive (dossiers « AAAA-NNN_CLIENT_COMMUNE ») ; chaque projet de l'Atelier
// est relié à son dossier. Un nouveau projet crée son dossier dans le Drive à partir du dossier type.
import { h, put, clear, icon, sheet, uid, toast, fmtShort, confirmBox } from '../lib.js';
import { db, deleteProject } from '../db.js';
import { PHASES, phase, driveFolderName } from '../data.js';
import * as gd from '../gdrive.js';

export const PROJECT_TYPES = ['Maison individuelle neuve', 'Extension', 'Surélévation', 'Rénovation', 'Réhabilitation', 'Architecture intérieure', 'Établissement recevant du public', 'Logements collectifs', 'Équipement public', 'Autre'];

export async function render(view) {
  let search = '';
  const [local, points] = await Promise.all([db.all('projects'), db.all('points')]);
  const openBy = {};
  points.forEach((p) => { if (p.status !== 'leve') openBy[p.projectId] = (openBy[p.projectId] || 0) + 1; });
  const linked = local.filter((p) => p.drive && p.drive.id);
  const unlinked = local.filter((p) => !(p.drive && p.drive.id));
  const online = gd.available() && !!(await gd.ensureToken());
  let drive = null, driveErr = '';
  const listBox = h('div');
  const status = h('div', { class: 'sub' });

  const row = (p, f) => h('a', { class: 'row', href: '#', onclick: (e) => { e.preventDefault(); openProject(p, f); } },
    h('span', { class: 'row-code' }, (p && p.code) || (f && gd.parseProjectFolder(f.name).code) || '—'),
    h('span', { class: 'row-main' },
      h('span', { class: 'row-t' }, (f && f.name) || driveFolderName(p)),
      h('span', { class: 'row-s' }, p ? [p.nom, p.type].filter(Boolean).join(' · ') + (p.updatedAt ? ' · ouvert le ' + fmtShort(p.updatedAt) : '') : 'Dans le Drive · modifié le ' + fmtShort(f.modifiedTime))),
    p && openBy[p.id] ? h('span', { class: 'tag', title: 'Points ouverts' }, openBy[p.id] + ' pt' + (openBy[p.id] > 1 ? 's' : '')) : null,
    p ? h('span', { class: p.phase === 'CLOS' ? 'tag tag-dash' : 'tag tag-fill' }, phase(p.phase).court) : h('span', { class: 'tag tag-dash' }, 'Drive'),
    h('span', { class: 'chev' }, icon('chev', 18)));

  const draw = () => {
    clear(listBox);
    const match = (t) => !search || t.toLowerCase().includes(search.toLowerCase());
    let rows;
    if (drive) {
      rows = drive.map((f) => ({ f, p: linked.find((p) => p.drive.id === f.id) })).filter(({ f, p }) => match(f.name + ' ' + (p ? p.nom + ' ' + (p.client || '') : '')));
    } else {
      rows = linked.map((p) => ({ p, f: null })).filter(({ p }) => match(driveFolderName(p) + ' ' + p.nom));
    }
    if (!rows.length) listBox.appendChild(h('div', { class: 'empty' }, drive ? 'Aucun dossier projet dans ton Drive. Crée le premier avec « Nouveau projet ».' : 'Aucun projet disponible hors ligne sur cet appareil.'));
    else listBox.appendChild(h('div', { class: 'list' }, rows.map(({ p, f }) => row(p, f))));
    if (unlinked.length) {
      listBox.appendChild(h('section', { class: 'card stack mt' },
        h('div', { class: 'flexb' }, h('h2', { class: 'section-t', style: { margin: 0 } }, 'Sur cet appareil, sans dossier Drive (' + unlinked.length + ')'),
          h('button', { class: 'btn btn-sm btn-line', onclick: async () => {
            if (!await confirmBox('Retirer de cet appareil les ' + unlinked.length + ' projet(s) non reliés au Drive (projets d’exemple, essais) ? Rien n’est touché dans le Drive.', 'Retirer')) return;
            for (const p of unlinked) await deleteProject(p.id);
            toast('Projets retirés de l’appareil'); render(view);
          } }, 'Retirer de l’appareil')),
        h('div', { class: 'small muted' }, 'Projets d’exemple ou créés avant la connexion au Drive. Ouvre-les puis « Fichiers › Relier au Drive » pour les rattacher à un dossier.'),
        h('div', { class: 'list' }, unlinked.map((p) => h('a', { class: 'row', href: '#/p/' + p.id }, h('span', { class: 'row-code' }, p.code || '—'), h('span', { class: 'row-main' }, h('span', { class: 'row-t' }, p.nom || 'Sans nom'), h('span', { class: 'row-s' }, [p.client, p.commune].filter(Boolean).join(' · ') || '—')), h('span', { class: 'chev' }, icon('chev', 18)))))));
    }
  };

  // Ouvre un projet : s'il n'existe pas encore sur l'appareil, il est créé à partir de son dossier Drive
  async function openProject(p, f) {
    if (!p && f) {
      const info = gd.parseProjectFolder(f.name) || {};
      p = { id: uid(), code: info.code, nom: info.nom || f.name, client: info.client, commune: info.commune, type: PROJECT_TYPES[0], phase: 'ESQ', assignments: [], drive: { id: f.id, name: f.name, path: f.name, map: {} }, createdAt: new Date().toISOString() };
      await db.put('projects', p);
    }
    location.hash = '#/p/' + p.id;
  }

  const gate = !gd.available() ? null : !gd.connected() && !online ? h('section', { class: 'card stack', style: { maxWidth: '640px' } },
    h('h2', { class: 'title-sm', style: { margin: 0 } }, 'Connecte ton Google Drive'),
    h('div', null, 'Les projets de l’Atelier sont ceux de ton Drive (Mon Drive › AAAA › AAAA-NNN_CLIENT_COMMUNE). Connecte-toi avec michel@statera-architecture.fr pour les retrouver.'),
    gd.connectBox('#/projets')) : null;

  clear(view).appendChild(h('div', { class: 'page' },
    h('header', { class: 'page-head' },
      h('div', null, h('div', { class: 'eyebrow' }, 'STATERA Atelier · Google Drive'), h('h1', { class: 'title' }, 'Projets'), status),
      h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', onclick: () => newProject() }, icon('plus', 18), 'Nouveau projet'))),
    gate || h('div', null,
      !online && gd.connected() ? h('div', { class: 'alert alert-soft mb' }, h('span', null, 'Session Google expirée ou hors ligne : seuls les projets déjà ouverts sur cet appareil sont affichés. '), gd.connectBox('#/projets')) : null,
      h('div', { class: 'flexb mb' }, h('span'),
        h('input', { class: 'input', type: 'search', placeholder: 'Rechercher un projet, un client, une commune…', 'aria-label': 'Rechercher', style: { maxWidth: '360px' }, oninput: (e) => { search = e.target.value; draw(); } })),
      listBox)));
  if (gate) return;
  status.textContent = online ? 'Lecture du Drive…' : linked.length + ' projet(s) sur cet appareil';
  draw();
  if (online) {
    try { drive = await gd.driveProjects(); status.textContent = drive.length + ' dossier' + (drive.length > 1 ? 's' : '') + ' projet dans ton Drive'; }
    catch (e) { driveErr = e.message; status.textContent = driveErr; }
    draw();
  }
}

export async function newProject(pre = {}, onCreated) {
  if (!gd.available() || !(await gd.ensureToken())) {
    if (gd.available()) { if (await confirmBox('La création d’un projet se fait dans ton Google Drive. Te connecter maintenant ?', 'Connecter')) gd.signIn('#/projets'); }
    else toast('Création des projets sur la version en ligne (Drive)');
    return;
  }
  let code = '';
  try { code = await gd.nextCode(new Date().getFullYear()); } catch (e) { toast(e.message); return; }
  const f = {
    code: h('input', { class: 'input', value: code }),
    client: h('input', { class: 'input', placeholder: 'ex. Manon Ortoli', value: pre.client || '' }),
    commune: h('input', { class: 'input', placeholder: 'ex. Olmiccia', value: pre.commune || '' }),
    nom: h('input', { class: 'input', placeholder: 'ex. Maison individuelle', value: pre.nom || '' }),
    type: h('select', { class: 'select' }, PROJECT_TYPES.map((t) => h('option', null, t))),
    phase: h('select', { class: 'select' }, PHASES.filter((p) => p.id !== 'CLOS').map((p) => h('option', { value: p.id, selected: p.id === 'ESQ' || null }, p.court + ' · ' + p.nom)))
  };
  const preview = h('div', { class: 'title-sm fname', style: { fontSize: '15px' } });
  const upd = () => { preview.textContent = 'Mon Drive › ' + (f.code.value.slice(0, 4) || 'AAAA') + ' › ' + driveFolderName({ code: f.code.value.trim(), client: f.client.value, commune: f.commune.value }); };
  [f.code, f.client, f.commune].forEach((el) => el.addEventListener('input', upd)); upd();
  const fld = (label, el, cls) => h('label', { class: 'field ' + (cls || '') }, h('span', null, label), el);
  const progress = h('div', { class: 'small muted' });
  const go = h('button', { class: 'btn btn-primary', onclick: create }, 'Créer le dossier');
  const s = sheet({
    title: 'Nouveau projet',
    body: [fld('N° d’affaire (chrono de l’agence)', f.code),
      h('div', { class: 'grid g2' }, fld('Client (maître d’ouvrage)', f.client), fld('Commune', f.commune)),
      fld('Intitulé', f.nom),
      h('div', { class: 'grid g2' }, fld('Type', f.type), fld('Phase', f.phase)),
      h('div', { class: 'alert alert-soft' }, h('div', null, h('div', { class: 'small muted' }, 'Dossier créé à partir du dossier type (BASES FICHIER › AAAA-NNN_CLIENT_COMMUNE) :'), preview)),
      progress],
    foot: [h('button', { class: 'btn btn-line', onclick: () => s.close() }, 'Annuler'), go]
  });
  async function create() {
    if (!/^\d{4}-\d{3}$/.test(f.code.value.trim())) { toast('N° d’affaire au format AAAA-NNN'); return; }
    if (!f.client.value.trim()) { toast('Indique le client'); f.client.focus(); return; }
    if (!f.commune.value.trim()) { toast('Indique la commune'); f.commune.focus(); return; }
    const p = { id: uid(), code: f.code.value.trim(), nom: f.nom.value.trim() || (f.type.value + ' · ' + f.commune.value.trim()), client: f.client.value.trim(), commune: f.commune.value.trim(), type: f.type.value, phase: f.phase.value, assignments: [], ouverture: new Date().toLocaleDateString('fr-FR'), createdAt: new Date().toISOString(), ...(pre.extra || {}) };
    go.disabled = true; go.textContent = 'Création…';
    try {
      await gd.createProjectFolder(p, (name) => { progress.textContent = 'Création : ' + name; });
      s.close(); toast('Dossier créé dans ton Drive : ' + p.drive.name);
      if (onCreated) await onCreated(p);
      location.hash = '#/p/' + p.id;
    } catch (e) { go.disabled = false; go.textContent = 'Créer le dossier'; progress.textContent = e.message; toast(e.message); }
  }
}
export { fmtShort };
