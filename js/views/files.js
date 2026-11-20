// Fichiers du projet, rangés comme le dossier du Drive :
// Mon Drive › 2026 › 2026-006_ORTOLI_OLMICCIA › 02_ESQ › 01_Entrant | 02_Travail | 03_Emis | 04_Valide
import { h, put, clear, icon, uid, sheet, toast, pickFiles, fmtShort, fmtSize, confirmBox, shareOrDownload, todayISO, blobURL } from '../lib.js';
import { db } from '../db.js';
import { FOLDERS, folderOf, destFor, DOC_TYPES, PHASES, phase, fileName, fileCode, normFolder, driveFolderName } from '../data.js';
import * as gd from '../gdrive.js';

const SOURCE = { note: 'CR de rendez-vous', reunion: 'CR de chantier', validation: 'Validation signée', plan: 'Plan annoté', rapport: 'Rapport de réserves', import: null };

export function render(body, ctx) {
  const { project: p, params } = ctx;
  const mode = params.q.v || (gd.available() && gd.connected() ? 'drive' : 'local');
  const seg = h('div', { class: 'seg mb', role: 'group', 'aria-label': 'Source' },
    [['drive', 'Google Drive'], ['local', 'Sur l’appareil']].map(([id, l]) => h('button', { 'aria-pressed': String(mode === id), onclick: () => { location.hash = '#/p/' + p.id + '/fichiers?v=' + id; } }, l)));
  if (mode === 'drive') return driveView(body, p, seg);
  return localView(body, ctx, seg);
}

function localView(body, { project: p, files, params }, seg) {
  files.forEach((f) => { f.folder = normFolder(f.folder); });
  let folder = params.q.f ? normFolder(params.q.f) : phase(p.phase).dossier;
  let sub = 'tous';
  const listBox = h('div');
  const count = (id) => files.filter((x) => x.folder === id).length;
  const folderBtns = FOLDERS.map((f) => h('button', {
    class: 'folder', 'aria-pressed': String(folder === f.id), 'data-f': f.id,
    onclick: () => { folder = f.id; sub = 'tous'; folderBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === folder))); history.replaceState(null, '', '#/p/' + p.id + '/fichiers?f=' + folder); draw(); }
  }, icon('folder', 18), h('b', null, f.id), h('small', null, count(f.id) || '')));

  const draw = () => {
    clear(listBox);
    const f = FOLDERS.find((x) => x.id === folder) || FOLDERS[0];
    let list = files.filter((x) => x.folder === folder);
    const defSub = (x) => x.sub || f.subs[0] || '';
    if (f.subs.length && sub !== 'tous') list = list.filter((x) => defSub(x) === sub);
    list.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    put(listBox,
      h('div', { class: 'flexb mb' },
        h('div', null,
          h('div', { class: 'small muted' }, driveFolderName(p) + ' ›'),
          h('div', { class: 'title-sm' }, f.id),
          f.desc ? h('div', { class: 'small muted' }, f.desc) : null),
        h('div', { class: 'actions' },
          h('button', { class: 'btn', onclick: () => importFiles(true) }, icon('camera', 18), 'Photo'),
          h('button', { class: 'btn btn-primary', onclick: () => importFiles(false) }, icon('plus', 18), 'Ajouter'))),
      f.subs.length ? h('div', { class: 'chips mb', role: 'group', 'aria-label': 'Sous-dossier' },
        [{ id: 'tous', nom: 'Tout' }, ...f.subs.map((id) => ({ id }))].map((s) => h('button', {
          class: 'chip', 'aria-pressed': String(sub === s.id),
          onclick: () => { sub = s.id; draw(); }
        }, s.id === 'tous' ? 'Tout' : s.id, h('span', { class: 'muted small' }, String(files.filter((x) => x.folder === folder && (s.id === 'tous' || defSub(x) === s.id)).length))))) : null,
      !list.length ? h('div', { class: 'empty' }, 'Dossier vide. Les comptes rendus, rapports, validations et plans exportés depuis l’application s’y rangent automatiquement (03_Emis, 04_Valide).')
        : h('div', { class: 'list' }, list.map((x) => h('div', { class: 'row' },
          h('span', { style: { flexShrink: 0, color: '#57544F' } }, icon(x.mime && x.mime.startsWith('image/') ? 'camera' : 'file', 22)),
          h('button', { class: 'row-main', style: { background: 'none', border: 0, padding: 0, textAlign: 'left' }, onclick: () => openFile(x) },
            h('span', { class: 'row-t fname' }, x.name),
            h('span', { class: 'row-s' }, [x.sub || null, fmtShort(x.createdAt), fmtSize(x.size || 0), SOURCE[x.source]].filter(Boolean).join(' · '))),
          h('button', { class: 'btn btn-sm btn-ghost btn-icon', 'aria-label': 'Partager', onclick: () => shareOrDownload(x.blob, x.name) }, icon('share', 18)),
          h('button', { class: 'btn btn-sm btn-line', onclick: () => edit(x) }, 'Gérer')))));
  };

  async function importFiles(camera) {
    const picked = await pickFiles({ accept: camera ? 'image/*' : '*/*', multiple: !camera, capture: camera ? 'environment' : undefined });
    if (!picked.length) return;
    const f = FOLDERS.find((x) => x.id === folder);
    for (const file of picked) {
      let blob; try { blob = new Blob([await file.arrayBuffer()], { type: file.type || 'application/octet-stream' }); } catch (e) { toast('Fichier inaccessible : ' + file.name); continue; }
      const rec = { id: uid(), projectId: p.id, folder, sub: sub !== 'tous' ? sub : (f.subs.includes(camera ? '02_Travail' : '01_Entrant') ? (camera ? '02_Travail' : '01_Entrant') : (f.subs[0] || '')), name: file.name, mime: blob.type, size: blob.size, blob, phase: p.phase, createdAt: new Date().toISOString(), source: 'import' };
      if (camera) rec.name = fileName({ date: todayISO(), code: fileCode(p), phase: p.phase, type: 'PHO', objet: 'Photo ' + new Date().toTimeString().slice(0, 5).replace(':', 'h'), ind: 'A', ext: 'jpg' });
      try { await db.put('files', rec); files.push(rec); } catch (e) { toast((e && e.message) || 'Enregistrement impossible'); }
    }
    toast(picked.length + ' fichier(s) ajouté(s)');
    folderBtns.forEach((b) => { b.querySelector('small').textContent = count(b.dataset.f) || ''; });
    draw();
  }

  function openFile(x) {
    const url = blobURL(x.id, x.blob);
    const w = window.open(url, '_blank');
    if (!w) shareOrDownload(x.blob, x.name);
  }

  function edit(x) {
    const ext = (x.name.match(/\.([a-z0-9]+)$/i) || [])[1] || '';
    const parts = x.name.replace(/\.[^.]+$/, '').split('_');
    const conv = parts.length >= 6 && /^\d{6}$/.test(parts[0]);
    const f = {
      date: h('input', { class: 'input', type: 'date', value: todayISO() }),
      phase: h('select', { class: 'select' }, PHASES.map((ph) => h('option', { value: ph.id, selected: ph.id === (x.phase || p.phase) || null }, ph.court))),
      type: h('select', { class: 'select' }, DOC_TYPES.map(([id, nom]) => h('option', { value: id, selected: (conv && parts[3] === id) || null }, id + ' · ' + nom))),
      objet: h('input', { class: 'input', value: conv ? parts.slice(4, -1).join('_') : x.name.replace(/\.[^.]+$/, '') }),
      ind: h('input', { class: 'input', value: conv ? parts[parts.length - 1] : 'A', maxlength: '3' }),
      folder: h('select', { class: 'select' }, FOLDERS.map((fo) => h('option', { value: fo.id, selected: fo.id === x.folder || null }, fo.id))),
      sub: h('select', { class: 'select' }, [h('option', { value: '' }, '(racine)')].concat(Array.from(new Set(FOLDERS.flatMap((fo) => fo.subs))).map((sid) => h('option', { value: sid, selected: sid === x.sub || null }, sid)))),
      name: h('input', { class: 'input fname', value: x.name })
    };
    const recompute = () => { f.name.value = fileName({ date: f.date.value, code: fileCode(p), phase: f.phase.value, type: f.type.value, objet: f.objet.value, ind: f.ind.value, ext }); };
    [f.date, f.phase, f.type, f.objet, f.ind].forEach((el) => el.addEventListener('input', recompute));
    const isPlanable = x.mime === 'application/pdf' || (x.mime || '').startsWith('image/');
    const s = sheet({
      title: 'Gérer le fichier',
      body: [
        h('div', { class: 'section-t', style: { margin: 0 } }, 'Nommage STATERA'),
        h('div', { class: 'small muted' }, 'AAMMJJ_' + fileCode(p) + '_PHASE_TYPE_OBJET_IND'),
        h('div', { class: 'grid g3' }, h('label', { class: 'field' }, h('span', null, 'Date'), f.date), h('label', { class: 'field' }, h('span', null, 'Phase'), f.phase), h('label', { class: 'field' }, h('span', null, 'Type'), f.type)),
        h('div', { class: 'grid g2' }, h('label', { class: 'field' }, h('span', null, 'Objet'), f.objet), h('label', { class: 'field' }, h('span', null, 'Indice'), f.ind)),
        h('label', { class: 'field' }, h('span', null, 'Nom du fichier'), f.name),
        h('div', { class: 'grid g2' }, h('label', { class: 'field' }, h('span', null, 'Dossier'), f.folder), h('label', { class: 'field' }, h('span', null, 'Sous-dossier'), f.sub)),
        isPlanable ? h('button', { class: 'btn btn-line', onclick: async () => {
          const { importPlanBlobs } = await import('./plans.js');
          const blob = new File([x.blob], x.name, { type: x.mime });
          const c = await importPlanBlobs(p, [blob]);
          if (c.length) { s.close(); location.hash = '#/p/' + p.id + '/plans/' + c[0].id; }
        } }, icon('plan', 18), 'Ouvrir comme plan annotable') : null],
      foot: [
        h('button', { class: 'btn btn-line', onclick: async () => { if (await confirmBox('Retirer « ' + x.name + ' » de cet appareil ? Le fichier du Drive n’est jamais touché.', 'Retirer de l’appareil')) { await db.del('files', x.id); files.splice(files.indexOf(x), 1); s.close(); draw(); } } }, icon('trash', 16), 'Retirer de l’appareil'),
        h('button', { class: 'btn btn-primary', onclick: async () => { x.name = f.name.value.trim() || x.name; x.folder = f.folder.value; x.sub = f.sub.value; x.phase = f.phase.value; await db.put('files', x); s.close(); toast('Fichier enregistré'); draw(); } }, 'Enregistrer')]
    });
  }

  put(body, seg,
    h('div', { class: 'alert alert-soft mb small' }, h('span', null, 'Copies gardées sur cet appareil (utilisables hors ligne), rangées comme le Drive : ' + driveFolderName(p) + '. Les documents produits par l’Atelier partent aussi dans le Drive quand il est connecté.')),
    h('div', { class: 'folders' }, folderBtns),
    listBox);
  draw();
}

async function driveView(body, p, seg) {
  clear(body).appendChild(seg);
  if (!gd.available()) { put(body, h('div', { class: 'alert' }, 'Google Drive est accessible depuis la version en ligne : statera-atelier.vercel.app')); return; }
  if (!(await gd.ensureToken())) { put(body, h('section', { class: 'card stack' }, h('h2', { class: 'section-t', style: { margin: 0 } }, 'Google Drive'), h('div', { class: 'small' }, 'Connecte ton Drive pour voir et utiliser les documents du projet.'), gd.connectBox(location.hash))); return; }
  if (!p.drive || !p.drive.id) {
    put(body, h('section', { class: 'card stack' }, h('h2', { class: 'section-t', style: { margin: 0 } }, 'Relier le projet à son dossier Drive'),
      h('div', { class: 'small' }, 'Je cherche le dossier « ' + (p.code || 'n° d’affaire') + ' » dans ton Drive, ou je crée l’arborescence STATERA complète.'),
      h('button', { class: 'btn btn-primary', style: { alignSelf: 'flex-start' }, onclick: async () => { if (await gd.linkProject(p)) driveView(body, p, seg); } }, icon('folder', 18), 'Relier au Drive')));
    return;
  }
  const status = h('span', { class: 'small muted' });
  gd.pushPending(p).then((n) => { if (n) { status.textContent = n + ' document(s) de l’Atelier envoyé(s) dans le Drive'; br.refresh(); } }).catch(() => {});
  const br = gd.browser(p, { actions: (f, pdfOrImg) => h('div', { class: 'actions', style: { flexShrink: 0 } },
    pdfOrImg ? h('button', { class: 'btn btn-sm btn-line', onclick: async () => {
      toast('Téléchargement…');
      try { const file = await gd.download(f); const { importPlanBlobs } = await import('./plans.js'); const c = await importPlanBlobs(p, [file]); if (c.length) location.hash = '#/p/' + p.id + '/plans' + (c.length === 1 ? '/' + c[0].id : ''); } catch (e) { toast(e.message); }
    } }, icon('plan', 16), 'Plan') : null,
    h('button', { class: 'btn btn-sm btn-ghost btn-icon', 'aria-label': 'Garder une copie sur l’appareil', title: 'Copie hors ligne', onclick: async () => {
      try { const file = await gd.download(f); const blob = new Blob([await file.arrayBuffer()], { type: file.type }); await db.put('files', { id: uid(), projectId: p.id, ...destFor('entrant', p), name: file.name, mime: blob.type, size: blob.size, blob, phase: p.phase, createdAt: new Date().toISOString(), source: 'drive', driveId: f.id }); toast('Copie gardée sur l’appareil'); } catch (e) { toast(e.message); }
    } }, icon('download', 18))) });
  put(body,
    h('div', { class: 'flexb mb' },
      h('div', null, h('div', { class: 'small muted' }, 'Google Drive · ' + (gd.account() || '')), h('div', { class: 'title-sm' }, p.drive.name), status),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: async () => {
          const picked = await pickFiles({ accept: '*/*', multiple: true }); if (!picked.length) return;
          const cur = br.current(); toast('Envoi dans « ' + cur.name + ' »…');
          for (const f of picked) { try { await gd.upload(cur.id, new Blob([await f.arrayBuffer()], { type: f.type || 'application/octet-stream' }), f.name); } catch (e) { toast(e.message); } }
          toast(picked.length + ' fichier(s) ajouté(s) au Drive'); br.refresh();
        } }, icon('plus', 18), 'Ajouter ici'),
        h('button', { class: 'btn btn-line', onclick: async () => { const n = await gd.pushPending(p); toast(n ? n + ' document(s) envoyé(s)' : 'Tout est déjà dans le Drive'); br.refresh(); } }, 'Synchroniser'),
        h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => { if (await gd.linkProject(p)) driveView(body, p, seg); } }, 'Changer de dossier'))),
    br);
}
