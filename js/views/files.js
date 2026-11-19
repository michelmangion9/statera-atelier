// Fichiers du projet, rangés comme le dossier Google Drive (00_ADMIN … 08_RECUS)
import { h, put, clear, icon, uid, sheet, toast, pickFiles, fmtShort, fmtSize, confirmBox, shareOrDownload, todayISO, blobURL } from '../lib.js';
import { db } from '../db.js';
import { FOLDERS, DOC_TYPES, PHASES, phase, fileName } from '../data.js';

export function render(body, { project: p, files, params }) {
  let folder = params.q.f || phase(p.phase).dossier;
  const listBox = h('div');
  const folderBtns = FOLDERS.map((f) => {
    const n = files.filter((x) => x.folder === f.id).length;
    return h('button', { class: 'folder', 'aria-pressed': String(folder === f.id), 'data-f': f.id, onclick: () => { folder = f.id; folderBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === folder))); history.replaceState(null, '', '#/p/' + p.id + '/fichiers?f=' + folder); draw(); } },
      icon('folder', 20), h('b', null, f.id), h('small', null, n || ''));
  });

  const draw = () => {
    clear(listBox);
    const f = FOLDERS.find((x) => x.id === folder);
    const list = files.filter((x) => x.folder === folder).sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    put(listBox, 
      h('div', { class: 'flexb mb' },
        h('div', null, h('div', { class: 'title-sm' }, f.id), h('div', { class: 'small muted' }, f.desc)),
        h('div', { class: 'actions' },
          h('button', { class: 'btn', onclick: () => importFiles(true) }, icon('camera', 18), 'Photo'),
          h('button', { class: 'btn btn-primary', onclick: () => importFiles(false) }, icon('plus', 18), 'Ajouter'))),
      !list.length ? h('div', { class: 'empty' }, 'Dossier vide. Les comptes rendus, validations et plans exportés depuis l’application s’y rangent automatiquement.')
        : h('div', { class: 'list' }, list.map((x) => h('div', { class: 'row' },
          h('span', { style: { flexShrink: 0, color: '#5E5C57' } }, icon(x.mime && x.mime.startsWith('image/') ? 'camera' : 'file', 22)),
          h('button', { class: 'row-main', style: { background: 'none', border: 0, padding: 0, textAlign: 'left' }, onclick: () => openFile(x) },
            h('span', { class: 'row-t fname' }, x.name),
            h('span', { class: 'row-s' }, [fmtShort(x.createdAt), fmtSize(x.size || 0), x.source === 'note' ? 'CR de note' : x.source === 'reunion' ? 'CR de chantier' : x.source === 'validation' ? 'Validation signée' : x.source === 'plan' ? 'Plan annoté' : null].filter(Boolean).join(' · '))),
          h('button', { class: 'btn btn-sm btn-ghost btn-icon', 'aria-label': 'Partager', onclick: () => shareOrDownload(x.blob, x.name) }, icon('share', 18)),
          h('button', { class: 'btn btn-sm btn-line', onclick: () => edit(x) }, 'Gérer')))));
  };

  async function importFiles(camera) {
    const picked = await pickFiles({ accept: camera ? 'image/*' : '*/*', multiple: !camera, capture: camera ? 'environment' : undefined });
    if (!picked.length) return;
    for (const f of picked) {
      const rec = { id: uid(), projectId: p.id, folder: camera ? '07_PHOTOS' : folder, name: f.name, mime: f.type || 'application/octet-stream', size: f.size, blob: f, phase: p.phase, createdAt: new Date().toISOString(), source: 'import' };
      if (camera) rec.name = fileName({ date: todayISO(), code: p.abbr, phase: p.phase, type: 'PHO', objet: 'Photo', ind: 'A', ext: 'jpg' }).replace(/_A\.jpg$/, '_' + new Date().toTimeString().slice(0, 8).replace(/:/g, '') + '.jpg');
      await db.put('files', rec); files.push(rec);
    }
    toast(picked.length + ' fichier(s) ajouté(s)');
    folderBtns.forEach((b) => { const n = files.filter((x) => x.folder === b.dataset.f).length; b.querySelector('small').textContent = n || ''; });
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
    const conv = parts.length >= 6;
    const f = {
      date: h('input', { class: 'input', type: 'date', value: todayISO() }),
      phase: h('select', { class: 'select' }, PHASES.map((ph) => h('option', { value: ph.id, selected: ph.id === (x.phase || p.phase) || null }, ph.court))),
      type: h('select', { class: 'select' }, DOC_TYPES.map(([id, nom]) => h('option', { value: id, selected: (conv && parts[3] === id) || null }, id + ' · ' + nom))),
      objet: h('input', { class: 'input', value: conv ? parts.slice(4, -1).join('_') : x.name.replace(/\.[^.]+$/, '') }),
      ind: h('input', { class: 'input', value: conv ? parts[parts.length - 1] : 'A', maxlength: '3' }),
      folder: h('select', { class: 'select' }, FOLDERS.map((fo) => h('option', { value: fo.id, selected: fo.id === x.folder || null }, fo.id + ' · ' + fo.nom))),
      name: h('input', { class: 'input fname', value: x.name })
    };
    const recompute = () => { f.name.value = fileName({ date: f.date.value, code: p.abbr, phase: f.phase.value, type: f.type.value, objet: f.objet.value, ind: f.ind.value, ext }); };
    [f.date, f.phase, f.type, f.objet, f.ind].forEach((el) => el.addEventListener('input', recompute));
    const isPlanable = x.mime === 'application/pdf' || (x.mime || '').startsWith('image/');
    const s = sheet({
      title: 'Gérer le fichier',
      body: [
        h('div', { class: 'section-t', style: { margin: 0 } }, 'Nommage STATERA'),
        h('div', { class: 'grid g3' }, h('label', { class: 'field' }, h('span', null, 'Date'), f.date), h('label', { class: 'field' }, h('span', null, 'Phase'), f.phase), h('label', { class: 'field' }, h('span', null, 'Type'), f.type)),
        h('div', { class: 'grid g2' }, h('label', { class: 'field' }, h('span', null, 'Objet'), f.objet), h('label', { class: 'field' }, h('span', null, 'Indice'), f.ind)),
        h('label', { class: 'field' }, h('span', null, 'Nom du fichier'), f.name),
        h('label', { class: 'field' }, h('span', null, 'Dossier'), f.folder),
        isPlanable ? h('button', { class: 'btn btn-line', onclick: async () => {
          const { importPlanBlobs } = await import('./plans.js');
          const blob = new File([x.blob], x.name, { type: x.mime });
          const c = await importPlanBlobs(p, [blob]);
          if (c.length) { s.close(); location.hash = '#/p/' + p.id + '/plans/' + c[0].id; }
        } }, icon('plan', 18), 'Ouvrir comme plan annotable') : null],
      foot: [
        h('button', { class: 'btn btn-line', onclick: async () => { if (await confirmBox('Supprimer « ' + x.name + ' » ?', 'Supprimer')) { await db.del('files', x.id); files.splice(files.indexOf(x), 1); s.close(); draw(); } } }, icon('trash', 16), 'Supprimer'),
        h('button', { class: 'btn btn-primary', onclick: async () => { x.name = f.name.value.trim() || x.name; x.folder = f.folder.value; x.phase = f.phase.value; await db.put('files', x); s.close(); toast('Fichier enregistré'); draw(); } }, 'Enregistrer')]
    });
  }

  put(clear(body), 
    h('div', { class: 'alert alert-soft mb small' }, icon('folder', 18), h('span', null, 'Même arborescence que le dossier du projet dans votre Google Drive (Mon Drive › ' + (p.code || 'AAAA-NNN') + '_' + (p.client || 'CLIENT').toUpperCase().replace(/\s+/g, '-') + '_' + (p.commune || 'COMMUNE').toUpperCase().replace(/\s+/g, '-') + '). La synchronisation automatique sera activée à la mise en ligne.')),
    h('div', { class: 'folders' }, folderBtns),
    listBox);
  draw();
}
