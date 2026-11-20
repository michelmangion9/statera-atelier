/* STATERA — Honoraires V7 — logique d’interface */
(function () {
  "use strict";
  const E = window.StateraEngine;
  const K = window.StateraContract;
  const I = window.StateraInvoice;
  const $ = id => document.getElementById(id);
  const VERSION = "9.2.0";
  const KEY_CAB = "statera-cabinet-v7";
  const PREFILL = {
    archPolicy: "74711/H/105",
    archMediator: "Centre de la médiation de la consommation des conciliateurs de justice (CM2C), désigné par le Conseil national de l’Ordre des architectes le 27 mai 2021",
    archMediatorContact: "49 rue de Ponthieu, 75008 Paris — 01 89 47 00 14 — declarer-un-litige@cm2c.net — saisine en ligne : www.cm2c.net"
  };
  const KEY_DOS = "statera-dossier-v7";
  const LEGACY_KEY = "statera-honoraires-v6";

  /* ---------- Formatage ---------- */
  const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
  const nf2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const euro = v => {
    const n = Number.isFinite(v) ? v : 0;
    return (Math.abs(n - Math.round(n)) < 0.005 ? nf0.format(Math.round(n)) : nf2.format(n)) + "\u00A0€";
  };
  const hoursFmt = h => (h ? nf2.format(h).replace(/,00$/, "") : "0") + "\u00A0h";
  const pctFmt = p => nf2.format(p) + "\u00A0%";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const val = id => ($(id) ? String($(id).value || "").trim() : "");
  const num = id => E.toNum($(id) ? $(id).value : 0);
  const longDate = iso => {
    const d = iso ? new Date(iso + "T12:00:00") : new Date();
    return isNaN(d) ? "" : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  };
  const today = () => { const d = new Date(), p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

  /* ---------- Stockage sûr ---------- */
  const store = {
    get(k) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (_) {} }
  };

  /* ---------- Construction des missions ---------- */
  function buildMissions() {
    const host = $("phases");
    host.innerHTML = E.PHASES.map(ph => `
      <div class="phase" data-phase="${ph.key}">
        <div class="phase-head"><h3>${esc(ph.title)}</h3><span class="phase-amt" id="amt-${ph.key}">0 €</span></div>
        <div class="phase-int int" id="int-${ph.key}"></div>
        ${E.MISSIONS[ph.key].map(m => `
          <label class="m" id="row-${ph.key}-${m.id}" for="m-${ph.key}-${m.id}">
            <input type="checkbox" class="mchk" id="m-${ph.key}-${m.id}" data-store="dos" data-phase="${ph.key}" data-mid="${m.id}">
            <span><span class="t">${m.code ? `<span class="code">${esc(m.code)}</span>` : ""}${esc(m.name)}</span><span class="d">${esc(m.short)}</span></span>
            <span class="n"><span class="pr">—</span><small class="int"><span class="h">0 h</span> · <span class="a">0 €</span> au temps</small></span>
          </label>`).join("")}
      </div>`).join("");
  }

  function setPreset(name) {
    const p = E.PRESETS[name]; if (!p) return;
    const withExisting = name !== "none" && num("sr") > 0;
    document.querySelectorAll(".mchk").forEach(c => {
      const list = (p[c.dataset.phase] || []).slice();
      if (withExisting && c.dataset.phase === "pc") list.push("rel", "diag");
      c.checked = list.includes(c.dataset.mid);
    });
    document.querySelectorAll("[data-preset]").forEach(b => b.classList.toggle("on", b.dataset.preset === name && name !== "none"));
  }

  /* ---------- Lecture du formulaire ---------- */
  function readInput() {
    const selected = { pc: [], site: [], int: [] };
    document.querySelectorAll(".mchk").forEach(c => { if (c.checked) selected[c.dataset.phase].push(c.dataset.mid); });
    return {
      sn: num("sn"), sr: num("sr"), si: num("si"), works: num("works"),
      rate: num("rate"), complexity: num("complexity") || 1, renoLevel: num("renoLevel") || 1.3, intComplexity: num("intComplexity") || 1,
      coefPc: num("coefPc") || 1, coefSite: num("coefSite") || 1, coefInt: num("coefInt") || 1,
      hoursScale: num("hoursScale") || 0.7, worksFloor: $("worksFloor").checked,
      hourStep: num("rounding") || 0.25, priceStep: num("priceStep") || 1, degress: num("degress") || 0.75,
      mode: $("pricingMode").value,
      priceNeuf: num("priceNeuf"), priceReno: num("priceReno"), minFee: num("minFee"),
      rateOverride: num("rateOverride"), pctPc: val("pctPc") === "" ? null : num("pctPc"), pctSite: val("pctSite") === "" ? null : num("pctSite"),
      targets: { pcMax: num("pcMax"), pcMin: num("pcMin"), siteMax: num("siteMax"), siteMin: num("siteMin"), degStart: num("degStart"), degEnd: num("degEnd") },
      vatRegime: $("vatRegime").value, vat: num("vat"),
      acompte: num("acompte"), scheduleMode: $("scheduleMode").value,
      manualSchedule: [1, 2, 3, 4].map(i => ({ label: val("m" + i + "l"), pct: num("m" + i + "p") })),
      selected,
      billing: $("billing").value, clientRate: num("clientRate"),
      insuranceHT: num("insuranceHT"), insuranceLabel: val("insuranceLabel"),
      manual: readManual()
    };
  }

  /* ---------- Déblocage général (mode manuel) ---------- */
  // État du dossier, persisté en JSON dans le champ caché #manualData (jamais transmis au client).
  function manualState() {
    let o = null;
    try { o = JSON.parse($("manualData").value || "null"); } catch (_) { o = null; }
    o = o && typeof o === "object" ? o : {};
    o.phases = o.phases && typeof o.phases === "object" ? o.phases : {};
    o.missions = o.missions && typeof o.missions === "object" ? o.missions : {};
    o.log = Array.isArray(o.log) ? o.log : [];
    return o;
  }
  function writeManual(o) { $("manualData").value = JSON.stringify(o); }
  // Lit les champs du panneau (s’il est affiché et déverrouillé) et met l’état à jour.
  function readManual() {
    const o = manualState();
    const box = $("manBlock");
    if (manUnlocked && box) {
      const sw = $("manOn"); if (sw) o.on = sw.checked;
      box.querySelectorAll("input.mi[data-k]").forEach(el => {
        const k = el.dataset.k, v = String(el.value || "").trim();
        const n = v === "" ? null : E.toNum(v, NaN);
        const okv = n !== null && Number.isFinite(n) && n >= 0 ? n : null;
        const [kind, id] = k.split(":");
        if (kind === "target") o.target = okv;
        else if (kind === "diff") o.difficulty = okv;
        else if (kind === "phase") { if (okv === null) delete o.phases[id]; else o.phases[id] = okv; }
        else if (kind === "price" || kind === "hours") {
          const m = Object.assign({}, o.missions[id]);
          if (okv === null) delete m[kind]; else m[kind] = okv;
          if (Object.keys(m).length) o.missions[id] = m; else delete o.missions[id];
        }
      });
      writeManual(o);
    }
    return o.on ? o : null;
  }
  let manUnlocked = false, manStage = "", manSig = "";
  function lockManual() { manUnlocked = false; manStage = ""; manSig = ""; }
  function renderManual(r) {
    const box = $("manBlock");
    const o = manualState();
    const M = r.manual || { on: false };
    const sel = E.PHASES.map(ph => ({ ph, list: r.phases[ph.key].missions.filter(m => m.selected) })).filter(x => x.list.length);
    const sig = [manUnlocked ? "u" : "l", manStage, o.on ? 1 : 0, val("manPin") ? "p" : "", sel.map(x => x.ph.key + ":" + x.list.map(m => m.id).join(",")).join("|")].join("/");
    if (sig !== manSig) {
      manSig = sig;
      const status = o.on ? "actif sur ce dossier" : "désactivé";
      if (!manUnlocked) {
        const hasPin = !!val("manPin");
        let ctl;
        if (manStage === "confirm") ctl = `<p>Les prix pourront être fixés librement, sans minimum ni bornes en %. Confirmer ?</p>
          <button type="button" class="btn solid" data-man="confirm">Confirmer le déblocage</button><button type="button" class="reset" data-man="cancel">Annuler</button>`;
        else if (manStage === "pin") ctl = `<div class="pin"><div class="f"><label for="manPinTry">Code du verrou</label><input id="manPinTry" type="password" inputmode="numeric" autocomplete="off"></div>
          <button type="button" class="btn solid" data-man="pin">Valider</button></div><p class="alert" id="manPinMsg"></p>`;
        else ctl = `<button type="button" class="btn" data-man="${hasPin ? "askpin" : "ask"}">Déverrouiller</button>`;
        box.innerHTML = `<div class="t"><span>Déblocage général</span><span>verrouillé</span></div><p>Mode manuel : ${status}.<span id="manSummary"></span></p>${ctl}`;
      } else {
        let html = `<div class="t"><span>Déblocage général</span><button type="button" class="reset" data-man="lock">Verrouiller</button></div>
          <label class="sw"><input type="checkbox" id="manOn"${o.on ? " checked" : ""}> Mode manuel pour ce dossier</label>`;
        if (o.on) {
          html += `<div class="two">
              <div><label for="manDiff">Coef. de difficulté</label><input class="mi" id="manDiff" data-k="diff" inputmode="decimal" placeholder="1" value="${o.difficulty != null && o.difficulty !== 1 ? esc(o.difficulty) : ""}"></div>
              <div><label for="manTarget">Total HT cible</label><input class="mi" id="manTarget" data-k="target" inputmode="decimal" placeholder="—" value="${o.target ? esc(o.target) : ""}"></div>
            </div>
            <div class="mg hd"><span>Mission</span><span style="text-align:right">Heures</span><span style="text-align:right">Prix HT</span></div>`;
          sel.forEach(({ ph, list }) => {
            const pv = o.phases[ph.key];
            html += `<div class="mg ph"><span>${esc(ph.title)}</span><span></span><input class="mi" data-k="phase:${ph.key}" inputmode="decimal" aria-label="Prix de la phase ${esc(ph.title)}" value="${pv != null ? esc(pv) : ""}"></div>`;
            list.forEach(m => {
              const mo = o.missions[m.id] || {};
              html += `<div class="mg"><span title="${esc(m.name)}">${m.code ? esc(m.code) + " · " : ""}${esc(m.name)}<small data-calc="${m.id}"></small></span>
                <input class="mi" data-k="hours:${m.id}" inputmode="decimal" aria-label="Heures ${esc(m.name)}" value="${mo.hours != null ? esc(mo.hours) : ""}">
                <input class="mi" data-k="price:${m.id}" inputmode="decimal" aria-label="Prix ${esc(m.name)}" value="${mo.price != null ? esc(mo.price) : ""}"></div>`;
            });
          });
          html += `<div class="tr" id="manTrace"></div>
            <button type="button" class="reset" data-man="clear">Effacer les ajustements de ce dossier</button>`;
        }
        html += `<div class="log" id="manLog"></div>`;
        box.innerHTML = html;
      }
    }
    // Mise à jour des valeurs (sans reconstruire le panneau, pour garder le focus pendant la saisie).
    const sum = $("manSummary");
    if (sum) sum.textContent = M.on ? ` Retenu ${euro(M.retainedHT)} (calculé ${euro(M.computedHT)}).` : "";
    if (manUnlocked && M.on) {
      const byId = {}; (M.missions || []).forEach(x => { byId[x.id] = x; });
      box.querySelectorAll("input.mi[data-k]").forEach(el => {
        const [kind, id] = el.dataset.k.split(":");
        if (kind === "price" && byId[id]) el.placeholder = nf0.format(byId[id].retainedPrice);
        if (kind === "hours" && byId[id]) el.placeholder = String(byId[id].retainedHours).replace(".", ",");
        if (kind === "phase" && M.phases[id]) el.placeholder = nf0.format(M.phases[id].retained);
      });
      box.querySelectorAll("small[data-calc]").forEach(el => {
        const x = byId[el.dataset.calc];
        el.textContent = x ? `calculé ${euro(x.computedPrice)} · ${hoursFmt(x.computedHours)}` : "";
      });
      const tr = $("manTrace");
      if (tr) {
        const sign = v => (v > 0 ? "+" : v < 0 ? "−" : "") ;
        const rateR = M.retainedHours ? M.retainedHT / M.retainedHours : 0;
        tr.innerHTML = `<div><span>Prix calculé</span><b>${euro(M.computedHT)}</b></div>
          <div><span>Prix retenu</span><b>${euro(M.retainedHT)}</b></div>
          <div><span>Écart</span><b>${sign(M.delta)}${euro(Math.abs(M.delta))} (${sign(M.delta)}${nf2.format(Math.abs(M.deltaPct))} %)</b></div>
          <div><span>Heures calculées / retenues</span><b>${hoursFmt(M.computedHours)} / ${hoursFmt(M.retainedHours)}</b></div>
          <div><span>Taux horaire effectif</span><b>${rateR ? euro(rateR) + "/h" : "—"}</b></div>
          ${(M.warnings || []).map(w => `<span class="alert">${esc(w)}</span>`).join("")}
          ${M.belowMin ? `<span class="alert">Sous le minimum habituel de ${euro(r.minFee)} HT (contourné en mode manuel).</span>` : ""}`;
      }
    }
    const lg = $("manLog");
    if (lg) lg.innerHTML = o.log.length ? "Trace des propositions éditées en mode manuel :<br>" + o.log.slice(-5).reverse()
      .map(e => `${esc(e.date)} · ${esc(e.ref)} · calculé ${euro(e.computed)} → retenu ${euro(e.retained)}`).join("<br>") : "";
  }
  function onManualClick(e) {
    const t = e.target.closest("[data-man]"); if (!t) return;
    const a = t.dataset.man;
    if (a === "ask") manStage = "confirm";
    else if (a === "askpin") manStage = "pin";
    else if (a === "cancel") manStage = "";
    else if (a === "confirm") { manUnlocked = true; manStage = ""; }
    else if (a === "pin") {
      if (val("manPinTry") === val("manPin")) { manUnlocked = true; manStage = ""; }
      else { const m = $("manPinMsg"); if (m) m.textContent = "Code incorrect."; return; }
    }
    else if (a === "lock") lockManual();
    else if (a === "clear") {
      if (!confirm("Effacer les prix, heures, coefficient et total cible saisis à la main pour ce dossier ?")) return;
      const o = manualState(); writeManual({ on: o.on, phases: {}, missions: {}, log: o.log });
      manSig = "";
    }
    calculate(); save();
    if (manStage === "pin" && $("manPinTry")) $("manPinTry").focus();
  }
  // Trace interne : chaque édition de proposition en mode manuel est consignée dans le dossier.
  function logManual(r) {
    if (!r.manual || !r.manual.on) return;
    const o = manualState();
    const d = new Date(), p = n => String(n).padStart(2, "0");
    const entry = { date: `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`,
                    ref: val("proposalRef"), computed: r.manual.computedHT, retained: r.manual.retainedHT, delta: r.manual.delta };
    const lastE = o.log[o.log.length - 1];
    if (lastE && lastE.ref === entry.ref && lastE.retained === entry.retained && lastE.computed === entry.computed) return;
    o.log.push(entry); o.log = o.log.slice(-20);
    writeManual(o); saveNow();
    renderManual(r);
  }

  function legalContext() {
    const type = $("clientType").value, mode = $("contractMode").value;
    const consumer = type === "consumer";
    const retract = (consumer && (mode === "distance" || mode === "offpremises")) || (type === "smallpro" && mode === "offpremises");
    const offPremisesConsumer = mode === "offpremises" && (consumer || type === "smallpro");
    return { type, mode, consumer, consumerLike: consumer || type === "smallpro", retract, offPremisesConsumer };
  }

  /* ---------- Calcul + affichage ---------- */
  let last = null;
  function calculate() {
    const errBox = $("errBox");
    try {
      if (!$("docDate").value) $("docDate").value = today();
      if (!val("proposalRef")) $("proposalRef").value = nextRef(false);
      const r = E.compute(readInput());
      last = r;

      E.PHASES.forEach(ph => {
        const P = r.phases[ph.key];
        P.missions.forEach(m => {
          const row = $(`row-${ph.key}-${m.id}`);
          row.classList.toggle("sel", m.selected);
          row.querySelector(".pr").textContent = m.selected && m.price ? euro(m.price) : "—";
          row.querySelector(".h").textContent = hoursFmt(m.selected ? m.hours : m.potentialHours);
          row.querySelector(".a").textContent = euro(m.selected ? m.amount : m.potentialHours * r.input.rate);
        });
        $("amt-" + ph.key).textContent = P.count && (!r.noSurface || r.manual.on) ? euro(P.finalAmount) : "—";
        let info = "";
        if (P.count) {
          info = `${hoursFmt(P.hours)} · temps ${euro(P.timeAmount)}`;
          if (ph.key !== "int") info += ` · cible ${pctFmt(P.targetRate * P.percentShare)} des travaux ${euro(P.percentAmount)} · retenu : ${P.driver === "percent" ? "% travaux" : "temps"}`;
        }
        $("int-" + ph.key).textContent = info;
      });

      const showTot = !r.noSurface || r.manual.on;
      $("sumLabel").textContent = r.billing === "temps" ? "Estimation HT — au temps passé" : "Honoraires HT";
      $("totalHT").textContent = showTot ? euro(r.totalHT) : "—";
      $("barHT").textContent = showTot ? euro(r.totalHT) : "—";
      $("sumInsRow").hidden = !(r.insuranceHT > 0);
      $("sumIns").textContent = euro(r.insuranceHT);
      $("sumTVA").textContent = euro(r.grandTVA);
      $("sumTTC").textContent = euro(r.grandTTC);
      $("vatLabel").textContent = r.vatRate ? `TVA ${nf2.format(r.vatRate).replace(/,00$/, "")} %` : "TVA non applicable";
      $("summaryClient").textContent = clientDisplayName() || "Client non renseigné";

      $("internalBlock").innerHTML = `
        <div><span>Budget travaux retenu</span><b>${euro(r.worksRef)}</b></div>
        <div><span>Taux appliqués${r.pctOverride.pc !== null || r.pctOverride.site !== null ? " (ajustés)" : ""}</span><b>${pctFmt(r.effPct.pc)} / ${pctFmt(r.effPct.site)}</b></div>
        ${r.rateOverride > 0 ? `<div><span>Taux horaire du dossier</span><b>${euro(r.rateOverride)}/h</b></div>` : ""}
        <div><span>Temps total estimé</span><b>${hoursFmt(r.totalHours)}</b></div>
        <div><span>Taux horaire effectif</span><b>${r.totalHours && r.totalHT ? euro(r.effectiveRate) + "/h" : "—"}</b></div>
        ${r.belowRate ? `<span class="alert">Rentabilité : les honoraires rémunèrent ${euro(r.effectiveRate)}/h, sous ton taux de ${euro(r.input.rate)}/h.</span>` : ""}`;
      if (r.minApplied) $("internalBlock").insertAdjacentHTML("beforeend", `<span class="alert">Minimum facturable appliqué : ${euro(r.minFee)} HT.</span>`);
      if (r.manual.on) $("internalBlock").insertAdjacentHTML("beforeend", `<span class="alert">Mode manuel : ${euro(r.manual.retainedHT)} HT retenus pour ${euro(r.manual.computedHT)} calculés.</span>`);
      renderArbitrage(r);
      renderManual(r);
      const est = r.worksEstimate;
      $("worksHint").textContent = !est ? "" : (r.input.works > 0
        ? (r.worksRaised ? `Budget retenu : ${euro(r.worksRef)} (estimation au m², plancher activé)` : `Estimation au m² : ${euro(est)}`)
        : `Budget retenu : estimation au m², ${euro(est)}`);

      $("renoWrap").style.opacity = r.input.sr > 0 ? 1 : .45;
      $("intWrap").style.opacity = r.input.si > 0 ? 1 : .45;
      const lc = legalContext();
      $("expressWrap").style.display = lc.retract ? "" : "none";
      $("manualWrap").style.display = $("scheduleMode").value === "manual" ? "" : "none";
      $("acompteWrap").style.display = $("scheduleMode").value === "manual" ? "none" : "";

      const comp = K.compliance(contractCtx(r));
      const st = $("legalStatus");
      st.className = "status" + (comp.blockers.length ? " warn" : "");
      st.innerHTML = (comp.blockers.length ? `<b>Projet non conforme</b> (${comp.blockers.length}) :<ul>${comp.blockers.map(b => `<li>${esc(b.msg)}</li>`).join("")}</ul>` : "Contrat conforme : la proposition peut être générée.")
        + (comp.warnings.length ? `<details style="margin-top:6px"><summary>${comp.warnings.length} point(s) à vérifier</summary><ul>${comp.warnings.map(w => `<li>${esc(w.msg)}</li>`).join("")}</ul></details>` : "");
      refreshInvoiceSource(r);
      errBox.style.display = "none";
      document.documentElement.dataset.calcOk = String(Date.now());
      return r;
    } catch (e) {
      errBox.style.display = "block";
      errBox.textContent = "Erreur de calcul : " + (e && e.message ? e.message : e) + ". Les autres champs restent utilisables.";
      if (window.console) console.error(e);
      return last;
    }
  }

  /* ---------- Arbitrage temps / % ---------- */
  function baseline() {
    const inp = readInput(); inp.rateOverride = 0; inp.pctPc = null; inp.pctSite = null; inp.manual = null;
    return E.compute(inp);
  }
  function renderArbitrage(r) {
    const box = $("arbBlock");
    const b = baseline();
    if (!b.arbitrage.available) { box.innerHTML = ""; return; }
    if (r.manual && r.manual.on) { box.innerHTML = `<div class="t">Arbitrage temps / pourcentage</div><p>Sans effet tant que le mode manuel est actif.</p>`; return; }
    if ($("pricingMode").value !== "percent") { box.innerHTML = `<div class="t">Arbitrage temps / pourcentage</div><p>Disponible lorsque la méthode « % des travaux » est choisie dans Pilotage interne.</p>`; return; }
    const ps = ["pc", "site"].filter(k => b.phases[k].count);
    const time = ps.reduce((a, k) => a + b.phases[k].timeAmount, 0);
    const pct = ps.reduce((a, k) => a + b.phases[k].percentAmount, 0);
    const pctLabel = ps.map(k => pctFmt(b.arbitrage.pctForRate[k] || 0)).join(" / ");
    const gridLabel = ps.map(k => pctFmt(b.phases[k].gridRate)).join(" / ");
    const rateOn = r.rateOverride > 0, pctOn = r.pctOverride.pc !== null || r.pctOverride.site !== null;
    box.innerHTML = `<div class="t">Arbitrage temps / pourcentage</div>
      <p>Temps estimé : ${hoursFmt(ps.reduce((a, k) => a + b.phases[k].hours, 0))} × ${euro(b.rateCabinet)}/h = ${euro(time)}<br>Pourcentage des travaux (${gridLabel}) : ${euro(pct)}</p>
      <button type="button" class="btn${rateOn ? " on" : ""}" data-arb="rate">Garder le pourcentage<small>Taux horaire du dossier ajusté à ${euro(b.arbitrage.rateForPercent)}/h</small></button>
      <button type="button" class="btn${pctOn ? " on" : ""}" data-arb="pct">Garder ${euro(b.rateCabinet)}/h<small>Pourcentage ajusté à ${pctLabel}</small></button>
      ${rateOn || pctOn ? `<button type="button" class="reset" data-arb="reset">Revenir à la grille et au taux cabinet</button>` : ""}`;
  }
  function applyArbitrage(kind) {
    const b = baseline();
    $("rateOverride").value = ""; $("pctPc").value = ""; $("pctSite").value = "";
    if (kind === "rate") $("rateOverride").value = String(b.arbitrage.rateForPercent);
    if (kind === "pct") {
      const p = b.arbitrage.pctForRate;
      if (p.pc != null) $("pctPc").value = String(p.pc);
      if (p.site != null) $("pctSite").value = String(p.site);
    }
    calculate(); saveNow();
  }

  function clientDisplayName() {
    const person = `${val("clientFirstName")} ${val("clientLastName")}`.trim();
    const co = val("clientCompany");
    return co ? (person ? `${co} — ${person}` : co) : person;
  }

  // Points bloquants (contrat non conforme), sous forme de texte.
  function validate() { return complianceNow().blockers.map(b => b.msg); }

  /* ---------- Persistance ---------- */
  function snapshot(kind) {
    const o = {};
    document.querySelectorAll(`[data-store="${kind}"]`).forEach(el => { if (el.id) o[el.id] = el.type === "checkbox" ? el.checked : el.value; });
    return o;
  }
  function apply(o) {
    if (!o) return;
    Object.keys(o).forEach(id => {
      const el = $(id); if (!el) return;
      if (el.type === "checkbox") el.checked = !!o[id];
      else if (el.tagName === "SELECT") { if ([...el.options].some(op => op.value === String(o[id]))) el.value = o[id]; }
      else el.value = o[id];
    });
  }
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 150);
  }
  let frozenStore = false; // vrai pendant une restauration : plus aucune écriture avant le rechargement
  function saveNow() {
    if (frozenStore) return;
    const cab = snapshot("cab"); cab.__refCounter = refCounter; cab.__v = VERSION;
    store.set(KEY_CAB, cab);
    store.set(KEY_DOS, snapshot("dos"));
    if (atelierPush) atelierPush();
  }
  let atelierPush = null;
  let refCounter = 1;
  function nextRef(increment) {
    if (increment) refCounter++;
    const y = new Date().getFullYear();
    return `STA-${y}-${String(refCounter).padStart(3, "0")}`;
  }
  function migrateLegacy() {
    const old = store.get(LEGACY_KEY); if (!old) return;
    const keep = ["archPhone", "archInsurer", "archPolicy", "archMediator", "archMediatorContact", "archClaims", "archCoverage", "rate"];
    const out = {};
    keep.forEach(k => { if (old[k] && String(old[k]).trim()) out[k] = old[k]; });
    apply(out);
  }
  // Compare deux numéros de version « 7.6.1 » / « 7.7.0 » (true si a < b).
  function verLess(a, b) {
    const x = String(a || "0").split(".").map(Number), y = String(b).split(".").map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d < 0; }
    return false;
  }
  // V7.7 : la nouvelle grille remplace les anciennes valeurs par défaut restées inchangées
  // (une valeur personnalisée est conservée).
  function migrateGrid(cab) {
    if (!verLess(cab.__v, "7.7")) return;
    const D = E.DEFAULTS, L = E.LEGACY_DEFAULTS;
    const now = { rate: D.rate, priceNeuf: D.priceNeuf, priceReno: D.priceReno, pcMax: D.targets.pcMax, pcMin: D.targets.pcMin,
                  siteMax: D.targets.siteMax, siteMin: D.targets.siteMin, degStart: D.targets.degStart };
    Object.keys(L).forEach(k => { if (k in cab && E.toNum(cab[k]) === L[k]) cab[k] = String(now[k]); });
  }
  function load() {
    const cab = store.get(KEY_CAB);
    if (cab) {
      if (cab.__refCounter) refCounter = cab.__refCounter;
      migrateGrid(cab);
      if (cab.startDelay === "à réception de la convention signée et des documents nécessaires") cab.startDelay = "à réception du contrat signé et des documents nécessaires";
      if (!cab.__v || cab.__v < "7.2") { delete cab.pricingMode; ["pcSmall","siteSmall","pc500","site500","pc1000","site1000"].forEach(k => delete cab[k]); }
      if (!cab.archPhone) cab.archPhone = "07 81 16 49 21";
      if (!cab.archInsurer) cab.archInsurer = "MAF (Mutuelle des Architectes Français)";
      // V9 : données reprises du contrat de l’Ordre (police MAF, médiateur désigné par le CNOA), si encore vides.
      if (!cab.archPolicy) cab.archPolicy = PREFILL.archPolicy;
      if (!cab.archMediator) { cab.archMediator = PREFILL.archMediator; if (!cab.archMediatorContact) cab.archMediatorContact = PREFILL.archMediatorContact; cab.archMediatorMember = true; }
      apply(cab);
    } else migrateLegacy();
    const dos = store.get(KEY_DOS);
    if (dos) apply(dos); else setPreset("pc");
  }
  function newDossier() {
    if (dossierHasContent()) saveHistory(true);
    if (!confirm("Commencer un nouveau dossier ? Les informations client, projet et missions seront effacées (les paramètres cabinet sont conservés).")) return;
    resetDossier();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function resetDossier() {
    document.querySelectorAll('[data-store="dos"]').forEach(el => {
      if (el.type === "checkbox") el.checked = false;
      else if (el.tagName === "SELECT") el.selectedIndex = [...el.options].findIndex(o => o.defaultSelected);
      else el.value = el.defaultValue || "";
    });
    ["rateOverride", "pctPc", "pctSite", "manualData"].forEach(id => { $(id).value = ""; });
    lockManual();
    $("proposalRef").value = nextRef(true);
    $("docDate").value = today();
    setPreset("pc");
    calculate(); saveNow();
  }


  /* ---------- Import d'un questionnaire du site (QR code ou code texte) ---------- */
  const IMPORT_PREFIX = "STATERA1.";
  function decodeImport(text) {
    const raw = String(text || "").trim();
    const at = raw.indexOf(IMPORT_PREFIX);
    if (at < 0) throw new Error("Ce code ne provient pas d’un questionnaire STATERA.");
    const b64 = raw.slice(at + IMPORT_PREFIX.length).replace(/[^A-Za-z0-9_-]/g, "");
    let json;
    try {
      const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4));
      json = new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
    } catch (_) { throw new Error("Code incomplet ou abîmé : copiez-le en entier."); }
    let p;
    try { p = JSON.parse(json); } catch (_) { throw new Error("Code incomplet ou abîmé : copiez-le en entier."); }
    if (!p || typeof p !== "object") throw new Error("Code illisible.");
    const s = v => (typeof v === "string" ? v.slice(0, 200) : "");
    const n = v => (Number.isFinite(+v) && +v > 0 ? Math.round(+v) : 0);
    return { fn: s(p.fn), ln: s(p.ln), co: s(p.co), ad: s(p.ad), pn: s(p.pn), pl: s(p.pl), cad: s(p.cad),
             sn: n(p.sn), sr: n(p.sr), si: n(p.si), st: n(p.st), w: n(p.w), ph: s(p.ph) || "p", ct: p.ct === "pro" ? "pro" : "consumer" };
  }
  function dossierHasContent() {
    return ["clientFirstName", "clientLastName", "clientCompany", "projectName"].some(id => val(id));
  }
  function applyImport(p) {
    if (dossierHasContent() && !confirm("Remplacer le dossier en cours par ce questionnaire ?")) return false;
    resetDossier();
    const setv = (id, v) => { if ($(id)) $(id).value = v; };
    setv("clientFirstName", p.fn); setv("clientLastName", p.ln); setv("clientCompany", p.co); setv("clientAddress", p.ad);
    setv("projectName", p.pn); setv("projectLocation", p.pl); setv("cadastralRefs", p.cad);
    setv("sn", String(p.sn)); setv("sr", String(p.sr)); setv("si", String(p.si));
    setv("works", p.w ? nf0.format(p.w) : "0");
    $("clientType").value = p.ct === "pro" ? "pro" : "consumer";
    const want = { pc: [], site: [], int: [] };
    if (p.ph.includes("p")) want.pc = E.PRESETS.pc.pc.concat(p.sr > 0 ? ["rel", "diag"] : []);
    if (p.ph.includes("s")) want.site = E.PRESETS.full.site.slice();
    if (p.ph.includes("i")) want.int = E.PRESETS.mixed.int.slice();
    document.querySelectorAll(".mchk").forEach(c => { c.checked = want[c.dataset.phase].includes(c.dataset.mid); });
    document.querySelectorAll("[data-preset]").forEach(b => b.classList.remove("on"));
    calculate(); saveNow();
    return true;
  }

  let jsqrLoading = null;
  function loadJsQR() {
    if (window.jsQR) return Promise.resolve(window.jsQR);
    if (!jsqrLoading) jsqrLoading = new Promise((ok, ko) => {
      const sc = document.createElement("script"); sc.src = "jsQR.js";
      sc.onload = () => (window.jsQR ? ok(window.jsQR) : ko(new Error("Lecteur QR indisponible.")));
      sc.onerror = () => { jsqrLoading = null; ko(new Error("Lecteur QR indisponible hors ligne au premier usage.")); };
      document.head.appendChild(sc);
    });
    return jsqrLoading;
  }
  function decodeCanvas(jsQR, cv) {
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, cv.width, cv.height);
    const res = jsQR(img.data, cv.width, cv.height, { inversionAttempts: "attemptBoth" });
    return res && res.data ? res.data : null;
  }
  let stream = null, scanRaf = 0;
  function stopCamera() {
    cancelAnimationFrame(scanRaf); scanRaf = 0;
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    $("impVideoWrap").hidden = true;
  }
  function importMsg(t, ok) { const m = $("impMsg"); m.textContent = t; m.className = "imp-msg" + (ok ? " ok" : t ? " ko" : ""); }
  function handleText(text) {
    try {
      const p = decodeImport(text);
      stopCamera();
      if (applyImport(p)) {
        closeImport();
        flash(`Questionnaire importé : ${[p.fn, p.ln].filter(Boolean).join(" ") || "client"}${p.pn ? " — " + p.pn : ""}. Vérifiez les champs avant la proposition.`);
      }
      return true;
    } catch (e) { importMsg(e.message, false); return false; }
  }
  async function startCamera() {
    importMsg("");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { importMsg("Caméra indisponible sur cet appareil : utilisez une photo ou le code.", false); return; }
    try {
      const jsQR = await loadJsQR();
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      const v = $("impVideo"); v.srcObject = stream; v.setAttribute("playsinline", ""); v.muted = true;
      $("impVideoWrap").hidden = false;
      await v.play();
      const cv = document.createElement("canvas");
      const tick = () => {
        if (!stream) return;
        if (v.readyState >= 2 && v.videoWidth) {
          const k = Math.min(1, 720 / v.videoWidth);
          cv.width = Math.round(v.videoWidth * k); cv.height = Math.round(v.videoHeight * k);
          cv.getContext("2d", { willReadFrequently: true }).drawImage(v, 0, 0, cv.width, cv.height);
          const txt = decodeCanvas(jsQR, cv);
          if (txt && txt.includes(IMPORT_PREFIX)) { handleText(txt); return; }
        }
        scanRaf = requestAnimationFrame(tick);
      };
      scanRaf = requestAnimationFrame(tick);
    } catch (e) {
      stopCamera();
      importMsg(e && e.name === "NotAllowedError" ? "Accès à la caméra refusé. Autorisez-le dans Réglages, ou utilisez une photo du QR code." : (e.message || "Caméra indisponible."), false);
    }
  }
  async function decodeFile(file) {
    importMsg("Lecture de l’image…");
    try {
      const jsQR = await loadJsQR();
      const url = URL.createObjectURL(file);
      const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error("Image illisible.")); i.src = url; });
      const cv = document.createElement("canvas");
      let found = null;
      for (const max of [1200, 800, 1800, 500]) {
        const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(img, 0, 0, cv.width, cv.height);
        found = decodeCanvas(jsQR, cv);
        if (found) break;
      }
      URL.revokeObjectURL(url);
      // Image très allongée (capture pleine page) : balayage par tranches à pleine largeur.
      if (!found && img.naturalHeight > img.naturalWidth * 1.5) {
        const k = Math.min(1, 1000 / img.naturalWidth);
        const tileH = Math.round(img.naturalWidth * 1.6);
        cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(tileH * k);
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        for (let y = 0; y < img.naturalHeight && !found; y += Math.round(tileH / 4)) {
          ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
          ctx.drawImage(img, 0, y, img.naturalWidth, tileH, 0, 0, cv.width, cv.height);
          found = decodeCanvas(jsQR, cv);
        }
      }
      if (!found) { importMsg("Aucun QR code reconnu sur cette image. Recadrez au plus près du code.", false); return; }
      handleText(found);
    } catch (e) { importMsg(e.message, false); }
  }
  function openImport() { importMsg(""); $("impCode").value = ""; $("importDlg").classList.add("open"); document.body.style.overflow = "hidden"; }
  function closeImport() { stopCamera(); $("importDlg").classList.remove("open"); document.body.style.overflow = ""; }
  let flashTimer = 0;
  function flash(t) { const f = $("flash"); f.textContent = t; f.classList.add("on"); clearTimeout(flashTimer); flashTimer = setTimeout(() => f.classList.remove("on"), 6000); }

  /* ---------- Données pour le contrat et les factures ---------- */
  function archData() {
    return {
      full: val("archFullName"), short: val("archShortName") || "Michel Mangion", form: val("archForm"), brand: val("archBrand"),
      siren: val("archSiren"), siret: val("archSiret"), ape: val("archApe"), tva: val("archTva"), address: val("archAddress"),
      email: val("archEmail"), phone: val("archPhone"), orderOrg: val("archOrderOrg"), orderNo: val("archOrderNo"),
      insurer: val("archInsurer"), insurerAddress: val("archInsurerAddress"), policy: val("archPolicy"),
      policyStart: val("archPolicyStart"), policyEnd: val("archPolicyEnd"), coverage: val("archCoverage"),
      mediator: val("archMediator"), mediatorContact: val("archMediatorContact"), mediatorMember: $("archMediatorMember").checked,
      claims: val("archClaims"), iban: val("archIban"), bic: val("archBic"), links: val("archLinks")
    };
  }
  function contractCtx(r) {
    const lc = legalContext();
    const sched = $("scheduleMode").value === "manual" ? Math.abs([1, 2, 3, 4].reduce((a, i) => a + num("m" + i + "p"), 0) - 100) <= 0.01 : true;
    const clauses = {}; ["cl1", "cl2", "cl3", "cl4", "cl5", "cl6", "cl7", "cl8"].forEach(k => { clauses[k] = $(k).checked; });
    return {
      model: K.MODEL, ref: val("proposalRef"), date: $("docDate").value || today(), r, lc,
      A: archData(),
      C: { first: val("clientFirstName"), last: val("clientLastName"), company: val("clientCompany"), address: val("clientAddress"),
           email: val("clientEmail"), phone: val("clientPhone"), siren: val("clientSiren"), type: lc.type },
      P: { name: val("projectName"), loc: val("projectLocation"), cad: val("cadastralRefs"), program: val("projectProgram"),
           landArea: num("landArea"), usage: $("usage").value, geotech: $("geotech").value === "na" ? "na" : $("geotech").value,
           loan: $("loan").value, loanMonths: num("loanMonths"), loanDetail: val("loanDetail"), suiviConf: $("suiviConf").checked },
      S: { validationDays: num("validationDays"), revisionTerms: val("revisionTerms"), paymentDays: num("paymentDays"), noticePeriod: num("noticePeriod"),
           startDelay: val("startDelay"), duration: val("duration"), expensesTerms: val("expensesTerms"), specialTerms: val("specialTerms"),
           expressStart: $("expressStart").checked, showWorks: $("showWorks").checked, signPlace: val("signPlace"), clauses, scheduleOk: sched,
           billing: r.billing, clientRate: r.clientRate || num("clientRate"), overrunPct: num("overrunPct"), vatRate: r.vatRate,
           execDays: num("execDays"), resilPct: val("resilPct") === "" ? 20 : num("resilPct"), penalty: num("penalty"), penaltyCap: num("penaltyCap"),
           deliverFormat: val("deliverFormat"), copies: num("copies"), showRate: $("showRate").checked,
           acompte: $("scheduleMode").value === "manual" ? 0 : num("acompte") }
    };
  }
  function complianceNow(r) { return K.compliance(contractCtx(r || last || calculate())); }

  /* ---------- Document client ---------- */
  const LOGO = '<svg viewBox="0 0 4538.4 1404" role="img" aria-label="STATERA Architecture"><use href="#statera-logo"/></svg>';
  const lc1 = t => t ? t.charAt(0).toLowerCase() + t.slice(1) : t;

  // Page 1 : proposition d'honoraires (sans aucune donnée interne). Le contrat est paginé à part.
  function buildDocument(r, opts) {
    const proposalOnly = !!(opts && opts.proposalOnly);
    const lc = legalContext();
    const ctx = contractCtx(r);
    const comp = K.compliance(ctx);
    const A = ctx.A, C = ctx.C, project = ctx.P;
    const person = `${C.first} ${C.last}`.trim();
    const ref = ctx.ref, date = ctx.date;
    const validity = Math.max(1, Math.round(num("validityDays")) || 30);
    const vd = new Date(date + "T12:00:00"); vd.setDate(vd.getDate() + validity);
    const validUntil = vd.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    const phases = E.PHASES.map(p => r.phases[p.key]).filter(p => p.count);
    const allSel = phases.reduce((a, p) => a + p.count, 0);
    const vatTxt = r.vatRate ? `TVA ${nf2.format(r.vatRate).replace(/,00$/, "")} %` : "TVA non applicable, art. 293 B du CGI";
    const nc = comp.blockers.map(b => b.msg);
    const temps = r.billing === "temps";
    const hfmt = h => nf2.format(h).replace(/,00$/, "").replace(/(,\d)0$/, "$1") + "\u00A0h";

    const phaseHtml = phases.map(p => {
      const sel = p.missions.filter(m => m.selected);
      const compact = p.key === "int" ? sel.length > 8 : allSel > 14;
      return `<div class="d-phase">
        <div class="d-phase-h"><span>${esc(p.title)}</span><span>${euro(p.finalAmount)} HT</span></div>
        <div class="d-mis ${compact ? "two" : "one"}">${sel.map(m => `<div class="mi"><div><b>${m.code ? `<span class="c">${esc(m.code)}</span>` : ""}${esc(m.name)}</b>${compact ? "" : `<p>${esc(m.short)}</p>`}</div><span class="pr">${euro(m.price)}${temps ? `<small>${hfmt(m.hours)} indicatives</small>` : ""}</span></div>`).join("")}</div>
      </div>`;
    }).join("");
    const sched = r.schedule.map(s => {
      let label = s.label;
      if (label === "__ACOMPTE__") label = lc.offPremisesConsumer ? "Acompte, exigible au plus tôt 7 jours après la signature" : "Acompte à la signature";
      if (s.insurance && lc.offPremisesConsumer) label = label.replace(/— à la signature$/, "— exigible au plus tôt 7 jours après la signature");
      return `<tr><td>${esc(label)}</td><td class="r">${euro(s.amount)}</td></tr>`;
    }).join("");
    // Proposition seule : document commercial, sans contrat ; les points du contrat restent signalés à l’écran uniquement.
    const ncShown = proposalOnly ? [] : nc;
    const banner = ncShown.length ? `<div class="c-banner">PROJET NON CONFORME — ne pas transmettre au client<small>${nc.map(esc).join(" · ")}</small></div>` : "";

    const page1 = `<div class="sheet${ncShown.length ? " nc" : ""}" id="page1">${banner}
      <div class="d-head">${LOGO}<div class="who"><b>${esc(A.short)}</b>Architecte</div></div>
      <div class="d-title">Proposition d’honoraires${temps ? " <span style=\"font-size:13pt;color:#57544F\">au temps passé</span>" : ""}</div>
      <div class="d-ref">Réf. ${esc(ref)} — ${esc(longDate(date))}</div>
      <div class="d-parties">
        <div><div class="d-lbl">Client</div>${C.company ? esc(C.company) + "<br>" : ""}${esc(person)}<br>${esc(C.address)}</div>
        <div><div class="d-lbl">Projet</div>${esc(project.name)}${project.cad ? `<br><span style="color:#8C8981">Cadastre ${esc(project.cad)}</span>` : ""}</div>
        <div><div class="d-lbl">Adresse du projet</div>${esc(project.loc)}</div>
      </div>
      ${phaseHtml}
      <div class="d-bottom">
        <div class="d-sched"><div class="d-lbl">Échéancier</div><table>${sched}</table></div>
        <div class="d-tot"><table>
          <tr class="ht"><td><small>Honoraires HT</small><small style="letter-spacing:.02em;text-transform:none;margin-top:1mm">${temps ? "estimation" : "forfait"}</small></td><td class="r">${euro(r.totalHT)}</td></tr>
          ${r.insuranceHT > 0 ? `<tr><td>${esc(r.insuranceLabel)} HT</td><td class="r">${euro(r.insuranceHT)}</td></tr><tr><td>Total HT</td><td class="r">${euro(r.grandHT)}</td></tr>` : ""}
          <tr><td>${esc(vatTxt)}</td><td class="r">${euro(r.grandTVA)}</td></tr>
          <tr class="ttc"><td>Total TTC</td><td class="r">${euro(r.grandTTC)}</td></tr>
        </table></div>
      </div>
      ${temps ? `<div class="d-temps">Honoraires au temps passé, au taux de ${euro(r.clientRate)} HT de l’heure${r.vatRate ? ` (${euro(Math.round(r.clientRate * (1 + r.vatRate / 100) * 100) / 100)} TTC)` : ""}. Temps estimé : ${hfmt(r.totalHours)}. Les heures sont indicatives : les échéances sont des acomptes sur l’estimation et la facture définitive est établie sur le temps réellement passé (relevé joint). Tout dépassement prévisible est signalé par écrit au client ; au-delà de ${nf0.format(Math.max(0, num("overrunPct")))} % de l’estimation, il requiert son accord écrit.</div>` : ""}
      <div class="d-valid">Proposition valable jusqu’au ${esc(validUntil)}. ${proposalOnly ? "Le contrat d’architecte, qui précise les conditions de la mission, est établi à l’acceptation de la présente proposition et prend effet à sa signature par les deux parties." : `Les conditions de la mission figurent dans le contrat d’architecte joint (modèle ${esc(K.MODEL)}), qui prend effet à sa signature par les deux parties.`}</div>
      <div class="d-foot">${esc(A.brand)} — ${esc(A.full)}, architecte, ${esc(lc1(A.form))} — ${esc(A.address)} — SIRET ${esc(A.siret)} — Inscrit à l’Ordre des architectes, ${esc(A.orderOrg.replace(/^Conseil régional de l’Ordre des architectes de /i, "région "))}, n° ${esc(A.orderNo)}${A.email ? " — " + esc(A.email) : ""}${A.phone ? " — " + esc(A.phone) : ""}</div>
    </div>`;
    const blocks = K.blocks(ctx);
    const contractText = blocks.map(b => b.html).join("\n");
    return { html: page1, contractText, ctx, compliance: comp, blocks,
             title: `${ref} — ${proposalOnly ? "Proposition d’honoraires" : "Proposition et contrat"} — ${person || C.company || "client"}` };
  }

  let prevTitle = document.title;
  function showOverlay(title, msgText, warn) {
    const msg = $("previewMsg");
    msg.className = "msg" + (warn ? " warn" : "");
    msg.textContent = msgText;
    prevTitle = document.title;
    document.title = title;
    $("preview").classList.add("open");
    fitPreview();
    $("preview").scrollTop = 0;
    document.body.style.overflow = "hidden";
  }
  const KEY_DOCMODE = "statera-docmode";
  function docMode() { const v = $("docMode").value; return v === "proposal" ? "proposal" : "full"; }
  function openPreview() {
    const r = calculate();
    if (!r) return;
    try { const m = localStorage.getItem(KEY_DOCMODE); if (m === "proposal" || m === "full") $("docMode").value = m; } catch (_) {}
    const proposalOnly = docMode() === "proposal";
    const doc = buildDocument(r, { proposalOnly });
    const host = $("doc");
    host.style.setProperty("--z", "1");
    $("preview").classList.add("open");
    host.innerHTML = doc.html;
    autoFit();
    if (proposalOnly) {
      host.dataset.contractPages = "0";
      saveHistory(true);
      const bl = doc.compliance.blockers;
      showOverlay(doc.title, bl.length
        ? `Proposition seule, 1 page, imprimable telle quelle. À compléter avant le contrat : ${bl.map(b => b.msg).join(" ")}`
        : "Proposition seule, 1 page, prête à imprimer.", false);
      return;
    }
    const pages = K.paginate(host, doc.blocks, { footer: `${val("archBrand") || "STATERA"} — contrat ${K.MODEL} — réf. ${doc.ctx.ref}`, nonCompliant: doc.compliance.blockers.map(b => b.msg) });
    host.dataset.contractPages = String(pages);
    logManual(r);
    saveHistory(true);
    const bl = doc.compliance.blockers;
    showOverlay(doc.title, bl.length ? `Projet non conforme : ${bl.map(b => b.msg).join(" ")}` : `Document prêt : proposition + contrat de ${pages} pages. Joindre l’attestation d’assurance (annexe 2).`, bl.length > 0);
  }
  /* ---------- Contrat de l’Ordre importé (PDF) ---------- */
  // Lecture sur l’appareil (pdf.js), restitution dans la mise en page STATERA, contrôle d’intégrité du texte.
  let imp = null; // { ok, verify, cut, meta } quand l’aperçu affiche un contrat importé
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return new Promise((res, rej) => {
      const sc = document.createElement("script");
      sc.src = "vendor/pdf.min.js";
      sc.onload = () => { if (!window.pdfjsLib) return rej(new Error("pdf.js indisponible")); window.pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js"; res(window.pdfjsLib); };
      sc.onerror = () => rej(new Error("Lecteur PDF non chargé (connexion requise au premier usage)."));
      document.head.appendChild(sc);
    });
  }
  // Page « Proposition d’honoraires » identique à celle de l’application, établie d’après les montants du contrat importé.
  function importProposal(sm) {
    const A = archData();
    const ph = sm.phases.map(p => `<div class="d-phase">
        <div class="d-phase-h"><span>${esc(p.title)}</span><span>${euro(p.missions.reduce((a, m) => a + m.ht, 0))} HT</span></div>
        <div class="d-mis one">${p.missions.map(m => `<div class="mi"><div><b>${esc(m.label)}</b>${m.note ? `<p>${esc(m.note.charAt(0).toUpperCase() + m.note.slice(1))}</p>` : ""}</div><span class="pr">${euro(m.ht)}</span></div>`).join("")}</div>
      </div>`).join("");
    const rows = [];
    if (sm.insHT) rows.push(["Frais d’assurance — à la signature", sm.insHT]);
    sm.missions.forEach(m => {
      if (sm.acompte > 0) { const a = Math.round(m.ht * sm.acompte) / 100; rows.push([`${m.label} — acompte au démarrage (${nf2.format(sm.acompte).replace(/,00$/, "")} %)`, a], [`${m.label} — à la remise`, Math.round((m.ht - a) * 100) / 100]); }
      else rows.push([`${m.label} — à la remise`, m.ht]);
    });
    const tva = Math.round(((sm.totalTTC - sm.totalHT) + (sm.insTTC - sm.insHT)) * 100) / 100;
    const ht = Math.round((sm.totalHT + sm.insHT) * 100) / 100;
    const rate = sm.totalHT ? Math.round((sm.totalTTC / sm.totalHT - 1) * 1000) / 10 : 0;
    return `<div class="sheet" id="page1">
      <div class="d-head">${LOGO}<div class="who"><b>${esc(A.short)}</b>Architecte</div></div>
      <div class="d-title">Proposition d’honoraires</div>
      <div class="d-ref">Contrat type de l’Ordre des architectes${sm.place ? ` — ${esc(sm.place.charAt(0) + sm.place.slice(1).toLowerCase())}` : ""}${sm.date ? `, le ${esc(longDate(sm.date))}` : ""}</div>
      <div class="d-parties">
        <div><div class="d-lbl">Client</div>${esc(sm.client)}<br>${esc(sm.clientAddress)}</div>
        <div><div class="d-lbl">Projet</div>${esc(sm.nature)}${sm.cad ? `<br><span style="color:#8C8981">${esc(sm.cad)}</span>` : ""}</div>
        <div><div class="d-lbl">Adresse du projet</div>${esc(sm.loc)}</div>
      </div>
      ${ph}
      <div class="d-bottom">
        <div class="d-sched"><div class="d-lbl">Échéancier <span style="letter-spacing:0;text-transform:none">(montants HT)</span></div><table>${rows.map(([l, a]) => `<tr><td>${esc(l)}</td><td class="r">${euro(a)}</td></tr>`).join("")}</table></div>
        <div class="d-tot"><table>
          <tr class="ht"><td><small>Honoraires HT</small><small style="letter-spacing:.02em;text-transform:none;margin-top:1mm">forfait</small></td><td class="r">${euro(sm.totalHT)}</td></tr>
          ${sm.insHT ? `<tr><td>Frais d’assurance HT</td><td class="r">${euro(sm.insHT)}</td></tr><tr><td>Total HT</td><td class="r">${euro(ht)}</td></tr>` : ""}
          <tr><td>TVA${rate ? ` ${nf2.format(rate).replace(/,0+$/, "")} %` : ""}</td><td class="r">${euro(tva)}</td></tr>
          <tr class="ttc"><td>Total TTC</td><td class="r">${euro(Math.round((sm.totalTTC + sm.insTTC) * 100) / 100)}</td></tr>
        </table></div>
      </div>
      <div class="d-valid">Synthèse établie d’après le contrat d’architecte joint (contrat type de l’Ordre des architectes), qui seul fait foi et prend effet à sa signature par les deux parties.</div>
      <div class="d-foot">${esc(A.brand)} — ${esc(A.full)}, architecte, ${esc(lc1(A.form))} — ${esc(A.address)} — SIRET ${esc(A.siret)} — Inscrit à l’Ordre des architectes, ${esc(A.orderOrg.replace(/^Conseil régional de l’Ordre des architectes de /i, "région "))}, n° ${esc(A.orderNo)}${A.email ? " — " + esc(A.email) : ""}${A.phone ? " — " + esc(A.phone) : ""}</div>
    </div>`;
  }
  async function importOrdre(file) {
    if (!file) return;
    flash("Lecture du contrat…");
    try {
      const lib = await loadPdfJs();
      const data = new Uint8Array(await file.arrayBuffer());
      const X = window.StateraImport;
      const ex = await X.extract(lib, data);
      if (!ex.pages.some(p => p.items.length)) throw new Error("Ce PDF ne contient pas de texte lisible (document scanné ?). Exportez le contrat depuis l’outil de l’Ordre.");
      const parsed = X.parse(ex);
      const rendered = X.render(parsed, { brand: val("archBrand") || "STATERA" });
      const v = X.verify(parsed, rendered);
      const sm = X.summary(parsed);
      const host = $("doc");
      host.style.setProperty("--z", "1");
      $("preview").classList.add("open");
      host.innerHTML = sm.ok ? importProposal(sm) : "";
      if (sm.ok) autoFit();
      const who = parsed.meta.parties ? ` — ${parsed.meta.parties}` : "";
      const pages = K.paginate(host, rendered, { footer: `${val("archBrand") || "STATERA"} — contrat type de l’Ordre des architectes${who}` });
      const cut = [...host.querySelectorAll(".cbody")].some(b => b.scrollHeight > b.clientHeight + 1);
      imp = { ok: v.ok && !cut, verify: v, cut, meta: parsed.meta, pages, summary: sm };
      $("docMode").hidden = true;
      const draft = parsed.meta.draft ? " Attention : ce PDF porte le filigrane « PROJET » de l’Ordre ; faites signer la version finalisée." : "";
      const msg = imp.ok
        ? `Contrat de l’Ordre importé : ${pages} pages${sm.ok ? ", précédées de la proposition d’honoraires établie d’après ses montants (recoupés)" : ""}. Texte intégral vérifié, ${v.chars.toLocaleString("fr-FR")} caractères repris sans omission ni ajout.${sm.ok ? "" : ` Proposition non générée : ${sm.warnings.join(" ")}`}${draft}`
        : `Impression bloquée : ${!v.ok ? `le texte restitué diffère du PDF (manquant : ${v.missing.slice(0, 6).join(", ") || "—"} ; en trop : ${v.extra.slice(0, 6).join(", ") || "—"})` : "un paragraphe dépasse la hauteur d’une page"}. Utilisez le PDF de l’Ordre tel quel.${draft}`;
      $("flash").classList.remove("on");
      showOverlay(`Contrat d’architecte${who}`, msg, !imp.ok || parsed.meta.draft);
    } catch (e) {
      imp = null;
      flash(e.message || "Import impossible.");
    } finally { $("ordreFile").value = ""; }
  }
  function closePreview() {
    imp = null; $("docMode").hidden = false;
    $("preview").classList.remove("open");
    document.body.style.overflow = "";
    document.title = prevTitle;
  }
  // Ajuste la densité pour que la proposition tienne sur une page A4.
  const MM = 96 / 25.4;
  function contentHeight(el) { const cs = getComputedStyle(el); const last = el.lastElementChild; if (!last) return 0; const r = el.getBoundingClientRect(), l = last.getBoundingClientRect(); return l.bottom - r.top - parseFloat(cs.paddingTop); }
  function autoFit() {
    const p1 = $("page1"); if (!p1) return;
    const limit = 266 * MM;
    for (const c of ["fit1", "fitcols", "fit2", "fit3"]) { if (contentHeight(p1) <= limit) break; p1.classList.add(c); }
    $("doc").dataset.p1 = Math.round(contentHeight(p1) / MM);
  }
  function fitPreview() {
    const mm = 96 / 25.4, w = 210 * mm + 24;
    const z = Math.min(1, (window.innerWidth) / w);
    $("doc").style.setProperty("--z", z.toFixed(3));
  }

  /* ---------- Facturation ---------- */
  const KEY_INV = "statera-factures-v8";
  const ledger = () => I.normLedger(store.get(KEY_INV));
  const setLedger = L => store.set(KEY_INV, L);
  const frDate = iso => { if (!iso) return ""; const [y, m, d] = String(iso).split("-"); return `${d}/${m}/${y}`; };
  function issuerSnapshot() {
    const A = archData();
    return { name: A.full, shortName: A.short, form: A.form, brand: A.brand, address: A.address, siren: A.siren, siret: A.siret, tva: A.tva,
             orderNo: A.orderNo, email: A.email, phone: A.phone, iban: A.iban, bic: A.bic, insurer: A.insurer, policy: A.policy, coverage: A.coverage };
  }
  function clientSnapshot() {
    const person = `${val("clientFirstName")} ${val("clientLastName")}`.trim();
    const co = val("clientCompany");
    return { name: co ? (person ? `${co} (${person})` : co) : person, address: val("clientAddress"), siren: val("clientSiren"),
             email: val("clientEmail"), pro: $("clientType").value !== "consumer" };
  }
  function scheduleLabel(s) { return s.label === "__ACOMPTE__" ? "Acompte à la signature" : s.label; }
  let invSrcSig = "", invSrcUser = false;
  function refreshInvoiceSource(r) {
    const sel = $("invSource"); if (!sel || !r) return;
    const rows = r.schedule || [];
    const sig = r.billing + rows.map(s => s.label + s.amount).join("|");
    if (sig === invSrcSig) return;
    invSrcSig = sig;
    const cur = sel.value;
    sel.innerHTML = rows.map((s, i) => `<option value="${i}">${esc(scheduleLabel(s))} — ${euro(s.amount)} HT</option>`).join("")
      + (r.billing === "temps" ? `<option value="final">Facture définitive au temps passé</option>` : "") + `<option value="free">Montant libre</option>`;
    // on ne conserve le choix précédent que s'il a été fait par l'utilisateur
    if (invSrcUser && [...sel.options].some(o => o.value === cur)) sel.value = cur; else sel.selectedIndex = 0;
    fillInvoiceFromSource();
  }
  function fillInvoiceFromSource() {
    const r = last; if (!r) return;
    const v = $("invSource").value;
    $("invHoursWrap").hidden = v !== "final";
    if (v === "final") { $("invLabel").value = "Honoraires d’architecte au temps passé — facture définitive"; if (!val("invHours")) $("invHours").value = String(r.totalHours).replace(".", ","); $("invAmount").value = ""; }
    else if (v === "free") { $("invLabel").value = ""; $("invAmount").value = ""; }
    else { const s = r.schedule[Number(v)]; if (s) { $("invLabel").value = s.insurance ? `${r.insuranceLabel}, refacturée au client` : `Honoraires d’architecte — ${scheduleLabel(s)}`; $("invAmount").value = nf2.format(s.amount).replace(/,00$/, ""); } }
    checkInvoiceDraft();
  }
  // Net HT déjà facturé sur ce dossier (factures moins avoirs) et pièces concernées.
  function billedForDossier(ref) {
    const docs = ledger().docs.filter(d => d.dossierRef === ref);
    return { ht: Math.round(docs.reduce((a, d) => a + d.totals.ht, 0) * 100) / 100, numbers: docs.map(d => d.number) };
  }
  function invoiceLines() {
    if ($("invSource").value !== "final") return [{ label: val("invLabel"), amount: E.toNum($("invAmount").value) }];
    const r = last, h = E.toNum($("invHours").value), rate = r && r.clientRate ? r.clientRate : num("clientRate");
    const prev = billedForDossier(val("proposalRef"));
    const lines = [{ label: val("invLabel") || "Honoraires au temps passé", amount: Math.round(h * rate * 100) / 100,
                     detail: `${nf2.format(h).replace(/,00$/, "")} h × ${euro(rate)} HT — temps estimé au contrat : ${nf2.format(r ? r.totalHours : 0).replace(/,00$/, "")} h (relevé des temps joint)` }];
    if (r && r.insuranceHT > 0) lines.push({ label: `${r.insuranceLabel}, refacturée au client`, amount: r.insuranceHT });
    if (prev.ht) lines.push({ label: `Déduction des sommes déjà facturées (${prev.numbers.join(", ")})`, amount: -prev.ht });
    return lines;
  }
  function invoiceDraft() {
    return {
      date: $("invDate").value || today(), paymentDays: num("paymentDays"), serviceDate: val("invService"),
      dossierRef: val("proposalRef"), project: [val("projectName"), val("projectLocation")].filter(Boolean).join(", "),
      issuer: issuerSnapshot(), client: clientSnapshot(), vatRegime: $("vatRegime").value, vatRate: num("vat"), vatOnDebits: $("vatDebits").checked,
      lines: invoiceLines()
    };
  }
  function checkInvoiceDraft() {
    const c = I.check(invoiceDraft(), ledger(), "invoice");
    const box = $("invCheck");
    const next = I.nextNumber(ledger(), "invoice", $("invDate").value || today());
    box.className = "status" + (c.ok ? "" : " warn");
    box.innerHTML = c.ok ? `Prochain numéro : <b>${esc(next)}</b>.${c.warnings.length ? `<ul>${c.warnings.map(w => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}`
      : `Émission impossible :<ul>${c.blockers.map(w => `<li>${esc(w)}</li>`).join("")}</ul>`;
    return c;
  }
  function issueInvoice() {
    const c = checkInvoiceDraft(); if (!c.ok) return;
    const d = invoiceDraft();
    if (!confirm(`Émettre la facture ${I.nextNumber(ledger(), "invoice", d.date)} de ${euro(I.totals(d.lines, d.vatRegime === "franchise" ? 0 : d.vatRate).ttc)} TTC ? Une facture émise ne peut plus être modifiée (seulement annulée par un avoir).`)) return;
    try {
      const res = I.issue(ledger(), d);
      setLedger(res.ledger);
      renderInvoices();
      showInvoice(res.doc);
    } catch (e) { $("invCheck").textContent = e.message; }
  }
  function showInvoice(doc) {
    $("doc").innerHTML = I.render(doc, LOGO);
    showOverlay(`${doc.number} — ${doc.kind === "credit" ? "Avoir" : "Facture"} — ${doc.client.name}`, I.NOTICE, false);
  }
  function renderInvoices() {
    const L = ledger(), box = $("invList"); if (!box) return;
    if (!L.docs.length) { box.innerHTML = `<div class="empty">Aucune facture émise.</div>`; return; }
    box.innerHTML = L.docs.slice().reverse().map(d => {
      const paid = (L.status[d.number] || {}).paid;
      const rest = d.kind === "invoice" ? I.creditable(L, d.number) : 0;
      return `<div class="row"><div><b>${esc(d.number)}</b> · ${esc(d.client.name)}<small>${d.kind === "credit" ? `Avoir sur ${esc(d.ref)} · ` : ""}${frDate(d.date)} · dossier ${esc(d.dossierRef)}${paid ? ` · payée le ${frDate(paid)}` : ""}</small></div><div>${euro(d.totals.ttc)} TTC</div>
        <div class="acts"><button type="button" data-inv="show" data-n="${esc(d.number)}">Voir / imprimer</button>${d.kind === "invoice" && rest > 0 ? `<button type="button" data-inv="credit" data-n="${esc(d.number)}">Avoir</button>` : ""}${d.kind === "invoice" ? `<button type="button" data-inv="paid" data-n="${esc(d.number)}">${paid ? "Annuler le paiement" : "Marquer payée"}</button>` : ""}</div></div>`;
    }).join("");
  }
  function onInvoiceAction(e) {
    const t = e.target.closest("[data-inv]"); if (!t) return;
    const L = ledger(), n = t.dataset.n, doc = L.docs.find(d => d.number === n);
    if (!doc) return;
    if (t.dataset.inv === "show") showInvoice(doc);
    if (t.dataset.inv === "paid") { const paid = (L.status[n] || {}).paid; setLedger(I.setPaid(L, n, paid ? null : today())); renderInvoices(); }
    if (t.dataset.inv === "credit") {
      const max = I.creditable(L, n);
      const amt = prompt(`Montant HT de l’avoir sur ${n} (maximum ${nf2.format(max)} €) :`, nf2.format(max).replace(/,00$/, ""));
      if (amt === null) return;
      const reason = prompt("Motif de l’avoir (figurera sur le document) :", "Annulation de la facture") || "";
      try { const res = I.credit(L, n, { amount: E.toNum(amt), reason, date: today() }); setLedger(res.ledger); renderInvoices(); showInvoice(res.doc); }
      catch (err) { alert(err.message); }
    }
  }
  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  /* ---------- Historique des dossiers et sauvegarde ---------- */
  const KEY_HIST = "statera-dossiers-v8";
  function history() { const h = store.get(KEY_HIST); return h && typeof h === "object" && !Array.isArray(h) ? h : {}; }
  function saveHistory(silent) {
    if (!dossierHasContent()) { if (!silent) flash("Dossier vide : rien à enregistrer."); return false; }
    const r = last || calculate();
    const h = history(); const ref = val("proposalRef") || nextRef(false);
    h[ref] = { ref, client: clientDisplayName(), project: val("projectName"), totalHT: r ? r.totalHT : 0, date: $("docDate").value, savedAt: new Date().toISOString(), data: snapshot("dos") };
    store.set(KEY_HIST, h);
    renderHistory();
    if (!silent) flash(`Dossier ${ref} enregistré dans l’historique.`);
    return true;
  }
  function renderHistory() {
    const box = $("dosList"); if (!box) return;
    const list = Object.values(history()).sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
    box.innerHTML = list.length ? list.map(d => `<div class="row"><div><b>${esc(d.ref)}</b> · ${esc(d.client || "client")}<small>${esc(d.project || "")} · enregistré le ${frDate(String(d.savedAt).slice(0, 10))}</small></div><div>${euro(d.totalHT || 0)} HT</div>
      <div class="acts"><button type="button" data-dos="open" data-ref="${esc(d.ref)}">Ouvrir</button><button type="button" data-dos="del" data-ref="${esc(d.ref)}">Supprimer</button></div></div>`).join("")
      : `<div class="empty">Aucun dossier enregistré.</div>`;
  }
  function onHistoryAction(e) {
    const t = e.target.closest("[data-dos]"); if (!t) return;
    const h = history(), d = h[t.dataset.ref]; if (!d) return;
    if (t.dataset.dos === "open") {
      if (dossierHasContent() && val("proposalRef") !== d.ref && !confirm(`Ouvrir le dossier ${d.ref} ? Le dossier en cours sera d’abord enregistré dans l’historique.`)) return;
      if (dossierHasContent() && val("proposalRef") !== d.ref) saveHistory(true);
      document.querySelectorAll('[data-store="dos"]').forEach(el => { if (el.type === "checkbox") el.checked = false; });
      apply(d.data); lockManual(); calculate(); saveNow();
      flash(`Dossier ${d.ref} ouvert.`); window.scrollTo({ top: 0, behavior: "smooth" });
    }
    if (t.dataset.dos === "del") { if (!confirm(`Supprimer ${d.ref} de l’historique ? (les factures émises sont conservées)`)) return; delete h[d.ref]; store.set(KEY_HIST, h); renderHistory(); }
  }
  function exportBackup() {
    saveNow();
    const data = { app: "STATERA Honoraires", version: VERSION, exportedAt: new Date().toISOString(),
                   cabinet: store.get(KEY_CAB), dossier: store.get(KEY_DOS), dossiers: history(), factures: ledger() };
    download(`STATERA-sauvegarde-${today()}.json`, JSON.stringify(data, null, 1), "application/json");
  }
  function importBackup(file) {
    const rd = new FileReader();
    rd.onload = () => {
      let d;
      try { d = JSON.parse(rd.result); } catch (_) { alert("Fichier illisible."); return; }
      if (!d || d.app !== "STATERA Honoraires" || !d.cabinet) { alert("Ce fichier n’est pas une sauvegarde STATERA Honoraires."); return; }
      const cur = ledger(), inc = I.normLedger(d.factures);
      if (cur.docs.length > inc.docs.length && !confirm(`Attention : cet appareil contient ${cur.docs.length} pièces comptables, la sauvegarde ${inc.docs.length}. Restaurer quand même ? (risque de rupture de numérotation)`)) return;
      if (!confirm(`Restaurer la sauvegarde du ${frDate(String(d.exportedAt).slice(0, 10))} ? Les données actuelles de cet appareil seront remplacées.`)) return;
      frozenStore = true; clearTimeout(saveTimer);
      store.set(KEY_CAB, d.cabinet); if (d.dossier) store.set(KEY_DOS, d.dossier); else store.del(KEY_DOS);
      store.set(KEY_HIST, d.dossiers || {}); store.set(KEY_INV, inc);
      location.reload();
    };
    rd.readAsText(file);
  }

  /* ---------- Événements ---------- */
  function onEdit(e) {
    const t = e.target;
    if (t && t.closest && t.closest("#preview")) return;
    if (t && t.classList && t.classList.contains("mchk")) document.querySelectorAll("[data-preset]").forEach(b => b.classList.remove("on"));
    calculate(); save();
  }
  function init() {
    buildMissions();
    load();
    if (!$("docDate").value) $("docDate").value = today();
    if (!val("proposalRef")) $("proposalRef").value = nextRef(false);

    document.addEventListener("input", onEdit, true);
    document.addEventListener("change", onEdit, true);
    document.querySelectorAll(".money").forEach(el => {
      el.addEventListener("blur", () => { const v = E.toNum(el.value); el.value = v ? nf0.format(v) : "0"; calculate(); save(); });
      el.addEventListener("focus", () => { if (E.toNum(el.value) === 0) el.select(); });
    });
    document.querySelectorAll(".num-in:not(.money)").forEach(el => el.addEventListener("focus", () => { if (E.toNum(el.value) === 0) el.select(); }));
    document.querySelectorAll("[data-preset]").forEach(b => b.addEventListener("click", () => { setPreset(b.dataset.preset); calculate(); save(); }));
    // Deux documents au choix : proposition d’honoraires seule, ou contrat d’architecte (proposition + contrat).
    ["pdfBtn", "ctrBtn", "pdfBtn2", "ctrBtn2"].forEach(id => $(id).addEventListener("click", e => {
      const m = e.currentTarget.dataset.mode; $("docMode").value = m;
      try { localStorage.setItem(KEY_DOCMODE, m); } catch (_) {}
      openPreview();
    }));
    $("closePreview").addEventListener("click", closePreview);
    $("docMode").addEventListener("change", () => {
      try { localStorage.setItem(KEY_DOCMODE, docMode()); } catch (_) {}
      const keep = prevTitle; openPreview(); prevTitle = keep;
    });
    $("printBtn").addEventListener("click", () => {
      if (imp && !imp.ok) { flash("Impression bloquée : la restitution du contrat importé n’est pas intégrale."); return; }
      window.print();
    });
    $("ordreBtn").addEventListener("click", () => $("ordreFile").click());
    $("ordreFile").addEventListener("change", e => importOrdre(e.target.files && e.target.files[0]));
    $("newBtn").addEventListener("click", newDossier);
    $("importBtn").addEventListener("click", openImport);
    $("impClose").addEventListener("click", closeImport);
    $("impScan").addEventListener("click", startCamera);
    $("impFile").addEventListener("change", e => { const f = e.target.files && e.target.files[0]; if (f) decodeFile(f); e.target.value = ""; });
    $("impGo").addEventListener("click", () => handleText($("impCode").value));
    window.addEventListener("pagehide", stopCamera);
    $("arbBlock").addEventListener("click", e => { const t = e.target.closest("[data-arb]"); if (t) applyArbitrage(t.dataset.arb); });
    $("manBlock").addEventListener("click", onManualClick);
    $("invNotice").textContent = I.NOTICE;
    $("invDate").value = today();
    $("invSource").addEventListener("change", () => { invSrcUser = true; fillInvoiceFromSource(); });
    ["invLabel", "invAmount", "invDate", "invService", "invHours"].forEach(id => $(id).addEventListener("input", checkInvoiceDraft));
    $("invIssue").addEventListener("click", issueInvoice);
    $("invCsv").addEventListener("click", () => download(`STATERA-factures-${today()}.csv`, I.toCSV(ledger()), "text/csv;charset=utf-8"));
    $("invList").addEventListener("click", onInvoiceAction);
    $("dosSave").addEventListener("click", () => saveHistory(false));
    $("dosList").addEventListener("click", onHistoryAction);
    $("bkExport").addEventListener("click", exportBackup);
    $("bkImport").addEventListener("change", e => { const f = e.target.files && e.target.files[0]; if (f) importBackup(f); e.target.value = ""; });
    renderInvoices(); renderHistory();
    $("manBlock").addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "manPinTry") { e.preventDefault(); onManualClick({ target: $("manBlock").querySelector('[data-man="pin"]') }); } });
    $("discreetBtn").addEventListener("click", () => {
      const on = document.body.dataset.discreet !== "1";
      document.body.dataset.discreet = on ? "1" : "0";
      if (on) { lockManual(); calculate(); }
      $("discreetBtn").textContent = on ? "Afficher les chiffres internes" : "Masquer les chiffres internes";
      try { sessionStorage.setItem("statera-discreet", on ? "1" : "0"); } catch (_) {}
    });
    try { if (sessionStorage.getItem("statera-discreet") === "1") $("discreetBtn").click(); } catch (_) {}
    $("resetAll").addEventListener("click", () => {
      if (!confirm("Restaurer tous les réglages par défaut ? Les paramètres cabinet saisis (assurance, téléphone…) seront effacés.")) return;
      frozenStore = true; clearTimeout(saveTimer); store.del(KEY_CAB); store.del(KEY_DOS); location.reload();
    });
    window.addEventListener("resize", fitPreview);
    window.addEventListener("pageshow", () => calculate());
    window.addEventListener("beforeprint", () => { if (!$("preview").classList.contains("open")) openPreview(); });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") saveNow(); });

    calculate(); saveNow();
  }

  // API de test (aucune donnée sensible)
  window.STATERA = { VERSION, importOrdre, importState: () => imp, decodeImport, importText: handleText, calculate, buildDocument: (o) => buildDocument(calculate(), o), setPreset, openPreview, closePreview, validate,
    compliance: () => complianceNow(calculate()), ledger, history };

  init();

  /* ---------- Pont STATERA Atelier : la proposition est rattachée à une demande client ---------- */
  (function atelierBridge() {
    const KEY = "statera-atelier-hon";
    const h = store.get(KEY);
    if (!h || !h.demandeId) return;
    const back = "/#/demandes/" + encodeURIComponent(h.demandeId);
    const bar = document.createElement("div");
    bar.className = "atelier-bar";
    bar.innerHTML = `<a href="${back}" id="atelierBack">← Retour à la demande</a><span>${esc(h.label || "")}</span>`;
    document.body.prepend(bar);
    ["importBtn", "newBtn"].forEach(id => { if ($(id)) $(id).style.display = "none"; }); // la demande porte le questionnaire et le dossier
    atelierPush = () => {
      const r = last || calculate();
      h.dos = snapshot("dos"); h.fresh = false;
      h.summary = { ref: val("proposalRef"), totalHT: r ? r.totalHT : 0, totalTTC: r ? r.totalTTC : 0, client: clientDisplayName(), project: val("projectName"), date: $("docDate").value, formule: val("billing") || "forfait" };
      store.set(KEY, h);
    };
    if (h.fresh) {
      resetDossier();
      if (h.prefill) {
        applyImport(h.prefill);
        const setv = (id, v) => { if ($(id) && v) $(id).value = v; };
        setv("clientEmail", h.prefill.email); setv("clientPhone", h.prefill.tel); setv("projectProgram", h.prefill.programme);
      }
      calculate();
    } else if (h.dos) {
      document.querySelectorAll('[data-store="dos"]').forEach(el => { if (el.type === "checkbox") el.checked = false; });
      apply(h.dos); lockManual(); calculate();
    }
    saveNow();
    $("atelierBack").addEventListener("click", () => { saveNow(); saveHistory(true); });
  })();

  // Intégré à STATERA Atelier : le service worker de l’Atelier gère le cache.
})();
