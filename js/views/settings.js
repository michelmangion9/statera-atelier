// Réglages : cabinet, sauvegarde, stockage, connexions prévues
import { h, put, clear, icon, toast, debounce, confirmBox, pickFiles, downloadBlob, blobToDataURL, dataURLToBlob, fmtSize, fmtDate, todayISO } from '../lib.js';
import { db, STORES, usage, askPersist } from '../db.js';
import { CABINET_DEFAULT, MENTION_CR } from '../data.js';

export async function render(view) {
  const cab = Object.assign({}, CABINET_DEFAULT, (await db.setting('cabinet', {})) || {});
  const mention = (await db.setting('mentionCR', null)) || MENTION_CR;
  const lastBackup = await db.setting('lastBackup', null);
  const saved = h('span', { class: 'saved' });
  const save = debounce(async () => { await db.setSetting('cabinet', cab); saved.textContent = 'Enregistré'; setTimeout(() => (saved.textContent = ''), 1400); }, 400);
  const inp = (key) => { const el = h('input', { class: 'input', value: cab[key] || '' }); el.addEventListener('input', () => { cab[key] = el.value; save(); }); return el; };
  const fld = (label, el, cls) => h('label', { class: 'field ' + (cls || '') }, h('span', null, label), el);
  const mentionEl = h('textarea', { class: 'textarea', rows: 2 }, mention);
  mentionEl.addEventListener('input', debounce(() => db.setSetting('mentionCR', mentionEl.value), 400));

  const est = await usage();
  const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted().catch(() => false) : false;
  const counts = {};
  for (const s of ['projects', 'notes', 'plans', 'points', 'files', 'entreprises', 'reunions']) counts[s] = (await db.all(s)).length;
  const daysSince = lastBackup ? Math.round((Date.now() - new Date(lastBackup).getTime()) / 86400000) : null;

  clear(view).appendChild(h('div', { class: 'page' },
    h('header', { class: 'page-head' }, h('div', null, h('div', { class: 'eyebrow' }, 'STATERA Atelier'), h('h1', { class: 'title' }, 'Réglages'))),
    h('div', { class: 'cols' },
      h('div', { class: 'stack' },
        h('section', { class: 'card stack' },
          h('div', { class: 'flexb' }, h('h2', { class: 'section-t', style: { margin: 0 } }, 'Cabinet · en-tête et pied des PDF'), saved),
          h('div', { class: 'grid g2' }, fld('Nom commercial', inp('nom')), fld('Architecte', inp('architecte')), fld('Adresse', inp('adresse'), 'span2'),
            fld('Téléphone', inp('tel')), fld('E-mail', inp('email')), fld('Site', inp('site')), fld('SIREN', inp('siren')), fld('Inscription à l’Ordre', inp('ordre'), 'span2'))),
        h('section', { class: 'card stack' },
          h('h2', { class: 'section-t', style: { margin: 0 } }, 'Comptes rendus de chantier'),
          fld('Mention en fin de CR', mentionEl),
          h('div', { class: 'small muted' }, 'Texte libre, à faire valider si vous souhaitez lui donner une portée contractuelle.')),
        h('section', { class: 'card stack' },
          h('h2', { class: 'section-t', style: { margin: 0 } }, 'Version de l’application'),
          (() => { const v = h('div', { class: 'small' }, '…'); caches.keys().then((k) => { v.textContent = 'Version installée : ' + ((k.find((x) => x.startsWith('atelier-')) || 'aucune').replace('atelier-', '')); }).catch(() => { v.textContent = 'Version : en ligne'; }); return v; })(),
          h('button', { class: 'btn btn-line', style: { alignSelf: 'flex-start' }, onclick: async () => {
            try { (await navigator.serviceWorker.getRegistrations()).forEach((r) => r.unregister()); (await caches.keys()).forEach((k) => caches.delete(k)); } catch (e) { /* rien */ }
            toast('Mise à jour…'); setTimeout(() => location.reload(), 600);
          } }, 'Forcer la mise à jour'),
          h('div', { class: 'small muted' }, 'Tes projets ne sont pas touchés : seule l’application est rechargée.')),
        h('section', { class: 'card stack' },
          h('h2', { class: 'section-t', style: { margin: 0 } }, 'Écoute IA · Gemini'),
          (() => { const st = h('div', { class: 'small muted' }, 'Vérification…'); fetch('/api/resume', { cache: 'no-store' }).then((r) => r.ok ? r.json() : null).then((j) => { st.textContent = j && j.configured ? 'Gemini est activé : le résumé des rendez-vous se fait automatiquement.' : 'Gemini n’est pas encore activé sur le serveur : le résumé passe par un copier-coller dans Gemini.'; }).catch(() => { st.textContent = 'Hors ligne ou aperçu : le résumé passe par un copier-coller dans Gemini.'; }); return st; })(),
          (() => { const i = h('input', { class: 'input', type: 'password', autocomplete: 'off', placeholder: 'Code d’accès IA (ATELIER_TOKEN)' }); try { i.value = localStorage.getItem('statera-atelier-ia') || ''; } catch (e) { /* stockage */ } i.addEventListener('change', () => { try { localStorage.setItem('statera-atelier-ia', i.value.trim()); toast('Code enregistré sur cet appareil'); } catch (e) { /* stockage */ } }); return fld('Code d’accès IA', i); })()),
        h('section', { class: 'card stack' },
          h('h2', { class: 'section-t', style: { margin: 0 } }, 'Connexions Google'),
          h('div', { class: 'small', style: { lineHeight: 1.55 } }, 'Prévu à la mise en ligne, avec votre compte Google Workspace :'),
          h('div', { class: 'kv' }, h('span', null, 'Drive'), h('span', { class: 'small' }, 'copie automatique des fichiers dans le dossier du projet')),
          h('div', { class: 'kv' }, h('span', null, 'Agenda'), h('span', { class: 'small' }, 'RDV et réunions de chantier, notes pré-remplies')),
          h('div', { class: 'kv' }, h('span', null, 'Gmail'), h('span', { class: 'small' }, 'envoi direct des CR par lot depuis contact@')),
          h('div', { class: 'small muted' }, 'D’ici là, tout fonctionne sur l’appareil, hors ligne compris ; les PDF se partagent par la feuille de partage (Mail, Drive, Fichiers).'))),
      h('div', { class: 'stack' },
        h('section', { class: 'card stack' },
          h('h2', { class: 'section-t', style: { margin: 0 } }, 'Sauvegarde'),
          daysSince === null || daysSince > 7 ? h('div', { class: 'alert' }, 'Les données sont stockées sur cet appareil. ' + (daysSince === null ? 'Aucune sauvegarde n’a encore été faite.' : 'Dernière sauvegarde il y a ' + daysSince + ' jours.') + ' Exportez régulièrement dans votre Drive.') : h('div', { class: 'small muted' }, 'Dernière sauvegarde : ' + fmtDate(lastBackup.slice(0, 10))),
          h('div', { class: 'small muted' }, Object.entries(counts).map(([k, v]) => v + ' ' + ({ projects: 'projets', notes: 'notes', plans: 'plans', points: 'points', files: 'fichiers', entreprises: 'entreprises', reunions: 'réunions' })[k]).join(' · ')),
          h('div', { class: 'actions' },
            h('button', { class: 'btn btn-primary', onclick: exportAll }, icon('download', 18), 'Exporter tout'),
            h('button', { class: 'btn', onclick: importAll }, 'Restaurer'))),
        h('section', { class: 'card stack' },
          h('h2', { class: 'section-t', style: { margin: 0 } }, 'Stockage'),
          est ? h('div', { class: 'kv' }, h('span', null, 'Utilisé'), h('span', null, fmtSize(est.usage || 0) + (est.quota ? ' sur ' + fmtSize(est.quota) : ''))) : null,
          h('div', { class: 'kv' }, h('span', null, 'Protection contre l’effacement'), h('span', null, persisted ? 'Activée' : 'Non accordée')),
          persisted ? null : h('button', { class: 'btn btn-sm btn-line', style: { alignSelf: 'flex-start' }, onclick: async () => { const ok = await askPersist(); toast(ok ? 'Protection activée' : 'Ajoutez l’app à l’écran d’accueil pour l’obtenir'); } }, 'Demander la protection'),
          h('div', { class: 'small muted' }, 'Sur iPad et iPhone : Partager › « Sur l’écran d’accueil » pour installer l’application et protéger les données.')),
        h('section', { class: 'card stack' },
          h('h2', { class: 'section-t', style: { margin: 0 } }, 'Découverte'),
          h('button', { class: 'btn btn-line', style: { alignSelf: 'flex-start' }, onclick: async () => { const { createDemo } = await import('../demo.js'); const id = await createDemo(); toast('Projet d’exemple chargé'); location.hash = '#/p/' + id; } }, 'Charger le projet d’exemple'),
          h('button', { class: 'btn btn-line', style: { alignSelf: 'flex-start' }, onclick: async () => { if (await confirmBox('Effacer toutes les données de cet appareil (projets, plans, fichiers, entreprises) ? Faites d’abord une sauvegarde.', 'Tout effacer')) { for (const s of STORES) await db.clear(s); toast('Données effacées'); location.hash = '#/projets'; } } }, icon('trash', 16), 'Tout effacer'))))));
}

async function serialize(v) {
  if (v instanceof Blob) return { __blob: await blobToDataURL(v), type: v.type, name: v.name };
  if (Array.isArray(v)) return Promise.all(v.map(serialize));
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = await serialize(x); return o; }
  return v;
}
async function revive(v) {
  if (v && typeof v === 'object' && v.__blob) { const b = await dataURLToBlob(v.__blob); return v.name ? new File([b], v.name, { type: v.type }) : new Blob([b], { type: v.type }); }
  if (Array.isArray(v)) return Promise.all(v.map(revive));
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = await revive(x); return o; }
  return v;
}
async function exportAll() {
  toast('Préparation de la sauvegarde…');
  const out = { app: 'statera-atelier', version: 1, date: new Date().toISOString(), stores: {} };
  for (const s of STORES) out.stores[s] = await serialize(await db.all(s));
  const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
  downloadBlob(blob, 'STATERA-Atelier_sauvegarde_' + todayISO() + '.json');
  await db.setSetting('lastBackup', new Date().toISOString());
  toast('Sauvegarde exportée');
}
async function importAll() {
  const [f] = await pickFiles({ accept: 'application/json,.json' });
  if (!f) return;
  let data;
  try { data = JSON.parse(await f.text()); } catch (e) { toast('Fichier illisible'); return; }
  if (data.app !== 'statera-atelier') { toast('Ce fichier n’est pas une sauvegarde STATERA Atelier'); return; }
  if (!(await confirmBox('Restaurer la sauvegarde du ' + fmtDate(data.date.slice(0, 10)) + ' ? Les éléments existants portant le même identifiant seront remplacés.', 'Restaurer'))) return;
  for (const [s, rows] of Object.entries(data.stores)) {
    if (!STORES.includes(s)) continue;
    for (const r of rows) await db.put(s, await revive(r));
  }
  toast('Sauvegarde restaurée');
  location.hash = '#/projets';
}
