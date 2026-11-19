// Stockage local (IndexedDB). Les fichiers (plans, photos, documents) sont gardés en Blob.
const NAME = 'statera-atelier';
const VERSION = 1;
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
  settings: { key: 'key' }
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

export const db = {
  async get(store, key) { const d = await open(); return reqP(d.transaction(store).objectStore(store).get(key)); },
  async all(store) { const d = await open(); return reqP(d.transaction(store).objectStore(store).getAll()); },
  async by(store, index, value) { const d = await open(); return reqP(d.transaction(store).objectStore(store).index(index).getAll(value)); },
  async put(store, obj) {
    if (store !== 'settings' && store !== 'pages') obj.updatedAt = new Date().toISOString();
    const d = await open();
    await new Promise((res, rej) => { const t = d.transaction(store, 'readwrite'); t.objectStore(store).put(obj); t.oncomplete = res; t.onerror = () => rej(t.error); });
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
