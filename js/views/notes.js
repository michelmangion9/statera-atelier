// Notes de projet : RDV, visites, appels — avec croquis, décisions, actions et export PDF
import { h, put, clear, icon, uid, debounce, toast, fmtDate, todayISO, nowTime, confirmBox, shareOrDownload } from '../lib.js';
import { db } from '../db.js';
import { NOTE_TYPES, noteType, AGENDAS, phase, fileName, fileCode } from '../data.js';
import { sketchSurface, miniSketch, penPicker, penPrefs } from '../ink.js';
import { addPhotos, photoThumb, openPhotoEditor } from './photo.js';
import { loadProject } from './project.js';

export function renderList(body, { project: p, notes }) {
  let filter = 'tous';
  const grid = h('div');
  const draw = () => {
    clear(grid);
    const list = notes.filter((n) => filter === 'tous' || n.type === filter).sort((a, b) => ((b.date || '') + (b.heure || '')).localeCompare((a.date || '') + (a.heure || '')));
    if (!notes.length) {
      grid.appendChild(h('div', { class: 'empty' }, h('div', { class: 'title-sm' }, 'Aucune note'),
        h('div', null, 'Chaque rendez-vous, visite ou appel devient une note datée, avec croquis, décisions et actions. Elle s’exporte en compte rendu PDF.'),
        h('div', { class: 'actions' }, NOTE_TYPES.slice(0, 3).map((t) => h('a', { class: 'btn', href: '#/p/' + p.id + '/notes/new?type=' + t.id }, t.nom)))));
      return;
    }
    if (!list.length) { grid.appendChild(h('div', { class: 'empty' }, 'Aucune note de ce type.')); return; }
    grid.appendChild(h('div', { class: 'note-cards' }, list.map((n) => {
      const open = (n.todos || []).filter((t) => t.text && !t.done).length;
      return h('a', { class: 'note-card', href: '#/p/' + p.id + '/notes/' + n.id },
        h('div', { class: 'flexb' }, h('span', { class: 'tag' }, noteType(n.type).court), h('span', { class: 'small muted' }, fmtDate(n.date) + (n.heure ? ' · ' + n.heure : ''))),
        h('div', { style: { fontSize: '18px', fontWeight: 500 } }, n.titre || noteType(n.type).nom),
        n.body ? h('div', { class: 'ex' }, n.body) : null,
        n.sketch && n.sketch.length ? miniSketch(n.sketch, n.sketchAspect || 0.62) : null,
        h('div', { class: 'small muted', style: { marginTop: 'auto' } }, [
          (n.decisions || []).filter((d) => d.text).length ? (n.decisions || []).filter((d) => d.text).length + ' décision(s)' : null,
          open ? open + ' action(s) ouverte(s)' : null,
          (n.photos || []).length ? n.photos.length + ' photo(s)' : null].filter(Boolean).join(' · ') || ' '));
    })));
  };
  const chip = (id, label) => h('button', { class: 'chip', 'aria-pressed': String(filter === id), onclick: (e) => { filter = id; e.currentTarget.parentElement.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); draw(); } }, label);
  put(clear(body), 
    h('div', { class: 'flexb mb' },
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Type de note' }, chip('tous', 'Toutes'), NOTE_TYPES.filter((t) => notes.some((n) => n.type === t.id)).map((t) => chip(t.id, t.nom))),
      h('div', { class: 'actions' }, h('a', { class: 'btn btn-primary', href: '#/p/' + p.id + '/notes/new' }, icon('plus', 18), 'Nouvelle note'))),
    grid);
  draw();
}

export async function renderEditor(view, params) {
  const p = await loadProject(params.projectId);
  if (params.noteId === 'new') {
    const type = params.q.type || 'rdv';
    const n = { id: uid(), projectId: p.id, type, titre: '', date: todayISO(), heure: nowTime(), lieu: '', participants: p.client || '', agenda: (AGENDAS[type] || []).map((t) => ({ text: t, done: false })), body: '', decisions: [], todos: [], sketch: [], sketchAspect: 0.62, photos: [], phase: p.phase, createdAt: new Date().toISOString() };
    await db.put('notes', n);
    location.replace('#/p/' + p.id + '/notes/' + n.id);
    return;
  }
  const n = await db.get('notes', params.noteId);
  if (!n) { location.replace('#/p/' + p.id + '/notes'); return; }
  n.agenda = n.agenda || []; n.decisions = n.decisions || []; n.todos = n.todos || []; n.photos = n.photos || [];

  const saved = h('span', { class: 'saved', 'aria-live': 'polite' });
  const save = debounce(async () => { await db.put('notes', n); saved.textContent = 'Enregistré'; setTimeout(() => (saved.textContent = ''), 1500); }, 450);
  const bind = (key, el) => { el.value = n[key] ?? ''; el.addEventListener('input', () => { n[key] = el.value; save(); }); return el; };
  const fld = (label, el, cls) => h('label', { class: 'field ' + (cls || '') }, h('span', null, label), el);

  const typeSel = h('select', { class: 'select' }, NOTE_TYPES.map((t) => h('option', { value: t.id }, t.nom)));
  typeSel.value = n.type;
  typeSel.addEventListener('change', () => {
    n.type = typeSel.value;
    if (!n.agenda.some((a) => a.text)) { n.agenda = (AGENDAS[n.type] || []).map((t) => ({ text: t, done: false })); drawAgenda(); }
    save();
  });

  // Listes éditables (ordre du jour, décisions, actions)
  const agendaBox = h('div', { class: 'items' });
  const drawAgenda = () => {
    clear(agendaBox);
    n.agenda.forEach((a, i) => agendaBox.appendChild(h('div', { class: 'item' },
      h('input', { type: 'checkbox', checked: a.done, 'aria-label': 'Point traité', style: { width: '22px', height: '22px', accentColor: '#161616', flexShrink: 0 }, onchange: (e) => { a.done = e.target.checked; save(); } }),
      h('input', { class: 'input', value: a.text, 'aria-label': 'Point de l’ordre du jour', oninput: (e) => { a.text = e.target.value; save(); } }),
      h('button', { class: 'btn btn-icon btn-sm btn-ghost', 'aria-label': 'Retirer', onclick: () => { n.agenda.splice(i, 1); drawAgenda(); save(); } }, icon('close', 16)))));
  };
  const decBox = h('div', { class: 'items' });
  const drawDec = () => {
    clear(decBox);
    n.decisions.forEach((d, i) => decBox.appendChild(h('div', { class: 'item' },
      h('span', { style: { width: '3px', alignSelf: 'stretch', background: '#161616', flexShrink: 0 } }),
      h('input', { class: 'input', value: d.text, placeholder: 'Décision', 'aria-label': 'Décision', oninput: (e) => { d.text = e.target.value; save(); } }),
      h('button', { class: 'btn btn-icon btn-sm btn-ghost', 'aria-label': 'Retirer', onclick: () => { n.decisions.splice(i, 1); drawDec(); save(); } }, icon('close', 16)))));
  };
  const todoBox = h('div', { class: 'items' });
  const drawTodo = () => {
    clear(todoBox);
    n.todos.forEach((t, i) => todoBox.appendChild(h('div', { class: 'item', style: { flexWrap: 'wrap' } },
      h('input', { type: 'checkbox', checked: t.done, 'aria-label': 'Action faite', style: { width: '22px', height: '22px', accentColor: '#161616', flexShrink: 0 }, onchange: (e) => { t.done = e.target.checked; save(); } }),
      h('input', { class: 'input', value: t.text, placeholder: 'Action', 'aria-label': 'Action', style: { flex: '3 1 200px' }, oninput: (e) => { t.text = e.target.value; save(); } }),
      h('input', { class: 'input', value: t.who || '', placeholder: 'Qui', 'aria-label': 'Responsable', style: { flex: '1 1 90px' }, oninput: (e) => { t.who = e.target.value; save(); } }),
      h('input', { class: 'input', type: 'date', value: t.due || '', 'aria-label': 'Échéance', style: { flex: '1 1 130px' }, oninput: (e) => { t.due = e.target.value; save(); } }),
      h('button', { class: 'btn btn-icon btn-sm btn-ghost', 'aria-label': 'Retirer', onclick: () => { n.todos.splice(i, 1); drawTodo(); save(); } }, icon('close', 16)))));
  };

  // Croquis
  let pen = 'stylo';
  const sk = h('div', { class: 'sketch-wrap sketch-grid', style: { aspectRatio: String(1 / (n.sketchAspect || 0.62)) } });
  const picker = penPicker({ light: true, withFinger: true, onFinger: (on) => sk.classList.toggle('finger', on) });
  if (penPrefs.finger) sk.classList.add('finger');
  const penBtns = [['stylo', 'Stylo'], ['feutre', 'Feutre'], ['surligneur', 'Surligneur'], ['gomme', 'Gomme']].map(([id, label]) =>
    h('button', { class: 'tool', 'aria-pressed': String(pen === id), onclick: (e) => { pen = id; picker.setMode(id); penBtns.forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } }, label));

  // Photos
  const photoBox = h('div', { class: 'photos' });
  const drawPhotos = async () => {
    clear(photoBox);
    for (const id of n.photos) {
      const m = await db.get('media', id);
      if (m) photoBox.appendChild(photoThumb(m, { onClick: () => openPhotoEditor(m, { onSave: drawPhotos, onDelete: () => { n.photos = n.photos.filter((x) => x !== id); save(); drawPhotos(); } }) }));
    }
    photoBox.appendChild(h('button', { class: 'photo photo-add', type: 'button', onclick: async () => { const ms = await addPhotos(p.id, { camera: false }); n.photos.push(...ms.map((m) => m.id)); save(); drawPhotos(); } }, icon('camera', 22), 'Ajouter'));
  };

  const back = '#/p/' + p.id + '/notes';
  clear(view).appendChild(h('div', { class: 'page' },
    h('header', { class: 'page-head' },
      h('div', { style: { flex: '1 1 420px' } },
        h('a', { class: 'crumb', href: back }, icon('back', 16), p.nom, h('span', { class: 'dotsep' }), 'Notes'),
        bind('titre', h('input', { class: 'title', placeholder: noteType(n.type).nom + ' du ' + fmtDate(n.date), 'aria-label': 'Titre de la note', style: { border: 0, background: 'transparent', width: '100%', padding: 0, outline: 'none' } }))),
      h('div', { class: 'actions' }, saved,
        h('button', { class: 'btn', onclick: exportPDF }, icon('share', 18), 'Compte rendu PDF'))),
    h('div', { class: 'cols' },
      h('div', { class: 'stack' },
        h('section', { class: 'card stack' },
          h('div', { class: 'grid g4' }, fld('Type', typeSel), fld('Date', bind('date', h('input', { class: 'input', type: 'date' }))), fld('Heure', bind('heure', h('input', { class: 'input', type: 'time' }))), fld('Lieu', bind('lieu', h('input', { class: 'input', placeholder: 'Sur site, agence…' })))),
          fld('Participants', bind('participants', h('input', { class: 'input' })))),
        h('section', { class: 'card stack' },
          h('h2', { class: 'section-t', style: { margin: 0 } }, 'Notes'),
          bind('body', h('textarea', { class: 'textarea', rows: 10, placeholder: 'Écrire ou dicter (micro du clavier)…', style: { minHeight: '220px', fontSize: '17px' } }))),
        h('section', { class: 'card stack' },
          h('div', { class: 'flexb' }, h('h2', { class: 'section-t', style: { margin: 0 } }, 'Croquis'),
            h('div', { class: 'toolbar' }, penBtns, h('button', { class: 'tool', 'aria-label': 'Annuler le dernier trait', onclick: () => surf.undo() }, icon('undo', 18)),
              h('button', { class: 'tool', onclick: async () => { if (await confirmBox('Effacer tout le croquis ?', 'Effacer')) surf.clear(); } }, 'Effacer'))),
          picker.el,
          sk,
          h('div', { class: 'small muted' }, 'Apple Pencil : pression prise en compte, paume ignorée. Au doigt, activez « Doigt » ; sinon le doigt fait défiler la page.'))),
      h('div', { class: 'stack' },
        h('section', { class: 'card stack' }, h('h2', { class: 'section-t', style: { margin: 0 } }, 'Ordre du jour'), agendaBox,
          h('button', { class: 'btn btn-sm btn-line', style: { alignSelf: 'flex-start' }, onclick: () => { n.agenda.push({ text: '', done: false }); drawAgenda(); save(); } }, icon('plus', 16), 'Point')),
        h('section', { class: 'card stack' }, h('h2', { class: 'section-t', style: { margin: 0 } }, 'Décisions'), decBox,
          h('button', { class: 'btn btn-sm btn-line', style: { alignSelf: 'flex-start' }, onclick: () => { n.decisions.push({ text: '' }); drawDec(); save(); setTimeout(() => decBox.querySelector('.item:last-child input')?.focus(), 30); } }, icon('plus', 16), 'Décision')),
        h('section', { class: 'card stack' }, h('h2', { class: 'section-t', style: { margin: 0 } }, 'Actions'), todoBox,
          h('button', { class: 'btn btn-sm btn-line', style: { alignSelf: 'flex-start' }, onclick: () => { n.todos.push({ text: '', who: '', due: '', done: false }); drawTodo(); save(); setTimeout(() => todoBox.querySelector('.item:last-child input.input')?.focus(), 30); } }, icon('plus', 16), 'Action')),
        h('section', { class: 'card stack' }, h('h2', { class: 'section-t', style: { margin: 0 } }, 'Photos'), photoBox),
        h('button', { class: 'btn btn-line', onclick: async () => { if (await confirmBox('Supprimer cette note ?', 'Supprimer')) { await db.del('notes', n.id); location.hash = back; } } }, icon('trash', 18), 'Supprimer la note')))));
  window.scrollTo(0, 0);
  const surf = sketchSurface(sk, { strokes: n.sketch || [], aspect: n.sketchAspect || 0.62, getPen: () => pen, finger: () => !!penPrefs.finger, onChange: (s) => { n.sketch = s; save(); } });
  drawAgenda(); drawDec(); drawTodo(); drawPhotos();

  async function exportPDF() {
    toast('Préparation du compte rendu…');
    await db.put('notes', n);
    const { buildNotePDF, photoComposite } = await import('../pdfkit.js');
    const photosData = [];
    for (const id of n.photos) { const m = await db.get('media', id); if (m) photosData.push(await photoComposite(m, 1000)); }
    const blob = await buildNotePDF({ project: p, note: { ...n, photosData }, getSetting: db.setting });
    const ph = phase(n.phase || p.phase);
    const name = fileName({ date: n.date, code: fileCode(p), phase: ph.id, type: 'CR', objet: n.titre || noteType(n.type).nom, ind: 'A', ext: 'pdf' });
    const existing = (await db.by('files', 'projectId', p.id)).find((f) => f.noteId === n.id);
    await db.put('files', { id: existing ? existing.id : uid(), projectId: p.id, folder: ph.dossier, name, mime: 'application/pdf', size: blob.size, blob, phase: ph.id, noteId: n.id, createdAt: new Date().toISOString(), source: 'note', sub: '03_Emis' });
    toast('Rangé dans ' + ph.dossier);
    await shareOrDownload(blob, name, 'Compte rendu · ' + p.nom);
  }
}
