// PDF : lecture (pdf.js) et fabrication de documents (pdf-lib) aux couleurs de STATERA
import { loadScript, fmtDate, fmtShort, blobToDataURL } from './lib.js';
import { drawStrokes } from './ink.js';
import { lot as lotOf, status as statusOf, noteType, CABINET_DEFAULT } from './data.js';

/* ---------------- Lecture : pdf.js ---------------- */
let pdfjsP;
export function pdfjs() {
  if (!pdfjsP) {
    pdfjsP = import('../vendor/pdf.min.js').then((m) => {
      m.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.js', import.meta.url).href;
      return m;
    });
  }
  return pdfjsP;
}
const docCache = new Map();
export async function openPdf(plan) {
  const k = plan.id + ':' + (plan.blob ? plan.blob.size : 0);
  if (!docCache.has(k)) {
    docCache.set(k, (async () => {
      const lib = await pdfjs();
      const data = new Uint8Array(await plan.blob.arrayBuffer());
      return lib.getDocument({ data, isEvalSupported: false }).promise;
    })());
  }
  return docCache.get(k);
}
// Rend une page en canvas d'une largeur donnée (px). Renvoie aussi la taille en points.
export async function renderPdfPage(plan, pageIndex, widthPx) {
  const pdf = await openPdf(plan);
  const page = await pdf.getPage(pageIndex + 1);
  const vp1 = page.getViewport({ scale: 1 });
  const scale = widthPx / vp1.width;
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return { canvas: c, w: vp1.width, h: vp1.height };
}
export async function pageCount(plan) {
  if (plan.kind !== 'pdf') return 1;
  return (await openPdf(plan)).numPages;
}
async function imageBitmap(blob) { return createImageBitmap(blob); }

// Rendu générique (PDF ou image) d'une page de plan
export async function renderPlan(plan, pageIndex, widthPx) {
  if (plan.kind === 'pdf') return renderPdfPage(plan, pageIndex, widthPx);
  const bmp = await imageBitmap(plan.blob);
  const c = document.createElement('canvas');
  const k = widthPx / bmp.width;
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return { canvas: c, w: bmp.width, h: bmp.height };
}
export async function planThumb(plan) {
  try {
    const { canvas } = await renderPlan(plan, 0, 520);
    return await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.8));
  } catch (e) { return null; }
}

/* ---------------- Fabrication : pdf-lib ---------------- */
let libP;
async function pdfLib() {
  if (!libP) {
    libP = (async () => {
      await loadScript(new URL('../vendor/pdf-lib.min.js', import.meta.url).href);
      await loadScript(new URL('../vendor/fontkit.umd.min.js', import.meta.url).href);
      const get = (f) => fetch(new URL('../assets/fonts/' + f, import.meta.url)).then((r) => r.arrayBuffer());
      const [j4, j5, g4, gi] = await Promise.all([get('jost-latin-400-normal.woff'), get('jost-latin-500-normal.woff'), get('eb-garamond-latin-400-normal.woff'), get('eb-garamond-latin-400-italic.woff')]);
      return { L: window.PDFLib, fontkit: window.fontkit, bytes: { j4, j5, g4, gi } };
    })();
  }
  return libP;
}

const A4 = [595.28, 841.89];
const M = 46;
function C(L) {
  return {
    ink: L.rgb(0.086, 0.086, 0.086), grey: L.rgb(0.37, 0.36, 0.34), line: L.rgb(0.75, 0.74, 0.71),
    stone: L.rgb(0.906, 0.898, 0.878), paper: L.rgb(0.957, 0.953, 0.941), white: L.rgb(1, 1, 1)
  };
}

// Mise en page : curseur vertical, sauts de page automatiques, en-têtes et pieds
class Doc {
  static async create(meta) {
    const { L, fontkit, bytes } = await pdfLib();
    const pdf = await L.PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const f = {
      r: await pdf.embedFont(bytes.j4, { subset: true }),
      m: await pdf.embedFont(bytes.j5, { subset: true }),
      g: await pdf.embedFont(bytes.g4, { subset: true }),
      gi: await pdf.embedFont(bytes.gi, { subset: true })
    };
    const d = new Doc(); Object.assign(d, { L, pdf, f, c: C(L), meta, pages: [] });
    pdf.setTitle(meta.title); pdf.setAuthor(meta.cabinet.nom); pdf.setCreator('STATERA Atelier'); pdf.setLanguage('fr-FR');
    d.charsets = new Map();
    d.newPage(true);
    return d;
  }
  safe(t, font) {
    if (t === null || t === undefined) return '';
    let s = String(t).replace(/→/g, '->').replace(/≈/g, '~').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/ | /g, ' ');
    font = font || this.f.r;
    if (!this.charsets.has(font)) this.charsets.set(font, new Set(font.getCharacterSet()));
    const set = this.charsets.get(font);
    let out = '';
    for (const ch of s) { const cp = ch.codePointAt(0); out += (cp === 10 || set.has(cp)) ? ch : (cp < 32 ? ' ' : '?'); }
    return out;
  }
  w(t, size, font) { return (font || this.f.r).widthOfTextAtSize(this.safe(t, font), size); }
  newPage(first) {
    const p = this.pdf.addPage(A4);
    this.pages.push(p); this.p = p;
    this.y = A4[1] - M;
    this.header(first);
  }
  header(first) {
    const { p, f, c, meta } = this;
    // Mot STATERA espacé
    let x = M; const yb = A4[1] - M - 14;
    for (const ch of 'STATERA') { p.drawText(ch, { x, y: yb, size: 17, font: f.g, color: c.ink }); x += f.g.widthOfTextAtSize(ch, 17) + 4.2; }
    let x2 = M + 1;
    for (const ch of 'ARCHITECTURE') { p.drawText(ch, { x: x2, y: yb - 12, size: 5.6, font: f.r, color: c.grey }); x2 += f.r.widthOfTextAtSize(ch, 5.6) + 2.6; }
    const t = this.safe(meta.title, f.gi);
    const ts = first ? 15 : 11;
    p.drawText(t, { x: A4[0] - M - f.gi.widthOfTextAtSize(t, ts), y: yb + (first ? 0 : 2), size: ts, font: f.gi, color: c.ink });
    if (meta.subtitle) {
      const s = this.safe(meta.subtitle);
      p.drawText(s, { x: A4[0] - M - f.r.widthOfTextAtSize(s, 8.5), y: yb - 13, size: 8.5, font: f.r, color: c.grey });
    }
    p.drawLine({ start: { x: M, y: yb - 24 }, end: { x: A4[0] - M, y: yb - 24 }, thickness: 0.6, color: c.ink });
    this.y = yb - 44;
  }
  footers() {
    const { f, c, meta } = this;
    const n = this.pages.length;
    const cab = meta.cabinet;
    const line = this.safe([cab.nom, cab.architecte, cab.adresse].filter(Boolean).join('  ·  '));
    const line2 = this.safe([cab.tel, cab.email, cab.ordre, cab.siren].filter(Boolean).join('  ·  '));
    this.pages.forEach((p, i) => {
      p.drawLine({ start: { x: M, y: 40 }, end: { x: A4[0] - M, y: 40 }, thickness: 0.4, color: c.line });
      p.drawText(line, { x: M, y: 28, size: 6.4, font: f.r, color: c.grey });
      p.drawText(line2, { x: M, y: 19, size: 6.4, font: f.r, color: c.grey });
      const pg = 'Page ' + (i + 1) + ' / ' + n;
      p.drawText(pg, { x: A4[0] - M - f.r.widthOfTextAtSize(pg, 7.5), y: 24, size: 7.5, font: f.r, color: c.ink });
      if (meta.ref) { const r = this.safe(meta.ref); p.drawText(r, { x: A4[0] - M - f.r.widthOfTextAtSize(r, 6.4), y: 14, size: 6.4, font: f.r, color: c.grey }); }
    });
  }
  ensure(hgt) { if (this.y - hgt < 58) this.newPage(false); }
  lines(text, size, width, font) {
    font = font || this.f.r;
    const out = [];
    for (const para of this.safe(text, font).split('\n')) {
      const words = para.split(/\s+/);
      let cur = '';
      for (const w of words) {
        const t = cur ? cur + ' ' + w : w;
        if (font.widthOfTextAtSize(t, size) <= width || !cur) {
          if (font.widthOfTextAtSize(t, size) > width && !cur) {
            // mot trop long : coupe brute
            let piece = '';
            for (const ch of w) { if (font.widthOfTextAtSize(piece + ch, size) > width) { out.push(piece); piece = ch; } else piece += ch; }
            cur = piece;
          } else cur = t;
        } else { out.push(cur); cur = w; }
      }
      out.push(cur);
    }
    return out;
  }
  para(text, { size = 9.5, font, color, width, x = M, gap = 4, lh = 1.42 } = {}) {
    if (!text) return;
    width = width || A4[0] - 2 * M;
    const ls = this.lines(text, size, width, font);
    for (const l of ls) {
      this.ensure(size * lh);
      this.p.drawText(l, { x, y: this.y - size, size, font: font || this.f.r, color: color || this.c.ink });
      this.y -= size * lh;
    }
    this.y -= gap;
  }
  h2(t) {
    this.ensure(40);
    this.y -= 6;
    this.p.drawText(this.safe(t.toUpperCase(), this.f.m), { x: M, y: this.y - 8, size: 7.6, font: this.f.m, color: this.c.grey });
    this.y -= 14;
    this.p.drawLine({ start: { x: M, y: this.y }, end: { x: A4[0] - M, y: this.y }, thickness: 0.4, color: this.c.line });
    this.y -= 10;
  }
  kvGrid(pairs, cols = 2) {
    const colW = (A4[0] - 2 * M) / cols;
    for (let i = 0; i < pairs.length; i += cols) {
      const row = pairs.slice(i, i + cols);
      const hs = row.map(([, v]) => this.lines(v || '—', 9.5, colW - 12).length);
      const rh = 12 + Math.max(...hs) * 13 + 6;
      this.ensure(rh);
      row.forEach(([k, v], j) => {
        const x = M + j * colW;
        this.p.drawText(this.safe(k.toUpperCase(), this.f.m), { x, y: this.y - 7, size: 6.6, font: this.f.m, color: this.c.grey });
        this.lines(v || '—', 9.5, colW - 12).forEach((l, n) => this.p.drawText(l, { x, y: this.y - 20 - n * 13, size: 9.5, font: this.f.r, color: this.c.ink }));
      });
      this.y -= rh;
    }
  }
  table(head, rows, widths, { size = 8.8 } = {}) {
    const W = A4[0] - 2 * M;
    const ws = widths.map((w) => w * W);
    const drawHead = () => {
      this.ensure(22);
      this.p.drawRectangle({ x: M, y: this.y - 18, width: W, height: 18, color: this.c.stone });
      let x = M;
      head.forEach((t, i) => { this.p.drawText(this.safe(t.toUpperCase(), this.f.m), { x: x + 6, y: this.y - 12, size: 6.6, font: this.f.m, color: this.c.ink }); x += ws[i]; });
      this.y -= 18;
    };
    drawHead();
    rows.forEach((r) => {
      const cells = r.map((t, i) => this.lines(t || '', size, ws[i] - 12));
      const rh = Math.max(...cells.map((c) => c.length)) * (size * 1.38) + 9;
      if (this.y - rh < 58) { this.newPage(false); drawHead(); }
      let x = M;
      cells.forEach((ls, i) => { ls.forEach((l, n) => this.p.drawText(l, { x: x + 6, y: this.y - 6 - size - n * size * 1.38, size, font: this.f.r, color: this.c.ink })); x += ws[i]; });
      this.y -= rh;
      this.p.drawLine({ start: { x: M, y: this.y }, end: { x: M + W, y: this.y }, thickness: 0.35, color: this.c.line });
    });
    this.y -= 8;
  }
  async image(dataURL, x, yTop, w, hgt) {
    const bytes = await (await fetch(dataURL)).arrayBuffer();
    const img = dataURL.startsWith('data:image/png') ? await this.pdf.embedPng(bytes) : await this.pdf.embedJpg(bytes);
    const k = Math.min(w / img.width, hgt / img.height);
    const iw = img.width * k, ih = img.height * k;
    this.p.drawImage(img, { x, y: yTop - ih, width: iw, height: ih });
    this.p.drawRectangle({ x, y: yTop - ih, width: iw, height: ih, borderColor: this.c.line, borderWidth: 0.5 });
    return ih;
  }
  async save() { this.footers(); return this.pdf.save(); }
}

async function cabinet(getSetting) { return Object.assign({}, CABINET_DEFAULT, (await getSetting('cabinet', {})) || {}); }

/* ---------- Vignettes : extrait de plan autour d'un point, photo annotée ---------- */
export async function photoComposite(media, maxW = 900) {
  const bmp = await createImageBitmap(media.blob);
  const k = Math.min(1, maxW / bmp.width);
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const ctx = c.getContext('2d');
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  if (media.strokes && media.strokes.length) drawStrokes(ctx, media.strokes, c.width / 1000);
  return c.toDataURL('image/jpeg', 0.82);
}
export async function planCrop(plan, pageIndex, point, cache, { w = 420, hgt = 280, annots } = {}) {
  const key = plan.id + ':' + pageIndex;
  if (!cache.has(key)) cache.set(key, renderPlan(plan, pageIndex, 1600));
  const { canvas } = await cache.get(key);
  const cx = point.x * canvas.width, cy = point.y * canvas.height;
  const c = document.createElement('canvas'); c.width = w; c.height = hgt;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hgt);
  ctx.drawImage(canvas, cx - w / 2, cy - hgt / 2, w, hgt, 0, 0, w, hgt);
  if (annots && annots.strokes && annots.strokes.length) {
    ctx.save(); ctx.translate(-(cx - w / 2), -(cy - hgt / 2)); drawStrokes(ctx, annots.strokes, canvas.width / 1000); ctx.restore();
  }
  ctx.beginPath(); ctx.arc(w / 2, hgt / 2, 15, 0, Math.PI * 2); ctx.fillStyle = '#161616'; ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = '600 14px Jost, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(point.num), w / 2, hgt / 2 + 1);
  return c.toDataURL('image/jpeg', 0.85);
}

/* ---------- Compte rendu de réunion de chantier (complet ou par lot) ---------- */
export async function buildCR({ project, reunion, points, assignments, entreprises, plans, media, pageAnnots, onlyLot, getSetting, previous }) {
  const cab = await cabinet(getSetting);
  const ent = (id) => entreprises.find((e) => e.id === id);
  const lotLabel = (lid) => { const l = lotOf(lid); return l.id === '—' ? 'Généralités' : 'Lot ' + l.id + ' · ' + l.nom; };
  const title = 'Compte rendu de chantier n°' + reunion.num;
  const subtitle = fmtDate(reunion.date, true) + (reunion.heure ? ' · ' + reunion.heure : '') + (onlyLot ? ' · ' + lotLabel(onlyLot) : '');
  const d = await Doc.create({ title, subtitle, cabinet: cab, ref: (project.code || '') + ' · CR' + String(reunion.num).padStart(2, '0') + (onlyLot ? ' · lot ' + onlyLot : '') });

  d.h2('Opération');
  d.kvGrid([
    ['Projet', project.nom], ['Dossier', project.code],
    ['Adresse des travaux', [project.adresse, project.commune].filter(Boolean).join(', ')], ['Maître d’ouvrage', project.client],
    ['Maîtrise d’œuvre', cab.nom + ' · ' + cab.architecte], ['Réunion', 'N° ' + reunion.num + ' du ' + fmtDate(reunion.date)]
  ]);

  if (onlyLot) {
    const a = assignments.find((x) => x.lot === onlyLot);
    const e = a && ent(a.entrepriseId);
    d.h2('Destinataire');
    d.kvGrid([['Lot', lotLabel(onlyLot)], ['Entreprise', e ? e.nom + (e.contact ? ' · ' + e.contact : '') : 'Non attribuée'], ['E-mail', e && e.email], ['Téléphone', e && e.tel]]);
  }

  // Présences
  const rows = [];
  rows.push(['Maître d’ouvrage', project.client || '—', presence(reunion.presence?.moa)]);
  rows.push(['Maîtrise d’œuvre', cab.nom, presence(reunion.presence?.moe || 'P')]);
  assignments.forEach((a) => { const e = ent(a.entrepriseId); rows.push([lotLabel(a.lot), e ? e.nom : '—', presence(reunion.presence?.[a.lot])]); });
  (reunion.autres || '').split('\n').filter(Boolean).forEach((t) => rows.push(['Autre', t, 'Présent']));
  d.h2('Présents et convoqués');
  d.table(['Fonction / lot', 'Intervenant', 'Présence'], rows, [0.42, 0.38, 0.2]);

  if (reunion.general) { d.h2('Observations générales'); d.para(reunion.general, { size: 9.5 }); }
  if (reunion.avancement) { d.h2('Avancement des travaux'); d.para(reunion.avancement, { size: 9.5 }); }

  // Points par lot
  const sinceDate = previous ? previous.date : '0000';
  const visible = points.filter((p) => p.status !== 'leve' || (p.leveAt && p.leveAt.slice(0, 10) >= sinceDate));
  const lots = [...new Set(visible.map((p) => p.lot || '—'))].sort();
  const shownLots = onlyLot ? lots.filter((l) => l === onlyLot || l === '—') : lots;
  const cropCache = new Map();
  d.h2('Observations');
  if (!shownLots.length) d.para('Aucune observation en cours.', { color: d.c.grey });
  for (const lid of shownLots) {
    const pts = visible.filter((p) => (p.lot || '—') === lid).sort((a, b) => a.num - b.num);
    const a = assignments.find((x) => x.lot === lid);
    const e = a && ent(a.entrepriseId);
    d.ensure(60);
    const W = A4[0] - 2 * M;
    d.p.drawRectangle({ x: M, y: d.y - 20, width: W, height: 20, color: d.c.ink });
    d.p.drawText(d.safe(lotLabel(lid).toUpperCase(), d.f.m), { x: M + 8, y: d.y - 13.5, size: 7.6, font: d.f.m, color: d.c.white });
    const en = d.safe(e ? e.nom : (lid === '—' ? 'Tous intervenants' : 'Entreprise non attribuée'));
    d.p.drawText(en, { x: M + W - 8 - d.f.r.widthOfTextAtSize(en, 8), y: d.y - 13.5, size: 8, font: d.f.r, color: d.c.white });
    d.y -= 28;
    for (const pt of pts) {
      const plan = plans.find((x) => x.id === pt.planId);
      const photo = (pt.photos || []).map((id) => media.find((m) => m.id === id)).find(Boolean);
      const textW = W - 40 - (plan || photo ? 190 : 0);
      const body = d.lines(pt.text || '—', 9.5, textW);
      const meta = [statusOf(pt.status).nom, pt.nature === 'res' ? 'Réserve' : null, pt.due ? 'Échéance ' + fmtShort(pt.due) : null, plan ? plan.nom + (plan.indice ? ' ind. ' + plan.indice : '') : null, pt.leveAt && pt.status === 'leve' ? 'Levé le ' + fmtShort(pt.leveAt) : null].filter(Boolean).join('  ·  ');
      const imgH = plan || photo ? 92 : 0;
      const rh = Math.max(body.length * 13.2 + 26, imgH + 10);
      d.ensure(rh);
      const top = d.y;
      // numéro
      d.p.drawCircle({ x: M + 13, y: top - 13, size: 11.5, color: pt.status === 'leve' ? d.c.white : d.c.ink, borderColor: d.c.ink, borderWidth: pt.status === 'leve' ? 0.8 : 0 });
      const ns = String(pt.num);
      d.p.drawText(ns, { x: M + 13 - d.f.m.widthOfTextAtSize(ns, 9) / 2, y: top - 16.2, size: 9, font: d.f.m, color: pt.status === 'leve' ? d.c.ink : d.c.white });
      body.forEach((l, i) => d.p.drawText(l, { x: M + 34, y: top - 11 - i * 13.2, size: 9.5, font: d.f.r, color: pt.status === 'leve' ? d.c.grey : d.c.ink }));
      d.p.drawText(d.safe(meta), { x: M + 34, y: top - 13 - body.length * 13.2 - 4, size: 7.4, font: d.f.r, color: d.c.grey, maxWidth: textW });
      let ix = M + W - 186;
      if (plan) {
        try { const url = await planCrop(plan, pt.page || 0, pt, cropCache, { annots: pageAnnots[pt.planId + ':' + (pt.page || 0)] }); await d.image(url, ix, top - 2, 92 * 1.5, 92); } catch (er) { /* vignette indisponible */ }
        ix += 142;
      }
      if (photo) {
        try { const url = await photoComposite(photo, 500); await d.image(url, plan ? ix : M + W - 92, top - 2, plan ? 44 : 92, 92); } catch (er) { /* photo indisponible */ }
      }
      d.y = top - rh;
      d.p.drawLine({ start: { x: M + 34, y: d.y + 4 }, end: { x: M + W, y: d.y + 4 }, thickness: 0.3, color: d.c.line });
    }
    d.y -= 6;
  }

  if (reunion.prochaine) { d.h2('Prochaine réunion'); d.para(fmtDate(reunion.prochaine, true) + (reunion.prochaineHeure ? ' à ' + reunion.prochaineHeure : '') + ' · sur site', { size: 10 }); }
  const mention = (await getSetting('mentionCR', null)) || 'Les observations éventuelles sur ce compte rendu sont à adresser à la maîtrise d’œuvre avant la prochaine réunion.';
  d.y -= 4; d.para(mention, { size: 8, color: d.c.grey });
  return new Blob([await d.save()], { type: 'application/pdf' });
}
function presence(v) { return v === 'A' ? 'Absent' : v === 'E' ? 'Excusé' : v === 'P' ? 'Présent' : 'Convoqué'; }

/* ---------- Compte rendu de rendez-vous (note) ---------- */
export async function buildNotePDF({ project, note, getSetting }) {
  const cab = await cabinet(getSetting);
  const t = noteType(note.type);
  const d = await Doc.create({ title: note.titre || ('Compte rendu · ' + t.nom), subtitle: fmtDate(note.date, true) + (note.heure ? ' · ' + note.heure : '') + (note.lieu ? ' · ' + note.lieu : ''), cabinet: cab, ref: (project.code || '') + ' · ' + t.nom });
  d.h2('Projet');
  d.kvGrid([['Projet', project.nom], ['Dossier', project.code], ['Client', project.client], ['Lieu', note.lieu || [project.adresse, project.commune].filter(Boolean).join(', ')], ['Type', t.nom], ['Participants', note.participants]]);
  const agenda = (note.agenda || []).filter((a) => a.text);
  if (agenda.length) { d.h2('Ordre du jour'); agenda.forEach((a) => d.para((a.done ? '[x]  ' : '[  ]  ') + a.text, { size: 9.5, gap: 1 })); d.y -= 4; }
  if (note.body) { d.h2('Notes'); d.para(note.body, { size: 9.8 }); }
  const dec = (note.decisions || []).filter((x) => x.text);
  if (dec.length) { d.h2('Décisions'); dec.forEach((x) => d.para('—  ' + x.text, { size: 9.8, gap: 2 })); }
  const todo = (note.todos || []).filter((x) => x.text);
  if (todo.length) { d.h2('Actions'); d.table(['Action', 'Qui', 'Échéance', 'Fait'], todo.map((x) => [x.text, x.who || '', x.due ? fmtShort(x.due) : '', x.done ? 'Oui' : '']), [0.56, 0.18, 0.14, 0.12]); }
  if (note.sketch && note.sketch.length) {
    const aspect = note.sketchAspect || 0.62;
    d.ensure(Math.min((A4[0] - 2 * M) * aspect, 340) + 50);
    d.h2('Croquis');
    const c = document.createElement('canvas'); c.width = 1600; c.height = Math.round(1600 * aspect);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    drawStrokes(ctx, note.sketch, 1.6);
    const W = A4[0] - 2 * M; const hh = W * aspect;
    const ih = await d.image(c.toDataURL('image/png'), M, d.y, W, Math.min(hh, 340));
    d.y -= ih + 10;
  }
  for (const m of note.photosData || []) {
    d.ensure(230);
    const ih = await d.image(m, M, d.y, 300, 220); d.y -= ih + 10;
  }
  return new Blob([await d.save()], { type: 'application/pdf' });
}

/* ---------- Validation de phase signée ---------- */
export async function buildValidationPDF({ project, v, getSetting }) {
  const cab = await cabinet(getSetting);
  const d = await Doc.create({ title: 'Validation de phase · ' + v.phaseNom, subtitle: fmtDate(v.date, true) + ' · ' + v.heure, cabinet: cab, ref: (project.code || '') + ' · VAL ' + v.phase });
  d.h2('Projet');
  d.kvGrid([['Projet', project.nom], ['Dossier', project.code], ['Maître d’ouvrage', project.client], ['Adresse', [project.adresse, project.commune].filter(Boolean).join(', ')]]);
  d.h2('Documents présentés');
  d.table(['Document', 'Indice', 'Date'], v.docs.map((x) => [x.nom, x.indice || '', x.date ? fmtShort(x.date) : '']), [0.64, 0.14, 0.22]);
  if (v.decisions) { d.h2('Décisions actées'); d.para(v.decisions); }
  d.h2('Réserves du maître d’ouvrage'); d.para(v.reserves || 'Aucune réserve.');
  d.h2('Validation');
  d.para('Le maître d’ouvrage valide la phase « ' + v.phaseNom + ' » sur la base des documents listés ci-dessus' + (v.reserves ? ', sous les réserves indiquées' : '') + '.', { size: 10 });
  if (v.signature) { d.ensure(120); await d.image(v.signature, M, d.y, 220, 100); d.y -= 108; }
  d.para('Signé sur tablette le ' + fmtDate(v.date) + ' à ' + v.heure + ' · ' + (project.client || 'Maître d’ouvrage'), { size: 8, color: d.c.grey });
  return new Blob([await d.save()], { type: 'application/pdf' });
}

/* ---------- Plan annoté (export) ---------- */
export async function exportAnnotatedPlan({ plan, pages, points }) {
  const { L } = await pdfLib();
  const { pdf, f } = await (async () => {
    let doc;
    if (plan.kind === 'pdf') doc = await L.PDFDocument.load(await plan.blob.arrayBuffer());
    else {
      doc = await L.PDFDocument.create();
      const bytes = await plan.blob.arrayBuffer();
      const img = plan.blob.type.includes('png') ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const pg = doc.addPage([img.width, img.height]); pg.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    }
    const { fontkit, bytes } = await pdfLib();
    doc.registerFontkit(fontkit);
    return { pdf: doc, f: await doc.embedFont(bytes.j5, { subset: true }) };
  })();
  const c = C(L);
  pdf.getPages().forEach((pg, i) => {
    const { width, height } = pg.getSize();
    const k = width / 1000;
    const an = pages[plan.id + ':' + i];
    if (an) {
      for (const s of an.strokes || []) {
        const { strokePath, PENS } = inkMod;
        const pen = PENS[s.pen] || PENS.stylo;
        const d = strokePath(s);
        const hex = (s.color || pen.color).replace('#', '');
        const col = L.rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);
        if (d) pg.drawSvgPath(d, { x: 0, y: height, scale: k, color: col, opacity: pen.opacity, borderWidth: 0 });
      }
      for (const t of an.texts || []) {
        const size = 11 * (width / 842);
        const tx = t.x * width, ty = height - t.y * height;
        const txt = String(t.text).replace(/[^\u0000-ÿŒœ’–—€]/g, '?');
        const tw = f.widthOfTextAtSize(txt, size);
        pg.drawRectangle({ x: tx - 3, y: ty - size * 0.75, width: tw + 6, height: size * 1.5, color: c.white, borderColor: c.ink, borderWidth: 0.6, opacity: 0.9 });
        pg.drawText(txt, { x: tx, y: ty - size * 0.35, size, font: f, color: c.ink });
      }
    }
    for (const p of points.filter((x) => (x.page || 0) === i)) {
      const r = 9 * (width / 842);
      const px = p.x * width, py = height - p.y * height;
      pg.drawCircle({ x: px, y: py, size: r, color: p.status === 'leve' ? c.white : c.ink, borderColor: p.status === 'leve' ? c.grey : c.white, borderWidth: 1.2 });
      const s = String(p.num); const fs = r * 0.95;
      pg.drawText(s, { x: px - f.widthOfTextAtSize(s, fs) / 2, y: py - fs * 0.35, size: fs, font: f, color: p.status === 'leve' ? c.grey : c.white });
    }
  });
  return new Blob([await pdf.save()], { type: 'application/pdf' });
}
import * as inkMod from './ink.js';

// Affiche un PDF dans l'application (aperçu, ou quand le téléchargement n'est pas permis)
export async function showPdf(blob, name) {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false }).promise;
  const pages = document.createElement('div');
  pages.style.cssText = 'flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;align-items:center;gap:16px;background:#3a3a37';
  const root = document.createElement('div');
  root.className = 'full'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', name);
  const bar = document.createElement('div');
  bar.className = 'v-top dark';
  const close = document.createElement('button');
  close.className = 'tool'; close.textContent = 'Fermer'; close.onclick = () => root.remove();
  const t = document.createElement('div'); t.className = 'v-title';
  const b = document.createElement('b'); b.textContent = name; const sp = document.createElement('span'); sp.textContent = doc.numPages + ' page(s) · aperçu';
  t.append(b, sp); bar.append(close, t); root.append(bar, pages);
  document.body.appendChild(root);
  const w = Math.min(900, window.innerWidth - 32);
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i);
    const vp1 = pg.getViewport({ scale: 1 });
    const k = (w * (window.devicePixelRatio || 1)) / vp1.width;
    const vp = pg.getViewport({ scale: k });
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; c.style.width = w + 'px'; c.style.background = '#fff';
    pages.appendChild(c);
    await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  }
}

export { blobToDataURL };
