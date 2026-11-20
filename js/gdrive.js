// Google Drive : connexion (OAuth 2.0 par redirection, compatible app installée sur iPad/iPhone),
// dossier du projet, navigation, téléchargement, dépôt des documents générés par l'Atelier.
import { h, put, clear, icon, toast, sheet, fmtShort, fmtSize, confirmBox } from './lib.js';
import { db } from './db.js';
import { FOLDERS, driveFolderName, folderOf, PHASES } from './data.js';

export const CLIENT_ID = '801369190574-3fls5l6a0kbumk8usql1s2hsh95hs7vo.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/gmail.readonly';
const API = 'https://www.googleapis.com/drive/v3';
const UP = 'https://www.googleapis.com/upload/drive/v3';
const LS = 'statera-atelier-gdrive';
const FOLDER = 'application/vnd.google-apps.folder';
const HINT = 'michel@statera-architecture.fr';

const read = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { return {}; } };
const write = (v) => { try { localStorage.setItem(LS, JSON.stringify(v)); } catch (e) { /* stockage */ } };

export const available = () => (location.protocol === 'https:' && !location.hostname.endsWith('claudeusercontent.com')) || location.hostname === 'localhost';
export function token() { const s = read(); return s.token && s.exp > Date.now() + 60000 ? s.token : null; }
export const connected = () => !!read().email;
export const account = () => read().email || '';

// Retour de Google : #access_token=…&expires_in=…&state=…  (appelé par le routeur avant tout affichage)
export function handleRedirect() {
  const hsh = location.hash || '';
  if (!/access_token=|error=/.test(hsh) || /^#\//.test(hsh)) return false;
  const q = new URLSearchParams(hsh.slice(1));
  let back = '#/reglages';
  try { const st = JSON.parse(atob(q.get('state') || '')); if (st.back) back = st.back; } catch (e) { /* état */ }
  const s = read();
  if (q.get('access_token')) {
    s.token = q.get('access_token'); s.exp = Date.now() + (Number(q.get('expires_in')) || 3600) * 1000;
    write(s);
    whoami().catch(() => {});
  } else toast('Connexion Google annulée');
  history.replaceState(null, '', location.pathname + back);
  return true;
}

export function signIn(back) {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', CLIENT_ID);
  u.searchParams.set('redirect_uri', location.origin + '/');
  u.searchParams.set('response_type', 'token');
  u.searchParams.set('scope', SCOPE);
  u.searchParams.set('include_granted_scopes', 'true');
  u.searchParams.set('login_hint', read().email || HINT);
  u.searchParams.set('state', btoa(JSON.stringify({ back: back || location.hash || '#/projets' })));
  location.href = u.toString();
}
export function signOut() {
  const t = read().token;
  if (t) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t), { method: 'POST' }).catch(() => {});
  write({});
}

class NeedAuth extends Error {}
async function api(path, opts = {}, raw = false) {
  const t = token();
  if (!t) throw new NeedAuth('Connexion Google nécessaire');
  const r = await fetch(path.startsWith('http') ? path : API + path, Object.assign({}, opts, { headers: Object.assign({ Authorization: 'Bearer ' + t }, opts.headers || {}) }));
  if (r.status === 401) { const s = read(); delete s.token; write(s); throw new NeedAuth('Session Google expirée'); }
  if (!r.ok) { let m = ''; try { m = (await r.json()).error.message; } catch (e) { /* texte */ } throw new Error('Drive : ' + (m || r.status)); }
  return raw ? r : r.json();
}
const qs = (o) => Object.entries(o).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export async function whoami() {
  const j = await api('/about?fields=user(emailAddress,displayName)');
  const s = read(); s.email = j.user.emailAddress; s.name = j.user.displayName; write(s);
  return s.email;
}

export async function list(folderId) {
  let out = [], pageToken = '';
  do {
    const j = await api('/files?' + qs({ q: "'" + esc(folderId) + "' in parents and trashed=false", fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,iconLink,thumbnailLink,parents)', orderBy: 'folder,name', pageSize: 200, supportsAllDrives: true, includeItemsFromAllDrives: true, pageToken }));
    out = out.concat(j.files || []); pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}
export const isFolder = (f) => f.mimeType === FOLDER;

export async function findFolders(text) {
  const j = await api('/files?' + qs({ q: "mimeType='" + FOLDER + "' and trashed=false and name contains '" + esc(text) + "'", fields: 'files(id,name,parents,modifiedTime)', pageSize: 20, supportsAllDrives: true, includeItemsFromAllDrives: true }));
  return j.files || [];
}
async function child(parentId, name, create) {
  const j = await api('/files?' + qs({ q: "'" + esc(parentId) + "' in parents and mimeType='" + FOLDER + "' and trashed=false and name='" + esc(name) + "'", fields: 'files(id,name)', supportsAllDrives: true, includeItemsFromAllDrives: true }));
  if (j.files && j.files[0]) return j.files[0].id;
  if (!create) return null;
  const c = await api('/files?supportsAllDrives=true', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId] }) });
  return c.id;
}

export async function download(f) {
  let out;
  if (/^application\/vnd\.google-apps\./.test(f.mimeType)) {
    const r = await api('/files/' + f.id + '/export?mimeType=application%2Fpdf', {}, true);
    out = new File([await r.blob()], f.name + '.pdf', { type: 'application/pdf' });
  } else {
    const r = await api('/files/' + f.id + '?alt=media&supportsAllDrives=true', {}, true);
    const b = await r.blob();
    out = new File([b], f.name, { type: f.mimeType || b.type });
  }
  out._drive = { id: f.id, name: f.name, parent: f.parents && f.parents[0], path: f._path || '' };
  return out;
}
// Tous les PDF et images du dossier projet (sous-dossiers compris)
// Plans et photos utilisables : PDF et images courantes uniquement (pas de DWG, DXF, RVT…)
const PLAN_MIME = /^(application\/pdf|image\/(jpeg|png|heic|heif|webp|gif))$/;
const BAD_EXT = /\.(dwg|dxf|rvt|rfa|skp|pln|ifc|3dm|max|psd|ai)$/i;
export const isPlanFile = (f) => PLAN_MIME.test(f.mimeType || '') && !BAD_EXT.test(f.name || '');

// Tous les PDF et photos du projet : dossiers explorés par niveaux, 25 dossiers par requête, en parallèle
export async function allPlans(rootId, onFolder) {
  const out = [], paths = { [rootId]: '' };
  let frontier = [rootId], seen = 0;
  const kinds = "(mimeType='" + FOLDER + "' or mimeType='application/pdf' or mimeType contains 'image/')";
  while (frontier.length && seen < 600) {
    const chunks = [];
    for (let i = 0; i < frontier.length; i += 25) chunks.push(frontier.slice(i, i + 25));
    seen += frontier.length; onFolder && onFolder(seen);
    const next = [];
    await Promise.all(chunks.map(async (ids) => {
      let pageToken = '';
      do {
        const q = '(' + ids.map((id) => "'" + esc(id) + "' in parents").join(' or ') + ') and trashed=false and ' + kinds;
        const j = await api('/files?' + qs({ q, fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,createdTime,webViewLink,thumbnailLink,parents)', pageSize: 1000, supportsAllDrives: true, includeItemsFromAllDrives: true, pageToken }));
        for (const it of j.files || []) {
          const par = (it.parents || []).find((x) => x in paths); const base = par != null ? paths[par] : '';
          if (isFolder(it)) { if (it.name !== '99_ARCHIVES' && !(it.id in paths)) { paths[it.id] = (base ? base + ' › ' : '') + it.name; next.push(it.id); } }
          else if (isPlanFile(it)) out.push(Object.assign(it, { _path: base }));
        }
        pageToken = j.nextPageToken || '';
      } while (pageToken);
    }));
    frontier = next;
  }
  return out;
}

export async function upload(parentId, blob, name, existingId) {
  const meta = existingId ? { name } : { name, parents: [parentId] };
  const fd = new FormData();
  fd.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
  fd.append('file', blob);
  return api(UP + '/files' + (existingId ? '/' + existingId : '') + '?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink', { method: existingId ? 'PATCH' : 'POST', body: fd });
}

// Dossier Drive d'un sous-dossier de l'Atelier (00_ADMIN, 02_ESQ › 03_Emis…) ; créé au besoin
export async function folderFor(p, folder, sub) {
  if (!p.drive || !p.drive.id) throw new Error('Projet non relié au Drive');
  p.drive.map = p.drive.map || {};
  const key = folder + '/' + (sub || '');
  if (p.drive.map[key]) return p.drive.map[key];
  let id = p.drive.map[folder + '/'] || await child(p.drive.id, folder, true);
  p.drive.map[folder + '/'] = id;
  if (sub) id = await child(id, sub, true);
  p.drive.map[key] = id; await db.put('projects', p);
  return id;
}

// Dossier type : « BASES FICHIER › AAAA-NNN_CLIENT_COMMUNE » (LISEZMOI, FICHE_PROJET, JOURNAL, CHECKLIST…)
export const TEMPLATE_NAME = 'AAAA-NNN_CLIENT_COMMUNE';
async function templateId() {
  const j = await api('/files?' + qs({ q: "name='" + TEMPLATE_NAME + "' and mimeType='" + FOLDER + "' and trashed=false", fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true }));
  return j.files && j.files[0] ? j.files[0].id : null;
}
async function copyTree(srcId, dstId, onStep) {
  for (const it of await list(srcId)) {
    if (isFolder(it)) { const nid = await child(dstId, it.name, true); onStep && onStep(it.name); await copyTree(it.id, nid, onStep); }
    else await api('/files/' + it.id + '/copy?supportsAllDrives=true', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: it.name, parents: [dstId] }) });
  }
}
// Projets STATERA présents dans le Drive : dossiers « AAAA-NNN_… »
export async function driveProjects() {
  const j = await api('/files?' + qs({ q: "mimeType='" + FOLDER + "' and trashed=false and name contains '-'", fields: 'files(id,name,parents,modifiedTime)', pageSize: 200, supportsAllDrives: true, includeItemsFromAllDrives: true }));
  return (j.files || []).filter((f) => /^\d{4}-\d{3}_/.test(f.name)).sort((a, b) => b.name.localeCompare(a.name));
}
export function parseProjectFolder(name) {
  const m = name.match(/^(\d{4}-\d{3})_(.+)$/); if (!m) return null;
  const parts = m[2].split('_');
  const cap = (t) => t.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase());
  const client = cap(parts[0] || ''), commune = cap(parts.slice(1).join(' '));
  return { code: m[1], client, commune, nom: client + (commune ? ' · ' + commune : '') };
}
// N° chrono suivant de l'année (jamais réutilisé : on prend le plus grand existant + 1)
export async function nextCode(year) {
  const y = String(year || new Date().getFullYear());
  const nums = (await driveProjects()).map((f) => f.name.match(/^(\d{4})-(\d{3})/)).filter((m) => m && m[1] === y).map((m) => Number(m[2]));
  return y + '-' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
}
async function findFile(parentId, name) {
  const j = await api('/files?' + qs({ q: "'" + esc(parentId) + "' in parents and trashed=false and name='" + esc(name) + "'", fields: 'files(id,name,mimeType)', supportsAllDrives: true, includeItemsFromAllDrives: true }));
  return j.files && j.files[0];
}
async function readText(f) { const r = await api('/files/' + f.id + '?alt=media&supportsAllDrives=true', {}, true); return r.text(); }
const setLine = (txt, label, value) => value ? txt.replace(new RegExp('(' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:)([^\\n·]*?)(\\s{2,}|\\s*·|\\n|$)'), (m0, a, b, c) => a + ' ' + value + (c.startsWith('\n') || !c ? c : '   ' + c.trim() + ' ')) : txt;
// Crée le dossier du projet dans le Drive à partir du dossier type, et remplit la fiche projet
export async function createProjectFolder(p, onStep) {
  const year = String(p.code || '').slice(0, 4) || String(new Date().getFullYear());
  const name = driveFolderName(Object.assign({}, p, { drive: null }));
  const yearId = await child('root', year, true);
  if (await findFile(yearId, name)) throw new Error('Le dossier « ' + name + ' » existe déjà dans Mon Drive › ' + year);
  const rootId = await child(yearId, name, true);
  const tpl = await templateId();
  if (tpl) await copyTree(tpl, rootId, onStep);
  else for (const f of FOLDERS) { const fid = await child(rootId, f.id, true); for (const sb of f.subs) await child(fid, sb, true); }
  p.drive = { id: rootId, name, path: 'Mon Drive › ' + year + ' › ' + name, map: {} };
  await db.put('projects', p);
  try { await writeFiche(p); } catch (e) { /* fiche facultative */ }
  try { await journal(p, 'Ouverture du dossier', 'MM', ''); } catch (e) { /* journal facultatif */ }
  return p.drive;
}
// FICHE_PROJET.md (00_ADMIN › 04_Contacts) : remplie avec ce que l'Atelier connaît du projet
export async function writeFiche(p) {
  const dir = await folderFor(p, '00_ADMIN', '04_Contacts');
  const f = await findFile(dir, 'FICHE_PROJET.md');
  let t = f ? await readText(f) : '# FICHE PROJET\n';
  const today = new Date().toLocaleDateString('fr-FR');
  t = setLine(t, 'Code projet', p.code); t = setLine(t, "Date d'ouverture", p.ouverture || today);
  t = setLine(t, 'Intitulé', p.nom); t = setLine(t, 'Adresse du terrain', p.adresse); t = setLine(t, 'Commune', p.commune);
  t = setLine(t, 'Parcelle(s) cadastrale(s)', p.parcelle);
  t = t.replace(/(## Maître d'ouvrage\nNom :)[^·\n]*/, (m0, a) => a + ' ' + (p.client || '') + ' ');
  if (p.clientTel) t = t.replace(/(Tél :)\s*·/, '$1 ' + p.clientTel + ' ·');
  if (p.clientEmail) t = t.replace(/(Mail :)\s*·/, '$1 ' + p.clientEmail + ' ·');
  await upload(dir, new Blob([t], { type: 'text/markdown' }), 'FICHE_PROJET.md', f && f.id);
}
// JOURNAL_PROJET.md : une ligne par événement, la plus récente en haut
export async function journal(p, event, who, doc) {
  const dir = await folderFor(p, '00_ADMIN', '04_Contacts');
  const f = await findFile(dir, 'JOURNAL_PROJET.md');
  let t = f ? await readText(f) : '# JOURNAL PROJET (une ligne par événement, le plus récent en haut)\n| Date | Événement / décision | Qui | Doc lié |\n|------|----------------------|-----|---------|\n';
  const line = '| ' + new Date().toLocaleDateString('fr-FR') + ' | ' + event.replace(/\|/g, '/') + ' | ' + (who || '') + ' | ' + (doc || '') + ' |';
  const i = t.indexOf('|------'); const j = i >= 0 ? t.indexOf('\n', i) : -1;
  t = j >= 0 ? t.slice(0, j + 1) + line + '\n' + t.slice(j + 1).replace(/^\|\s*\|\s*\|\s*\|\s*\|\n?/m, '') : t + line + '\n';
  await upload(dir, new Blob([t], { type: 'text/markdown' }), 'JOURNAL_PROJET.md', f && f.id);
}

// Envoie au Drive un document généré par l'Atelier (CR, PV, fiche, plan annoté…)
const syncing = new Set();
export async function pushFile(p, rec) {
  if (!token() || !p.drive || !p.drive.id || !rec.blob || syncing.has(rec.id)) return false;
  syncing.add(rec.id);
  try {
    const parent = rec.driveParent || await folderFor(p, rec.folder, rec.sub || '');
    // Règle : l'Atelier ne supprime, ne déplace ni n'écrase jamais un fichier du Drive.
    // Si le nom est déjà pris, le nouveau document est ajouté en copie : …_2, …_3
    let name = rec.name, k = 2;
    while (await findFile(parent, name)) name = rec.name.replace(/(\.[^.]+)?$/, (ext) => '_' + (k++) + (ext || ''));
    const r = await upload(parent, rec.blob, name);
    rec.driveName = name;
    rec.driveId = r.id; rec.driveLink = r.webViewLink; rec.driveAt = new Date().toISOString();
    await db.put('files', rec);
    return true;
  } finally { syncing.delete(rec.id); }
}
export async function pushPending(p) {
  if (!token() || !p.drive || !p.drive.id) return 0;
  const files = (await db.by('files', 'projectId', p.id)).filter((f) => f.source && f.source !== 'import' && f.source !== 'drive' && !f.driveId);
  let n = 0;
  for (const f of files) { try { if (await pushFile(p, f)) n++; } catch (e) { /* on réessaiera */ } }
  return n;
}
// Dès qu'un document est généré, il part dans le Drive si la session Google est ouverte
window.addEventListener('atelier:file-saved', async (e) => {
  const rec = e.detail;
  if (!rec || !rec.projectId || rec.source === 'import' || rec.source === 'drive' || rec.driveId || syncing.has(rec.id) || !token()) return;
  try { const p = await db.get('projects', rec.projectId); if (p && p.drive && p.drive.id && await pushFile(p, rec)) toast('Envoyé dans le Drive : ' + rec.name); } catch (er) { /* réessai plus tard */ }
});

/* ---------- Interface ---------- */

export function connectBox(back) {
  if (!available()) return h('div', { class: 'small muted' }, 'La connexion Google fonctionne sur la version en ligne (statera-atelier.vercel.app).');
  if (token()) return h('div', { class: 'flexb' }, h('span', { class: 'small' }, icon('check', 16), ' Connecté · ' + (account() || 'Google Drive')),
    h('button', { class: 'btn btn-sm btn-line', onclick: () => { signOut(); toast('Drive déconnecté'); window.dispatchEvent(new HashChangeEvent('hashchange')); } }, 'Déconnecter'));
  return h('div', { class: 'stack' },
    connected() ? h('div', { class: 'small muted' }, 'Session expirée (elle dure une heure) : reconnecte-toi, c’est immédiat.') : null,
    h('button', { class: 'btn btn-primary', style: { alignSelf: 'flex-start' }, onclick: () => signIn(back) }, icon('folder', 18), connected() ? 'Reconnecter Google Drive' : 'Connecter Google Drive'));
}

// Relier un projet à son dossier Drive : recherche par n° d'affaire, ou création de l'arborescence
export async function linkProject(p) {
  const code = String(p.code || '').trim();
  let found = [];
  try { found = code ? await findFolders(code) : []; } catch (e) { if (e instanceof NeedAuth) { signIn(location.hash); return; } toast(e.message); return; }
  return new Promise((res) => {
    const s = sheet({
      title: 'Dossier Drive du projet',
      body: [
        h('div', { class: 'small muted' }, found.length ? 'Dossiers trouvés pour « ' + code + ' » :' : 'Aucun dossier « ' + code + ' » trouvé dans ton Drive.'),
        found.length ? h('div', { class: 'list' }, found.map((f) => h('button', { class: 'row', onclick: async () => {
          p.drive = { id: f.id, name: f.name, path: f.name, map: {} }; await db.put('projects', p); res(true); s.close(); toast('Projet relié à « ' + f.name + ' »');
        } }, icon('folder', 20), h('span', { class: 'row-main' }, h('span', { class: 'row-t' }, f.name), h('span', { class: 'row-s' }, 'modifié ' + fmtShort(f.modifiedTime))), icon('chev', 18)))) : null,
        h('button', { class: 'btn btn-line', onclick: async () => {
          if (!await confirmBox('Créer « ' + driveFolderName(p) + ' » dans Mon Drive › ' + (code.slice(0, 4) || 'AAAA') + ' à partir du dossier type ?', 'Créer')) return;
          toast('Création du dossier à partir du dossier type…');
          try { await createProjectFolder(p); res(true); s.close(); toast('Dossier créé dans le Drive'); } catch (e) { toast(e.message); }
        } }, icon('plus', 18), 'Créer le dossier à partir du dossier type')],
      onClose: () => res(false)
    });
  });
}

// Explorateur Drive (dans l'onglet Fichiers, ou en fenêtre pour choisir un plan)
export function browser(p, { startId, startName, pick, onPick, actions } = {}) {
  const trail = [{ id: startId || p.drive.id, name: startName || p.drive.name }];
  const box = h('div', { class: 'drive' });
  async function draw() {
    const cur = trail[trail.length - 1];
    put(clear(box), h('div', { class: 'small muted' }, 'Chargement du Drive…'));
    let items;
    try { items = await list(cur.id); } catch (e) {
      clear(box);
      if (e instanceof NeedAuth) { put(box, h('div', { class: 'alert alert-soft' }, e.message), connectBox(location.hash)); return; }
      put(box, h('div', { class: 'alert' }, e.message)); return;
    }
    const crumbs = h('div', { class: 'drive-crumbs' }, trail.map((t, i) => [i ? h('span', { class: 'muted' }, ' › ') : null,
      h('button', { class: 'linkish', onclick: () => { trail.splice(i + 1); draw(); } }, t.name)]));
    const folders = items.filter(isFolder), files = items.filter((f) => !isFolder(f) && (!pick || isPlanFile(f)));
    put(clear(box), crumbs,
      folders.length ? h('div', { class: 'folders' }, folders.map((f) => h('button', { class: 'folder', onclick: () => { trail.push({ id: f.id, name: f.name }); draw(); } }, icon('folder', 18), h('b', null, f.name)))) : null,
      !items.length ? h('div', { class: 'empty' }, 'Dossier vide dans le Drive.') : null,
      files.length ? h('div', { class: 'list' }, files.map((f) => {
        const pdfOrImg = isPlanFile(f);
        return h('div', { class: 'row' },
          f.thumbnailLink ? h('img', { src: f.thumbnailLink, alt: '', referrerpolicy: 'no-referrer', style: { width: '40px', height: '40px', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--rule)' } }) : h('span', { style: { flexShrink: 0, color: '#57544F' } }, icon(/^image\//.test(f.mimeType) ? 'camera' : 'file', 22)),
          h('a', { class: 'row-main', href: f.webViewLink, target: '_blank', rel: 'noopener', style: { textDecoration: 'none', color: 'inherit' } },
            h('span', { class: 'row-t fname' }, f.name), h('span', { class: 'row-s' }, [fmtShort(f.modifiedTime), f.size ? fmtSize(Number(f.size)) : null].filter(Boolean).join(' · '))),
          pick ? (pdfOrImg ? h('button', { class: 'btn btn-sm btn-primary', onclick: () => onPick(f) }, 'Choisir') : null)
            : (actions ? actions(f, pdfOrImg) : null));
      })) : null);
  }
  draw();
  box.refresh = draw;
  box.current = () => trail[trail.length - 1];
  return box;
}

export function pickFromDrive(p, title = 'Choisir un plan dans le Drive') {
  return new Promise((res) => {
    let done = false;
    const choose = async (f) => {
      done = true; s.close(); toast('Téléchargement de « ' + f.name + ' »…');
      try { res(await download(f)); } catch (e) { toast(e.message); res(null); }
    };
    const body = h('div');
    let files = null, q = '', sort = 'recent', kind = 'tous';
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Rechercher un nom : RDC, coupe, façade, PC…', 'aria-label': 'Rechercher', oninput: () => { q = search.value; drawList(); } });
    const sortSel = h('select', { class: 'input', 'aria-label': 'Trier', onchange: () => { sort = sortSel.value; drawList(); } },
      h('option', { value: 'recent' }, 'Plus récents d’abord'), h('option', { value: 'ancien' }, 'Plus anciens d’abord'), h('option', { value: 'nom' }, 'Nom A → Z'), h('option', { value: 'dossier' }, 'Par dossier'));
    const kindSeg = h('div', { class: 'seg', role: 'group' }, [['tous', 'Tout'], ['pdf', 'PDF'], ['photo', 'Photos']].map(([k, l]) =>
      h('button', { 'aria-pressed': String(k === kind), onclick: (e) => { kind = k; kindSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); drawList(); } }, l)));
    const listBox = h('div');
    const norm = (x) => (x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    function drawList() {
      if (!files) return;
      const words = norm(q).split(/[\s_\-]+/).filter(Boolean);
      let fs = files.filter((f) => (kind === 'tous' || (kind === 'pdf') === (f.mimeType === 'application/pdf')) && words.every((w) => norm(f.name + ' ' + f._path).includes(w)));
      const by = { recent: (a, b) => (b.modifiedTime || '').localeCompare(a.modifiedTime || ''), ancien: (a, b) => (a.modifiedTime || '').localeCompare(b.modifiedTime || ''), nom: (a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }), dossier: (a, b) => (a._path || '').localeCompare(b._path || '', 'fr', { numeric: true }) || a.name.localeCompare(b.name, 'fr', { numeric: true }) };
      fs = fs.slice().sort(by[sort]);
      put(clear(listBox), h('div', { class: 'small muted mb' }, fs.length + ' fichier(s)' + (fs.length !== files.length ? ' sur ' + files.length : '')),
        fs.length ? h('div', { class: 'list' }, fs.map((f) => h('button', { class: 'row', onclick: () => choose(f) },
          icon(f.mimeType === 'application/pdf' ? 'file' : 'camera', 20),
          h('span', { class: 'row-main' }, h('span', { class: 'row-t fname' }, f.name), h('span', { class: 'row-s' }, [f._path, fmtShort(f.modifiedTime), f.size ? fmtSize(Number(f.size)) : null].filter(Boolean).join(' · '))),
          h('span', { class: 'btn btn-sm btn-primary' }, 'Choisir')))) : h('div', { class: 'empty' }, files.length ? 'Aucun fichier ne correspond.' : 'Aucun PDF ni photo dans le dossier du projet.'));
    }
    const showAll = async () => {
      put(clear(body), h('div', { class: 'drive-filters' }, search, sortSel, kindSeg), listBox);
      if (!files) {
        put(clear(listBox), h('div', { class: 'small muted' }, 'Recherche des PDF et photos du projet…'));
        try { files = await allPlans(p.drive.id, (n) => { if (listBox.firstChild) listBox.firstChild.textContent = 'Recherche… ' + n + ' dossier(s) parcourus'; }); }
        catch (e) { put(clear(listBox), h('div', { class: 'alert' }, e.message)); return; }
      }
      drawList();
    };
    const showBrowse = () => put(clear(body), browser(p, { pick: true, onPick: choose }));
    const seg = h('div', { class: 'seg mb', role: 'group' },
      h('button', { 'aria-pressed': 'true', onclick: (e) => { e.currentTarget.setAttribute('aria-pressed', 'true'); e.currentTarget.nextSibling.setAttribute('aria-pressed', 'false'); showAll(); } }, 'PDF et photos du projet'),
      h('button', { 'aria-pressed': 'false', onclick: (e) => { e.currentTarget.setAttribute('aria-pressed', 'true'); e.currentTarget.previousSibling.setAttribute('aria-pressed', 'false'); showBrowse(); } }, 'Parcourir les dossiers'));
    const s = sheet({ title, wide: true, body: [seg, body], onClose: () => { if (!done) res(null); } });
    showAll();
  });
}

/* ---------- Demandes clients : Mon Drive › STATERA_DEMANDES › AAAA-MM-JJ_CLIENT_COMMUNE ---------- */
// Règle inchangée : rien n'est supprimé ni déplacé. Seuls les fichiers créés par l'Atelier (fiche, tableau de suivi) sont mis à jour.
const DEM_ROOT = 'STATERA_DEMANDES';
const clean = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
let demRootP = null;
export function demandesRoot() {
  const s = read();
  if (s.demRoot) return Promise.resolve(s.demRoot);
  // une seule création même si plusieurs écrans synchronisent en même temps
  if (!demRootP) demRootP = child('root', DEM_ROOT, true).then((id) => { const s2 = read(); s2.demRoot = id; write(s2); return id; }).finally(() => { demRootP = null; });
  return demRootP;
}
const STAT_NOM = { nouvelle: 'Nouvelle', proposition: 'Proposition envoyée', acceptee: 'Acceptée', refusee: 'Sans suite (non aboutie)', projet: 'Aboutie · projet créé' };
function ficheDemande(d) {
  const c = d.client, pj = d.projet, hs = d.honSummary;
  const L = (k, v) => '- ' + k + ' : ' + (v == null || v === '' ? '—' : v);
  return ['# FICHE DEMANDE · ' + [c.prenom, c.nom].filter(Boolean).join(' ') + (c.societe ? ' (' + c.societe + ')' : ''), '',
    L('Statut', STAT_NOM[d.statut] || d.statut), L('Reçue le', d.date), L('Origine', d.source === 'questionnaire' ? 'Questionnaire du site' : 'Saisie dans l’Atelier'), d.projectCode ? L('Projet', d.projectCode) : null, '',
    '## Client', L('Nom', [c.prenom, c.nom].filter(Boolean).join(' ')), L('Société', c.societe), L('Qualité', c.type === 'pro' ? 'Professionnel' : 'Particulier'), L('Adresse', c.adresse), L('E-mail', c.email), L('Téléphone', c.tel), '',
    '## Projet', L('Intitulé', pj.intitule), L('Commune', pj.commune), L('Adresse du terrain', pj.lieu), L('Cadastre', pj.cadastre),
    L('Surfaces', [pj.sn ? pj.sn + ' m² neuf' : '', pj.sr ? pj.sr + ' m² rénovation' : '', pj.si ? pj.si + ' m² intérieur' : ''].filter(Boolean).join(' · ')),
    L('Budget travaux HT', pj.budget ? Number(pj.budget).toLocaleString('fr-FR') + ' €' : ''),
    L('Accompagnement', [(pj.phases || '').includes('p') ? 'conception jusqu’au permis' : '', (pj.phases || '').includes('s') ? 'suivi de chantier' : '', (pj.phases || '').includes('i') ? 'architecture intérieure' : ''].filter(Boolean).join(', ')),
    '', '## Programme, souhaits', pj.programme || '—', '',
    '## Proposition d’honoraires', hs && hs.totalHT ? [L('Référence', hs.ref), L('Total', Number(hs.totalHT).toLocaleString('fr-FR') + ' € HT · ' + Number(hs.totalTTC || 0).toLocaleString('fr-FR') + ' € TTC'), L('Formule', hs.formule === 'temps' ? 'au temps passé' : 'au forfait'), L('Date', hs.date)].join('\n') : '—', '',
    '## Notes', d.notes || '—', '', '_Mise à jour par STATERA Atelier le ' + new Date().toLocaleString('fr-FR') + '_'].filter((x) => x !== null).join('\n');
}
const demLocks = new Map();
export function syncDemande(d) {
  const prev = demLocks.get(d.id) || Promise.resolve();
  const next = prev.catch(() => {}).then(() => syncDemandeNow(d));
  demLocks.set(d.id, next); next.finally(() => { if (demLocks.get(d.id) === next) demLocks.delete(d.id); });
  return next;
}
async function syncDemandeNow(d) {
  if (!token()) return false;
  const root = await demandesRoot();
  if (!d.drive || !d.drive.id) {
    const name = [d.date || new Date().toISOString().slice(0, 10), clean(d.client.nom || d.client.societe || 'CLIENT'), clean(d.projet.commune)].filter(Boolean).join('_');
    d.drive = { id: await child(root, name, true), name };
  }
  const r = await upload(d.drive.id, new Blob([ficheDemande(d)], { type: 'text/markdown' }), 'FICHE_DEMANDE.md', d.drive.ficheId);
  d.drive.ficheId = r.id; d.drive.link = d.drive.link || 'https://drive.google.com/drive/folders/' + d.drive.id;
  for (const f of d.files || []) {
    if (f.driveId || !f.blob) continue;
    let name = f.name, k = 2;
    while (await findFile(d.drive.id, name)) name = f.name.replace(/(\.[^.]+)?$/, (ext) => '_' + (k++) + (ext || ''));
    const u = await upload(d.drive.id, f.blob, name); f.driveId = u.id; f.driveName = name;
  }
  d.drive.at = new Date().toISOString();
  return true;
}
// Tableau de suivi : en cours / abouties / non abouties
let indexP = Promise.resolve();
export function syncDemandesIndex(all) { indexP = indexP.catch(() => {}).then(() => writeIndex(all)); return indexP; }
async function writeIndex(all) {
  if (!token()) return;
  const root = await demandesRoot();
  const s = read();
  const row = (d) => '| ' + (d.date || '') + ' | ' + ([d.client.prenom, d.client.nom].filter(Boolean).join(' ') || d.client.societe || '—') + ' | ' + (d.projet.intitule || '—') + ' | ' + (d.projet.commune || '—') + ' | ' + (d.honSummary && d.honSummary.totalHT ? Number(d.honSummary.totalHT).toLocaleString('fr-FR') + ' € HT' : '—') + ' | ' + (STAT_NOM[d.statut] || d.statut) + ' | ' + (d.drive ? d.drive.name : '') + ' |';
  const head = '| Reçue | Client | Projet | Commune | Proposition | Statut | Dossier |\n|---|---|---|---|---|---|---|';
  const grp = (t, l) => '## ' + t + ' (' + l.length + ')\n' + (l.length ? head + '\n' + l.map(row).join('\n') : '_Aucune_') + '\n';
  const by = (f) => all.filter(f).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const txt = '# SUIVI DES DEMANDES · STATERA\n\n' + grp('En cours', by((d) => !['projet', 'refusee'].includes(d.statut))) + '\n' + grp('Abouties', by((d) => d.statut === 'projet')) + '\n' + grp('Non abouties', by((d) => d.statut === 'refusee')) +
    '\n_Mis à jour par STATERA Atelier le ' + new Date().toLocaleString('fr-FR') + '_\n';
  let id = s.demIndex;
  if (!id) { const f = await findFile(root, 'SUIVI_DEMANDES.md'); id = f && f.id; }
  const r = await upload(root, new Blob([txt], { type: 'text/markdown' }), 'SUIVI_DEMANDES.md', id);
  const s2 = read(); s2.demIndex = r.id; write(s2);
}
// Ajoute un document généré (compte rendu des échanges…) dans le dossier de la demande, sans jamais écraser
export async function addToDemande(d, blob, name) {
  await syncDemande(d);
  let n = name, k = 2;
  while (await findFile(d.drive.id, n)) n = name.replace(/(\.[^.]+)?$/, (ext) => '_' + (k++) + (ext || ''));
  return upload(d.drive.id, blob, n);
}

/* ---------- Gmail (lecture seule) : échanges avec un client ---------- */
const GM = 'https://gmail.googleapis.com/gmail/v1/users/me';
const b64u = (s) => { try { const bin = atob(String(s || '').replace(/-/g, '+').replace(/_/g, '/')); return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); } catch (e) { return ''; } };
function bodyOf(part) {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body && part.body.data) return b64u(part.body.data);
  for (const p of part.parts || []) { const t = bodyOf(p); if (t) return t; }
  if (part.mimeType === 'text/html' && part.body && part.body.data) return b64u(part.body.data).replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>|<\/p>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' ');
  return '';
}
// Retire les citations des réponses (« Le … a écrit : », lignes « > »)
const unquote = (t) => t.split(/\n(?:Le .{5,120} a écrit\s*:|On .{5,120} wrote:|-----Original Message-----|De :.*\nEnvoyé :)/)[0].split('\n').filter((l) => !/^\s*>/.test(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
export async function gmailExchanges(email, max = 40) {
  if (!email) throw new Error('Indique l’e-mail du client dans la fiche');
  const q = 'from:' + email + ' OR to:' + email;
  const l = await api(GM + '/messages?' + qs({ q, maxResults: max }));
  const out = [];
  for (const m of l.messages || []) {
    const j = await api(GM + '/messages/' + m.id + '?format=full');
    const hd = (n) => ((j.payload.headers || []).find((x) => x.name.toLowerCase() === n) || {}).value || '';
    out.push({ id: m.id, threadId: j.threadId, date: new Date(Number(j.internalDate)).toISOString(), from: hd('from'), to: hd('to'), subject: hd('subject'), snippet: j.snippet || '', text: unquote(bodyOf(j.payload)).slice(0, 4000), out: !hd('from').toLowerCase().includes(email.toLowerCase()) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
