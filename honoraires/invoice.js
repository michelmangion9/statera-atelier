/* STATERA — facturation (V8). Module pur, sans DOM (testable sous Node).
 * - Factures FAC-AAAA-NNN et avoirs AV-AAAA-NNN : deux séries continues et chronologiques.
 * - Une pièce émise est figée (données émetteur et client copiées et gelées) : on ne la modifie
 *   pas, on l'annule ou on la réduit par un avoir.
 * - Le PDF produit n'est PAS une facture électronique au sens de la réforme (art. 289 bis du CGI) :
 *   réception obligatoire pour toutes les entreprises au 1er septembre 2026 ; émission obligatoire
 *   pour les PME et micro-entreprises au 1er septembre 2027 (plateforme agréée).
 */
(function (root) {
  "use strict";
  const SERIES = { invoice: "FAC", credit: "AV" };
  const nf2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const euro = v => nf2.format(Number.isFinite(v) ? v : 0) + " €";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const s = v => String(v == null ? "" : v).trim();
  const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
  const frDate = iso => { if (!iso) return ""; const [y, m, d] = String(iso).split("-"); return d && m && y ? `${d}/${m}/${y}` : String(iso); };
  const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + (Number(n) || 0)); const p = x => String(x).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

  function deepFreeze(o) { Object.values(o).forEach(v => { if (v && typeof v === "object" && !Object.isFrozen(v)) deepFreeze(v); }); return Object.freeze(o); }
  function emptyLedger() { return { v: 1, seq: {}, docs: [], status: {} }; }
  function normLedger(l) {
    const L = l && typeof l === "object" ? l : emptyLedger();
    return { v: 1, seq: L.seq && typeof L.seq === "object" ? L.seq : {}, docs: Array.isArray(L.docs) ? L.docs : [], status: L.status && typeof L.status === "object" ? L.status : {} };
  }

  function totals(lines, vatRate) {
    const ht = r2(lines.reduce((a, l) => a + r2(l.amount), 0));
    const tva = r2(ht * (Number(vatRate) || 0) / 100);
    return { ht, tva, ttc: r2(ht + tva) };
  }

  function nextNumber(ledger, kind, date) {
    const L = normLedger(ledger);
    const pre = SERIES[kind]; const y = String(date || "").slice(0, 4);
    const n = ((L.seq[pre] || {})[y] || 0) + 1;
    return `${pre}-${y}-${String(n).padStart(3, "0")}`;
  }

  // Contrôle d'une facture avant émission. blockers : émission impossible.
  function check(draft, ledger, kind) {
    const L = normLedger(ledger);
    const d = draft || {}, I = d.issuer || {}, C = d.client || {};
    const blockers = [], warnings = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s(d.date))) blockers.push("Date d’émission invalide.");
    if (!s(I.name) || !s(I.address)) blockers.push("Nom et adresse de l’émetteur requis.");
    if (!s(I.siren)) blockers.push("SIREN de l’émetteur requis.");
    if (!s(C.name)) blockers.push("Nom du client requis.");
    if (!s(C.address)) blockers.push("Adresse du client requise.");
    const lines = Array.isArray(d.lines) ? d.lines : [];
    if (!lines.length || lines.some(l => !s(l.label))) blockers.push("Au moins une ligne avec un libellé est requise.");
    const t = totals(lines, d.vatRate);
    if (kind !== "credit" && !(t.ht > 0)) blockers.push(lines.some(l => l.amount < 0) ? "Le total est nul ou négatif : les sommes déjà facturées dépassent le temps passé ; émettre un avoir sur la dernière facture." : "Le montant HT doit être positif.");
    if (d.vatRegime !== "franchise" && !(Number(d.vatRate) > 0)) blockers.push("Taux de TVA manquant (ou choisir la franchise en base).");
    // chronologie : une pièce ne peut être datée avant la dernière pièce de sa série
    const pre = SERIES[kind || "invoice"];
    const lastOfSeries = L.docs.filter(x => x.number.startsWith(pre + "-")).slice(-1)[0];
    if (lastOfSeries && s(d.date) < lastOfSeries.date) blockers.push(`Date antérieure à la pièce ${lastOfSeries.number} (${frDate(lastOfSeries.date)}) : la numérotation doit rester chronologique.`);
    if (C.pro && !s(C.siren)) warnings.push("SIREN du client professionnel non renseigné (mention obligatoire avec la facture électronique).");
    if (!s(I.insurer) || !s(I.policy)) warnings.push("Assurance professionnelle non mentionnée.");
    if (!s(I.iban)) warnings.push("IBAN non renseigné.");
    return { blockers, warnings, ok: !blockers.length };
  }

  function makeDoc(ledger, kind, draft, extra) {
    const L = normLedger(ledger);
    const c = check(draft, L, kind);
    if (!c.ok) { const e = new Error(c.blockers.join(" ")); e.blockers = c.blockers; throw e; }
    const number = nextNumber(L, kind, draft.date);
    const pre = SERIES[kind], y = draft.date.slice(0, 4);
    const lines = draft.lines.map(l => ({ label: s(l.label), detail: s(l.detail), amount: r2(l.amount) }));
    const vatRate = draft.vatRegime === "franchise" ? 0 : Number(draft.vatRate) || 0;
    const doc = deepFreeze(Object.assign({
      kind, number, date: draft.date, issuedAt: draft.issuedAt || new Date().toISOString(),
      dueDate: draft.dueDate || addDays(draft.date, draft.paymentDays || 0),
      serviceDate: s(draft.serviceDate), dossierRef: s(draft.dossierRef), project: s(draft.project),
      category: "Prestation de services",
      issuer: JSON.parse(JSON.stringify(draft.issuer)), client: JSON.parse(JSON.stringify(draft.client)),
      lines, vatRegime: draft.vatRegime === "franchise" ? "franchise" : "normal", vatRate,
      vatOnDebits: !!draft.vatOnDebits, totals: totals(lines, vatRate)
    }, extra || {}));
    const seq = Object.assign({}, L.seq, { [pre]: Object.assign({}, L.seq[pre], { [y]: (((L.seq[pre] || {})[y]) || 0) + 1 }) });
    return { ledger: { v: 1, seq, docs: L.docs.concat([doc]), status: Object.assign({}, L.status) }, doc };
  }

  function issue(ledger, draft) { return makeDoc(ledger, "invoice", draft); }

  // Montant HT restant à créditer sur une facture (factures moins avoirs déjà émis).
  function creditable(ledger, number) {
    const L = normLedger(ledger);
    const inv = L.docs.find(d => d.number === number && d.kind === "invoice");
    if (!inv) return 0;
    const done = L.docs.filter(d => d.kind === "credit" && d.ref === number).reduce((a, d) => a + Math.abs(d.totals.ht), 0);
    return r2(inv.totals.ht - done);
  }

  // Avoir total (montant omis) ou partiel. Les données émetteur/client sont reprises de la facture d'origine.
  function credit(ledger, number, opts) {
    const L = normLedger(ledger);
    const o = opts || {};
    const inv = L.docs.find(d => d.number === number && d.kind === "invoice");
    if (!inv) throw new Error("Facture d’origine introuvable.");
    const max = creditable(L, number);
    const amount = o.amount == null || o.amount === "" ? max : r2(o.amount);
    if (!(amount > 0)) throw new Error("Montant de l’avoir invalide.");
    if (amount > max + 0.001) throw new Error(`L’avoir dépasse le montant restant à créditer (${euro(max)} HT).`);
    const draft = {
      date: o.date, issuer: inv.issuer, client: inv.client, vatRegime: inv.vatRegime, vatRate: inv.vatRate, vatOnDebits: inv.vatOnDebits,
      paymentDays: 0, dossierRef: inv.dossierRef, project: inv.project,
      lines: [{ label: `Avoir sur la facture ${inv.number} du ${frDate(inv.date)}`, detail: s(o.reason), amount: -amount }]
    };
    return makeDoc(L, "credit", draft, { ref: inv.number, reason: s(o.reason) });
  }

  // Statut de paiement (hors pièce figée).
  function setPaid(ledger, number, date) {
    const L = normLedger(ledger);
    const status = Object.assign({}, L.status, { [number]: date ? { paid: date } : undefined });
    if (!date) delete status[number];
    return { v: 1, seq: L.seq, docs: L.docs, status };
  }

  function toCSV(ledger) {
    const L = normLedger(ledger);
    const q = v => { const t = String(v == null ? "" : v); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const num = v => nf2.format(v).replace(/ | /g, "");
    const head = ["Numéro", "Type", "Date", "Échéance", "Client", "SIREN client", "Dossier", "Objet", "HT", "TVA", "TTC", "Taux TVA", "Pièce d’origine", "Payée le"];
    const rows = L.docs.map(d => [d.number, d.kind === "credit" ? "Avoir" : "Facture", frDate(d.date), frDate(d.dueDate), d.client.name, d.client.siren || "",
      d.dossierRef, d.lines.map(l => l.label).join(" / "), num(d.totals.ht), num(d.totals.tva), num(d.totals.ttc),
      d.vatRegime === "franchise" ? "franchise" : nf2.format(d.vatRate).replace(/,00$/, "") + " %", d.ref || "", frDate((L.status[d.number] || {}).paid || "")]);
    return "﻿" + [head].concat(rows).map(r => r.map(q).join(";")).join("\r\n") + "\r\n";
  }

  // Rendu A4 d'une pièce (HTML). Aucune donnée interne (heures, taux horaire).
  function render(doc, logoSvg) {
    const I = doc.issuer, C = doc.client, credit = doc.kind === "credit";
    const vat = doc.vatRegime === "franchise" ? "TVA non applicable, art. 293 B du CGI" : `TVA ${nf2.format(doc.vatRate).replace(/,00$/, "")} %`;
    const penalties = C.pro
      ? "En cas de retard de paiement : pénalités au taux de la Banque centrale européenne majoré de dix points et indemnité forfaitaire pour frais de recouvrement de 40 € (art. L.441-10 et D.441-5 du code de commerce). Pas d’escompte pour paiement anticipé."
      : "En cas de retard de paiement, les sommes dues produisent intérêts au taux légal à compter d’une mise en demeure. Pas d’escompte pour paiement anticipé.";
    return `<div class="sheet inv" id="inv-${esc(doc.number)}">
      <div class="d-head">${logoSvg || ""}<div class="who"><b>${esc(I.shortName || I.name)}</b>Architecte</div></div>
      <div class="i-title">${credit ? "Avoir" : "Facture"} <span>n° ${esc(doc.number)}</span></div>
      <div class="i-meta">Date d’émission : ${frDate(doc.date)}${credit ? ` — Avoir sur la facture n° ${esc(doc.ref)}` : ` — Échéance : ${frDate(doc.dueDate)}`}${doc.serviceDate ? ` — Prestation : ${esc(doc.serviceDate)}` : ""}</div>
      <div class="i-parties">
        <div><div class="d-lbl">Émetteur</div><b>${esc(I.name)}</b>, architecte — ${esc(I.form)}<br>${esc(I.brand)}<br>${esc(I.address)}<br>SIREN ${esc(I.siren)}${I.siret ? ` — SIRET ${esc(I.siret)}` : ""}${I.tva ? `<br>TVA ${esc(I.tva)}` : ""}<br>Ordre des architectes n° ${esc(I.orderNo)}</div>
        <div><div class="d-lbl">Client</div><b>${esc(C.name)}</b><br>${esc(C.address)}${C.siren ? `<br>SIREN ${esc(C.siren)}` : ""}${C.tva ? `<br>TVA ${esc(C.tva)}` : ""}</div>
      </div>
      <div class="i-obj">Opération : ${esc(doc.project)}${doc.dossierRef ? ` — dossier ${esc(doc.dossierRef)}` : ""} — Catégorie : ${esc(doc.category)}</div>
      <table class="i-lines"><tr><th>Désignation</th><th class="r">Montant HT</th></tr>
        ${doc.lines.map(l => `<tr><td>${esc(l.label)}${l.detail ? `<small>${esc(l.detail)}</small>` : ""}</td><td class="r">${euro(l.amount)}</td></tr>`).join("")}
      </table>
      <table class="i-tot"><tr><td>Total HT</td><td class="r">${euro(doc.totals.ht)}</td></tr><tr><td>${esc(vat)}</td><td class="r">${euro(doc.totals.tva)}</td></tr><tr class="ttc"><td>${credit ? "Total TTC crédité" : "Net à payer TTC"}</td><td class="r">${euro(doc.totals.ttc)}</td></tr></table>
      <div class="i-legal">
        ${doc.vatOnDebits ? "<p>Option pour le paiement de la taxe d’après les débits.</p>" : ""}
        ${credit ? "" : `<p>Paiement par virement avant le ${frDate(doc.dueDate)}${I.iban ? ` — IBAN ${esc(I.iban)}${I.bic ? ` — BIC ${esc(I.bic)}` : ""}` : ""}.</p><p>${esc(penalties)}</p>`}
        ${I.insurer ? `<p>Assurance de responsabilité professionnelle : ${esc(I.insurer)}${I.policy ? `, police n° ${esc(I.policy)}` : ""}, couverture : ${esc(I.coverage || "France")}.</p>` : ""}
      </div>
      <div class="d-foot">${esc(I.brand)} — ${esc(I.name)}, architecte, ${esc(I.form)} — ${esc(I.address)} — SIREN ${esc(I.siren)}${I.email ? " — " + esc(I.email) : ""}${I.phone ? " — " + esc(I.phone) : ""}</div>
    </div>`;
  }

  const NOTICE = "Ce PDF n’est pas une facture électronique au sens de la réforme : depuis le 1er septembre 2026, toute entreprise doit pouvoir recevoir des factures électroniques ; l’émission par une plateforme agréée deviendra obligatoire pour les PME et micro-entreprises au 1er septembre 2027 (clients professionnels). Les ventes aux particuliers relèvent de l’e-reporting.";

  const api = { SERIES, NOTICE, emptyLedger, normLedger, totals, nextNumber, check, issue, credit, creditable, setPaid, toCSV, render, addDays };
  root.StateraInvoice = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : this);
