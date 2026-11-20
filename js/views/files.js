// Fichiers du projet, rangés comme le dossier du Drive :
// Mon Drive › 2026 › 2026-006_ORTOLI_OLMICCIA › 02_ESQ › 01_Entrant | 02_Travail | 03_Emis | 04_Valide
import { h, put, clear, icon, uid, sheet, toast, pickFiles, fmtShort, fmtSize, confirmBox, shareOrDownload, todayISO, blobURL } from '../lib.js';
import { db } from '../db.js';
import { FOLDERS, SUBFOLDERS, DOC_TYPES, PHASES, phase, fileName, fileCode, normFolder, driveFolderName } from '../data.js';

const SOURCE = { note: 'CR de rendez-vous', reunion: 'CR de chantier', validation: 'Validation signée', plan: 'Plan annoté', rapport: 'Rapport de réserves', import: null };

export function render(body, { project: p, files, params }) {
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
    if (f.phase && sub !== 'tous') list = list.filter((x) => (x.sub || '02_Travail') === sub);
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
      f.phase ? h('div', { class: 'chips mb', role: 'group', 'aria-label': 'Sous-dossier' },
        [{ id: 'tous', nom: 'Tout' }, ...SUBFOLDERS].map((s) => h('button', {
          class: 'chip', 'aria-pressed': String(sub === s.id),
          onclick: () => { sub = s.id; draw(); }
        }, s.id === 'tous' ? 'Tout' : s.id, h('span', { class: 'muted small' }, String(files.filter((x) => x.folder === folder && (s.id === 'tous' || (x.sub || '02_Travail') === s.id)).length))))) : null,
      !list.length ? h('div', { class: 'empty' }, 'Dossier vide. Les comptes rendus, rapports, validations et plans exportés depuis l’application s’y rangent automatiquement (03_Emis, 04_Valide).')
        : h('div', { class: 'list' }, list.map((x) => h('div', { class: 'row' },
          h('span', { style: { flexShrink: 0, color: '#57544F' } }, icon(x.mime && x.mime.startsWith('image/') ? 'camera' : 'file', 22)),
          h('button', { class: 'row-main', style: { background: 'none', border: 0, padding: 0, textAlign: 'left' }, onclick: () => openFile(x) },
            h('span', { class: 'row-t fname' }, x.name),
            h('span', { class: 'row-s' }, [f.phase ? (x.sub || '02_Travail') : null, fmtShort(x.createdAt), fmtSize(x.size || 0), SOURCE[x.source]].filter(Boolean).join(' · '))),
          h('button', { class: 'btn btn-sm btn-ghost btn-icon', 'aria-label': 'Partager', onclick: () => shareOrDownload(x.blob, x.name) }, icon('share', 18)),
          h('button', { class: 'btn btn-sm btn-line', onclick: () => edit(x) }, 'Gérer')))));
  };

  async function importFiles(camera) {
    const picked = await pickFiles({ accept: camera ? 'image/*' : '*/*', multiple: !camera, capture: camera ? 'environment' : undefined });
    if (!picked.length) return;
    const f = FOLDERS.find((x) => x.id === folder);
    for (const file of picked) {
      let blob; try { blob = new Blob([await file.arrayBuffer()], { type: file.type || 'application/octet-stream' }); } catch (e) { toast('Fichier inaccessible : ' + file.name); continue; }
      const rec = { id: uid(), projectId: p.id, folder, sub: f && f.phase ? (sub !== 'tous' ? sub : (camera ? '02_Travail' : '01_Entrant')) : undefined, name: file.name, mime: blob.type, size: blob.size, blob, phase: p.phase, createdAt: new Date().toISOString(), source: 'import' };
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
      sub: h('select', { class: 'select' }, SUBFOLDERS.map((s) => h('option', { value: s.id, selected: s.id === (x.sub || '02_Travail') || null }, s.id))),
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
        h('button', { class: 'btn btn-line', onclick: async () => { if (await confirmBox('Supprimer « ' + x.name + ' » ?', 'Supprimer')) { await db.del('files', x.id); files.splice(files.indexOf(x), 1); s.close(); draw(); } } }, icon('trash', 16), 'Supprimer'),
        h('button', { class: 'btn btn-primary', onclick: async () => { x.name = f.name.value.trim() || x.name; x.folder = f.folder.value; x.sub = f.sub.value; x.phase = f.phase.value; await db.put('files', x); s.close(); toast('Fichier enregistré'); draw(); } }, 'Enregistrer')]
    });
  }

  put(body,
    h('div', { class: 'alert alert-soft mb small' }, h('span', null, 'Même arborescence que le dossier du projet dans ton Google Drive : Mon Drive › ' + (String(p.code || '').slice(0, 4) || 'AAAA') + ' › ' + driveFolderName(p) + '. La synchronisation automatique sera activée à la mise en ligne.')),
    h('div', { class: 'folders' }, folderBtns),
    listBox);
  draw();
}
