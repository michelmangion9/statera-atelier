// STATERA Atelier — routeur et coquille
import { h, put, clear, icon } from './lib.js';
import { db, askPersist } from './db.js';

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
  renderNav(section, parts[0] === 'p' ? parts[1] : null);
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

async function renderNav(section, currentProject) {
  const nav = document.getElementById('nav');
  const tab = document.getElementById('tabbar');
  clear(nav); clear(tab);
  NAV.forEach((n) => {
    nav.appendChild(h('a', { href: n.href, 'aria-current': n.id === section ? 'page' : null }, icon(n.icon), n.label));
    tab.appendChild(h('a', { href: n.href, 'aria-current': n.id === section ? 'page' : null }, icon(n.icon, 22), n.label));
  });
  const rec = await db.setting('recent', []);
  const projs = (await Promise.all(rec.map((id) => db.get('projects', id)))).filter(Boolean).slice(0, 4);
  if (projs.length) {
    nav.appendChild(h('div', { class: 'side-proj' }, h('div', { class: 'lbl' }, 'RÉCENTS'),
      projs.map((p) => h('a', { href: '#/p/' + p.id, 'aria-current': p.id === currentProject ? 'page' : null }, h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, p.nom)))));
  }
  const foot = document.getElementById('side-foot');
  put(clear(foot), h('div', null, 'Données sur cet appareil'), h('div', null, 'Michel Mangion · Architecte'));
}

window.addEventListener('hashchange', route);
window.addEventListener('statera:refresh-nav', () => { const { parts } = parse(); renderNav(parts[0] === 'p' ? 'projets' : (parts[0] || 'projets'), parts[0] === 'p' ? parts[1] : null); });

if ('serviceWorker' in navigator && location.protocol === 'https:' && !location.hostname.endsWith('claudeusercontent.com')) {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => { /* hors ligne indisponible */ });
}
askPersist();
route();
