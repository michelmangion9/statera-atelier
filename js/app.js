// STATERA Atelier — routeur et coquille
import { h, put, clear, icon } from './lib.js';
import { db, askPersist } from './db.js';
import { logoSVG } from './brand.js';
import { setLots, LOTS_VERSION } from './data.js';
import { handleRedirect } from './gdrive.js';

const NAV = [
  { id: 'projets', href: '#/projets', label: 'Projets', icon: 'projets' },
  { id: 'entreprises', href: '#/entreprises', label: 'Entreprises', icon: 'entreprises' },
  { id: 'reglages', href: '#/reglages', label: 'Réglages', icon: 'reglages' }
];

let cleanup = null;
const view = document.getElementById('view');

function parse() {
  const raw = (location.hash || '#/projets').slice(1);
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  const q = Object.fromEntries(new URLSearchParams(qs || ''));
  return { parts, q };
}

async function route() {
  const { parts, q } = parse();
  if (cleanup) { try { cleanup(); } catch (e) { /* rien */ } cleanup = null; }
  document.querySelectorAll('.viewer, .full').forEach((el) => el.remove());
  document.querySelectorAll('#layer > *').forEach((el) => el.remove());
  window.scrollTo(0, 0);
  const section = parts[0] === 'p' ? 'projets' : (parts[0] || 'projets');
  renderNav(section);
  let mod, params = { q };
  try {
    if (parts[0] === 'p' && parts[1]) {
      params.projectId = parts[1];
      const tab = parts[2] || 'synthese';
      params.tab = tab;
      if (tab === 'notes' && parts[3]) { mod = await import('./views/notes.js'); params.noteId = parts[3]; cleanup = await mod.renderEditor(view, params); }
      else if (tab === 'plans' && parts[3]) { mod = await import('./views/viewer.js'); params.planId = parts[3]; cleanup = await mod.renderViewer(view, params); }
      else { mod = await import('./views/project.js'); cleanup = await mod.render(view, params); }
      remember(parts[1]);
    } else if (parts[0] === 'entreprises') {
      mod = await import('./views/entreprises.js'); params.id = parts[1]; cleanup = await mod.render(view, params);
    } else if (parts[0] === 'reglages') {
      mod = await import('./views/settings.js'); cleanup = await mod.render(view, params);
    } else {
      mod = await import('./views/projects.js'); cleanup = await mod.render(view, params);
    }
  } catch (e) {
    console.error(e);
    clear(view).appendChild(h('div', { class: 'page' }, h('div', { class: 'alert' }, 'Une erreur est survenue : ' + (e && e.message ? e.message : e))));
  }
}

async function remember(id) {
  const rec = (await db.setting('recent', [])).filter((x) => x !== id);
  rec.unshift(id);
  await db.setSetting('recent', rec.slice(0, 5));
}

async function renderNav(section) {
  const nav = document.getElementById('nav');
  const tab = document.getElementById('tabbar');
  clear(nav); clear(tab);
  NAV.forEach((n) => {
    nav.appendChild(h('a', { href: n.href, 'aria-current': n.id === section ? 'page' : null }, n.label));
    tab.appendChild(h('a', { href: n.href, 'aria-current': n.id === section ? 'page' : null }, icon(n.icon, 22), n.label));
  });
}
const brand = document.getElementById('brand');
if (brand && !brand.firstChild) brand.appendChild(logoSVG());

window.addEventListener('hashchange', route);


if ('serviceWorker' in navigator && location.protocol === 'https:' && !location.hostname.endsWith('claudeusercontent.com')) {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
    // Vérifie les mises à jour à chaque retour dans l'app (iPad/iPhone gardent l'app ouverte en arrière-plan)
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => { /* hors ligne indisponible */ });
  let reloaded = false;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
}
askPersist();
try { handleRedirect(); } catch (e) { /* retour Google */ }
try { const saved = await db.setting('lots', null); const v = await db.setting('lotsVersion', 1); if (Array.isArray(saved) && saved.length && v === LOTS_VERSION) setLots(saved); } catch (e) { /* liste par défaut */ }
route();
