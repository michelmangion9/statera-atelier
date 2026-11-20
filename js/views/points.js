// Tous les points du projet : filtres par statut, lot et plan, levée rapide
import { h, put, clear, icon, fmtShort, daysUntil, todayISO, blobURL } from '../lib.js';
import { db } from '../db.js';
import { lot as lotOf, status as statusOf } from '../data.js';

export async function render(body, { project: p, points, plans }) {
  const entreprises = await db.all('entreprises');
  const media = new Map((await db.by('media', 'projectId', p.id)).map((m) => [m.id, m]));
  const reunions = (await db.by('reunions', 'projectId', p.id)).sort((a, b) => (a.num || 0) - (b.num || 0));
  const visOf = (id) => reunions.find((r) => r.id === id);
  let st = 'ouverts', lotF = 'tous', planF = 'tous', visF = 'toutes';
  const entOf = (l) => { const a = (p.assignments || []).find((x) => x.lot === l); return a && entreprises.find((e) => e.id === a.entrepriseId); };
  const box = h('div');

  const lotsUsed = [...new Set(points.map((x) => x.lot || '—'))].sort();
  const summary = h('div', { class: 'tbl-wrap mb' }, h('table', { class: 'tbl' },
    h('thead', null, h('tr', null, h('th', null, 'Lot'), h('th', null, 'Entreprise'), h('th', null, 'Ouverts'), h('th', null, 'En retard'), h('th', null, 'Levés'))),
    h('tbody', null, lotsUsed.map((l) => {
      const ps = points.filter((x) => (x.lot || '—') === l);
      const late = ps.filter((x) => x.status !== 'leve' && x.due && daysUntil(x.due) < 0).length;
      const e = entOf(l);
      return h('tr', null, h('td', null, l === '—' ? 'Généralités' : 'Lot ' + l + ' · ' + lotOf(l).nom), h('td', null, e ? e.nom : '—'),
        h('td', null, ps.filter((x) => x.status !== 'leve').length), h('td', null, late ? h('b', null, late) : '0'), h('td', null, ps.filter((x) => x.status === 'leve').length));
    }))));

  const draw = () => {
    clear(box);
    let list = points.slice().sort((a, b) => a.num - b.num);
    if (st === 'ouverts') list = list.filter((x) => x.status !== 'leve');
    if (st === 'leves') list = list.filter((x) => x.status === 'leve');
    if (lotF !== 'tous') list = list.filter((x) => (x.lot || '—') === lotF);
    if (planF !== 'tous') list = list.filter((x) => x.planId === planF);
    if (visF !== 'toutes') list = list.filter((x) => (x.visiteId || '—') === visF);
    if (!list.length) { box.appendChild(h('div', { class: 'empty' }, points.length ? 'Aucun point pour ce filtre.' : 'Aucun point. Les points se posent pendant une visite : Journal › la réunion du jour › Plans de la visite › Annoter.')); return; }
    box.appendChild(h('div', { class: 'list' }, list.map((pt) => {
      const pl = plans.find((x) => x.id === pt.planId);
      const e = entOf(pt.lot);
      const late = pt.status !== 'leve' && pt.due && daysUntil(pt.due) < 0;
      const ph = (pt.photos || []).map((id) => media.get(id)).find(Boolean);
      const vi = visOf(pt.visiteId); const vl = vi ? reunions.find((r) => r.id === vi.id) : null;
      const levVis = pt.leveAt ? reunions.find((r) => r.date === pt.leveAt) : null;
      return h('div', { class: 'row' },
        h('span', { class: 'pt-num' + (pt.status === 'leve' ? ' leve' : '') }, h('b', null, pt.num), h('i', null, pt.lot ? lotOf(pt.lot).code : 'GÉN')),
        h('a', { class: 'row-main', href: '#/p/' + p.id + '/plans/' + pt.planId + '?' + (vl ? 'v=' + vl.id + '&' : '') + 'pt=' + pt.id, style: { textDecoration: 'none' } },
          h('span', { class: 'row-t', style: { whiteSpace: 'normal' } }, pt.text || 'Observation sans texte'),
          h('span', { class: 'row-s' }, [vl ? 'Visite n°' + vl.num + ' · ' + fmtShort(vl.date) : 'Hors visite', pt.lot ? 'Lot ' + pt.lot + (e ? ' · ' + e.nom : '') : 'Généralités', pl ? pl.nom + ((pl.pages || 1) > 1 ? ' p.' + ((pt.page || 0) + 1) : '') : null, pt.due ? (late ? 'EN RETARD · ' : 'Échéance ') + fmtShort(pt.due) : null, pt.nature === 'res' ? 'Réserve' : null, pt.status === 'leve' && pt.leveAt ? 'levé le ' + fmtShort(pt.leveAt) + (levVis ? ' (visite n°' + levVis.num + ')' : '') : null].filter(Boolean).join(' · '))),
        ph ? h('img', { class: 'pt-thumb', src: blobURL(ph.id, ph.blob), alt: '' }) : null,
        h('span', { class: pt.status === 'leve' ? 'tag tag-dash' : pt.status === 'encours' ? 'tag' : 'tag tag-fill' }, statusOf(pt.status).nom),
        pt.status !== 'leve' ? h('button', { class: 'btn btn-sm btn-line', onclick: async () => { pt.status = 'leve'; pt.leveAt = todayISO(); await db.put('points', pt); draw(); } }, 'Lever') : null);
    })));
  };
  const chip = (group, id, label, get, set) => h('button', { class: 'chip', 'aria-pressed': String(get() === id), onclick: (e) => { set(id); e.currentTarget.parentElement.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); draw(); } }, label);
  const planSel = h('select', { class: 'select', 'aria-label': 'Plan', style: { maxWidth: '280px' } }, h('option', { value: 'tous' }, 'Tous les plans'), plans.map((pl) => h('option', { value: pl.id }, pl.nom)));
  planSel.addEventListener('change', () => { planF = planSel.value; draw(); });
  const visSel = h('select', { class: 'select', 'aria-label': 'Visite', style: { maxWidth: '280px' } }, h('option', { value: 'toutes' }, 'Toutes les visites'),
    reunions.map((r) => h('option', { value: r.id }, 'Visite n°' + r.num + ' · ' + fmtShort(r.date))), points.some((x) => !x.visiteId) ? h('option', { value: '—' }, 'Hors visite') : null);
  visSel.addEventListener('change', () => { visF = visSel.value; draw(); });
  const intro = h('div', { class: 'small muted mb' }, 'Synthèse de toutes les observations du chantier : ce qui reste à régler, ce qui a été levé, par lot, par entreprise et par visite. Les points se posent dans les visites (Journal › réunion de chantier).');

  put(clear(body), intro,
    points.length ? summary : null,
    h('div', { class: 'flexb mb' },
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Statut' }, chip('st', 'ouverts', 'Ouverts', () => st, (v) => (st = v)), chip('st', 'leves', 'Levés', () => st, (v) => (st = v)), chip('st', 'tous', 'Tous', () => st, (v) => (st = v))),
      h('div', { class: 'toolbar' }, visSel, planSel)),
    lotsUsed.length > 1 ? h('div', { class: 'chips mb', role: 'group', 'aria-label': 'Lot' }, chip('lot', 'tous', 'Tous les lots', () => lotF, (v) => (lotF = v)), lotsUsed.map((l) => chip('lot', l, l === '—' ? 'Généralités' : l + ' · ' + lotOf(l).code, () => lotF, (v) => (lotF = v)))) : null,
    box);
  draw();
}
