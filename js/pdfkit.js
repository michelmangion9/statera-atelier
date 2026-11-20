// PDF : lecture (pdf.js) et fabrication de documents (pdf-lib) aux couleurs de STATERA
import { loadScript, fmtDate, fmtShort, blobToDataURL } from './lib.js';
import { LOGO_VB, LOGO_PATHS, LOGO_TF } from './brand.js';
import { drawStrokes } from './ink.js';
import { lot as lotOf, lotLabel as lotLabelOf, status as statusOf, noteType, CABINET_DEFAULT, visitType, MENTION_CR, phase as phaseOf } from './data.js';

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

/* ---------------- Fabrication : pdf-lib (mise en page des documents STATERA Honoraires) ---------------- */
let libP;
async function pdfLib() {
  if (!libP) {
    libP = (async () => {
      await loadScript(new URL('../vendor/pdf-lib.min.js', import.meta.url).href);
      await loadScript(new URL('../vendor/fontkit.umd.min.js', import.meta.url).href);
      const get = (f) => fetch(new URL('../assets/fonts/' + f, import.meta.url)).then((r) => r.arrayBuffer());
      const [j3, j4, j5, gi] = await Promise.all([get('jost-latin-300-normal.woff'), get('jost-latin-400-normal.woff'), get('jost-latin-500-normal.woff'), get('eb-garamond-latin-400-italic.woff')]);
      return { L: window.PDFLib, fontkit: window.fontkit, bytes: { j3, j4, j5, gi } };
    })();
  }
  return libP;
}

const A4 = [595.28, 841.89];
const MM = 2.8346;
const M = 17 * MM;           // marges latérales 17 mm
const TOP = 16 * MM;         // marge haute 16 mm
const FOOT = 22 * MM;        // zone de pied
function C(L) {
  const hex = (x) => L.rgb(parseInt(x.slice(1, 3), 16) / 255, parseInt(x.slice(3, 5), 16) / 255, parseInt(x.slice(5, 7), 16) / 255);
  return {
    hex, ink: hex('#161616'), ink2: hex('#57544F'), ink3: hex('#8C8981'), beton: hex('#BFBDB6'), rule: hex('#D9D6CF'), enduit: hex('#E7E5E0'), chaux: hex('#F4F3F0'), white: L.rgb(1, 1, 1),
    late: hex('#A23B2A'),
    // alias historiques
    grey: hex('#57544F'), line: hex('#BFBDB6'), stone: hex('#E7E5E0')
  };
}

// Mise en page : curseur vertical, sauts de page automatiques, en-têtes et pieds
class Doc {
  static async create(meta) {
    const { L, fontkit, bytes } = await pdfLib();
    const pdf = await L.PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const f = {
      l: await pdf.embedFont(bytes.j3, { subset: true }),
      r: await pdf.embedFont(bytes.j4, { subset: true }),
      m: await pdf.embedFont(bytes.j5, { subset: true }),
      gi: await pdf.embedFont(bytes.gi, { subset: true })
    };
    f.g = f.l;
    const d = new Doc(); Object.assign(d, { L, pdf, f, c: C(L), meta, pages: [], size: meta.size || A4 });
    pdf.setTitle(meta.title); pdf.setAuthor(meta.cabinet.nom); pdf.setCreator('STATERA Atelier'); pdf.setLanguage('fr-FR');
    d.charsets = new Map();
    d.newPage(true);
    return d;
  }
  get W() { return this.size[0]; }
  get H() { return this.size[1]; }
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
  // Texte espacé (capitales des étiquettes)
  tracked(text, x, y, size, { font, color, track = 0.16, right = false, page } = {}) {
    font = font || this.f.r; page = page || this.p;
    const t = this.safe(text, font);
    const tw = [...t].reduce((a, ch) => a + font.widthOfTextAtSize(ch, size) + size * track, 0) - size * track;
    let cx = right ? x - tw : x;
    for (const ch of t) { page.drawText(ch, { x: cx, y, size, font, color: color || this.c.ink3 }); cx += font.widthOfTextAtSize(ch, size) + size * track; }
    return tw;
  }
  logo(page, x, yTop, width, color) {
    const [vx, vy, vw] = LOGO_VB.split(/\s+/).map(Number);
    const k = width / vw;
    LOGO_PATHS.forEach((d, i) => {
      const t = LOGO_TF[i];
      const ox = x - vx * k + (t ? t.tx * k : 0), oy = yTop + vy * k - (t ? t.ty * k : 0);
      page.drawSvgPath(d, { x: ox, y: oy, scale: k * (t ? t.k : 1), color: color || this.c.ink, borderWidth: 0 });
    });
    return width * (Number(LOGO_VB.split(/\s+/)[3]) / vw);
  }
  newPage(first, size) {
    if (size) this.size = size;
    const p = this.pdf.addPage(this.size);
    this.pages.push(p); this.p = p;
    this.header(first);
  }
  header(first) {
    const { p, f, c, meta } = this;
    const top = this.H - TOP;
    if (first) {
      const lh = this.logo(p, M, top, 52 * MM);
      const who = this.safe(meta.cabinet.architecte.split(',')[0] || 'Michel Mangion', f.l);
      p.drawText(who, { x: this.W - M - f.l.widthOfTextAtSize(who, 13), y: top - 12, size: 13, font: f.l, color: c.ink });
      const s2 = 'Architecte';
      p.drawText(s2, { x: this.W - M - f.r.widthOfTextAtSize(s2, 8.5), y: top - 24, size: 8.5, font: f.r, color: c.ink2 });
      const ty = top - lh - 11 * MM - 22;
      const t = this.safe(meta.title, f.l);
      let ts = 25; while (f.l.widthOfTextAtSize(t, ts) > this.W - 2 * M && ts > 14) ts -= 1;
      p.drawText(t, { x: M, y: ty, size: ts, font: f.l, color: c.ink });
      let y = ty - 14;
      if (meta.subtitle) { p.drawText(this.safe(meta.subtitle), { x: M, y, size: 8.5, font: f.r, color: c.ink2 }); y -= 11; }
      if (meta.ref) { this.tracked(meta.ref, M, y, 6.8, { track: 0.06 }); y -= 6; }
      this.y = y - 16;
    } else {
      const lh = this.logo(p, M, top, 34 * MM);
      const t = this.safe(meta.title, f.l);
      p.drawText(t, { x: this.W - M - f.l.widthOfTextAtSize(t, 10.5), y: top - 10, size: 10.5, font: f.l, color: c.ink });
      if (meta.subtitle) { const s = this.safe(meta.subtitle); p.drawText(s, { x: this.W - M - f.r.widthOfTextAtSize(s, 7.5), y: top - 21, size: 7.5, font: f.r, color: c.ink3 }); }
      p.drawLine({ start: { x: M, y: top - lh - 8 }, end: { x: this.W - M, y: top - lh - 8 }, thickness: 0.6, color: c.ink });
      this.y = top - lh - 24;
    }
  }
  footers() {
    const { f, c, meta } = this;
    const n = this.pages.length;
    const cab = meta.cabinet;
    const txt = this.safe([cab.nom, cab.architecte + (cab.forme ? ', ' + cab.forme : ''), cab.adresse, cab.siren, cab.ordre, cab.email, cab.tel].filter(Boolean).join(' — '));
    this.pages.forEach((p, i) => {
      const { width } = p.getSize();
      const maxW = width - 2 * M - 60;
      p.drawLine({ start: { x: M, y: FOOT - 4 }, end: { x: width - M, y: FOOT - 4 }, thickness: 0.4, color: c.rule });
      const ls = this.lines(txt, 6.4, maxW);
      ls.slice(0, 2).forEach((l, j) => p.drawText(l, { x: M, y: FOOT - 14 - j * 8.5, size: 6.4, font: f.r, color: c.ink3 }));
      const pg = (i + 1) + ' / ' + n;
      p.drawText(pg, { x: width - M - f.r.widthOfTextAtSize(pg, 7.5), y: FOOT - 14, size: 7.5, font: f.r, color: c.ink });
      if (meta.ref) { const r = this.safe(meta.ref); p.drawText(r, { x: width - M - f.r.widthOfTextAtSize(r, 6.2), y: FOOT - 23, size: 6.2, font: f.r, color: c.ink3 }); }
    });
  }
  ensure(hgt) { if (this.y - hgt < FOOT + 6) this.newPage(false); }
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
    width = width || this.W - 2 * M;
    const ls = this.lines(text, size, width, font);
    for (const l of ls) {
      this.ensure(size * lh);
      this.p.drawText(l, { x, y: this.y - size, size, font: font || this.f.r, color: color || this.c.ink });
      this.y -= size * lh;
    }
    this.y -= gap;
  }
  // Titre de section : capitales espacées, filet béton (comme les phases de la proposition d'honoraires)
  h2(t, right) {
    this.ensure(44);
    this.y -= 8;
    this.tracked(t.toUpperCase(), M, this.y - 8, 7.4, { color: this.c.ink, track: 0.18 });
    if (right) { const r = this.safe(right, this.f.l); this.p.drawText(r, { x: this.W - M - this.f.l.widthOfTextAtSize(r, 12.5), y: this.y - 9, size: 12.5, font: this.f.l, color: this.c.ink }); }
    this.y -= 13;
    this.p.drawLine({ start: { x: M, y: this.y }, end: { x: this.W - M, y: this.y }, thickness: 0.4, color: this.c.beton });
    this.y -= 10;
  }
  // Bloc « parties » : filet noir au-dessus, filet clair au-dessous, colonnes
  kvGrid(pairs, cols = 3) {
    const colW = (this.W - 2 * M) / cols;
    this.ensure(40);
    this.p.drawLine({ start: { x: M, y: this.y }, end: { x: this.W - M, y: this.y }, thickness: 0.6, color: this.c.ink });
    this.y -= 4 * MM;
    for (let i = 0; i < pairs.length; i += cols) {
      const row = pairs.slice(i, i + cols);
      const hs = row.map(([, v]) => this.lines(v || '—', 9, colW - 14).length);
      const rh = 12 + Math.max(...hs) * 12.6 + 8;
      this.ensure(rh);
      row.forEach(([k, v], j) => {
        const x = M + j * colW;
        this.tracked(k.toUpperCase(), x, this.y - 6, 6.6, { track: 0.16 });
        this.lines(v || '—', 9, colW - 14).forEach((l, n) => this.p.drawText(l, { x, y: this.y - 19 - n * 12.6, size: 9, font: this.f.r, color: this.c.ink }));
      });
      this.y -= rh;
    }
    this.p.drawLine({ start: { x: M, y: this.y + 2 }, end: { x: this.W - M, y: this.y + 2 }, thickness: 0.4, color: this.c.rule });
    this.y -= 12;
  }
  table(head, rows, widths, { size = 8.6 } = {}) {
    const Wd = this.W - 2 * M;
    const ws = widths.map((w) => w * Wd);
    const drawHead = () => {
      this.ensure(22);
      let x = M;
      head.forEach((t, i) => { this.tracked(t.toUpperCase(), x, this.y - 10, 6.6, { track: 0.14, color: this.c.ink }); x += ws[i]; });
      this.y -= 15;
      this.p.drawLine({ start: { x: M, y: this.y }, end: { x: M + Wd, y: this.y }, thickness: 0.4, color: this.c.beton });
    };
    drawHead();
    rows.forEach((r) => {
      const cells = r.map((t, i) => this.lines(t || '', size, ws[i] - 10));
      const rh = Math.max(...cells.map((c) => c.length)) * (size * 1.38) + 8;
      if (this.y - rh < FOOT + 6) { this.newPage(false); drawHead(); }
      let x = M;
      cells.forEach((ls, i) => { ls.forEach((l, n) => this.p.drawText(l, { x, y: this.y - 5 - size - n * size * 1.38, size, font: this.f.r, color: this.c.ink })); x += ws[i]; });
      this.y -= rh;
      this.p.drawLine({ start: { x: M, y: this.y }, end: { x: M + Wd, y: this.y }, thickness: 0.3, color: this.c.enduit });
    });
    this.y -= 8;
  }
  async image(dataURL, x, yTop, w, hgt) {
    const bytes = await (await fetch(dataURL)).arrayBuffer();
    const img = dataURL.startsWith('data:image/png') ? await this.pdf.embedPng(bytes) : await this.pdf.embedJpg(bytes);
    const k = Math.min(w / img.width, hgt / img.height);
    const iw = img.width * k, ih = img.height * k;
    this.p.drawImage(img, { x, y: yTop - ih, width: iw, height: ih });
    this.p.drawRectangle({ x, y: yTop - ih, width: iw, height: ih, borderColor: this.c.rule, borderWidth: 0.4 });
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
  const lotLabel = (lid) => (lid === '—' || !lid) ? 'Généralités' : lotLabelOf(lid);
  const vt = visitType(reunion.type);
  const title = vt.id === 'chantier' ? vt.titre + ' n°' + reunion.num : vt.titre;
  const subtitle = fmtDate(reunion.date, true) + (reunion.heure ? ' · ' + reunion.heure : '') + (onlyLot ? ' · ' + lotLabel(onlyLot) : '');
  const d = await Doc.create({ title, subtitle, cabinet: cab, ref: (project.code || '') + ' · ' + vt.court + String(reunion.num).padStart(2, '0') + (onlyLot ? ' · lot ' + onlyLot : '') });

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
    const lc = d.c.hex(lotOf(lid).color || '#161616');
    d.y -= 6;
    d.p.drawRectangle({ x: M, y: d.y - 12, width: 9, height: 9, color: lc });
    d.tracked(lotLabel(lid).toUpperCase(), M + 16, d.y - 11, 7.4, { color: d.c.ink, track: 0.16 });
    const en = d.safe(e ? e.nom : (lid === '—' ? 'Tous intervenants' : 'Entreprise non attribuée'), d.f.l);
    d.p.drawText(en, { x: M + W - d.f.l.widthOfTextAtSize(en, 12), y: d.y - 12, size: 12, font: d.f.l, color: d.c.ink });
    d.y -= 18;
    d.p.drawLine({ start: { x: M, y: d.y }, end: { x: M + W, y: d.y }, thickness: 0.4, color: d.c.beton });
    d.y -= 10;
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
      d.p.drawCircle({ x: M + 13, y: top - 13, size: 11.5, color: pt.status === 'leve' ? d.c.white : d.c.hex(lotOf(pt.lot).color || '#161616'), borderColor: d.c.ink3, borderWidth: pt.status === 'leve' ? 0.8 : 0 });
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

  if (vt.id === 'reception' || vt.id === 'levee') {
    const W = A4[0] - 2 * M;
    d.h2(vt.id === 'reception' ? 'Décision du maître d’ouvrage' : 'Constat');
    const opts = vt.id === 'reception'
      ? [['sans', 'La réception est prononcée sans réserve.'], ['avec', 'La réception est prononcée avec les réserves listées ci-dessus, à lever par les entreprises concernées' + (reunion.delaiLevee ? ' dans un délai de ' + reunion.delaiLevee + ' jours.' : '.')], ['refus', 'La réception est refusée' + (reunion.motifRefus ? ' : ' + reunion.motifRefus : '.')]]
      : [['tout', 'L’ensemble des réserves listées est levé.'], ['partiel', 'Les réserves restant ouvertes ci-dessus demeurent à lever.']];
    for (const [k, t] of opts) {
      d.ensure(18);
      const on = (reunion.decision || (vt.id === 'reception' ? 'avec' : 'partiel')) === k;
      d.p.drawRectangle({ x: M, y: d.y - 9, width: 8, height: 8, borderColor: d.c.ink, borderWidth: 0.6, color: on ? d.c.ink : undefined });
      const ls = d.lines(t, 9.5, W - 18);
      ls.forEach((l, i) => d.p.drawText(l, { x: M + 16, y: d.y - 8 - i * 12.5, size: 9.5, font: d.f.r, color: d.c.ink }));
      d.y -= 8 + ls.length * 12.5 + 4;
    }
    if (vt.id === 'reception') d.para('Date d’effet de la réception : ' + fmtDate(reunion.dateEffet || reunion.date) + '. Elle fait courir la garantie de parfait achèvement (1 an), la garantie de bon fonctionnement (2 ans) et la garantie décennale (10 ans).', { size: 8.5, color: d.c.grey });
    d.h2('Signatures');
    const sig = ['Maître d’ouvrage', 'Maîtrise d’œuvre', onlyLot ? 'Entreprise · lot ' + onlyLot : 'Entreprise(s)'];
    d.ensure(84);
    const bw = (W - 24) / 3;
    sig.forEach((t, i) => {
      const x = M + i * (bw + 12);
      d.p.drawText(d.safe(t.toUpperCase()), { x, y: d.y - 10, size: 6.8, font: d.f.m || d.f.r, color: d.c.grey });
      d.p.drawRectangle({ x, y: d.y - 76, width: bw, height: 58, borderColor: d.c.line, borderWidth: 0.5 });
      d.p.drawText('Lu et approuvé, date :', { x: x + 6, y: d.y - 28, size: 7, font: d.f.r, color: d.c.grey });
    });
    d.y -= 84;
  }
  if (reunion.prochaine) { d.h2('Prochaine réunion'); d.para(fmtDate(reunion.prochaine, true) + (reunion.prochaineHeure ? ' à ' + reunion.prochaineHeure : '') + ' · sur site', { size: 10 }); }
  const mention = (await getSetting('mentionCR', null)) || MENTION_CR;
  d.y -= 4; d.para(mention, { size: 8, color: d.c.grey });
  return new Blob([await d.save()], { type: 'application/pdf' });
}
function presence(v) { return v === 'A' ? 'Absent' : v === 'E' ? 'Excusé' : v === 'P' ? 'Présent' : 'Convoqué'; }

/* ---------- Fiche de rendez-vous client (A4 à imprimer) ---------- */
export async function buildRdvPDF({ project, decisions = [], todos = [], getSetting }) {
  const cab = await cabinet(getSetting);
  const ph = phaseOf(project.phase);
  const d = await Doc.create({ title: 'Fiche de rendez-vous', subtitle: fmtDate(new Date().toISOString().slice(0, 10), true), cabinet: cab, ref: (project.code || '') + ' · RDV' });
  const pr = project.prog || {};
  d.kvGrid([['Projet', project.nom], ['Dossier', project.code], ['Maître d’ouvrage', project.client], ['Adresse des travaux', [project.adresse, project.commune].filter(Boolean).join(', ')], ['Phase en cours', ph.nom], ['Budget travaux HT', pr.budget ? Number(pr.budget).toLocaleString('fr-FR') + ' €' : '']]);
  const rdv = project.rdv || {};
  const block = (t, items) => { if (!items.length) return; d.h2(t); items.forEach((x) => d.para('— ' + x, { size: 10, gap: 2 })); };
  block('Décidé ensemble', decisions.slice(0, 10).map((x) => x.text));
  block('En attente', todos.slice(0, 8).map((x) => x.text + (x.who ? ' (' + x.who + ')' : '')));
  if (rdv.agenda) { d.h2('Aujourd’hui'); d.para(rdv.agenda, { size: 10 }); }
  if (rdv.suite) { d.h2('La suite'); d.para(rdv.suite, { size: 10 }); }
  d.h2('Notes du rendez-vous');
  d.ensure(120);
  const W = A4[0] - 2 * M;
  while (d.y - 22 > FOOT + 30) { d.y -= 22; d.p.drawLine({ start: { x: M, y: d.y }, end: { x: M + W, y: d.y }, thickness: 0.3, color: d.c.line }); }
  return new Blob([await d.save()], { type: 'application/pdf' });
}

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
  pages.style.cssText = 'flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;align-items:center;gap:16px;background:#D9D7D2';
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
