// Chantier : entreprises affectées par lot, réunions, CR par lot envoyés à chaque entreprise
import { h, put, clear, icon, uid, sheet, toast, fmtDate, fmtShort, daysUntil, todayISO, nowTime, confirmBox, shareOrDownload, downloadBlob, debounce } from '../lib.js';
import { db } from '../db.js';
import { LOTS, lot as lotOf, fileName, fileCode } from '../data.js';
import { editEntreprise, decStatus } from './entreprises.js';

export async function render(body, ctx) {
  const { project: p, params } = ctx;
  p.assignments = p.assignments || [];
  const entreprises = await db.all('entreprises');
  const reunions = (await db.by('reunions', 'projectId', p.id)).sort((a, b) => b.num - a.num);
  if (params.q.r) {
    const r = reunions.find((x) => x.id === params.q.r);
    if (r) return reunionEditor(body, { ...ctx, entreprises, reunions, r });
  }
  const ent = (id) => entreprises.find((e) => e.id === id);

  const assignBox = h('div');
  const drawAssign = () => {
    clear(assignBox);
    const rows = p.assignments.slice().sort((a, b) => a.lot.localeCompare(b.lot));
    put(assignBox, 
      h('div', { class: 'flexb', style: { marginBottom: '12px' } }, h('h2', { class: 'section-t', style: { margin: 0 } }, 'Entreprises du chantier'),
        h('button', { class: 'btn btn-sm btn-primary', onclick: () => assign() }, icon('plus', 16), 'Affecter un lot')),
      rows.length ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, h('th', null, 'Lot'), h('th', null, 'Entreprise'), h('th', null, 'Contact'), h('th', null, 'Décennale'), h('th', null, ''))),
        h('tbody', null, rows.map((a) => {
          const e = ent(a.entrepriseId);
          const ds = e ? decStatus(e) : null;
          return h('tr', null,
            h('td', null, h('b', { style: { fontWeight: 500 } }, a.lot), ' · ' + lotOf(a.lot).nom),
            h('td', null, e ? h('a', { href: '#/entreprises/' + e.id }, e.nom) : '—'),
            h('td', { class: 'small' }, e ? [e.contact, e.email].filter(Boolean).join(' · ') : ''),
            h('td', null, ds ? h('span', { class: ds.bad ? 'tag tag-fill' : 'tag tag-dash' }, ds.label) : ''),
            h('td', { style: { textAlign: 'right', whiteSpace: 'nowrap' } },
              h('button', { class: 'btn btn-sm btn-line', onclick: () => assign(a) }, 'Changer'),
              h('button', { class: 'btn btn-sm btn-ghost btn-icon', 'aria-label': 'Retirer le lot', onclick: async () => { if (await confirmBox('Retirer le lot ' + a.lot + ' de ce chantier ?', 'Retirer')) { p.assignments = p.assignments.filter((x) => x !== a); await db.put('projects', p); drawAssign(); } } }, icon('close', 16))));
        })))) : h('div', { class: 'empty' }, 'Affectez une entreprise à chaque lot : les points posés sur les plans seront rattachés à l’entreprise du lot, et chaque entreprise recevra son propre compte rendu.'));
  };

  async function assign(existing) {
    const lotSel = h('select', { class: 'select' }, LOTS.filter((l) => !p.assignments.some((a) => a.lot === l.id && a !== existing)).map((l) => h('option', { value: l.id, selected: existing && existing.lot === l.id || null }, l.id + ' · ' + l.nom)));
    const entSel = h('select', { class: 'select' });
    const fillEnt = () => {
      const l = lotSel.value;
      const match = entreprises.filter((e) => (e.lots || []).includes(l));
      const others = entreprises.filter((e) => !(e.lots || []).includes(l));
      put(clear(entSel), h('option', { value: '' }, '— Choisir —'),
        match.length ? h('optgroup', { label: 'Entreprises du lot ' + l }, match.map((e) => h('option', { value: e.id }, e.nom))) : null,
        others.length ? h('optgroup', { label: 'Autres entreprises' }, others.map((e) => h('option', { value: e.id }, e.nom))) : null);
      if (existing) entSel.value = existing.entrepriseId;
      else if (match.length === 1) entSel.value = match[0].id;
    };
    lotSel.addEventListener('change', fillEnt); fillEnt();
    const s = sheet({
      title: existing ? 'Changer l’entreprise' : 'Affecter un lot',
      body: [h('label', { class: 'field' }, h('span', null, 'Lot'), lotSel), h('label', { class: 'field' }, h('span', null, 'Entreprise'), entSel),
        h('button', { class: 'btn btn-line', style: { alignSelf: 'flex-start' }, onclick: async () => {
          const e = await editEntreprise(null, { lots: [lotSel.value] });
          if (e) { entreprises.push(e); fillEnt(); entSel.value = e.id; }
        } }, icon('plus', 16), 'Nouvelle entreprise')],
      foot: [h('button', { class: 'btn btn-line', onclick: () => s.close() }, 'Annuler'), h('button', { class: 'btn btn-primary', onclick: async () => {
        if (!entSel.value) { toast('Choisissez une entreprise'); return; }
        if (existing) { existing.lot = lotSel.value; existing.entrepriseId = entSel.value; } else p.assignments.push({ lot: lotSel.value, entrepriseId: entSel.value });
        const e = ent(entSel.value); if (e && !(e.lots || []).includes(lotSel.value)) { e.lots = (e.lots || []).concat(lotSel.value); await db.put('entreprises', e); }
        await db.put('projects', p); s.close(); drawAssign();
      } }, 'Enregistrer')]
    });
  }

  async function newReunion() {
    const num = reunions.reduce((m, r) => Math.max(m, r.num), 0) + 1;
    const prev = reunions[0];
    const r = { id: uid(), projectId: p.id, num, date: todayISO(), heure: nowTime(), presence: { moe: 'P' }, general: '', avancement: '', autres: prev ? prev.autres || '' : '', prochaine: '', prochaineHeure: prev ? prev.prochaineHeure || '' : '', sent: {}, createdAt: new Date().toISOString() };
    if (prev && prev.prochaine) r.date = prev.prochaine;
    await db.put('reunions', r);
    location.hash = '#/p/' + p.id + '/chantier?r=' + r.id;
  }

  put(clear(body), 
    h('section', { class: 'card mb' }, assignBox),
    h('section', { class: 'card' },
      h('div', { class: 'flexb', style: { marginBottom: '12px' } }, h('h2', { class: 'section-t', style: { margin: 0 } }, 'Réunions de chantier'),
        h('button', { class: 'btn btn-sm btn-primary', onclick: newReunion }, icon('plus', 16), 'Nouvelle réunion')),
      reunions.length ? h('div', { class: 'list' }, reunions.map((r) => h('a', { class: 'row', href: '#/p/' + p.id + '/chantier?r=' + r.id },
        h('span', { class: 'pt-num' }, h('b', null, r.num), h('i', null, 'CR')),
        h('span', { class: 'row-main' }, h('span', { class: 'row-t' }, 'Réunion n°' + r.num + ' · ' + fmtDate(r.date, true)),
          h('span', { class: 'row-s' }, Object.keys(r.sent || {}).length ? 'CR envoyés : ' + Object.keys(r.sent).map((k) => k === 'moa' ? 'MOA' : 'lot ' + k).join(', ') : 'CR non diffusé')),
        h('span', { class: 'chev' }, icon('chev', 18))))) : h('div', { class: 'empty' }, 'Aucune réunion. Lors de la visite, posez les points sur les plans, puis créez la réunion pour générer les comptes rendus par lot.')));
  drawAssign();
}

/* ---------------- Réunion ---------------- */
async function reunionEditor(body, { project: p, entreprises, reunions, r, points, plans }) {
  const ent = (id) => entreprises.find((e) => e.id === id);
  const save = debounce(() => db.put('reunions', r), 400);
  const fld = (label, el, cls) => h('label', { class: 'field ' + (cls || '') }, h('span', null, label), el);
  const bind = (key, el) => { el.value = r[key] || ''; el.addEventListener('input', () => { r[key] = el.value; save(); }); return el; };
  const previous = reunions.filter((x) => x.num < r.num).sort((a, b) => b.num - a.num)[0];
  r.presence = r.presence || {}; r.sent = r.sent || {};

  const presRow = (key, label, who) => h('tr', null, h('td', null, label), h('td', null, who || '—'),
    h('td', { style: { textAlign: 'right' } }, h('div', { class: 'seg', role: 'group' }, [['P', 'Présent'], ['A', 'Absent'], ['E', 'Excusé']].map(([v, l]) =>
      h('button', { 'aria-pressed': String(r.presence[key] === v), onclick: (e) => { r.presence[key] = r.presence[key] === v ? '' : v; e.currentTarget.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget && r.presence[key] === v))); save(); } }, l)))));

  const sinceDate = previous ? previous.date : '0000';
  const visible = points.filter((x) => x.status !== 'leve' || (x.leveAt && x.leveAt >= sinceDate));
  const byLot = {};
  visible.forEach((x) => { const l = x.lot || '—'; (byLot[l] = byLot[l] || []).push(x); });

  const lotsDiff = p.assignments.slice().sort((a, b) => a.lot.localeCompare(b.lot));
  r.diff = r.diff || Object.fromEntries(lotsDiff.map((a) => [a.lot, (byLot[a.lot] || []).length > 0]).concat([['moa', true]]));
  const results = {};
  const diffBox = h('div');
  const drawDiff = () => {
    clear(diffBox);
    const line = (key, label, who, email, n) => {
      const res = results[key];
      return h('div', { class: 'pt-line', style: { flexWrap: 'wrap' } },
        h('label', { class: 'check', style: { flex: '1 1 260px', minHeight: '44px', alignItems: 'center' } },
          h('input', { type: 'checkbox', checked: !!r.diff[key], onchange: (e) => { r.diff[key] = e.target.checked; save(); } }),
          h('span', { style: { display: 'flex', flexDirection: 'column' } }, h('b', { style: { fontWeight: 500 } }, label), h('span', { class: 'small muted' }, [who, email || 'e-mail manquant'].filter(Boolean).join(' · ')))),
        h('span', { class: 'small muted', style: { minWidth: '80px' } }, n + ' point' + (n > 1 ? 's' : '')),
        r.sent[key] ? h('span', { class: 'tag tag-dash' }, 'Envoyé ' + fmtShort(r.sent[key])) : null,
        res ? h('div', { class: 'actions' },
          h('button', { class: 'btn btn-sm btn-primary', onclick: async () => { const st = await shareOrDownload(res.blob, res.name, mailBody(key)); if (st === 'shared') { r.sent[key] = todayISO(); save(); drawDiff(); } } }, icon('share', 16), 'Partager le PDF'),
          email ? h('a', { class: 'btn btn-sm btn-line', href: mailto(email, key), onclick: () => { r.sent[key] = todayISO(); save(); setTimeout(drawDiff, 300); } }, icon('mail', 16), 'E-mail') : null,
          h('button', { class: 'btn btn-sm btn-ghost btn-icon', 'aria-label': 'Télécharger', onclick: () => downloadBlob(res.blob, res.name) }, icon('download', 16))) : null);
    };
    put(diffBox, 
      line('moa', 'Maître d’ouvrage · CR complet', p.client, p.clientEmail, visible.length),
      lotsDiff.map((a) => { const e = ent(a.entrepriseId); return line(a.lot, 'Lot ' + a.lot + ' · ' + lotOf(a.lot).nom, e && e.nom, e && e.email, (byLot[a.lot] || []).length + (byLot['—'] || []).length); }));
  };
  const subject = (key) => p.nom + ' · CR de chantier n°' + r.num + (key !== 'moa' ? ' · lot ' + key : '');
  const mailBody = (key) => 'Bonjour,\n\nVeuillez trouver ci-joint le compte rendu de la réunion de chantier n°' + r.num + ' du ' + fmtDate(r.date) + (key !== 'moa' ? ', avec les observations concernant votre lot' : '') + '.' + (r.prochaine ? '\nProchaine réunion : ' + fmtDate(r.prochaine, true) + (r.prochaineHeure ? ' à ' + r.prochaineHeure : '') + ' sur site.' : '') + '\n\nCordialement,\nMichel Mangion\nSTATERA Architecture';
  const mailto = (email, key) => 'mailto:' + encodeURIComponent(email) + '?subject=' + encodeURIComponent(subject(key)) + '&body=' + encodeURIComponent(mailBody(key) + '\n\n(PDF joint)');

  async function generate() {
    const keys = Object.keys(r.diff).filter((k) => r.diff[k]);
    if (!keys.length) { toast('Cochez au moins un destinataire'); return; }
    await db.put('reunions', r);
    toast('Génération de ' + keys.length + ' compte(s) rendu(s)…');
    const { buildCR } = await import('../pdfkit.js');
    const media = await db.by('media', 'projectId', p.id);
    const pageAnnots = {};
    for (const pl of plans) for (const pg of await db.by('pages', 'planId', pl.id)) pageAnnots[pg.key] = pg;
    const existing = await db.by('files', 'projectId', p.id);
    for (const k of keys) {
      const blob = await buildCR({ project: p, reunion: r, points, assignments: p.assignments, entreprises, plans, media, pageAnnots, onlyLot: k === 'moa' ? null : k, getSetting: db.setting, previous });
      const name = fileName({ date: r.date, code: fileCode(p), phase: 'DET', type: 'CR', objet: 'Reunion-' + String(r.num).padStart(2, '0') + (k === 'moa' ? '' : '-Lot' + k), ind: 'A', ext: 'pdf' });
      const old = existing.find((f) => f.name === name);
      await db.put('files', { id: old ? old.id : uid(), projectId: p.id, folder: '06_CHANTIER', name, mime: 'application/pdf', size: blob.size, blob, phase: 'DET', reunionId: r.id, createdAt: new Date().toISOString(), source: 'reunion', sub: '03_Emis' });
      results[k] = { blob, name };
    }
    toast('CR rangés dans 06_CHANTIER');
    drawDiff();
  }

  function ics() {
    if (!r.prochaine) { toast('Indiquez la date de la prochaine réunion'); return; }
    const [hh, mm] = (r.prochaineHeure || '08:30').split(':');
    const d = r.prochaine.replace(/-/g, '');
    const start = d + 'T' + hh + mm + '00';
    const endH = String(Math.min(23, Number(hh) + 1)).padStart(2, '0');
    const txt = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//STATERA//Atelier//FR', 'BEGIN:VEVENT', 'UID:' + r.id + '-next@statera', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z',
      'DTSTART;TZID=Europe/Paris:' + start, 'DTEND;TZID=Europe/Paris:' + d + 'T' + endH + mm + '00',
      'SUMMARY:Réunion de chantier n°' + (r.num + 1) + ' · ' + p.nom, 'LOCATION:' + [p.adresse, p.commune].filter(Boolean).join(', '), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    downloadBlob(new Blob([txt], { type: 'text/calendar' }), 'reunion-' + (r.num + 1) + '.ics');
  }

  put(clear(body), 
    h('div', { class: 'flexb mb' },
      h('div', null, h('a', { class: 'crumb', href: '#/p/' + p.id + '/chantier' }, icon('back', 16), 'Chantier'), h('h2', { class: 'title-sm' }, 'Réunion de chantier n°' + r.num)),
      h('div', { class: 'actions' },
        h('a', { class: 'btn', href: plans[0] ? '#/p/' + p.id + '/plans/' + plans[0].id + '?mode=point' : '#/p/' + p.id + '/plans' }, icon('pin', 18), 'Points sur plan'),
        h('button', { class: 'btn btn-line btn-icon', 'aria-label': 'Supprimer la réunion', onclick: async () => { if (await confirmBox('Supprimer la réunion n°' + r.num + ' ?', 'Supprimer')) { await db.del('reunions', r.id); location.hash = '#/p/' + p.id + '/chantier'; } } }, icon('trash', 18)))),
    h('div', { class: 'cols' },
      h('div', { class: 'stack' },
        h('section', { class: 'card stack' },
          h('div', { class: 'grid g2' }, fld('Date', bind('date', h('input', { class: 'input', type: 'date' }))), fld('Heure', bind('heure', h('input', { class: 'input', type: 'time' }))))),
        h('section', { class: 'card stack' },
          h('h2', { class: 'section-t', style: { margin: 0 } }, 'Présents'),
          h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, h('tbody', null,
            presRow('moa', 'Maître d’ouvrage', p.client),
            lotsDiff.map((a) => presRow(a.lot, 'Lot ' + a.lot + ' · ' + lotOf(a.lot).code, ent(a.entrepriseId)?.nom))))),
          fld('Autres présents (un par ligne)', bind('autres', h('textarea', { class: 'textarea', rows: 2, placeholder: 'BET structure, bureau de contrôle, coordonnateur SPS…' })))),
        h('section', { class: 'card stack' },
          fld('Avancement des travaux', bind('avancement', h('textarea', { class: 'textarea', rows: 3 }))),
          fld('Observations générales', bind('general', h('textarea', { class: 'textarea', rows: 4, placeholder: 'Sécurité, propreté, planning, approvisionnements…' })))),
        h('section', { class: 'card stack' },
          h('h2', { class: 'section-t', style: { margin: 0 } }, 'Prochaine réunion'),
          h('div', { class: 'grid g2' }, fld('Date', bind('prochaine', h('input', { class: 'input', type: 'date' }))), fld('Heure', bind('prochaineHeure', h('input', { class: 'input', type: 'time' })))),
          h('button', { class: 'btn btn-line', style: { alignSelf: 'flex-start' }, onclick: ics }, icon('calendar', 18), 'Ajouter à l’agenda'))),
      h('div', { class: 'stack' },
        h('section', { class: 'card' },
          h('h2', { class: 'section-t' }, 'Observations par lot'),
          Object.keys(byLot).length ? Object.keys(byLot).sort().map((l) => {
            const a = p.assignments.find((x) => x.lot === l); const e = a && ent(a.entrepriseId);
            const open = byLot[l].filter((x) => x.status !== 'leve').length;
            return h('div', { class: 'kv' }, h('span', null, l === '—' ? 'Généralités' : 'Lot ' + l + ' · ' + lotOf(l).code + (e ? ' — ' + e.nom : '')), h('span', null, open + ' ouvert' + (open > 1 ? 's' : '') + (byLot[l].length - open ? ' · ' + (byLot[l].length - open) + ' levé(s)' : '')));
          }) : h('div', { class: 'muted small' }, 'Aucun point ouvert. Posez les points sur les plans pendant la visite.'),
          h('a', { class: 'btn btn-sm btn-line mt', href: '#/p/' + p.id + '/points' }, 'Voir la liste des points')),
        h('section', { class: 'card' },
          h('h2', { class: 'section-t' }, 'Diffusion du compte rendu'),
          h('div', { class: 'small muted', style: { marginBottom: '10px' } }, 'Chaque entreprise reçoit les observations générales et les points de son lot, avec l’extrait de plan et la photo annotée.'),
          lotsDiff.length ? null : h('div', { class: 'alert alert-soft small mb' }, 'Aucune entreprise affectée : seul le CR complet sera produit.'),
          h('div', { class: 'lotblock', style: { marginBottom: '12px' } }, diffBox),
          h('button', { class: 'btn btn-primary', style: { width: '100%' }, onclick: generate }, 'Générer les comptes rendus'),
          h('div', { class: 'small muted mt' }, 'Sur iPad, « Partager le PDF » ouvre Mail avec le PDF en pièce jointe. L’envoi direct depuis contact@ sera branché sur Gmail à la mise en ligne.')))));
  drawDiff();
}
export { daysUntil };
