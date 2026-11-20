// Stockage local (IndexedDB). Les fichiers (plans, photos, documents) sont gardés en Blob.
const NAME = 'statera-atelier';
const VERSION = 2;
const SCHEMA = {
  projects: { key: 'id' },
  notes: { key: 'id', idx: ['projectId'] },
  plans: { key: 'id', idx: ['projectId'] },
  pages: { key: 'key', idx: ['planId'] },          // annotations d'une page de plan : traits + textes
  points: { key: 'id', idx: ['projectId', 'planId'] },
  media: { key: 'id', idx: ['projectId'] },         // photos (avec annotations) et pièces jointes
  files: { key: 'id', idx: ['projectId'] },
  entreprises: { key: 'id' },
  reunions: { key: 'id', idx: ['projectId'] },
  settings: { key: 'key' },
  demandes: { key: 'id' }                          // demandes clients avant projet : questionnaire, fiche, honoraires, contrat
};
export const STORES = Object.keys(SCHEMA);

let dbp;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, def] of Object.entries(SCHEMA)) {
        if (!db.objectStoreNames.contains(name)) {
          const st = db.createObjectStore(name, { keyPath: def.key });
          (def.idx || []).forEach((i) => st.createIndex(i, i));
        }
      }
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  return dbp;
}
const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

// Safari (iPad/iPhone) refuse parfois d'enregistrer un fichier choisi dans « Fichiers » tel quel
// (« Error preparing Blob/File data »), en particulier en navigation privée. On convertit alors
// chaque Blob en tableau d'octets pour l'enregistrement, et on le reconstitue à la lecture.
const isBlob = (v) => v && typeof v === 'object' && typeof v.arrayBuffer === 'function' && typeof v.size === 'number';
async function pack(obj) {
  const out = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (isBlob(v)) out[k] = { __blob: await v.arrayBuffer(), type: v.type || '' };
    else if (v && typeof v === 'object' && !(v instanceof Date) && !ArrayBuffer.isView(v) && !(v instanceof ArrayBuffer)) out[k] = await pack(v);
    else out[k] = v;
  }
  return out;
}
function unpack(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (obj.__blob instanceof ArrayBuffer) return new Blob([obj.__blob], { type: obj.type || '' });
  if (Array.isArray(obj)) { for (let i = 0; i < obj.length; i++) obj[i] = unpack(obj[i]); return obj; }
  if (obj instanceof Blob || obj instanceof Date || obj instanceof ArrayBuffer || ArrayBuffer.isView(obj)) return obj;
  for (const k of Object.keys(obj)) obj[k] = unpack(obj[k]);
  return obj;
}
const write = (d, store, obj) => new Promise((res, rej) => {
  let t;
  try { t = d.transaction(store, 'readwrite'); t.objectStore(store).put(obj); } catch (e) { rej(e); return; }
  t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Transaction annulée'));
});

export const db = {
  async get(store, key) { const d = await open(); return unpack(await reqP(d.transaction(store).objectStore(store).get(key))); },
  async all(store) { const d = await open(); return unpack(await reqP(d.transaction(store).objectStore(store).getAll())); },
  async by(store, index, value) { const d = await open(); return unpack(await reqP(d.transaction(store).objectStore(store).index(index).getAll(value))); },
  async put(store, obj) {
    if (store !== 'settings' && store !== 'pages') obj.updatedAt = new Date().toISOString();
    const d = await open();
    try { await write(d, store, obj); }
    catch (e) {
      // Second essai sans objets Blob (cas Safari)
      try { await write(d, store, await pack(obj)); }
      catch (e2) {
        const msg = String((e2 && e2.message) || e2 || '');
        const err = new Error(/quota/i.test(msg) ? 'Stockage plein sur cet appareil' : 'Enregistrement impossible sur cet appareil' + (/private|privée/i.test(msg) ? ' (navigation privée)' : '') + ' : ' + msg);
        err.cause = e2; throw err;
      }
    }
    if (store === 'files' && typeof window !== 'undefined') { try { window.dispatchEvent(new CustomEvent('atelier:file-saved', { detail: obj })); } catch (e) { /* rien */ } }
    return obj;
  },
  async del(store, key) {
    const d = await open();
    await new Promise((res, rej) => { const t = d.transaction(store, 'readwrite'); t.objectStore(store).delete(key); t.oncomplete = res; t.onerror = () => rej(t.error); });
  },
  async clear(store) {
    const d = await open();
    await new Promise((res, rej) => { const t = d.transaction(store, 'readwrite'); t.objectStore(store).clear(); t.oncomplete = res; t.onerror = () => rej(t.error); });
  },
  async setting(key, fallback) { const r = await db.get('settings', key); return r ? r.value : fallback; },
  async setSetting(key, value) { return db.put('settings', { key, value }); }
};

// Suppression d'un projet et de tout ce qui lui appartient
export async function deleteProject(id) {
  for (const st of ['notes', 'plans', 'points', 'media', 'files', 'reunions']) {
    const rows = await db.by(st, 'projectId', id);
    for (const r of rows) {
      if (st === 'plans') { const pg = await db.by('pages', 'planId', r.id); for (const p of pg) await db.del('pages', p.key); }
      await db.del(st, r.id);
    }
  }
  await db.del('projects', id);
}

// Demande au navigateur de ne pas purger les données (Safari peut sinon les effacer)
export async function askPersist() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) { /* rien */ }
  return false;
}
export async function usage() {
  try { if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate(); } catch (e) { /* rien */ }
  return null;
}
