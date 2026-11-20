/* STATERA — import d'un contrat de l'Ordre des architectes (PDF généré par l'outil en ligne du CNOA)
 * et restitution dans la mise en page STATERA, texte repris mot pour mot.
 * extract() lit le PDF avec pdf.js (navigateur ou Node) ; parse(), render(), verify() sont purs.
 * Garantie : verify() compare, caractère par caractère (espaces et points de suite exclus), le texte du PDF
 * et le texte restitué ; la moindre différence bloque l'impression.
 * Aucune donnée n'est envoyée ni conservée : tout reste en mémoire sur l'appareil.
 */
(function (root) {
  "use strict";

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const BOX = /^[☑☐☒□■▢▣✓✔✗✘]/;
  const ON = /^[☑☒■▣✓✔✗✘]/;

  /* ---------- 1. Extraction (pdf.js) ---------- */
  async function extract(pdfjsLib, data) {
    const doc = await pdfjsLib.getDocument({ data, isEvalSupported: false, disableFontFace: true, useSystemFonts: false }).promise;
    const pages = [], art = { draft: false, stamps: [], pageNumbers: 0 };
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      try { await page.getOperatorList(); } catch (_) { /* polices non chargées : gras non détecté */ }
      const fname = id => { try { const f = page.commonObjs.get(id); return (f && (f.name || "")) + (f && f.bold ? "-Bold" : ""); } catch (_) { return ""; } };
      const items = [];
      for (const it of tc.items) {
        if (!it.str) continue;
        const t = it.transform;
        const size = Math.hypot(t[2], t[3]) || Math.abs(t[3]);
        if (Math.abs(t[1]) > 0.01 || Math.abs(t[2]) > 0.01) {
          // Texte oblique ou vertical : filigrane « PROJET » et horodatage de l'outil de l'Ordre.
          if (/^\s*PROJET\s*$/i.test(it.str)) art.draft = true; else if (it.str.trim()) art.stamps.push(it.str.trim());
          continue;
        }
        if (/^\s*\d{1,3}\s*$/.test(it.str) && t[5] < 40) { art.pageNumbers++; continue; }
        const fn = fname(it.fontName);
        items.push({ s: it.str, x: t[4], y: t[5], w: it.width, size, bold: /bold|black|semibold|heavy/i.test(fn), italic: /italic|oblique/i.test(fn) });
      }
      pages.push({ n, w: vp.width, h: vp.height, items });
    }
    return { pages, artifacts: art };
  }

  /* ---------- 2. Analyse ---------- */
  // Concatène des fragments d'une même ligne en respectant les espaces réels (lettrines et ligatures collées).
  function joinItems(items) {
    let out = "", prev = null;
    for (const it of items) {
      if (prev) {
        const gap = it.x - (prev.x + prev.w);
        const sp = /\s$/.test(out) || /^\s/.test(it.s);
        if (!sp && gap > 0.07 * Math.max(it.size, prev.size)) out += " ";
      }
      out += it.s; prev = it;
    }
    return out.replace(/\s+/g, " ").trim();
  }

  // Bandes horizontales : éléments dont les hauteurs se chevauchent (cellules de tableau sur plusieurs lignes).
  function bands(page) {
    const its = page.items.filter(i => i.s.trim()).sort((a, b) => (b.y + 0.75 * b.size) - (a.y + 0.75 * a.size) || a.x - b.x);
    const out = [];
    for (const it of its) {
      const hi = it.y + 0.75 * it.size;
      const cur = out[out.length - 1];
      if (cur && hi > cur.lo + 0.3) { cur.items.push(it); cur.lo = Math.min(cur.lo, it.y); }
      else out.push({ items: [it], hi, lo: it.y });
    }
    return out.map(b => {
      const xs = b.items.slice().sort((a, c) => a.x - c.x);
      const cols = [];
      for (const it of xs) {
        const c = cols[cols.length - 1];
        if (c && it.x - c.x1 <= 14) { c.items.push(it); c.x1 = Math.max(c.x1, it.x + it.w); }
        else cols.push({ x0: it.x, x1: it.x + it.w, items: [it] });
      }
      // Ligne justifiée (espaces élargis) ou case à cocher suivie de son libellé : une seule colonne.
      const live = cols;
      if (live.length > 4 || (live.length >= 2 && BOX.test(live[0].items.map(i => i.s).join("").trim()) && live[0].items.map(i => i.s).join("").trim().length === 1)) {
        const all = { x0: cols[0].x0, x1: Math.max(...cols.map(c => c.x1)), items: cols.flatMap(c => c.items) };
        cols.length = 0; cols.push(all);
      }
      cols.forEach(c => {
        const rows = [];
        c.items.slice().sort((a, d) => d.y - a.y || a.x - d.x).forEach(it => {
          const r = rows.find(r => Math.abs(r.y - it.y) < 0.5 * it.size);
          if (r) r.items.push(it); else rows.push({ y: it.y, items: [it] });
        });
        rows.sort((a, d) => d.y - a.y);
        c.lines = rows.map(r => joinItems(r.items.sort((a, d) => a.x - d.x))).filter(Boolean);
        c.text = c.lines.join(" ");
        const chars = c.items.reduce((a, it) => a + it.s.replace(/\s/g, "").length, 0) || 1;
        c.bold = c.items.reduce((a, it) => a + (it.bold ? it.s.replace(/\s/g, "").length : 0), 0) / chars > 0.6;
        c.italic = c.items.reduce((a, it) => a + (it.italic ? it.s.replace(/\s/g, "").length : 0), 0) / chars > 0.6;
      });
      const size = Math.max(...b.items.map(i => i.size));
      const base = Math.max(...b.items.map(i => i.y));
      return { page: page.n, pw: page.w, hi: b.hi, lo: b.lo, base, size, cols: cols.filter(c => c.text), x0: cols[0].x0, x1: Math.max(...cols.map(c => c.x1)) };
    }).filter(b => b.cols.length);
  }

  function parse(ex) {
    const blocks = [];
    let src = "";
    ex.pages.forEach(p => p.items.forEach(it => { src += it.s; }));
    const margin = Math.min(...ex.pages.flatMap(p => p.items.map(i => i.x)).filter(Number.isFinite));
    const ends1 = ex.pages.flatMap(p => p.items.map(i => i.x + i.w)).filter(Number.isFinite).sort((a, c) => a - c);
    const right = ends1.length ? ends1[Math.floor(ends1.length * 0.97)] : 560;
    let prevBand = null;
    const last = () => blocks[blocks.length - 1];
    const ends = t => /[.:;!?»”)]\s*$/.test(t);
    // Retour à la ligne après un trait d'union (« ci-|dessous », adresse web) : pas d'espace ajoutée.
    const glue = (a, t) => (/\S-$/.test(a) ? a + t : a + " " + t);

    // Libellé de ligne écrit au-dessus des montants (cellule sur deux lignes) : rattaché à la ligne suivante.
    let pend = null;
    const flush = () => { if (pend) { pend.row.cells[0] = (pend.row.cells[0] ? pend.row.cells[0] + " " : "") + pend.text; pend = null; } };
    ex.pages.forEach((page, pi) => {
      const bs = bands(page);
      bs.forEach((b, bi) => {
        const text = b.cols.map(c => c.text).join(" ");
        if (pend && !(b.cols.length >= 2 && b.page === pend.page && pend.base - b.base < 2 * b.size)) flush();
        const L = last();
        const samePage = prevBand && prevBand.page === b.page;
        const gap = samePage ? prevBand.base - b.base : Infinity;
        const firstOnPage = bi === 0;
        const centered = b.cols.length === 1 && b.x0 > margin + 40 && Math.abs((b.x0 + b.x1) / 2 - b.pw / 2) < 35;
        const bold = b.cols.every(c => c.bold);
        const italic = b.cols.every(c => c.italic);
        const push = o => { blocks.push(Object.assign({ page: b.page, x0: b.x0, x1: b.x1 }, o)); };

        if (pi === 0 && b.size >= 14 && !blocks.some(k => k.t !== "title")) { if (L && L.t === "title") L.lines.push(text); else push({ t: "title", lines: [text] }); }
        else if (b.cols.length >= 2 && /LE CLIENT/i.test(text) && /ARCHITECTE/i.test(text)) push({ t: "sig", cells: b.cols.map(c => c.text) });
        else if (b.cols.length >= 2) {
          const row = { cells: b.cols.map(c => c.text), xs: b.cols.map(c => c.x0), bold };
          if (pend) { row.cells[0] = pend.text + " " + row.cells[0]; pend = null; }
          if (L && L.t === "table" && (gap < 6 * b.size || firstOnPage)) L.rows.push(row);
          else if (L && L.t === "caption" && L.page === b.page && gap < 6 * b.size) { L.t = "table"; L.rows = [{ group: L.text, bold: L.bold }, row]; L.xs = row.xs; delete L.text; }
          else push({ t: "table", rows: [row], xs: row.xs });
        }
        else if (L && L.t === "table" && !centered && b.x0 > margin + 3 && (gap < 6 * b.size || firstOnPage) && L.rows.length && L.rows[L.rows.length - 1].cells) {
          // suite d'une cellule (texte sur plusieurs lignes, ou tableau coupé par un saut de page)
          const row = L.rows[L.rows.length - 1];
          let k = 0, best = Infinity;
          L.xs.forEach((x, i) => { const d = Math.abs(x - b.x0); if (d < best) { best = d; k = i; } });
          if (best < 12 && k === 0 && !firstOnPage) pend = { text, base: b.base, page: b.page, row };
          else if (best < 12 && (gap < 2.4 * b.size || firstOnPage)) { while (row.cells.length <= k) row.cells.push(""); row.cells[k] = row.cells[k] ? glue(row.cells[k], text) : text; }
          else push({ t: "p", text, italic });
        }
        else if (centered && L && L.t === "table" && gap < 6 * b.size) L.rows.push({ group: text, bold });
        else if (L && (L.t === "h2" || L.t === "h3" || L.t === "h4") && bold && samePage && gap < 1.9 * b.size && !ends(L.text) && b.x0 < margin + 30) { L.text = glue(L.text, text); if (L.t === "h4") L.multi = true; }
        else if (/^ARTICLE\s+\d+/.test(text) && bold) push({ t: "h2", text });
        else if (/^Article\s+\d+(\.\d+)+/.test(text) && bold) push({ t: "h3", text });
        else if (BOX.test(text)) push({ t: "chk", on: ON.test(text), text });
        else if (centered && L && (L.t === "p") && samePage && gap < 1.9 * b.size && !ends(L.text)) { L.text = glue(L.text, text); }
        else if (centered) push({ t: "caption", text, bold });
        else if (/^formulaire|mod[eè]le de formulaire/i.test(text) && bold) push({ t: "caption", text, bold, pageBreak: true });
        else if (bold && text.length < 160 && !(L && L.t === "p" && samePage && gap < 1.9 * b.size && !ends(L.text) && L.bold)) push({ t: "h4", text });
        else if (/^[-–•]\s?/.test(text) && !/^-\d/.test(text)) push({ t: "li", text });
        else if (!text.replace(/[….\s_:]/g, "")) push({ t: "fill", text });
        else {
          // Suite du paragraphe : ligne précédente pleine (le texte a été renvoyé à la ligne) et même alignement.
          const full = L && L.x1 > right - 90;
          const aligned = L && (b.x0 < margin + 30 && L.x0 < margin + 30 || Math.abs(b.x0 - (L.ind || L.x0)) < 4 || L.t === "li" || L.t === "chk");
          const cont = L && (L.t === "p" || L.t === "li" || L.t === "chk") && (
            (samePage && gap < 1.9 * b.size && full && aligned) ||
            (firstOnPage && !ends(L.text) && /^[a-zà-ÿ0-9(«"’']/.test(text)));
          if (cont) { L.text = glue(L.text, text); L.x1 = b.x1; }
          else push({ t: "p", text, italic, bold, ind: b.x0 > margin + 12 ? b.x0 : 0 });
        }
        prevBand = b;
      });
    });
    flush();
    // Formulaire de rétractation et annexes : nouvelle page.
    blocks.forEach(k => { if ((k.t === "caption" || k.t === "h4") && /formulaire de r[ée]tractation/i.test(k.text || "")) k.pageBreak = true; });
    const title = blocks.find(k => k.t === "title");
    const meta = {
      draft: !!(ex.artifacts && ex.artifacts.draft),
      stamp: ex.artifacts && ex.artifacts.stamps[0] || "",
      title: title ? title.lines.join(" — ") : "Contrat d’architecte",
      cnoa: /CNOA|Ordre des architectes/i.test(src),
      parties: ((blocks.find(k => k.t === "p" && /contractant en son nom/i.test(k.text)) || {}).text || "").replace(/\s*contractant en son nom.*$/i, "")
    };
    return { blocks, meta, source: src };
  }

  /* ---------- 3. Restitution ---------- */
  // Les points de suite (……) deviennent des lignes à remplir ; le texte, lui, est repris tel quel.
  const fills = s => esc(s).replace(/(?:…|\.{2,}|_{2,})+/g, '<span class="fill"></span>');
  // Même mise en page que le contrat généré par l'application (titre, sommaire, articles, cases, tableaux,
  // mention manuscrite, signatures, annexe). Seules les mentions ajoutées (data-x) ne viennent pas du PDF.
  function render(parsed, opts) {
    const o = Object.assign({ brand: "STATERA" }, opts || {});
    const out = [];
    const added = t => `<span data-x>${esc(t)}</span>`;
    const sentence = t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
    const isMoney = t => /€|^\s*\d+([,.]\d+)?\s*$/.test(t);
    const B = parsed.blocks;
    const shortChk = k => k && k.t === "chk" && k.text.length <= 110;
    const manus = t => `<div class="c-manus"><div class="lbl">${esc(t)}</div><div class="lines"><i></i><i></i><i></i><i></i><i></i></div></div>`;
    let i = 0, firstPara = true;
    while (i < B.length) {
      const k = B[i];
      // Liste de cases à cocher (éléments de mission), avec ses intertitres : tableau à cases, comme le contrat généré.
      if ((k.t === "caption" && !k.pageBreak && B.slice(i, i + 4).some(shortChk)) || shortChk(k)) {
        const rows = [];
        while (i < B.length && ((B[i].t === "caption" && !B[i].pageBreak) || shortChk(B[i]))) {
          const r = B[i];
          rows.push(r.t === "caption"
            ? `<tr class="grp"><td colspan="2">${esc(r.text)}</td></tr>`
            : `<tr><td class="b"><span class="cbx${r.on ? " on" : ""}">${esc(r.text.charAt(0))}</span></td><td>${esc(r.text.slice(1).trim())}</td></tr>`);
          i++;
        }
        rows.forEach((tr, j) => out.push({ cls: "c-p c-trow", html: `<table class="c-tab c-miss">${tr}</table>`, keep: /class="grp"/.test(tr) }));
        continue;
      }
      i++;
      switch (k.t) {
        case "title": {
          const toc = B.filter(b => b.t === "h2").map(b => `<li>${added(sentence(b.text.replace(/^ARTICLE\s+\d+\s*[-–—]\s*/, "")))}</li>`).join("");
          out.push({ cls: "c-title", html: `<div class="c-h1"><span class="imp-case">${esc(k.lines[0])}</span></div><div class="c-sub">${k.lines.slice(1).map(l => `<span class="imp-case">${esc(l)}</span>`).join(" ")}${added(` — contrat type de l’Ordre des architectes${parsed.meta.draft ? " (projet)" : ""}${parsed.meta.parties ? ` — ${parsed.meta.parties}` : ""}`)}</div>` });
          if (toc) out.push({ cls: "c-toc", html: `<ol>${toc}</ol>` });
          break;
        }
        case "h2": out.push({ cls: "c-p", html: `<h4>${esc(k.text)}</h4>`, keep: true }); break;
        case "h3": out.push({ cls: "c-p", html: `<h5>${esc(k.text)}</h5>`, keep: true }); break;
        case "h4":
          if (k.multi) { out.push({ cls: "c-p", html: `<p class="${firstPara ? "c-note" : "imp-b"}">${fills(k.text)}</p>` }); break; }
          if (/^Mention du client\s*:?\s*$/i.test(k.text)) { out.push({ cls: "c-p", html: manus(k.text) }); break; }
          out.push({ cls: "c-p", html: `<p class="imp-lbl"><b>${esc(k.text)}</b></p>`, keep: true });
          break;
        case "caption":
          if (k.pageBreak) out.push({ cls: "c-annex", pageBreak: true, html: `<div class="c-h2"><span class="imp-case">${esc(k.text)}</span></div><div class="c-sub">${added(`Contrat type de l’Ordre des architectes${parsed.meta.parties ? ` — ${parsed.meta.parties}` : ""}`)}</div>` });
          else out.push({ cls: "c-p", html: `<h5>${esc(k.text)}</h5>`, keep: true });
          break;
        case "chk": out.push({ cls: "c-p", html: `<p class="imp-chk"><span class="cbx${k.on ? " on" : ""}">${esc(k.text.charAt(0))}</span>${esc(k.text.slice(1).trim())}</p>` }); break;
        case "li": { const m = k.text.match(/^([-–•])\s?(.*)$/); out.push({ cls: "c-p", html: `<p class="imp-li"><span class="mk">${esc(m[1])}</span>${fills(m[2])}</p>` }); break; }
        case "fill": out.push({ cls: "c-p", html: `<p class="imp-fill">${fills(k.text)}</p>` }); break;
        case "sig":
          out.push({ cls: "c-sign", html: `<div class="c-sigs">${k.cells.map((c, j) => `<div class="c-sig"><div class="lbl">${esc(c)}</div><div class="space">${added(j === 0 ? "Mention manuscrite « Lu et approuvé » et signature" : "Signature")}</div></div>`).join("")}</div>` });
          break;
        case "table": {
          const n = Math.max(...k.rows.map(r => r.cells ? r.cells.length : 1));
          const xs = k.xs.slice(0, n);
          const w = xs.map((x, j) => (j + 1 < xs.length ? xs[j + 1] : 560) - x);
          const tot = w.reduce((a, v) => a + v, 0) || 1;
          const cg = `<colgroup>${w.map(v => `<col style="width:${(v / tot * 100).toFixed(1)}%">`).join("")}</colgroup>`;
          k.rows.forEach((r, j) => {
            const head = j === 0 && r.bold;
            const tr = r.group != null
              ? `<tr class="grp"><td colspan="${n}">${esc(r.group)}</td></tr>`
              : `<tr>${Array.from({ length: n }, (_, c) => { const v = r.cells[c] || ""; return head ? `<th>${esc(v)}</th>` : `<td${c > 0 && isMoney(v) ? ' class="r"' : ""}>${esc(v)}</td>`; }).join("")}</tr>`;
            out.push({ cls: "c-p c-trow", html: `<table class="c-tab c-imp">${cg}${tr}</table>`, keep: r.group != null || head });
          });
          break;
        }
        default: {
          const cls = [k.italic ? "imp-i" : "", k.ind ? "imp-ind" : ""].filter(Boolean).join(" ");
          if (/^Mention du client\s*:?\s*$/i.test(k.text)) { out.push({ cls: "c-p", html: manus(k.text) }); break; }
          if (/^Fait (en|à)\b/i.test(k.text)) { out.push({ cls: "c-p", html: `<div class="c-sigs-intro">${fills(k.text)}</div>`, keep: true }); break; }
          // Lignes courtes successives (coordonnées, références) : resserrées comme un bloc d’identification.
          out.push({ cls: "c-p" + (k.text.length < 95 && !/[.;]$/.test(k.text) ? " imp-s" : ""), html: `<p${cls ? ` class="${cls}"` : ""}>${fills(k.text)}</p>` });
        }
      }
      if (k.t !== "title") firstPara = false;
    }
    // Un titre ne reste jamais seul en bas de page : il est fusionné avec le bloc suivant.
    const merged = [];
    for (let j = 0; j < out.length; j++) {
      const b = Object.assign({}, out[j]);
      while (b.keep && out[j + 1] && !out[j + 1].pageBreak) { const nx = out[++j]; b.html += nx.html; b.keep = nx.keep; }
      delete b.keep;
      merged.push(b);
    }
    return merged;
  }

  /* ---------- 4. Contrôle d'intégrité ---------- */
  const canon = s => String(s || "").normalize("NFKC").replace(/[​-‍﻿­]/g, "").replace(/(?:\.{2,}|_{2,})+/g, "").replace(/\s+/g, "");
  const decode = s => s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  function blocksText(rendered) {
    return rendered.map(b => decode(b.html.replace(/<span data-x>[^<]*<\/span>/g, "").replace(/<[^>]+>/g, " "))).join(" ");
  }
  // Intégrité : chaque caractère du PDF (hors espaces et points de suite) doit se retrouver dans la restitution,
  // autant de fois, et rien ne doit être ajouté. L'ordre peut varier dans les tableaux reconstruits.
  function counts(str) { const m = new Map(); for (const ch of str) m.set(ch, (m.get(ch) || 0) + 1); return m; }
  function verify(parsed, rendered) {
    const a = canon(parsed.source), b = canon(blocksText(rendered));
    const ca = counts(a), cb = counts(b);
    const missing = [], extra = [];
    new Set([...ca.keys(), ...cb.keys()]).forEach(ch => {
      const d = (ca.get(ch) || 0) - (cb.get(ch) || 0);
      if (d > 0) missing.push(`${ch} ×${d}`); else if (d < 0) extra.push(`${ch} ×${-d}`);
    });
    let at = 0; while (at < a.length && a[at] === b[at]) at++;
    return { ok: !missing.length && !extra.length, chars: a.length, out: b.length, missing, extra, sameOrder: a === b,
             at, source: a.slice(Math.max(0, at - 30), at + 30), result: b.slice(Math.max(0, at - 30), at + 30) };
  }

  /* ---------- 5. Synthèse pour la page « Proposition d’honoraires » ---------- */
  // Les montants sont relevés dans le contrat lui-même, puis recoupés : somme des missions = montant forfaitaire.
  const num = t => { const v = parseFloat(String(t || "").replace(/[\s\u00A0\u202F]/g, "").replace(",", ".")); return Number.isFinite(v) ? v : NaN; };
  const MONEY = "([\\d\\s\\u00A0\\u202F]+(?:,\\d{1,2})?)\\s*€";
  function summary(parsed) {
    const B = parsed.blocks, all = B.map(b => b.text || "").join("\n");
    const after = (re, from) => { const k = B.slice(from || 0).find(b => b.text && re.test(b.text)); return k ? k.text.replace(re, "").trim() : ""; };
    const iArch = B.findIndex(b => /^L'?’?architecte$/i.test((b.text || "").trim()) || /^L.architecte$/i.test((b.text || "").trim()));
    const clientBlocks = iArch > 0 ? B.slice(0, iArch) : B;
    const addrB = clientBlocks.find(b => b.text && /^Adresse de correspondance\s*:/i.test(b.text));
    const out = {
      client: parsed.meta.parties || "",
      clientAddress: addrB ? addrB.text.replace(/^Adresse de correspondance\s*:\s*/i, "") : "",
      loc: after(/^Adresse de réalisation des travaux\s*:\s*/i),
      cad: after(/^Références cadastrales\s*:\s*/i),
      nature: after(/^Nature du projet\s*:\s*/i).replace(/\.$/, ""),
      phases: [], missions: [], warnings: []
    };
    const m1 = all.match(new RegExp("rémunération de l.architecte(?:,)? (?:est )?fixée? à " + MONEY + "\\s*HT soit\\s*" + MONEY + "\\s*TTC", "i"));
    out.totalHT = m1 ? num(m1[1]) : NaN; out.totalTTC = m1 ? num(m1[2]) : NaN;
    const m2 = all.match(new RegExp("frais d.assurance sont factur[ée]s en sus à hauteur de " + MONEY + "\\s*HT soit\\s*\\u200B?" + MONEY + "\\s*TTC", "i"));
    out.insHT = m2 ? num(m2[1]) : 0; out.insTTC = m2 ? num(m2[2]) : 0;
    const m3 = all.match(/acompte de (\d+(?:,\d+)?) ?%/i); out.acompte = m3 ? num(m3[1]) : 0;
    const m4 = all.match(/Fait en deux exemplaires,? à (.+?) le (\d{2})\/(\d{2})\/(\d{4})/i);
    out.place = m4 ? m4[1].trim() : ""; out.date = m4 ? `${m4[4]}-${m4[3]}-${m4[2]}` : "";
    // Tableau de décomposition : lignes « libellé | x € HT | y € TTC ».
    const tab = B.find(b => b.t === "table" && b.rows.some(r => r.cells && r.cells.some(c => /€\s*HT/.test(c))));
    if (tab) {
      let ph = null;
      tab.rows.forEach(r => {
        if (r.group != null) { ph = { title: r.group, missions: [] }; out.phases.push(ph); return; }
        const iHT = r.cells.findIndex(c => /€\s*HT/.test(c)), iTTC = r.cells.findIndex(c => /€\s*TTC/.test(c));
        if (iHT < 1) return;
        const full = r.cells.slice(0, iHT).join(" ").trim();
        const mm = { label: full.replace(/\s*\(.*\)\s*$/, ""), note: (full.match(/\(([^)]*)\)\s*$/) || [])[1] || "", ht: num(r.cells[iHT]), ttc: iTTC >= 0 ? num(r.cells[iTTC]) : NaN };
        if (!ph) { ph = { title: "Missions", missions: [] }; out.phases.push(ph); }
        ph.missions.push(mm); out.missions.push(mm);
      });
    }
    const sum = Math.round(out.missions.reduce((a, m) => a + m.ht, 0) * 100) / 100;
    if (!out.missions.length) out.warnings.push("Décomposition des honoraires introuvable.");
    else if (!(Math.abs(sum - out.totalHT) < 0.6)) out.warnings.push(`La somme des missions (${sum} € HT) ne correspond pas au montant du contrat (${out.totalHT} € HT).`);
    out.ok = !out.warnings.length && Number.isFinite(out.totalHT) && Number.isFinite(out.totalTTC);
    return out;
  }

  const api = { extract, parse, render, verify, summary, canon, blocksText, bands, joinItems };
  root.StateraImport = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : this);
