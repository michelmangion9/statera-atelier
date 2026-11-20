/* STATERA Atelier — service worker
   Navigation : réseau d'abord, repli hors ligne sur index.html.
   Ressources : précache versionné, purge des anciens caches. */
const VERSION = 'atelier-v1.3.2';
const PRECACHE = [
  './', './index.html', './manifest.json', './css/app.css',
  './js/app.js', './js/lib.js', './js/db.js', './js/data.js', './js/ink.js', './js/pdfkit.js', './js/demo.js', './js/brand.js', './js/seed-entreprises.js',
  './js/views/projects.js', './js/views/project.js', './js/views/notes.js', './js/views/plans.js',
  './js/views/viewer.js', './js/views/points.js', './js/views/files.js', './js/views/chantier.js',
  './js/views/entreprises.js', './js/views/settings.js', './js/views/photo.js', './js/views/rdv.js', './js/listen.js',
  './vendor/pdf.min.js', './vendor/pdf.worker.min.js', './vendor/pdf-lib.min.js', './vendor/fontkit.umd.min.js', './vendor/perfect-freehand.js',
  './assets/fonts/jost-var.woff2', './assets/fonts/eb-garamond-var-italic.woff2', './assets/fonts/jost-latin-300-normal.woff',
  './assets/fonts/jost-latin-400-normal.woff2', './assets/fonts/jost-latin-500-normal.woff2', './assets/fonts/jost-latin-600-normal.woff2',
  './assets/fonts/eb-garamond-latin-400-italic.woff2', './assets/fonts/eb-garamond-latin-500-italic.woff2', './assets/fonts/eb-garamond-latin-400-normal.woff2',
  './assets/fonts/jost-latin-400-normal.woff', './assets/fonts/jost-latin-500-normal.woff', './assets/fonts/jost-latin-600-normal.woff',
  './assets/fonts/eb-garamond-latin-400-italic.woff', './assets/fonts/eb-garamond-latin-400-normal.woff',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png', './assets/icons/apple-touch-icon.png',
  './assets/demo/plan-exemple.pdf'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).pathname.startsWith('/api/')) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok && !res.redirected) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('./index.html', copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && !res.redirected && res.type === 'basic') {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
      }
      return res;
    }))
  );
});
