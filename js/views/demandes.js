// Demandes clients : du questionnaire du site à la création du projet
// questionnaire (QR / code STATERA1) → fiche client → proposition d'honoraires et contrat (module Honoraires) → projet + dossier Drive
import { h, put, clear, icon, uid, sheet, toast, confirmBox, pickFiles, fmtDate, todayISO, loadScript, blobURL } from '../lib.js';
import { db } from '../db.js';

const HANDOFF = 'statera-atelier-hon';
export const STATUTS = [
  { id: 'nouvelle', nom: 'Nouvelle' },
  { id: 'proposition', nom: 'Proposition envoyée' },
  { id: 'acceptee', nom: 'Acceptée' },
  { id: 'refusee', nom: 'Sans suite' },
  { id: 'projet', nom: 'Projet créé' }
];
const statut = (id) => STATUTS.find((s) => s.id === id) || STATUTS[0];
const euro = (v) => (Number(v) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €';
const clientName = (d) => [d.client.prenom, d.client.nom].filter(Boolean).join(' ') || d.client.societe || 'Client sans nom';

/* ---------- Questionnaire du site : code STATERA1.… (même format que l'app Honoraires) ---------- */
export function decodeQuestionnaire(text) {
  const raw = String(text || '').trim();
  const at = raw.indexOf('STATERA1.');
  if (at < 0) throw new Error('Ce code ne provient pas d’un questionnaire STATERA.');
  const b64 = raw.slice(at + 9).replace(/[^A-Za-z0-9_-]/g, '');
  let p;
  try {
    const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4));
    p = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
  } catch (e) { throw new Error('Code incomplet ou abîmé : copie-le en entier.'); }
  if (!p || typeof p !== 'object') throw new Error('Code illisible.');
  const s = (v) => (typeof v === 'string' ? v.slice(0, 300) : '');
  const n = (v) => (Number.isFinite(+v) && +v > 0 ? Math.round(+v) : 0);
  return { fn: s(p.fn), ln: s(p.ln), co: s(p.co), ad: s(p.ad), pn: s(p.pn), pl: s(p.pl), cad: s(p.cad), sn: n(p.sn), sr: n(p.sr), si: n(p.si), st: n(p.st), w: n(p.w), ph: s(p.ph) || 'p', ct: p.ct === 'pro' ? 'pro' : 'consumer', em: s(p.em || p.email), tel: s(p.tel || p.phone), msg: s(p.msg || p.prog) };
}
function communeOf(lieu) { const parts = String(lieu || '').split(',').map((x) => x.trim()).filter(Boolean); return (parts[parts.length - 1] || '').replace(/^\d{5}\s*/, ''); }
function fromQuestionnaire(q, code) {
  return {
    id: uid(), createdAt: new Date().toISOString(), date: todayISO(), statut: 'nouvelle', source: 'questionnaire', code,
    client: { prenom: q.fn, nom: q.ln, societe: q.co, type: q.ct, adresse: q.ad, email: q.em, tel: q.tel },
    projet: { intitule: q.pn, lieu: q.pl, commune: communeOf(q.pl), cadastre: q.cad, sn: q.sn, sr: q.sr, si: q.si, st: q.st, budget: q.w, phases: q.ph, programme: q.msg },
    notes: '', files: []
  };
}
function blank() {
  return { id: uid(), createdAt: new Date().toISOString(), date: todayISO(), statut: 'nouvelle', source: 'manuel',
    client: { prenom: '', nom: '', societe: '', type: 'consumer', adresse: '', email: '', tel: '' },
    projet: { intitule: '', lieu: '', commune: '', cadastre: '', sn: 0, sr: 0, si: 0, st: 0, budget: 0, phases: 'p', programme: '' }, notes: '', files: [] };
}

/* ---------- Lecture du QR code (jsQR, partagé avec le module Honoraires) ---------- */
async function jsqr() { await loadScript('/honoraires/jsQR.js'); if (!window.jsQR) throw new Error('Lecteur QR indisponible'); return window.jsQR; }
function decodeCanvas(J, cv) { const img = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height); const r = J(img.data, cv.width, cv.height, { inversionAttempts: 'attemptBoth' }); return r ? r.data : null; }
async function qrFromImage(file) {
  const J = await jsqr();
  const bmp = await createImageBitmap(file);
  for (const max of [1600, 1000, 2400]) {
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    const t = decodeCanvas(J, cv); if (t) return t;
  }
  return null;
}

export function importQuestionnaire() {
  return new Promise((res) => {
    let stream = null, raf = 0, done = false;
    const stop = () => { cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; };
    const msg = h('div', { class: 'small muted' });
    const ta = h('textarea', { class: 'textarea', rows: 4, placeholder: 'Colle ici le code reçu par e-mail (STATERA1.…)' });
    const video = h('video', { playsinline: true, muted: true, style: { width: '100%', maxHeight: '320px', background: '#000', display: 'none' } });
    const accept = (text) => {
      try { const q = decodeQuestionnaire(text); done = true; stop(); s.close(); res({ q, code: text.trim() }); }
      catch (e) { msg.textContent = e.message; }
    };
    const scan = async () => {
      try {
        const J = await jsqr();
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = stream; video.style.display = 'block'; await video.play();
        const cv = document.createElement('canvas');
        const tick = () => {
          if (!stream) return;
          if (video.videoWidth) { cv.width = video.videoWidth; cv.height = video.videoHeight; cv.getContext('2d').drawImage(video, 0, 0); const t = decodeCanvas(J, cv); if (t) { accept(t); return; } }
          raf = requestAnimationFrame(tick);
        };
        msg.textContent = 'Vise le QR code de l’e-mail…'; raf = requestAnimationFrame(tick);
      } catch (e) { msg.textContent = e && e.name === 'NotAllowedError' ? 'Accès à la caméra refusé : utilise une photo du QR code ou colle le code.' : (e.message || 'Caméra indisponible'); }
    };
    const photo = async () => {
      const [f] = await pickFiles({ accept: 'image/*' }); if (!f) return;
      msg.textContent = 'Lecture du QR code…';
      try { const t = await qrFromImage(f); if (t) accept(t); else msg.textContent = 'Aucun QR code reconnu : recadre au plus près du code.'; } catch (e) { msg.textContent = e.message; }
    };
    const s = sheet({ title: 'Importer un questionnaire', wide: true, onClose: () => { stop(); if (!done) res(null); }, body: [
      h('div', { class: 'small muted' }, 'Le questionnaire « Démarrer un projet » du site t’arrive par e-mail avec un QR code et un code texte.'),
      h('div', { class: 'actions' },
        h('button', { class: 'btn btn-primary', onclick: scan }, icon('camera', 18), 'Scanner le QR code'),
        h('button', { class: 'btn btn-line', onclick: photo }, icon('file', 18), 'Photo ou capture du QR code')),
      video, ta,
      h('button', { class: 'btn btn-line', onclick: () => accept(ta.value) }, 'Importer le code collé'),
      msg] });
  });
}

/* ---------- Vues ---------- */
export async function render(view, params) {
  if (params.id) return renderOne(view, params.id);
  const list = (await db.all('demandes')).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const add = async (d) => { await db.put('demandes', d); location.hash = '#/demandes/' + d.id; };
  const row = (d) => h('a', { class: 'row', href: '#/demandes/' + d.id },
    h('span', { class: 'row-main' },
      h('span', { class: 'row-t' }, clientName(d) + (d.projet.intitule ? ' · ' + d.projet.intitule : '')),
      h('span', { class: 'row-s' }, [d.projet.commune || d.projet.lieu, 'reçue le ' + fmtDate(d.date), d.honSummary && d.honSummary.totalHT ? euro(d.honSummary.totalHT) + ' HT' + (d.honSummary.ref ? ' · ' + d.honSummary.ref : '') : null].filter(Boolean).join(' · '))),
    h('span', { class: d.statut === 'nouvelle' ? 'tag tag-fill' : d.statut === 'refusee' ? 'tag tag-dash' : 'tag' }, statut(d.statut).nom),
    h('span', { class: 'chev' }, icon('chev', 18)));
  const open = list.filter((d) => !['projet', 'refusee'].includes(d.statut));
  const closed = list.filter((d) => ['projet', 'refusee'].includes(d.statut));
  clear(view).appendChild(h('div', { class: 'page' },
    h('header', { class: 'page-head' },
      h('div', null, h('div', { class: 'eyebrow' }, 'Avant le projet'), h('h1', { class: 'title' }, 'Demandes')),
      h('div', { class: 'actions' },
        h('button', { class: 'btn btn-primary', onclick: async () => { const r = await importQuestionnaire(); if (r) { await add(fromQuestionnaire(r.q, r.code)); toast('Questionnaire importé'); } } }, icon('camera', 18), 'Importer un questionnaire'),
        h('button', { class: 'btn btn-line', onclick: () => add(blank()) }, icon('plus', 18), 'Nouvelle demande'))),
    h('div', { class: 'small muted mb' }, 'Une demande devient un projet en quatre temps : fiche client, proposition d’honoraires, contrat signé, puis création du projet et de son dossier Drive.'),
    h('section', { class: 'card' }, h('h2', { class: 'section-t' }, 'En cours'), open.length ? h('div', { class: 'list' }, open.map(row)) : h('div', { class: 'empty' }, 'Aucune demande en cours. Importe un questionnaire reçu par e-mail ou crée une demande à la main.')),
    closed.length ? h('section', { class: 'card mt' }, h('h2', { class: 'section-t' }, 'Traitées'), h('div', { class: 'list' }, closed.map(row))) : null));
}

async function renderOne(view, id) {
  const d = await db.get('demandes', id);
  if (!d) { clear(view).appendChild(h('div', { class: 'page' }, h('div', { class: 'alert' }, 'Demande introuvable.'), h('a', { class: 'btn btn-line mt', href: '#/demandes' }, 'Retour aux demandes'))); return; }
  d.files = d.files || [];
  // Retour du module Honoraires : on récupère la proposition en cours
  try {
    const hf = JSON.parse(localStorage.getItem(HANDOFF) || 'null');
    if (hf && hf.demandeId === d.id && hf.dos) {
      d.hon = hf.dos; d.honSummary = hf.summary || d.honSummary;
      if (d.statut === 'nouvelle') d.statut = 'proposition';
      await db.put('demandes', d);
    }
  } catch (e) { /* rien */ }
  let t = null;
  const save = () => { clearTimeout(t); t = setTimeout(() => db.put('demandes', d), 350); };
  const inp = (obj, k, attrs = {}) => { const el = h(attrs.tag || 'input', Object.assign({ class: attrs.tag === 'textarea' ? 'textarea' : 'input', value: obj[k] ?? '' }, attrs)); el.value = obj[k] ?? ''; el.addEventListener('input', () => { obj[k] = attrs.type === 'number' ? Number(el.value) || 0 : el.value; save(); }); return el; };
  const fld = (label, el) => h('label', { class: 'field' }, h('span', null, label), el);
  const typeSel = h('select', { class: 'select' }, h('option', { value: 'consumer' }, 'Particulier'), h('option', { value: 'pro' }, 'Professionnel'));
  typeSel.value = d.client.type || 'consumer'; typeSel.addEventListener('change', () => { d.client.type = typeSel.value; save(); });
  const ph = (k, label) => { const c = h('input', { type: 'checkbox', checked: (d.projet.phases || '').includes(k) }); c.addEventListener('change', () => { const set = new Set((d.projet.phases || '').split('')); c.checked ? set.add(k) : set.delete(k); d.projet.phases = ['p', 's', 'i'].filter((x) => set.has(x)).join(''); save(); }); return h('label', { class: 'chk' }, c, h('span', null, label)); };

  const statutBox = h('div', { class: 'chips', role: 'group', 'aria-label': 'Statut' }, STATUTS.filter((s) => s.id !== 'projet' || d.statut === 'projet').map((s) =>
    h('button', { class: 'chip', 'aria-pressed': String(d.statut === s.id), onclick: (e) => { if (d.statut === 'projet') return; d.statut = s.id; save(); statutBox.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } }, s.nom)));

  // Proposition et contrat : module Honoraires (même moteur, même contrat que l'app Honoraires)
  const openHon = () => {
    const prefill = { fn: d.client.prenom, ln: d.client.nom, co: d.client.societe, ad: d.client.adresse, pn: d.projet.intitule, pl: [d.projet.lieu, d.projet.lieu && d.projet.lieu.includes(d.projet.commune) ? '' : d.projet.commune].filter(Boolean).join(', '),
      cad: d.projet.cadastre, sn: d.projet.sn || 0, sr: d.projet.sr || 0, si: d.projet.si || 0, st: d.projet.st || 0, w: d.projet.budget || 0, ph: d.projet.phases || 'p', ct: d.client.type, email: d.client.email, tel: d.client.tel, programme: d.projet.programme };
    try { localStorage.setItem(HANDOFF, JSON.stringify({ demandeId: d.id, label: clientName(d) + (d.projet.intitule ? ' · ' + d.projet.intitule : ''), fresh: !d.hon, dos: d.hon || null, prefill, summary: d.honSummary || null })); }
    catch (e) { toast('Stockage indisponible (navigation privée ?)'); return; }
    db.put('demandes', d).then(() => { location.href = '/honoraires/index.html'; });
  };
  const sum = d.honSummary;
  const honCard = h('section', { class: 'card stack' },
    h('h2', { class: 'section-t', style: { margin: 0 } }, '2 · Proposition d’honoraires et contrat'),
    sum && sum.totalHT ? h('div', null,
      h('div', { class: 'kv' }, h('span', null, 'Référence'), h('b', null, sum.ref || '—')),
      h('div', { class: 'kv' }, h('span', null, 'Total'), h('b', null, euro(sum.totalHT) + ' HT · ' + euro(sum.totalTTC) + ' TTC')),
      h('div', { class: 'kv' }, h('span', null, 'Formule'), h('b', null, sum.formule === 'temps' ? 'Au temps passé' : 'Au forfait')))
      : h('div', { class: 'small muted' }, 'Le calcul part de la fiche ci-dessus : surfaces, budget, accompagnement demandé. Tout reste modifiable dans le module.'),
    h('div', { class: 'actions' },
      h('button', { class: 'btn btn-primary', onclick: openHon }, icon('file', 18), d.hon ? 'Reprendre la proposition' : 'Faire la proposition d’honoraires'),
      d.hon ? h('button', { class: 'btn btn-line', onclick: async () => { if (!(await confirmBox('Repartir d’une nouvelle proposition à partir de la fiche ? L’actuelle reste dans l’historique du module.', 'Recommencer'))) return; d.hon = null; d.honSummary = null; await db.put('demandes', d); openHon(); } }, 'Recommencer depuis la fiche') : null),
    h('div', { class: 'small muted' }, 'Dans le module : « Proposition d’honoraires » (1 page) ou « Contrat d’architecte » (proposition + contrat), puis Imprimer › Enregistrer en PDF dans Fichiers, et joins-le ci-dessous.'));

  // Pièces : proposition, contrat signé…
  const filesBox = h('div');
  const drawFiles = () => put(clear(filesBox), d.files.length ? h('div', { class: 'list' }, d.files.map((f) => h('div', { class: 'row' },
    icon('file', 20),
    h('a', { class: 'row-main', href: blobURL(f.id, f.blob), target: '_blank', rel: 'noopener', style: { textDecoration: 'none', color: 'inherit' } }, h('span', { class: 'row-t fname' }, f.name), h('span', { class: 'row-s' }, (f.kind === 'contrat' ? 'Contrat signé' : f.kind === 'proposition' ? 'Proposition' : 'Pièce') + ' · ' + fmtDate(f.date))),
    h('button', { class: 'btn btn-icon btn-sm btn-ghost', 'aria-label': 'Retirer', onclick: async () => { if (!(await confirmBox('Retirer « ' + f.name + ' » de la demande ?', 'Retirer'))) return; d.files = d.files.filter((x) => x !== f); save(); drawFiles(); } }, icon('close', 16))))) : h('div', { class: 'small muted' }, 'Aucune pièce jointe.'));
  const attach = (kind) => async () => {
    const fs = await pickFiles({ accept: 'application/pdf,image/*', multiple: true });
    for (const f of fs) { const blob = new Blob([await f.arrayBuffer()], { type: f.type }); d.files.push({ id: uid(), kind, name: f.name, mime: f.type, size: blob.size, blob, date: todayISO() }); }
    if (fs.length) { if (kind === 'contrat' && d.statut !== 'projet') d.statut = 'acceptee'; await db.put('demandes', d); renderOne(view, d.id); }
  };
  drawFiles();
  const filesCard = h('section', { class: 'card stack' },
    h('h2', { class: 'section-t', style: { margin: 0 } }, '3 · Pièces et contrat signé'), filesBox,
    h('div', { class: 'actions' },
      h('button', { class: 'btn btn-line', onclick: attach('proposition') }, icon('plus', 16), 'Joindre la proposition'),
      h('button', { class: 'btn btn-line', onclick: attach('contrat') }, icon('check', 16), 'Joindre le contrat signé')),
    h('div', { class: 'small muted' }, 'À la création du projet, ces pièces sont copiées dans 00_ADMIN › 01_Contrat du dossier Drive.'));

  // Création du projet
  const projCard = h('section', { class: 'card stack' }, h('h2', { class: 'section-t', style: { margin: 0 } }, '4 · Projet'));
  if (d.projectId) {
    projCard.appendChild(h('a', { class: 'btn btn-primary', href: '#/p/' + d.projectId }, icon('projets', 18), 'Ouvrir le projet'));
  } else {
    projCard.append(h('div', { class: 'small muted' }, 'Crée le projet et son dossier Drive (dossier type AAAA-NNN_CLIENT_COMMUNE), avec la fiche client remplie et les pièces jointes rangées.'),
      h('button', { class: 'btn btn-primary', onclick: async () => {
        const { newProject } = await import('./projects.js');
        await newProject({ client: [d.client.prenom, d.client.nom].filter(Boolean).join(' ') || d.client.societe, commune: d.projet.commune, nom: d.projet.intitule,
          extra: { clientEmail: d.client.email || '', clientTel: d.client.tel || '', adresse: d.projet.lieu || '', cadastre: d.projet.cadastre || '', programme: d.projet.programme || '', demandeId: d.id, honoraires: d.honSummary || null } },
        async (p) => {
          d.projectId = p.id; d.statut = 'projet'; await db.put('demandes', d);
          for (const f of d.files) await db.put('files', { id: uid(), projectId: p.id, folder: '00_ADMIN', sub: '01_Contrat', name: f.name, mime: f.mime, size: f.size, blob: f.blob, phase: p.phase, createdAt: new Date().toISOString(), source: 'demande' });
        });
      } }, icon('folder', 18), 'Créer le projet et le dossier Drive'));
  }

  clear(view).appendChild(h('div', { class: 'page' },
    h('header', { class: 'page-head' },
      h('div', { style: { flex: '1 1 420px' } },
        h('a', { class: 'crumb', href: '#/demandes' }, icon('back', 16), 'Demandes'),
        h('h1', { class: 'title' }, clientName(d)),
        h('div', { class: 'small muted' }, (d.source === 'questionnaire' ? 'Questionnaire du site' : 'Demande saisie') + ' · reçue le ' + fmtDate(d.date))),
      h('div', { class: 'actions' }, statutBox)),
    h('div', { class: 'cols' },
      h('div', { class: 'stack' },
        h('section', { class: 'card stack' },
          h('h2', { class: 'section-t', style: { margin: 0 } }, '1 · Fiche client'),
          h('div', { class: 'grid g3' }, fld('Prénom', inp(d.client, 'prenom')), fld('Nom', inp(d.client, 'nom')), fld('Société', inp(d.client, 'societe'))),
          h('div', { class: 'grid g3' }, fld('Qualité', typeSel), fld('E-mail', inp(d.client, 'email', { type: 'email', inputmode: 'email' })), fld('Téléphone', inp(d.client, 'tel', { type: 'tel', inputmode: 'tel' }))),
          fld('Adresse du client', inp(d.client, 'adresse'))),
        h('section', { class: 'card stack' },
          h('h2', { class: 'section-t', style: { margin: 0 } }, 'Le projet'),
          h('div', { class: 'grid g2' }, fld('Intitulé', inp(d.projet, 'intitule', { placeholder: 'ex. Maison individuelle' })), fld('Commune', inp(d.projet, 'commune'))),
          h('div', { class: 'grid g2' }, fld('Adresse du terrain', inp(d.projet, 'lieu')), fld('Références cadastrales', inp(d.projet, 'cadastre'))),
          h('div', { class: 'grid g4' }, fld('Neuf (m²)', inp(d.projet, 'sn', { type: 'number', inputmode: 'numeric' })), fld('Rénovation (m²)', inp(d.projet, 'sr', { type: 'number', inputmode: 'numeric' })), fld('Intérieur (m²)', inp(d.projet, 'si', { type: 'number', inputmode: 'numeric' })), fld('Budget travaux HT (€)', inp(d.projet, 'budget', { type: 'number', inputmode: 'numeric' }))),
          h('div', { class: 'field' }, h('span', null, 'Accompagnement demandé'), h('div', { class: 'chips' }, ph('p', 'Conception jusqu’au permis'), ph('s', 'Suivi de chantier'), ph('i', 'Architecture intérieure'))),
          fld('Programme, souhaits du client', inp(d.projet, 'programme', { tag: 'textarea', rows: 4 })),
          fld('Mes notes', inp(d, 'notes', { tag: 'textarea', rows: 4, placeholder: 'Premier appel, budget réel, contraintes, impressions…' })))),
      h('div', { class: 'stack' }, honCard, filesCard, projCard,
        h('button', { class: 'btn btn-line', onclick: async () => { if (await confirmBox('Supprimer cette demande ? Le projet éventuellement créé et son dossier Drive ne sont pas touchés.', 'Supprimer')) { await db.del('demandes', d.id); location.hash = '#/demandes'; } } }, icon('trash', 18), 'Supprimer la demande')))));
}
