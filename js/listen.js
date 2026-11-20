// Écoute du rendez-vous : transcription en direct (reconnaissance vocale de l'appareil),
// copie de sécurité audio, puis résumé par Gemini (compte Google de l'agence) et retour structuré en note.
import { h, put, clear, icon, toast, uid, todayISO, nowTime, fmtDate } from './lib.js';
import { db } from './db.js';
import { phase, fileName, fileCode, destFor } from './data.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export function promptFor(p, transcript) {
  return [
    'Tu es l’assistant de Michel Mangion, architecte (STATERA Architecture, Corse).',
    'Voici la transcription brute d’un rendez-vous avec un client. Elle peut contenir des erreurs de reconnaissance vocale : corrige-les avec bon sens, sans rien inventer.',
    'Projet : ' + p.nom + (p.code ? ' (dossier ' + p.code + ')' : '') + ' · Client : ' + (p.client || '—') + ' · Phase : ' + phase(p.phase).nom + '.',
    '',
    'Réponds en français, exactement avec ces cinq rubriques et ces titres, sans autre texte :',
    'RÉSUMÉ',
    '(5 à 10 lignes, factuelles, ce qui a été présenté et discuté)',
    'DÉCISIONS',
    '- une décision par ligne (ce qui a été arrêté avec le client)',
    'ACTIONS',
    '- action | qui (Michel, client, géomètre, BET…) | échéance si dite',
    'À SUIVRE',
    '- questions ouvertes, points à vérifier, demandes du client',
    'PROCHAIN RDV',
    '(date, objet, documents à préparer — ou « non fixé »)',
    '',
    'TRANSCRIPTION :',
    transcript
  ].join('\n');
}

export function parseSummary(txt) {
  const keys = { 'RÉSUMÉ': 'resume', 'RESUME': 'resume', 'DÉCISIONS': 'decisions', 'DECISIONS': 'decisions', 'ACTIONS': 'actions', 'À SUIVRE': 'suivre', 'A SUIVRE': 'suivre', 'PROCHAIN RDV': 'rdv' };
  const out = { resume: [], decisions: [], actions: [], suivre: [], rdv: [] };
  let cur = 'resume';
  for (const raw of String(txt || '').split(/\r?\n/)) {
    const line = raw.replace(/\*\*/g, '').replace(/^#+\s*/, '').trim();
    if (!line) continue;
    const k = Object.keys(keys).find((x) => line.toUpperCase().replace(/[:：]\s*$/, '') === x);
    if (k) { cur = keys[k]; continue; }
    out[cur].push(line.replace(/^[-–•*]\s*/, ''));
  }
  return out;
}

/* ---------- Session d'écoute unique : elle continue quand on quitte la page RDV (plans, croquis, fichiers…) ---------- */
const LSK = (pid) => 'listen:' + pid;
const S = { on: false, pid: null, nom: '', pinfo: null, text: '', interim: '', t0: 0, rec: null, media: null, chunks: [], timer: null, saveT: null, subs: new Set() };
export const listening = () => (S.on ? { projectId: S.pid, nom: S.nom, since: S.t0 } : null);
const elapsed = () => { const s = Math.max(0, Math.round((Date.now() - S.t0) / 1000)); return Math.floor(s / 60) + ' min ' + String(s % 60).padStart(2, '0'); };
function emit() { S.subs.forEach((f) => { try { f(); } catch (e) { /* carte retirée */ } }); drawFloat(); }
function persist(now) {
  clearTimeout(S.saveT);
  const go = () => db.setSetting(LSK(S.pid), S.text).catch(() => {});
  if (now) return go(); S.saveT = setTimeout(go, 800);
}
export async function loadTranscript(p) {
  if (S.pid === p.id && (S.on || S.text)) return S.text;
  const v = await db.setting(LSK(p.id), null);
  return v == null ? ((p.rdv && p.rdv.transcript) || '') : v;
}
async function setTranscript(pid, text) { if (S.pid === pid) S.text = text; await db.setSetting(LSK(pid), text); }

async function startSession(p) {
  if (S.on) return;
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (e) { toast('Micro refusé : autorise le micro pour l’Atelier'); return; }
  const text = await loadTranscript(p);
  Object.assign(S, { on: true, pid: p.id, nom: p.nom || p.client || 'Projet', pinfo: { id: p.id, code: p.code, phase: p.phase, nom: p.nom, client: p.client, drive: p.drive }, text, interim: '', t0: Date.now(), chunks: [] });
  try {
    const media = new MediaRecorder(stream); S.media = media;
    media.ondataavailable = (e) => e.data.size && S.chunks.push(e.data);
    media.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      if (!S.chunks.length) return;
      const pp = S.pinfo;
      const type = media.mimeType || 'audio/mp4'; const ext = /mp4|aac/.test(type) ? 'm4a' : 'webm';
      const blob = new Blob(S.chunks, { type }); S.chunks = [];
      const name = fileName({ date: todayISO(), code: fileCode(pp), phase: pp.phase, type: 'CR', objet: 'Audio-RDV-' + nowTime().replace(':', 'h'), ind: 'A', ext });
      const d = destFor('travail', pp);
      await db.put('files', { id: uid(), projectId: pp.id, ...d, name, mime: type, size: blob.size, blob, phase: pp.phase, createdAt: new Date().toISOString(), source: 'import' });
      toast('Audio enregistré dans ' + d.folder + ' › ' + d.sub);
    };
    media.start(10000);
  } catch (e) { /* enregistrement audio indisponible : la transcription continue */ }
  if (SR) startRec();
  S.timer = setInterval(emit, 1000);
  try { navigator.wakeLock && (window.__wl = await navigator.wakeLock.request('screen')); } catch (e) { /* écran */ }
  // l'écran se rallume : on relance le verrou d'écran et la reconnaissance si iOS l'a coupée
  emit();
}
function startRec() {
  const rec = new SR(); S.rec = rec; rec.lang = 'fr-FR'; rec.continuous = true; rec.interimResults = true;
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) { S.text += (S.text && !/\s$/.test(S.text) ? ' ' : '') + r[0].transcript.trim() + '.'; persist(); }
      else interim += r[0].transcript;
    }
    S.interim = interim; emit();
  };
  rec.onend = () => { if (S.on && S.rec === rec) { try { rec.start(); } catch (e) { setTimeout(() => S.on && startRec(), 300); } } };
  rec.onerror = (e) => { if (e.error === 'not-allowed') S.srDenied = true; };
  try { rec.start(); } catch (e) { /* déjà lancé */ }
}
export function stopSession() {
  if (!S.on) return;
  S.on = false; clearInterval(S.timer);
  const rec = S.rec; S.rec = null;
  try { rec && rec.stop(); } catch (e) { /* rien */ }
  try { S.media && S.media.state !== 'inactive' && S.media.stop(); } catch (e) { /* rien */ }
  try { window.__wl && window.__wl.release(); } catch (e) { /* rien */ }
  S.interim = ''; persist(true); emit();
}
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !S.on) return;
  try { navigator.wakeLock && (window.__wl = await navigator.wakeLock.request('screen')); } catch (e) { /* écran */ }
});

// Bandeau flottant visible partout pendant l'écoute : revenir au RDV ou arrêter, depuis n'importe quelle page
let floatEl = null;
function drawFloat() {
  const onRdv = (location.hash || '').startsWith('#/p/' + S.pid + '/rdv');
  if (!S.on || onRdv) { if (floatEl) { floatEl.remove(); floatEl = null; } return; }
  if (!floatEl) { floatEl = h('div', { class: 'listen-float', role: 'status', 'aria-live': 'off' }); document.body.appendChild(floatEl); }
  put(clear(floatEl), h('span', { class: 'lf-dot', 'aria-hidden': 'true' }),
    h('span', { class: 'lf-t' }, h('b', null, 'Écoute en cours'), ' · ' + elapsed() + ' · ' + S.nom),
    h('a', { class: 'lf-btn', href: '#/p/' + S.pid + '/rdv' }, 'Revenir au RDV'),
    h('button', { class: 'lf-btn lf-stop', onclick: () => { stopSession(); location.hash = '#/p/' + S.pid + '/rdv'; } }, 'Arrêter'));
}
window.addEventListener('hashchange', drawFloat);

export function listenCard(p, { onNote } = {}) {
  p.rdv = p.rdv || {};
  const mine = () => S.pid === p.id;
  const save = () => db.put('projects', p);
  const consent = h('input', { type: 'checkbox' });
  const status = h('span', { class: 'small muted' }, SR ? 'Prêt' : 'Transcription en direct indisponible sur ce navigateur : l’audio sera enregistré.');
  const live = h('div', { class: 'listen-live' });
  const tx = h('textarea', { class: 'textarea listen-tx', rows: 6, placeholder: 'La transcription s’affiche ici pendant le rendez-vous. Tu peux la corriger. L’écoute continue si tu vas montrer un plan : reviens ici par le bandeau rouge.' });
  loadTranscript(p).then((t) => { if (!tx.value) tx.value = t; if (t && !(S.on && mine())) put(clear(btn), icon('phone', 18), 'Reprendre l’écoute'); });
  tx.addEventListener('input', () => setTranscript(p.id, tx.value));
  const btn = h('button', { class: 'btn btn-primary listen-btn', onclick: () => {
    if (S.on && mine()) { stopSession(); return; }
    if (S.on) { toast('Une écoute est déjà en cours sur « ' + S.nom + ' »'); return; }
    if (!consent.checked) { toast('Coche d’abord l’accord du client'); return; }
    startSession(p);
  } }, icon('phone', 18), 'Démarrer l’écoute');
  const gemBtn = h('button', { class: 'btn btn-line', onclick: () => toGemini() }, icon('share', 18), '1 · Résumer avec Gemini');
  const gemHint = h('span', { class: 'small muted' }, 'Copie la consigne et la transcription, ouvre Gemini : colle, puis copie sa réponse.');
  const sumBox = h('textarea', { class: 'textarea', rows: 6, placeholder: 'Colle ici la réponse de Gemini, puis « Créer la note ».' });
  let wasOn = false;
  const sync = () => {
    if (!btn.isConnected && wasOn !== null) { /* carte encore en construction */ }
    const running = S.on && mine();
    if (running) {
      consent.checked = true;
      if (document.activeElement !== tx) { tx.value = S.text; tx.scrollTop = tx.scrollHeight; }
      live.textContent = S.interim;
      status.textContent = S.srDenied ? 'Reconnaissance vocale refusée : l’audio reste enregistré.' : '● Écoute en cours · ' + elapsed();
      btn.classList.add('on'); if (!wasOn) put(clear(btn), icon('close', 18), 'Arrêter');
    } else if (wasOn) {
      live.textContent = ''; status.textContent = 'Écoute terminée'; btn.classList.remove('on');
      put(clear(btn), icon('phone', 18), 'Reprendre l’écoute');
      if (mine()) tx.value = S.text;
    }
    wasOn = running;
  };
  const sub = () => { if (!card.isConnected) { if (card.__mounted) S.subs.delete(sub); return; } card.__mounted = true; sync(); };
  S.subs.add(sub);
  requestAnimationFrame(() => { card.__mounted = true; sync(); drawFloat(); });
  const getText = () => tx.value;

  let api = null;
  fetch('/api/resume', { cache: 'no-store' }).then((r) => r.ok ? r.json() : null).then((j) => { api = j; if (j && j.configured) { put(clear(gemBtn), icon('share', 18), '1 · Résumer avec Gemini (auto)'); gemHint.textContent = 'Gemini lit la transcription et écrit le résumé dans le cadre ci-dessous (5 à 20 secondes).'; sumBox.placeholder = 'Le résumé de Gemini apparaît ici. Tu peux le corriger, puis « Créer la note ».'; } }).catch(() => {});
  async function toGemini() {
    if (!getText().trim()) { toast('Pas encore de transcription'); return; }
    const text = promptFor(p, getText());
    if (api && api.configured) {
      gemBtn.disabled = true; const old = gemBtn.lastChild.textContent; gemBtn.lastChild.textContent = 'Gemini rédige…';
      try {
        let tk = ''; try { tk = localStorage.getItem('statera-atelier-ia') || ''; } catch (e) { /* stockage */ }
        const r = await fetch('/api/resume', { method: 'POST', signal: AbortSignal.timeout ? AbortSignal.timeout(70000) : undefined, headers: { 'Content-Type': 'application/json', 'x-atelier-token': tk }, body: JSON.stringify({ prompt: text }) });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.text) { sumBox.value = j.text; sumBox.scrollIntoView({ behavior: 'smooth', block: 'center' }); toast('Résumé prêt : vérifie-le puis « Créer la note »'); return; }
        toast(r.status === 401 ? 'Code d’accès IA incorrect (Réglages)' : 'Gemini indisponible (' + (j.message || j.error || r.status) + ') : passage en copier-coller');
      } catch (e) { toast(e && e.name === 'TimeoutError' ? 'Gemini trop lent : passage en copier-coller' : 'Hors connexion : passage en copier-coller'); }
      finally { gemBtn.disabled = false; gemBtn.lastChild.textContent = old; }
    }
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) { /* presse-papiers refusé */ }
    if (!ok) { const ta = h('textarea', { style: { position: 'fixed', opacity: 0 } }); ta.value = text; document.body.appendChild(ta); ta.select(); try { ok = document.execCommand('copy'); } catch (e) { /* rien */ } ta.remove(); }
    toast(ok ? 'Consigne + transcription copiées : colle-les dans Gemini' : 'Copie impossible : sélectionne la transcription à la main');
    window.open('https://gemini.google.com/app', '_blank', 'noopener');
  }

  async function makeNote() {
    const s = parseSummary(sumBox.value);
    if (!s.resume.length && !s.decisions.length && !s.actions.length) { toast('Colle d’abord la réponse de Gemini'); return; }
    const todos = s.actions.map((a) => { const [text, who, due] = a.split('|').map((x) => (x || '').trim()); return { text, who: who || '', due: due || '', done: false }; });
    const n = { id: uid(), projectId: p.id, type: 'rdv', titre: 'Rendez-vous du ' + fmtDate(todayISO()), date: todayISO(), heure: nowTime(), lieu: '', participants: p.client || '',
      agenda: [], body: s.resume.join('\n') + (s.suivre.length ? '\n\nÀ suivre :\n' + s.suivre.map((x) => '— ' + x).join('\n') : '') + (s.rdv.length ? '\n\nProchain rendez-vous : ' + s.rdv.join(' ') : ''),
      decisions: s.decisions.map((text) => ({ text })), todos, sketch: [], sketchAspect: 0.62, photos: [], phase: p.phase, transcript: getText(), source: 'ecoute', createdAt: new Date().toISOString() };
    await db.put('notes', n);
    if (s.rdv.length || s.suivre.length) { p.rdv.suite = [...s.suivre, ...(s.rdv.length ? ['Prochain RDV : ' + s.rdv.join(' ')] : [])].join('\n'); }
    p.rdv.transcript = ''; await save(); await setTranscript(p.id, ''); tx.value = '';
    toast('Note créée avec ' + n.decisions.length + ' décision(s) et ' + todos.length + ' action(s)');
    if (onNote) onNote(n); else location.hash = '#/p/' + p.id + '/notes/' + n.id;
  }

  const card = h('section', { class: 'rdv-card listen' },
    h('h2', null, 'Écoute du rendez-vous'),
    h('label', { class: 'listen-consent' }, consent, h('span', null, 'Le client est informé que l’échange est enregistré pour en faire le compte rendu, et il est d’accord.')),
    h('div', { class: 'listen-bar' }, btn, status),
    live, tx,
    h('div', { class: 'listen-steps' },
      gemBtn, gemHint),
    sumBox,
    h('div', { class: 'listen-steps' },
      h('button', { class: 'btn btn-primary', onclick: makeNote }, icon('note', 18), '2 · Créer la note'),
      h('span', { class: 'small muted' }, 'Résumé, décisions et actions deviennent une note du projet, exportable en compte rendu PDF.')));
  return card;
}
