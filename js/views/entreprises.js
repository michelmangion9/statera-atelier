// Base de données des entreprises : lots, contacts, assurance décennale, chantiers
import { h, put, clear, icon, uid, sheet, toast, fmtShort, daysUntil, confirmBox, pickFiles, blobURL } from '../lib.js';
import { db } from '../db.js';
import { LOTS, lot as lotOf } from '../data.js';

export function decStatus(e) {
  if (!e.decFin) return { label: 'Attestation à demander', bad: true };
  const d = daysUntil(e.decFin);
  if (d < 0) return { label: 'Expirée ' + fmtShort(e.decFin), bad: true };
  if (d <= 30) return { label: 'Expire ' + fmtShort(e.decFin), bad: true };
  return { label: 'Valide ' + fmtShort(e.decFin), bad: false };
}

export async function render(view, params) {
  let search = '', lotF = 'tous';
  const [list, projects] = await Promise.all([db.all('entreprises'), db.all('projects')]);
  const chantiers = (id) => projects.filter((p) => (p.assignments || []).some((a) => a.entrepriseId === id));
  const box = h('div');
  const draw = () => {
    clear(box);
    let rows = list.slice().sort((a, b) => a.nom.localeCompare(b.nom));
    if (lotF !== 'tous') rows = rows.filter((e) => (e.lots || []).includes(lotF));
    if (search) { const s = search.toLowerCase(); rows = rows.filter((e) => [e.nom, e.contact, e.email, e.commune].join(' ').toLowerCase().includes(s)); }
    if (!list.length) { box.appendChild(h('div', { class: 'empty' }, h('div', { class: 'title-sm' }, 'Aucune entreprise'), 'Enregistrez vos entreprises une fois : elles seront proposées par lot sur chaque chantier, avec le suivi de leur assurance décennale.', h('button', { class: 'btn btn-primary', onclick: add }, icon('plus', 18), 'Nouvelle entreprise'))); return; }
    if (!rows.length) { box.appendChild(h('div', { class: 'empty' }, 'Aucune entreprise ne correspond.')); return; }
    box.appendChild(h('div', { class: 'list' }, rows.map((e) => {
      const ds = decStatus(e); const n = chantiers(e.id).length;
      return h('button', { class: 'row', onclick: () => open(e) },
        h('span', { class: 'row-main' }, h('span', { class: 'row-t' }, e.nom), h('span', { class: 'row-s' }, [(e.lots || []).map((l) => l + ' ' + lotOf(l).code).join(', '), e.contact, e.tel].filter(Boolean).join(' · ') || '—')),
        n ? h('span', { class: 'tag' }, n + ' chantier' + (n > 1 ? 's' : '')) : null,
        h('span', { class: ds.bad ? 'tag tag-fill' : 'tag tag-dash' }, ds.label),
        h('span', { class: 'chev' }, icon('chev', 18)));
    })));
  };
  async function add() { const e = await editEntreprise(); if (e) { list.push(e); draw(); } }
  async function open(e) { const r = await editEntreprise(e, {}, chantiers(e.id)); if (r === 'deleted') list.splice(list.indexOf(e), 1); draw(); }
  const lotsUsed = LOTS.filter((l) => list.some((e) => (e.lots || []).includes(l.id)));
  const chip = (id, label) => h('button', { class: 'chip', 'aria-pressed': String(lotF === id), onclick: (ev) => { lotF = id; ev.currentTarget.parentElement.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', String(b === ev.currentTarget))); draw(); } }, label);
  const expired = list.filter((e) => decStatus(e).bad && chantiers(e.id).length);

  clear(view).appendChild(h('div', { class: 'page' },
    h('header', { class: 'page-head' },
      h('div', null, h('div', { class: 'eyebrow' }, 'Base de données'), h('h1', { class: 'title' }, 'Entreprises'), h('div', { class: 'sub' }, list.length + ' entreprise' + (list.length > 1 ? 's' : ''))),
      h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', onclick: add }, icon('plus', 18), 'Nouvelle entreprise'))),
    expired.length ? h('div', { class: 'alert mb' }, h('b', null, 'Assurance à vérifier'), ' — ' + expired.map((e) => e.nom + ' (' + decStatus(e).label.toLowerCase() + ')').join(', ') + '. Demandez l’attestation avant tout nouveau marché.') : null,
    list.length ? h('div', { class: 'flexb mb' },
      h('div', { class: 'chips' }, chip('tous', 'Tous les lots'), lotsUsed.map((l) => chip(l.id, l.id + ' · ' + l.code))),
      h('input', { class: 'input', type: 'search', placeholder: 'Rechercher…', 'aria-label': 'Rechercher une entreprise', style: { maxWidth: '300px' }, oninput: (ev) => { search = ev.target.value; draw(); } })) : null,
    box));
  draw();
  if (params.id) { const e = list.find((x) => x.id === params.id); if (e) open(e); }
}

export function editEntreprise(existing, defaults = {}, chantiers = []) {
  return new Promise((res) => {
    const e = existing ? JSON.parse(JSON.stringify(existing)) : { id: uid(), nom: '', lots: defaults.lots || [], createdAt: new Date().toISOString() };
    const inp = (key, attrs = {}) => { const el = h('input', Object.assign({ class: 'input' }, attrs)); el.value = e[key] || ''; el.addEventListener('input', () => (e[key] = el.value)); return el; };
    const fld = (label, el, cls) => h('label', { class: 'field ' + (cls || '') }, h('span', null, label), el);
    const lotChips = h('div', { class: 'chips' }, LOTS.map((l) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String((e.lots || []).includes(l.id)), onclick: (ev) => {
      const on = (e.lots || []).includes(l.id);
      e.lots = on ? e.lots.filter((x) => x !== l.id) : (e.lots || []).concat(l.id);
      ev.currentTarget.setAttribute('aria-pressed', String(!on));
    } }, l.id + ' · ' + l.code)));
    const attBox = h('div');
    const drawAtt = async () => {
      clear(attBox);
      const m = e.attestationId && await db.get('media', e.attestationId);
      put(attBox, m ? h('div', { class: 'flexb' }, h('a', { href: blobURL(m.id, m.blob), target: '_blank', class: 'small' }, m.name || 'Attestation'), h('span', { class: 'small muted' }, 'ajoutée le ' + fmtShort(m.createdAt))) : h('div', { class: 'small muted' }, 'Aucune attestation enregistrée.'),
        h('button', { class: 'btn btn-sm btn-line mt', type: 'button', onclick: async () => {
          const [f] = await pickFiles({ accept: 'application/pdf,image/*' });
          if (!f) return;
          const rec = { id: uid(), projectId: '_entreprises', kind: 'attestation', name: f.name, blob: f, createdAt: new Date().toISOString() };
          await db.put('media', rec); e.attestationId = rec.id; drawAtt();
        } }, icon('plus', 16), 'Attestation (PDF ou photo)'));
    };
    let result = null;
    const s = sheet({
      title: existing ? e.nom : 'Nouvelle entreprise', wide: true,
      body: [
        fld('Raison sociale', inp('nom', { placeholder: 'ex. SARL Maçonnerie …' })),
        h('div', { class: 'field' }, h('span', { class: 'lbl-s' }, 'Lots'), lotChips),
        h('div', { class: 'grid g2' }, fld('Contact', inp('contact')), fld('Téléphone', inp('tel', { type: 'tel', inputmode: 'tel' })),
          fld('E-mail (envoi des CR)', inp('email', { type: 'email', inputmode: 'email' })), fld('SIRET', inp('siret', { inputmode: 'numeric' })),
          fld('Adresse', inp('adresse'), 'span2')),
        h('div', { class: 'section-t', style: { margin: '6px 0 0' } }, 'Assurance décennale'),
        h('div', { class: 'grid g3' }, fld('Assureur', inp('decAssureur')), fld('N° de police', inp('decPolice')), fld('Valide jusqu’au', inp('decFin', { type: 'date' }))),
        attBox,
        fld('Notes', (() => { const t = h('textarea', { class: 'textarea', rows: 3 }); t.value = e.notes || ''; t.addEventListener('input', () => (e.notes = t.value)); return t; })()),
        chantiers.length ? h('div', null, h('div', { class: 'section-t' }, 'Chantiers'), chantiers.map((p) => h('a', { class: 'kv', href: '#/p/' + p.id + '/chantier', style: { textDecoration: 'none' } }, h('span', null, p.nom), h('span', { class: 'small' }, (p.assignments || []).filter((a) => a.entrepriseId === e.id).map((a) => 'lot ' + a.lot).join(', '))))) : null,
        existing ? h('div', { class: 'actions' },
          e.tel ? h('a', { class: 'btn btn-sm btn-line', href: 'tel:' + e.tel.replace(/\s/g, '') }, icon('phone', 16), 'Appeler') : null,
          e.email ? h('a', { class: 'btn btn-sm btn-line', href: 'mailto:' + e.email }, icon('mail', 16), 'E-mail') : null) : null],
      foot: [
        existing ? h('button', { class: 'btn btn-line', onclick: async () => { if (await confirmBox('Supprimer « ' + e.nom + ' » de la base ?', 'Supprimer')) { await db.del('entreprises', e.id); result = 'deleted'; s.close(); } } }, icon('trash', 16)) : null,
        h('button', { class: 'btn btn-line', onclick: () => s.close() }, 'Annuler'),
        h('button', { class: 'btn btn-primary', onclick: async () => { if (!e.nom.trim()) { toast('Indiquez la raison sociale'); return; } await db.put('entreprises', e); if (existing) Object.assign(existing, e); result = existing || e; s.close(); toast('Entreprise enregistrée'); } }, 'Enregistrer')],
      onClose: () => res(result)
    });
    drawAtt();
  });
}
