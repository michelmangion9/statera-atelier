/* STATERA — moteur de calcul des honoraires (V7.7)
 * Module pur : aucune dépendance au DOM. Utilisé par index.html et par les tests Node.
 * Toutes les données de ce fichier sont INTERNES : seuls les noms et descriptions
 * de missions, et les montants retenus, sont destinés au document client.
 */
(function (root) {
  "use strict";

  // basis : "built" = surface pondérée (neuf + rénovation × niveau) ; "existing" = surface rénovation ;
  //         "int" = surface architecture intérieure.
  // w : poids de la mission dans la cible % de sa phase (mission de référence = 100).
  // grp : jalon d'échéancier.
  const MISSIONS = {
    pc: [
      { id: "fais", code: "", name: "Faisabilité & programme", base: 3, m2: 0.1, basis: "built", w: 6, grp: "esq",
        short: "Analyse des besoins, du site et de la faisabilité de l’opération.",
        long: "Analyse des besoins, du programme, des premières contraintes du terrain ou du bâti et de la faisabilité générale de l’opération." },
      { id: "plu", code: "", name: "Analyse d’urbanisme", base: 3, m2: 0.06, basis: "built", w: 4, grp: "esq",
        short: "Étude des règles d’urbanisme applicables au terrain.",
        long: "Étude des règles d’urbanisme applicables : implantation, prospects, hauteur, emprise, stationnement et aspect extérieur." },
      { id: "rel", code: "", name: "Relevé de l’existant", base: 3, m2: 0.18, basis: "existing", w: 5, grp: "esq",
        short: "Relevé des dimensions du bâti existant.",
        long: "Relevé des dimensions de l’existant afin d’établir une base graphique fiable de travail." },
      { id: "diag", code: "", name: "Diagnostic architectural", base: 3, m2: 0.11, basis: "existing", w: 4, grp: "esq",
        short: "Lecture architecturale et technique de l’existant.",
        long: "Lecture architecturale et technique de l’existant, identification des points de vigilance et des potentiels." },
      { id: "esq", code: "ESQ", name: "Esquisse", base: 3, m2: 0.22, basis: "built", w: 20, grp: "esq",
        short: "Premières propositions d’implantation, de volumétrie et d’organisation.",
        long: "Premières propositions d’implantation, d’organisation spatiale, de volumétrie et d’intentions architecturales." },
      { id: "aps", code: "APS", name: "Avant-projet sommaire", base: 3, m2: 0.2, basis: "built", w: 20, grp: "apd",
        short: "Développement de la solution retenue : plans, volumes, principes constructifs.",
        long: "Développement de la solution retenue avec les plans, l’organisation et les principes généraux du projet." },
      { id: "apd", code: "APD", name: "Avant-projet définitif", base: 4, m2: 0.22, basis: "built", w: 25, grp: "apd",
        short: "Mise au point détaillée du projet, des surfaces et des matériaux.",
        long: "Mise au point détaillée du projet, arrêt des surfaces, des matériaux et des principes techniques avant le dossier d’autorisation." },
      { id: "dp", code: "DP", name: "Déclaration préalable", base: 4, m2: 0.1, basis: "built", w: 15, grp: "aut",
        short: "Constitution et dépôt du dossier de déclaration préalable.",
        long: "Préparation des pièces graphiques et écrites nécessaires lorsque le projet relève d’une déclaration préalable." },
      { id: "pcm", code: "PC", name: "Permis de construire", base: 4, m2: 0.2, basis: "built", w: 25, grp: "aut",
        short: "Constitution et dépôt du dossier de demande de permis de construire.",
        long: "Constitution du dossier de demande de permis de construire : pièces graphiques, notice architecturale et pièces administratives relevant de la mission de l’architecte." }
    ],
    site: [
      { id: "pro", code: "PRO", name: "Études de projet", base: 4, m2: 0.26, basis: "built", w: 15, grp: "dce",
        short: "Définition précise des ouvrages, plans et descriptifs.",
        long: "Développement technique du projet et établissement des plans et descriptifs nécessaires à une définition précise des ouvrages." },
      { id: "dce", code: "DCE", name: "Dossier de consultation des entreprises", base: 4, m2: 0.2, basis: "built", w: 12, grp: "dce",
        short: "Dossier permettant de consulter les entreprises sur une base comparable.",
        long: "Préparation du dossier permettant de consulter les entreprises sur une base claire et comparable." },
      { id: "act", code: "ACT", name: "Assistance aux contrats de travaux", base: 3, m2: 0.11, basis: "built", w: 6, grp: "dce",
        short: "Analyse des offres et mise au point des marchés.",
        long: "Assistance à l’analyse des offres, aux échanges avec les entreprises et à la mise au point des marchés de travaux." },
      { id: "visa", code: "VISA", name: "Visa des études d’exécution", base: 2, m2: 0.08, basis: "built", w: 5, grp: "chantier",
        short: "Vérification de la conformité des documents d’exécution.",
        long: "Vérification de la conformité au projet des documents d’exécution transmis par les entreprises." },
      { id: "det", code: "DET", name: "Direction de l’exécution des travaux", base: 14, m2: 1.05, basis: "built", w: 55, grp: "chantier",
        short: "Réunions de chantier, comptes rendus, suivi de la conformité architecturale.",
        long: "Organisation et animation des réunions de chantier, comptes rendus, suivi de l’avancement et contrôle de la conformité architecturale des travaux." },
      { id: "aor", code: "AOR", name: "Assistance aux opérations de réception", base: 3, m2: 0.1, basis: "built", w: 7, grp: "aor",
        short: "Réception des travaux, suivi et levée des réserves.",
        long: "Assistance à la réception des travaux, établissement et suivi des réserves jusqu’à leur levée." }
    ],
    int: [
      { id: "irel", name: "Relevé intérieur", base: 1, m2: 0.08, grp: "intc", short: "Prise de cotes précise des volumes existants.", long: "Relevé précis des dimensions intérieures existantes servant de base au projet." },
      { id: "ietat", name: "Plans d’état des lieux", base: 1, m2: 0.06, grp: "intc", short: "Plans de l’existant.", long: "Établissement des plans de l’existant pour documenter la configuration actuelle." },
      { id: "idiag", name: "Diagnostic intérieur", base: 1, m2: 0.04, grp: "intc", short: "Analyse fonctionnelle, technique et esthétique.", long: "Analyse fonctionnelle, technique et esthétique de l’existant intérieur." },
      { id: "iprog", name: "Programmation des espaces", base: 1, m2: 0.05, grp: "intc", short: "Besoins, usages et niveau de prestation.", long: "Définition des besoins, usages, relations entre espaces et niveaux de prestation souhaités." },
      { id: "iesq", name: "Esquisse d’aménagement", base: 2, m2: 0.12, grp: "intc", short: "Premières propositions d’organisation et d’ambiance.", long: "Premières propositions d’organisation intérieure, d’ambiance et de distribution." },
      { id: "iaps", name: "Avant-projet sommaire intérieur", base: 2, m2: 0.09, grp: "intc", short: "Développement de la solution retenue.", long: "Développement sommaire de la solution d’aménagement intérieur retenue." },
      { id: "iapd", name: "Avant-projet définitif intérieur", base: 2, m2: 0.12, grp: "intc", short: "Mise au point détaillée de l’aménagement.", long: "Mise au point détaillée de l’aménagement intérieur avant mise en œuvre." },
      { id: "idemo", name: "Plans de démolition et dépose", base: 1, m2: 0.05, grp: "intc", short: "Éléments à déposer ou démolir.", long: "Identification des éléments à déposer, démolir ou modifier." },
      { id: "iclo", name: "Plans de cloisonnement", base: 1, m2: 0.07, grp: "intc", short: "Implantations, cloisons et circulations.", long: "Définition des nouvelles implantations, cloisons, circulations et usages." },
      { id: "iplaf", name: "Plafonds et éclairage", base: 1, m2: 0.07, grp: "intc", short: "Plafonds, points lumineux et ambiances.", long: "Conception des plafonds, des points lumineux et des principes d’ambiance lumineuse." },
      { id: "ielec", name: "Implantation électrique", base: 1, m2: 0.07, grp: "intc", short: "Prises, commandes et éclairages.", long: "Positionnement architectural des prises, interrupteurs et éclairages." },
      { id: "iplom", name: "Implantation plomberie et sanitaires", base: 1, m2: 0.05, grp: "intc", short: "Équipements sanitaires et points d’eau.", long: "Positionnement des équipements sanitaires et des principaux points techniques liés à l’eau." },
      { id: "icalep", name: "Calepinages sols et murs", base: 1, m2: 0.07, grp: "intc", short: "Revêtements, découpes et alignements.", long: "Organisation graphique des revêtements, découpes, alignements et finitions." },
      { id: "imen", name: "Menuiseries et mobilier sur mesure", base: 2, m2: 0.12, grp: "intc", short: "Dessins et détails des ouvrages sur mesure.", long: "Dessins et détails des éléments de menuiserie et de mobilier spécifiques." },
      { id: "imat", name: "Matériaux, couleurs et finitions", base: 1, m2: 0.06, grp: "intc", short: "Choix et coordination des matériaux.", long: "Choix et coordination des matériaux, textures, teintes et finitions." },
      { id: "imob", name: "Mobilier, luminaires et équipements", base: 1, m2: 0.06, grp: "intc", short: "Sélection du mobilier et des luminaires.", long: "Sélection des éléments mobiliers, luminaires et équipements du projet." },
      { id: "icarnet", name: "Carnet de prescriptions", base: 1, m2: 0.05, grp: "intc", short: "Récapitulatif des choix et références.", long: "Document récapitulatif des références, choix et prescriptions du projet intérieur." },
      { id: "i3d", name: "Modélisation 3D", base: 2, m2: 0.09, grp: "intc", short: "Mise en volume numérique du projet.", long: "Mise en volume numérique du projet pour en faciliter la compréhension." },
      { id: "irendu", name: "Rendus photoréalistes", base: 1, m2: 0.06, grp: "intc", short: "Images d’ambiance du projet.", long: "Création d’images réalistes permettant de visualiser l’ambiance du projet." },
      { id: "idce", name: "Dossier de consultation intérieur", base: 2, m2: 0.11, grp: "intd", short: "Dossier de consultation des artisans.", long: "Dossier de consultation adapté aux travaux d’aménagement intérieur." },
      { id: "idevis", name: "Analyse des devis", base: 1, m2: 0.05, grp: "intd", short: "Comparaison des devis et aide à la décision.", long: "Analyse comparative des devis reçus et aide à la décision." },
      { id: "isuivi", name: "Suivi esthétique des travaux", base: 2, m2: 0.18, grp: "ints", short: "Suivi de la mise en œuvre des choix architecturaux.", long: "Suivi de la mise en œuvre des choix architecturaux et esthétiques intérieurs." }
    ]
  };
  MISSIONS.int.forEach(m => { m.basis = "int"; m.code = ""; m.w = 0; });

  const PHASES = [
    { key: "pc", title: "Conception & autorisations" },
    { key: "site", title: "Consultation, chantier & réception" },
    { key: "int", title: "Architecture intérieure" }
  ];

  const MILESTONES = {
    esq: "À la remise de l’esquisse",
    apd: "À la validation de l’avant-projet",
    aut: "Au dépôt de la demande d’autorisation",
    dce: "À la remise du dossier de consultation",
    chantier: "Pendant les travaux, mensuellement au prorata de leur avancement",
    aor: "À la réception des travaux et à la levée des réserves",
    intc: "À la validation du projet d’aménagement intérieur",
    intd: "À la remise du dossier de consultation intérieur",
    ints: "Pendant les travaux d’aménagement, au prorata de leur avancement"
  };

  const PRESETS = {
    pc: { pc: ["fais", "plu", "esq", "aps", "apd", "pcm"], site: [], int: [] },
    full: { pc: ["fais", "plu", "esq", "aps", "apd", "pcm"], site: ["pro", "dce", "act", "visa", "det", "aor"], int: [] },
    mixed: { pc: ["fais", "plu", "esq", "aps", "apd", "pcm"], site: [],
             int: ["irel", "ietat", "idiag", "iprog", "iesq", "iaps", "iapd", "idemo", "iclo", "iplaf", "ielec", "iplom", "imat", "imob", "i3d", "irendu"] },
    none: { pc: [], site: [], int: [] }
  };

  const DEFAULTS = {
    sn: 0, sr: 0, si: 0, works: 0,
    rate: 115, complexity: 1, renoLevel: 1.3, intComplexity: 1,
    coefPc: 1, coefSite: 1, coefInt: 1, hoursScale: 0.7,
    hourStep: 0.25, priceStep: 50, degress: 0.75,
    mode: "percent",
    priceNeuf: 2800, priceReno: 750, minFee: 2500,
    worksFloor: false,
    billing: "forfait", clientRate: 0,
    rateOverride: 0, pctPc: null, pctSite: null,
    targets: { pcMax: 4.25, pcMin: 2.75, siteMax: 8.5, siteMin: 6.25, degStart: 400000, degEnd: 2000000 },
    vatRegime: "normal", vat: 20,
    acompte: 15, scheduleMode: "auto",
    manualSchedule: [],
    selected: { pc: [], site: [], int: [] },
    manual: null
  };
  // Anciennes valeurs par défaut (≤ V7.6.1), utiles à la migration des réglages enregistrés.
  const LEGACY_DEFAULTS = { rate: 135, priceNeuf: 3500, priceReno: 900, pcMax: 5, pcMin: 3, siteMax: 10, siteMin: 7, degStart: 500000 };

  function toNum(v, fallback) {
    if (typeof v === "number") return Number.isFinite(v) ? v : (fallback || 0);
    if (v === null || v === undefined) return fallback || 0;
    let s = String(v).replace(/[\s\u00A0\u202F€]/g, "").replace(/m²|m2|%|h$/gi, "");
    if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");      // 300.000
    s = s.replace(",", ".");
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : (fallback || 0);
  }

  function ceilStep(v, step) {
    if (!(v > 0)) return 0;
    if (!(step > 0)) return v;
    return Math.ceil(v / step - 1e-9) * step;
  }

  // Taux en % des travaux : plein taux jusqu’à degStart, puis décroissance linéaire continue
  // jusqu’au taux plancher, atteint à degEnd (aucune rupture).
  function targetRates(works, t) {
    const w = Math.max(0, works);
    const a = Math.max(0, t.degStart), b = Math.max(a + 1, t.degEnd);
    const x = w <= a ? 0 : (w >= b ? 1 : (w - a) / (b - a));
    return { pc: t.pcMax + (t.pcMin - t.pcMax) * x, site: t.siteMax + (t.siteMin - t.siteMax) * x };
  }

  // Mode manuel (« déblocage général ») : normalisation des réglages saisis.
  const isSet = v => v !== null && v !== undefined && v !== "" && Number.isFinite(toNum(v, NaN));
  function normManual(m) {
    if (!m || !m.on) return null;
    const d = toNum(m.difficulty, 1);
    const out = { on: true, difficulty: d > 0 ? Math.min(5, Math.max(0.1, d)) : 1,
                  target: isSet(m.target) && toNum(m.target) > 0 ? Math.round(toNum(m.target) * 100) / 100 : 0,
                  phases: {}, missions: {} };
    ["pc", "site", "int"].forEach(k => { const v = m.phases && m.phases[k]; if (isSet(v) && toNum(v) >= 0) out.phases[k] = Math.round(toNum(v) * 100) / 100; });
    Object.keys(m.missions || {}).forEach(id => {
      const o = m.missions[id] || {}, r = {};
      if (isSet(o.price) && toNum(o.price) >= 0) r.price = Math.round(toNum(o.price) * 100) / 100;
      if (isSet(o.hours) && toNum(o.hours) >= 0) r.hours = toNum(o.hours);
      if ("price" in r || "hours" in r) out.missions[id] = r;
    });
    return out;
  }

  // Répartit un montant entre des missions selon des poids, arrondi à 10 €, somme exacte.
  function spread(list, amount, weight) {
    if (!list.length) return;
    let ws = list.map(weight);
    let tot = ws.reduce((a, b) => a + b, 0);
    if (!(tot > 0)) { ws = list.map(() => 1); tot = list.length; }
    const run = step => { let acc = 0; list.forEach((m, i) => {
      m.price = i === list.length - 1 ? Math.round((amount - acc) * 100) / 100 : Math.round(amount * ws[i] / tot / step) * step;
      acc += m.price; }); };
    run(10);
    if (list[list.length - 1].price < 0) run(1);
  }

  function compute(rawInput) {
    const man = normManual(rawInput && rawInput.manual);
    const auto = core(rawInput, null);
    if (!man) { auto.manual = { on: false }; return auto; }
    const r = core(rawInput, man);
    const missions = [];
    ["pc", "site", "int"].forEach(k => r.phases[k].missions.forEach((m, i) => {
      if (!m.selected) return;
      const a = auto.phases[k].missions[i];
      missions.push({ id: m.id, phase: k, name: m.name, computedPrice: a.price, retainedPrice: m.price,
                      computedHours: a.hours, retainedHours: m.hours, fixedPrice: m.fixed === true, fixedHours: m.hoursFixed === true });
    }));
    const delta = Math.round((r.totalHT - auto.totalHT) * 100) / 100;
    r.manual = Object.assign({}, r.manualTrace, {
      on: true, difficulty: man.difficulty, target: man.target,
      computedHT: auto.totalHT, retainedHT: r.totalHT, delta,
      deltaPct: auto.totalHT ? Math.round(delta / auto.totalHT * 10000) / 100 : 0,
      computedHours: auto.totalHours, retainedHours: r.totalHours,
      phases: { pc: { computed: auto.phases.pc.finalAmount, retained: r.phases.pc.finalAmount },
                site: { computed: auto.phases.site.finalAmount, retained: r.phases.site.finalAmount },
                int: { computed: auto.phases.int.finalAmount, retained: r.phases.int.finalAmount } },
      missions,
      belowMin: r.totalHT > 0 && r.totalHT < r.minFee
    });
    delete r.manualTrace;
    return r;
  }

  function core(rawInput, man) {
    const inp = Object.assign({}, DEFAULTS, rawInput || {});
    inp.targets = Object.assign({}, DEFAULTS.targets, (rawInput && rawInput.targets) || {});
    inp.selected = Object.assign({ pc: [], site: [], int: [] }, (rawInput && rawInput.selected) || {});
    const n = k => Math.max(0, toNum(inp[k], DEFAULTS[k]));
    const sn = n("sn"), sr = n("sr"), si = n("si"), works = n("works");
    const rateCabinet = n("rate");
    // Arbitrage du dossier : taux horaire ajusté pour coller au %, ou % ajustés pour coller au taux horaire.
    const rateOverride = Math.max(0, toNum(inp.rateOverride, 0));
    const rate = rateOverride > 0 ? rateOverride : rateCabinet;
    const ovr = v => (v === null || v === undefined || v === "") ? null : Math.max(0, toNum(v, 0));
    const pctOverride = { pc: ovr(inp.pctPc), site: ovr(inp.pctSite) };
    const complexity = toNum(inp.complexity, 1) || 1;
    const renoLevel = toNum(inp.renoLevel, 1.3) || 1;
    const intComplexity = toNum(inp.intComplexity, 1) || 1;
    const coef = { pc: toNum(inp.coefPc, 1) || 1, site: toNum(inp.coefSite, 1) || 1, int: toNum(inp.coefInt, 1) || 1 };
    const hoursScale = Math.min(3, Math.max(0.1, toNum(inp.hoursScale, DEFAULTS.hoursScale) || DEFAULTS.hoursScale));
    const difficulty = man ? man.difficulty : 1;
    const hourStep = toNum(inp.hourStep, 0.25);
    const priceStep = toNum(inp.priceStep, 50);
    const mode = ["auto", "time", "percent"].includes(inp.mode) ? inp.mode : "percent";
    const t = {};
    Object.keys(DEFAULTS.targets).forEach(k => { t[k] = toNum(inp.targets[k], DEFAULTS.targets[k]); });

    // Dégressivité : surface prise en compte linéaire jusqu’à 100 m², puis 100 × (S/100)^k (continu à 100 m²).
    const degress = Math.min(1, Math.max(0.4, toNum(inp.degress, 0.75)));
    const eff = S => S <= 100 ? S : 100 * Math.pow(S / 100, degress);
    const surfaces = { built: eff(sn + sr * renoLevel), existing: eff(sr), int: eff(si) };
    const noSurface = sn + sr + si <= 0;
    const refSurface = Math.max(sn + sr, si, 0);
    // Budget de référence = le plus élevé entre le budget saisi et l’estimation minimale au m².
    const priceNeuf = Math.max(0, toNum(inp.priceNeuf, DEFAULTS.priceNeuf));
    const priceReno = Math.max(0, toNum(inp.priceReno, DEFAULTS.priceReno));
    // Niveau de rénovation : « Légère » (1,15) = prix minimal ; standard et lourde majorent l’estimation.
    const renoFactor = Math.max(1, renoLevel / 1.15);
    const worksEstimate = sn * priceNeuf + sr * priceReno * renoFactor;
    // Budget retenu : le budget saisi prime ; l’estimation au m² ne sert que s’il n’est pas renseigné
    // (ou comme plancher si l’option « worksFloor » est activée).
    const worksFloor = inp.worksFloor === true || inp.worksFloor === "1" || inp.worksFloor === "true";
    const worksRef = works > 0 ? (worksFloor ? Math.max(works, worksEstimate) : works) : worksEstimate;
    const worksRaised = worksRef > works;
    const rates = targetRates(worksRef, t);
    // Complexité : coefficient appliqué au % (standard = 1, grille exacte).
    const effPct = {
      pc: pctOverride.pc !== null ? pctOverride.pc : rates.pc * complexity,
      site: pctOverride.site !== null ? pctOverride.site : rates.site * complexity, int: 0 };
    const phaseTarget = { pc: worksRef * effPct.pc / 100 * difficulty, site: worksRef * effPct.site / 100 * difficulty, int: 0 };

    const phases = {};
    PHASES.forEach(ph => {
      const sel = new Set(inp.selected[ph.key] || []);
      const factor = (ph.key === "int" ? intComplexity : complexity) * coef[ph.key] * hoursScale * difficulty;
      let hours = 0, wSel = 0, count = 0;
      const missions = MISSIONS[ph.key].map(m => {
        const on = sel.has(m.id);
        const raw = (m.base + m.m2 * surfaces[m.basis]) * factor;
        const mo = man && man.missions[m.id];
        const hoursFixed = !!(on && mo && "hours" in mo);
        const h = on ? (hoursFixed ? mo.hours : ceilStep(raw, hourStep)) : 0;
        if (on) { hours += h; wSel += m.w; count++; }
        return { id: m.id, code: m.code, name: m.name, short: m.short, long: m.long, grp: m.grp, selected: on,
                 hours: h, amount: h * rate, potentialHours: ceilStep(raw, hourStep), w: m.w, price: 0, hoursFixed };
      });
      const timeAmount = hours * rate;
      const percentShare = ph.key === "int" ? 0 : wSel / 100;
      const percentAmount = phaseTarget[ph.key] * percentShare;
      let raw;
      if (ph.key === "int" || mode === "time") raw = timeAmount;
      else if (mode === "percent") raw = percentAmount;
      else raw = Math.max(timeAmount, percentAmount);
      const finalAmount = count && (!noSurface || man) ? ceilStep(raw, priceStep) : 0;
      const driver = ph.key === "int" || mode === "time" ? "time" : (mode === "percent" ? "percent" : (percentAmount > timeAmount ? "percent" : "time"));
      phases[ph.key] = { key: ph.key, title: ph.title, missions, hours, count, timeAmount, percentAmount,
                         percentShare, targetRate: effPct[ph.key], gridRate: ph.key === "int" ? 0 : rates[ph.key] * complexity,
                         finalAmount, driver };
    });

    // Minimum facturable par mission (contrat) : relèvement réparti au prorata des phases.
    const minFee = Math.max(0, toNum(inp.minFee, DEFAULTS.minFee));
    const before = phases.pc.finalAmount + phases.site.finalAmount + phases.int.finalAmount;
    let minApplied = false;
    // Formule « au temps passé » : prix de chaque mission = heures indicatives × taux horaire client,
    // sans arrondi ni minimum ; le total est une estimation, la facture définitive suit le temps réel.
    const temps = inp.billing === "temps";
    const clientRate = Math.max(0, toNum(inp.clientRate, 0)) || rate;
    if (temps) {
      ["pc", "site", "int"].forEach(k => {
        const P = phases[k];
        P.missions.forEach(m => { if (m.selected) m.price = Math.round(m.hours * clientRate * 100) / 100; });
        P.finalAmount = P.count ? Math.round(P.missions.reduce((a, m) => a + (m.selected ? m.price : 0), 0) * 100) / 100 : 0;
        P.driver = "time";
      });
    }
    if (!temps && !man && before > 0 && before < minFee) {
      minApplied = true;
      const keys = ["pc", "site", "int"].filter(k => phases[k].finalAmount > 0);
      let acc = 0;
      keys.forEach((k, i) => {
        const v = i === keys.length - 1 ? minFee - acc : Math.round(minFee * phases[k].finalAmount / before);
        phases[k].finalAmount = v; acc += v;
      });
    }
    // Prix contractuel par mission : répartition du montant de phase (poids si le % fixe le prix, heures sinon),
    // arrondi à 10 €, la dernière mission absorbe l’écart pour que la somme soit exacte.
    ["pc", "site", "int"].forEach(k => {
      const P = phases[k];
      const sel = P.missions.filter(m => m.selected);
      if (temps || !P.finalAmount || !sel.length) return;
      const usePct = k !== "int" && P.driver === "percent" && sel.every(m => m.w > 0);
      const key = m => usePct ? m.w : (m.hours || 1);
      const tot = sel.reduce((a, m) => a + key(m), 0);
      let acc = 0;
      sel.forEach((m, i) => {
        m.price = i === sel.length - 1 ? P.finalAmount - acc : Math.round(P.finalAmount * key(m) / tot / 10) * 10;
        acc += m.price;
      });
      if (sel[sel.length - 1].price < 0) { acc = 0; sel.forEach((m, i) => { m.price = i === sel.length - 1 ? P.finalAmount - acc : Math.round(P.finalAmount * key(m) / tot); acc += m.price; }); }
    });
    // Mode manuel : prix fixés par mission, puis par phase, puis total HT cible réparti sur les prix libres.
    let manualTrace = null;
    if (man && temps) {
      const ignored = man.target > 0 || Object.keys(man.phases).length || Object.values(man.missions).some(o => "price" in o);
      manualTrace = { warnings: ignored ? ["Formule au temps passé : seuls les heures et le coefficient de difficulté s’appliquent (prix, prix de phase et total cible ignorés)."] : [] };
    } else if (man) {
      const warnings = [];
      const keys = ["pc", "site", "int"];
      const selOf = k => phases[k].missions.filter(m => m.selected);
      const sum = list => Math.round(list.reduce((a, m) => a + (m.price || 0), 0) * 100) / 100;
      keys.forEach(k => selOf(k).forEach(m => {
        m.base = m.price;
        const mo = man.missions[m.id];
        if (mo && "price" in mo) { m.price = mo.price; m.fixed = true; }
      }));
      const phaseFixed = {};
      keys.forEach(k => {
        const sel = selOf(k);
        if (!sel.length) return;
        const free = sel.filter(m => !m.fixed);
        if (k in man.phases) {
          const P = man.phases[k];
          const rem = P - sum(sel.filter(m => m.fixed));
          if (free.length && rem >= 0) { spread(free, rem, m => m.base); phaseFixed[k] = true; }
          else warnings.push(free.length
            ? `Prix de la phase « ${phases[k].title} » inférieur aux prix de missions fixés : il n’est pas appliqué.`
            : `Prix de la phase « ${phases[k].title} » non appliqué : toutes ses missions ont un prix fixé.`);
        }
      });
      if (man.target > 0) {
        const free = [], locked = [];
        keys.forEach(k => selOf(k).forEach(m => ((phaseFixed[k] || m.fixed) ? locked : free).push(m)));
        const rem = Math.round((man.target - sum(locked)) * 100) / 100;
        if (free.length && rem >= 0) spread(free, rem, m => m.base);
        else warnings.push(free.length
          ? "Total cible inférieur aux prix déjà fixés : la cible n’est pas atteinte."
          : "Total cible non appliqué : tous les prix sont fixés (missions ou phases).");
      }
      keys.forEach(k => { const sel = selOf(k); phases[k].finalAmount = sel.length ? sum(sel) : 0; sel.forEach(m => delete m.base); });
      manualTrace = { warnings };
    }
    const totalHT = Math.round((phases.pc.finalAmount + phases.site.finalAmount + phases.int.finalAmount) * 100) / 100;

    // Valeurs d'arbitrage proposées (conception + chantier, hors intérieur).
    const ps = ["pc", "site"].filter(k => phases[k].count > 0);
    const hPS = ps.reduce((a, k) => a + phases[k].hours, 0);
    const pctPS = ps.reduce((a, k) => a + phases[k].percentAmount, 0);
    const arbitrage = {
      available: ps.length > 0 && hPS > 0 && worksRef > 0,
      rateForPercent: hPS > 0 ? Math.round(pctPS / hPS) : 0,
      pctForRate: {}
    };
    ps.forEach(k => {
      const P = phases[k];
      arbitrage.pctForRate[k] = (worksRef > 0 && P.percentShare > 0) ? Math.round(P.timeAmount / (worksRef * P.percentShare) * 10000) / 100 : null;
    });
    const vatRate = inp.vatRegime === "franchise" ? 0 : Math.max(0, toNum(inp.vat, 20));
    const tva = Math.round(totalHT * vatRate) / 100;
    const totalTTC = Math.round((totalHT + tva) * 100) / 100;
    // Assurance de l'opération : coût saisi, refacturé au client, hors honoraires (ni minimum ni rentabilité).
    const insuranceHT = Math.max(0, Math.round(toNum(inp.insuranceHT, 0) * 100) / 100);
    const insuranceLabel = String(inp.insuranceLabel || "").trim() || "Assurance de l’opération";
    const grandHT = Math.round((totalHT + insuranceHT) * 100) / 100;
    const grandTVA = Math.round(grandHT * vatRate) / 100;
    const grandTTC = Math.round((grandHT + grandTVA) * 100) / 100;
    const sched = schedule(phases, totalHT, inp);
    if (insuranceHT > 0) sched.unshift({ label: insuranceLabel + " — à la signature", amount: insuranceHT, insurance: true });
    const totalHours = phases.pc.hours + phases.site.hours + phases.int.hours;
    const effectiveRate = totalHours ? totalHT / totalHours : 0;
    const ratioWorks = worksRef ? (phases.pc.finalAmount + phases.site.finalAmount) / worksRef * 100 : 0;
    const belowRate = totalHours > 0 && rate > 0 && totalHT > 0 && totalHT / totalHours < rate;

    return {
      noSurface,
      input: { sn, sr, si, degress, works, worksRef, priceNeuf, priceReno, rate, complexity, renoLevel, intComplexity, coef, mode, hourStep, priceStep, hoursScale, worksFloor },
      billing: temps ? "temps" : "forfait", clientRate: temps ? clientRate : 0,
      surfaces, refSurface, rates, effPct, phaseTarget, phases, worksEstimate, worksRef, worksRaised, belowRate,
      minFee, minApplied, arbitrage, rateCabinet, rateOverride, pctOverride,
      totalHT, vatRate, tva, totalTTC, totalHours, effectiveRate, ratioWorks,
      insuranceHT, insuranceLabel, grandHT, grandTVA, grandTTC,
      schedule: sched,
      manualTrace
    };
  }

  // Échéancier automatique : acompte sur la première phase retenue, puis jalons pondérés par mission.
  function schedule(phases, totalHT, inp) {
    if (!totalHT) return [];
    if (inp.scheduleMode === "manual" && Array.isArray(inp.manualSchedule) && inp.manualSchedule.length) {
      const rows = inp.manualSchedule.filter(r => r && (r.label || toNum(r.pct)))
        .map(r => ({ label: String(r.label || "Échéance"), amount: Math.round(totalHT * toNum(r.pct) / 100) }));
      return fixRounding(rows, totalHT);
    }
    const acompteRate = Math.min(50, Math.max(0, toNum(inp.acompte, 15))) / 100;
    const order = ["pc", "int", "site"];
    const first = order.find(k => phases[k].finalAmount > 0);
    const rows = [];
    // Chaque échéance = somme exacte des prix des missions du jalon ; l’acompte est déduit
    // des premières échéances de la première phase (en cascade), sans proportionnalité.
    const acompte = first && acompteRate > 0 ? Math.round(phases[first].finalAmount * acompteRate) : 0;
    if (acompte) rows.push({ label: "__ACOMPTE__", amount: acompte });
    ["pc", "site", "int"].forEach(k => {
      const ph = phases[k];
      if (!ph.finalAmount) return;
      const groups = {};
      ph.missions.filter(m => m.selected).forEach(m => { groups[m.grp] = (groups[m.grp] || 0) + (m.price || 0); });
      let toDeduct = k === first ? acompte : 0;
      Object.keys(MILESTONES).forEach(g => {
        if (!(g in groups)) return;
        let v = groups[g];
        const d = Math.min(v, toDeduct); v -= d; toDeduct -= d;
        if (v > 0) rows.push({ label: MILESTONES[g], amount: v });
      });
    });
    return fixRounding(rows, totalHT);
  }
  function fixRounding(rows, total) {
    if (!rows.length) return rows;
    const sum = rows.reduce((a, r) => a + r.amount, 0);
    rows[rows.length - 1].amount += Math.round(total - sum);
    return rows;
  }

  const api = { MISSIONS, PHASES, MILESTONES, PRESETS, DEFAULTS, LEGACY_DEFAULTS, compute, normManual, targetRates, toNum, ceilStep };
  root.StateraEngine = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : this);
