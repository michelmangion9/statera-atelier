// Écoute du rendez-vous : transcription en direct (reconnaissance vocale de l'appareil),
// copie de sécurité audio, puis résumé par Gemini (compte Google de l'agence) et retour structuré en note.
import { h, put, clear, icon, toast, uid, todayISO, nowTime, fmtDate } from './lib.js';
import { db } from './db.js';
import { phase, fileName, fileCode } from './data.js';

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

export function listenCard(p, { onNote } = {}) {
  p.rdv = p.rdv || {};
  let rec = null, media = null, chunks = [], on = false, finalText = p.rdv.transcript || '', t0 = 0, timer = null;
  const save = () => db.put('projects', p);
  const consent = h('input', { type: 'checkbox' });
  const status = h('span', { class: 'small muted' }, SR ? 'Prêt' : 'Transcription en direct indisponible sur ce navigateur : l’audio sera enregistré.');
  const live = h('div', { class: 'listen-live' });
  const tx = h('textarea', { class: 'textarea listen-tx', rows: 6, placeholder: 'La transcription s’affiche ici pendant le rendez-vous. Tu peux la corriger.' });
  tx.value = finalText;
  tx.addEventListener('input', () => { finalText = tx.value; p.rdv.transcript = finalText; save(); });
  const btn = h('button', { class: 'btn btn-primary listen-btn', onclick: () => (on ? stop() : start()) }, icon('phone', 18), 'Démarrer l’écoute');
  const sumBox = h('textarea', { class: 'textarea', rows: 6, placeholder: 'Colle ici la réponse de Gemini, puis « Créer la note ».' });

  function tick() { const s = Math.round((Date.now() - t0) / 1000); status.textContent = '● Écoute en cours · ' + Math.floor(s / 60) + ' min ' + String(s % 60).padStart(2, '0'); }
  async function start() {
    if (!consent.checked) { toast('Coche d’abord l’accord du client'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      media = new MediaRecorder(stream);
      media.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      media.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (!chunks.length) return;
        const type = media.mimeType || 'audio/mp4'; const ext = /mp4|aac/.test(type) ? 'm4a' : 'webm';
        const blob = new Blob(chunks, { type });
        const name = fileName({ date: todayISO(), code: fileCode(p), phase: p.phase, type: 'CR', objet: 'Audio-RDV-' + nowTime().replace(':', 'h'), ind: 'A', ext });
        await db.put('files', { id: uid(), projectId: p.id, folder: phase(p.phase).dossier, sub: '02_Travail', name, mime: type, size: blob.size, blob, phase: p.phase, createdAt: new Date().toISOString(), source: 'import' });
        toast('Audio enregistré dans ' + phase(p.phase).dossier + ' › 02_Travail');
      };
      media.start(10000);
    } catch (e) { toast('Micro refusé : autorise le micro pour l’Atelier'); return; }
    on = true; t0 = Date.now(); timer = setInterval(tick, 1000); tick();
    btn.classList.add('on'); put(clear(btn), icon('close', 18), 'Arrêter');
    if (SR) startRec();
    try { navigator.wakeLock && (window.__wl = await navigator.wakeLock.request('screen')); } catch (e) { /* écran */ }
  }
  function startRec() {
    rec = new SR(); rec.lang = 'fr-FR'; rec.continuous = true; rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) { finalText += (finalText && !/\s$/.test(finalText) ? ' ' : '') + r[0].transcript.trim() + '.'; tx.value = finalText; tx.scrollTop = tx.scrollHeight; p.rdv.transcript = finalText; }
        else interim += r[0].transcript;
      }
      live.textContent = interim;
    };
    rec.onend = () => { if (on) { try { rec.start(); } catch (e) { setTimeout(() => on && startRec(), 300); } } else save(); };
    rec.onerror = (e) => { if (e.error === 'not-allowed') { status.textContent = 'Reconnaissance vocale refusée : l’audio reste enregistré.'; } };
    try { rec.start(); } catch (e) { /* déjà lancé */ }
  }
  function stop() {
    on = false; clearInterval(timer);
    try { rec && rec.stop(); } catch (e) { /* rien */ }
    try { media && media.state !== 'inactive' && media.stop(); } catch (e) { /* rien */ }
    try { window.__wl && window.__wl.release(); } catch (e) { /* rien */ }
    live.textContent = ''; status.textContent = 'Écoute terminée'; btn.classList.remove('on');
    put(clear(btn), icon('phone', 18), 'Reprendre l’écoute');
    p.rdv.transcript = finalText; save();
  }

  async function toGemini() {
    if (!finalText.trim()) { toast('Pas encore de transcription'); return; }
    const text = promptFor(p, finalText);
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
      decisions: s.decisions.map((text) => ({ text })), todos, sketch: [], sketchAspect: 0.62, photos: [], phase: p.phase, transcript: finalText, source: 'ecoute', createdAt: new Date().toISOString() };
    await db.put('notes', n);
    if (s.rdv.length || s.suivre.length) { p.rdv.suite = [...s.suivre, ...(s.rdv.length ? ['Prochain RDV : ' + s.rdv.join(' ')] : [])].join('\n'); }
    p.rdv.transcript = ''; await save();
    toast('Note créée avec ' + n.decisions.length + ' décision(s) et ' + todos.length + ' action(s)');
    if (onNote) onNote(n); else location.hash = '#/p/' + p.id + '/notes/' + n.id;
  }

  return h('section', { class: 'rdv-card listen' },
    h('h2', null, 'Écoute du rendez-vous'),
    h('label', { class: 'listen-consent' }, consent, h('span', null, 'Le client est informé que l’échange est enregistré pour en faire le compte rendu, et il est d’accord.')),
    h('div', { class: 'listen-bar' }, btn, status),
    live, tx,
    h('div', { class: 'listen-steps' },
      h('button', { class: 'btn btn-line', onclick: toGemini }, icon('share', 18), '1 · Résumer avec Gemini'),
      h('span', { class: 'small muted' }, 'Copie la consigne et la transcription, ouvre Gemini : colle, puis copie sa réponse.')),
    sumBox,
    h('div', { class: 'listen-steps' },
      h('button', { class: 'btn btn-primary', onclick: makeNote }, icon('note', 18), '2 · Créer la note'),
      h('span', { class: 'small muted' }, 'Résumé, décisions et actions deviennent une note du projet, exportable en compte rendu PDF.')));
}
