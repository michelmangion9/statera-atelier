/* STATERA — contrat d'architecte, modèle MC-2026.11 (V9) — structure du contrat type de l'Ordre « client privé »
 * Rédaction, contrôle de conformité et pagination A4.
 * build() et compliance() sont purs (testables sous Node) ; paginate() utilise le DOM.
 * Sources citées dans le texte : loi n° 77-2 du 3 janvier 1977 (art. 3, 16, 18) ;
 * code de déontologie des architectes (décret n° 80-217 modifié par le décret n° 2026-568
 * du 26 juin 2026 : art. 11, 15, 29, 33, 36 à 40, 46) ; code des assurances (L.242-1, L.243-2) ;
 * code de la consommation (L.221-5, L.221-10, L.221-18, L.221-25, L.612-1, L.616-1) ;
 * code de la propriété intellectuelle (L.111-1) ; code de commerce (L.441-10, D.441-5) ;
 * code de la consommation (L.214-1, L.313-41, L.313-42) ; CCH (L.126-35-2, L.132-4, L.132-6, L.271-4) ;
 * code civil (1792 s., 1799-1) ; loi 75-1334 ; loi 78-12 ; code du travail (L.4532-7) ; code du patrimoine (L.650-2).
 * À FAIRE VALIDER par un avocat ou par le conseil régional de l'Ordre avant usage.
 */
(function (root) {
  "use strict";
  const MODEL = "MC-2026.11";

  const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
  const nf2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const euro = v => { const n = Number.isFinite(v) ? v : 0; return (Math.abs(n - Math.round(n)) < 0.005 ? nf0.format(Math.round(n)) : nf2.format(n)) + " €"; };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const longDate = iso => {
    if (!iso) return "";
    const d = new Date(iso + "T12:00:00");
    return isNaN(d) ? "" : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  };
  const blank = (v, w) => v ? esc(v) : `<span class="blank" style="min-width:${w || 34}mm"></span>`;
  const lc1 = t => t ? t.charAt(0).toLowerCase() + t.slice(1) : t;
  const s = v => String(v == null ? "" : v).trim();

  /* ---------- Conformité ---------- */
  // blockers : empêchent de transmettre le contrat (bandeau « PROJET NON CONFORME ») ;
  // warnings : points à vérifier. Aucun chiffre interne (heures, taux, écart) n'y figure.
  function compliance(ctx) {
    const { A = {}, C = {}, P = {}, r, lc = {}, S = {} } = ctx || {};
    const blockers = [], warnings = [];
    const B = (code, msg) => blockers.push({ code, msg });
    const W = (code, msg) => warnings.push({ code, msg });

    if (!s(C.last) && !s(C.company)) B("client", "Nom du client manquant.");
    if (!s(C.address)) B("clientAddress", "Adresse du client manquante.");
    if (!s(P.name)) B("project", "Nom de l’opération manquant.");
    if (!s(P.loc)) B("projectLocation", "Adresse de l’opération manquante.");
    if (!r || !(r.totalHT > 0)) B("fee", "Aucune mission chiffrée : honoraires nuls.");
    const nSel = r ? ["pc", "site", "int"].reduce((a, k) => a + (r.phases[k] ? r.phases[k].count : 0), 0) : 0;
    if (!nSel) B("missions", "Aucune mission sélectionnée.");
    // Identification de l'architecte
    if (!s(A.full) || !s(A.address) || !s(A.siren)) B("arch", "Identification de l’architecte incomplète (nom, adresse, SIREN).");
    if (!s(A.orderNo)) B("order", "Numéro d’inscription à l’Ordre manquant.");
    // Assurance (loi 77-2, art. 16) : attestation jointe au contrat
    if (!s(A.insurer)) B("insurer", "Assureur de responsabilité professionnelle manquant (loi 77-2, art. 16).");
    if (!s(A.policy)) B("policy", "Numéro de police d’assurance manquant (loi 77-2, art. 16).");
    if (!s(A.policyEnd)) W("policyPeriod", "Période de validité de la police non renseignée.");
    else if (ctx.date && A.policyEnd < ctx.date) B("policyExpired", "La période d’assurance renseignée est échue à la date du contrat.");
    if (!s(A.insurerAddress)) W("insurerAddress", "Adresse de l’assureur non renseignée.");
    // Liens d'intérêt (loi 77-2, art. 18 ; code de déontologie, art. 15 et 29)
    if (!s(A.links)) B("links", "Déclaration des liens d’intérêt à renseigner (loi 77-2, art. 18 ; déontologie, art. 15).");
    // Consommateur : médiation (C. consom., L.612-1 et L.616-1)
    if (lc.consumer) {
      if (!s(A.mediator)) B("mediator", "Médiateur de la consommation non désigné (C. consom., L.612-1).");
      else if (!A.mediatorMember) B("mediatorMember", "Adhésion au médiateur de la consommation non confirmée.");
      if (!s(A.mediatorContact)) W("mediatorContact", "Coordonnées du médiateur à indiquer (site internet, adresse).");
    }
    if (lc.retract && !s(A.email) && !s(A.address)) B("retractAddress", "Aucune adresse pour notifier la rétractation.");
    // Paiement
    const pd = Number(S.paymentDays);
    if (!(pd >= 0)) W("paymentDays", "Délai de paiement non renseigné.");
    else if (!lc.consumer && pd > 60) B("paymentDaysPro", "Délai de paiement supérieur à 60 jours (C. com., L.441-10).");
    if (S.scheduleOk === false) B("schedule", "L’échéancier manuel ne totalise pas 100 %.");
    if (!(Number(S.validationDays) > 0)) W("validationDays", "Délai de validation des étapes non renseigné.");
    if (!s(A.iban)) W("iban", "IBAN non renseigné : le client ne pourra pas payer par virement sans le demander.");
    if (!s(A.email)) W("email", "Adresse électronique de l’architecte non renseignée.");
    if (!lc.consumer && !s(C.siren)) W("clientSiren", "SIREN du client professionnel non renseigné (utile pour la facturation).");
    if (r && r.phases && r.phases.site && r.phases.site.count) W("do", "Mission chantier : rappeler au client l’assurance dommages-ouvrage (C. assur., L.242-1).");
    if ((S.billing === "temps" || (r && r.billing === "temps")) && !(Number(S.overrunPct) > 0)) W("overrun", "Formule au temps passé : aucun seuil de dépassement fixé (accord écrit exigé pour tout dépassement).");
    if (!s(P.program)) W("program", "Programme du projet non décrit : seul le métrage figurera au contrat.");
    if (r && r.input && r.input.sn > 0 && !s(P.geotech)) W("geotech", "Construction neuve : indiquer si l’étude géotechnique (zone d’argiles, CCH L.132-4) a été remise.");
    if (r && r.input && r.input.sn > 0 && !(Number(P.landArea) > 0)) W("landArea", "Surface du terrain non renseignée.");
    if (lc.consumer && s(P.loan) === "loan" && !s(P.loanDetail)) W("loanDetail", "Prêt envisagé : préciser l’organisme ou le montant (condition suspensive, C. consom. L.313-41).");
    return { blockers, warnings, ok: blockers.length === 0 };
  }

  /* ---------- Rédaction ---------- */
  // Structure alignée sur le modèle de contrat de l'Ordre des architectes « Contrat d'architecte — client privé »
  // (18 articles), complétée des mentions propres à STATERA : liens d'intérêt (loi 77-2, art. 18), formule au
  // temps passé (C. consom., L.112-3), assurance de l'opération refacturée, annexes de suivi.
  // Un paragraphe commençant par « ## » est un sous-titre ; un paragraphe commençant par « < » est un bloc HTML brut.
  function build(ctx) {
    const { A = {}, C = {}, P = {}, r, lc = {}, S = {} } = ctx;
    const cl = k => !S.clauses || S.clauses[k] !== false;
    const person = `${s(C.first)} ${s(C.last)}`.trim();
    const clientName = s(C.company) ? (person ? `${s(C.company)}, représentée par ${person}` : s(C.company)) : person;
    const sel = k => (r.phases[k] && r.phases[k].missions.filter(m => m.selected)) || [];
    const has = id => ["pc", "site", "int"].some(k => sel(k).some(m => m.id === id));
    const phases = ["pc", "site", "int"].map(k => r.phases[k]).filter(p => p && p.count);
    const hasSite = !!(r.phases.site && r.phases.site.count);
    const hasDet = has("det");
    const conception = ["esq", "aps", "apd", "dp", "pcm"].some(has);
    const complete = ["esq", "aps", "apd"].some(has) && ["dce", "act"].some(has) && hasDet && has("aor");
    const vatTxt = r.vatRate ? `TVA au taux de ${nf2.format(r.vatRate).replace(/,00$/, "")} %` : "TVA non applicable, art. 293 B du CGI";
    const ttc = v => Math.round(v * (100 + (r.vatRate || 0))) / 100;
    const ht = v => `${euro(v)} HT${r.vatRate ? `, soit ${euro(ttc(v))} TTC` : ""}`;
    const notice = Math.max(1, Math.round(Number(S.noticePeriod) || 15));
    const vdays = Math.max(1, Math.round(Number(S.validationDays) || 15));
    const xdays = Math.max(1, Math.round(Number(S.execDays) || 20));
    const pdays = Math.max(0, Math.round(Number(S.paymentDays) || 0));
    const resil = Math.max(0, Math.min(100, Number(S.resilPct) >= 0 && S.resilPct !== "" && S.resilPct != null ? Number(S.resilPct) : 20));
    const surf = (r.input.sn || 0) + (r.input.sr || 0) + (r.input.si || 0);
    const retract = !!lc.retract;
    const consumer = !!lc.consumer;
    const temps = S.billing === "temps" || r.billing === "temps";
    const rate = r.clientRate || Number(S.clientRate) || 0;
    const hf = h => nf2.format(h).replace(/,00$/, "").replace(/(,\d)0$/, "$1") + " h";
    const overrun = Math.max(0, Math.round(Number(S.overrunPct) || 0));
    const box = on => `<span class="cbx${on ? " on" : ""}" aria-label="${on ? "case cochée" : "case non cochée"}"></span>`;
    const contact = [A.phone, A.email].filter(v => s(v)).join(", ");

    const arts = [];
    const art = (title, ...paras) => arts.push({ title, paras: paras.flat(Infinity).filter(Boolean) });

    /* 1 */
    art("Parties contractantes",
      `<b>Le client</b>, également désigné le maître d’ouvrage : ${esc(clientName)}${s(C.company) ? "" : ", contractant en son nom personnel"}, demeurant ${esc(C.address)}${s(C.siren) ? `, SIREN ${esc(C.siren)}` : ""}${[C.phone, C.email].filter(v => s(v)).length ? ` (${esc([C.phone, C.email].filter(v => s(v)).join(", "))})` : ""}${consumer ? ", agissant en qualité de consommateur au sens de l’article liminaire du code de la consommation" : ""}, ci-après « le client ».`,
      `<b>L’architecte</b> : ${esc(A.full)}, ${esc(lc1(A.form))}, contractant en son nom personnel, exerçant sous le nom commercial ${esc(A.brand)}, SIREN ${esc(A.siren)}${s(A.siret) ? `, SIRET ${esc(A.siret)}` : ""}${s(A.tva) ? `, TVA ${esc(A.tva)}` : ""}. Titre professionnel : architecte ; État membre d’octroi du titre : France. Inscrit au tableau du ${esc(A.orderOrg)} sous le numéro national ${esc(A.orderNo)}. Adresse professionnelle : ${esc(A.address)}${contact ? ` (${esc(contact)})` : ""}. Ci-après « l’architecte ».`,
      `Ci-après désignés ensemble les « parties » et individuellement la « partie ». Conformément à l’article 11 du code de déontologie des architectes, qui fait obligation de recourir à une convention écrite préalable à tout engagement professionnel, il est convenu ce qui suit.`);

    /* 2 */
    const prog = [];
    if (r.input.sn) prog.push(`${nf0.format(r.input.sn)} m² en construction neuve ou extension`);
    if (r.input.sr) prog.push(`${nf0.format(r.input.sr)} m² en rénovation`);
    if (r.input.si) prog.push(`${nf0.format(r.input.si)} m² en architecture intérieure`);
    const geo = s(P.geotech);
    const geoTxt = geo === "received"
      ? "En ce qui concerne les risques liés aux sols argileux, le client a remis à l’architecte l’étude géotechnique prévue aux articles L.132-5 et L.132-6 du code de la construction et de l’habitation ; l’architecte en tient compte dans la conception du projet (art. L.132-7 du même code)."
      : geo === "notreceived"
        ? "En ce qui concerne les risques liés aux sols argileux, il est précisé que l’architecte n’a pas reçu l’étude géotechnique prévue aux articles L.132-5 et L.132-6 du code de la construction et de l’habitation et que les prestations dont il assure la maîtrise d’œuvre n’intègrent pas les mesures rendues nécessaires par le risque de mouvement de terrain différentiel consécutif à la sécheresse et à la réhydratation des sols (art. L.132-6 du même code)."
        : "";
    art("Informations concernant le projet",
      `Opération : « ${esc(P.name)} ». Adresse de réalisation des travaux : ${esc(P.loc)}${s(P.cad) ? ` ; références cadastrales : ${esc(P.cad)}` : ""}${Number(P.landArea) > 0 ? ` ; surface foncière du terrain : ${nf0.format(Number(P.landArea))} m²` : ""}${surf ? ` ; surface indicative du projet : ${nf0.format(surf)} m²` : ""}.`,
      `Nature du projet${prog.length ? ` (${prog.join(", ")})` : ""} : ${s(P.program) ? esc(s(P.program).replace(/[.\s]+$/, "")).replace(/\n/g, "<br>") : "telle que définie par le client lors des premiers échanges et précisée à l’esquisse"}. L’opération est destinée à un usage ${P.usage === "professionnel" ? "professionnel" : "personnel"}.`,
      "## 2.1 — Programme et contraintes",
      cl("cl1") ? `Le client s’oblige à fournir à l’architecte, en temps utile et sous sa responsabilité : son programme, qui définit ses attentes et ses besoins ; les données juridiques, notamment titres de propriété, servitudes, certificat d’urbanisme, limites séparatives, règlement de copropriété, règlement et cahier des charges de lotissement ; les éventuelles études antérieures et, le cas échéant, leur appréciation par l’administration ; les données techniques, notamment relevés de géomètre, plan de bornage, résultats et analyse de la campagne de sondages.` : "",
      `Le client s’engage à effectuer la déclaration de projet de travaux à proximité des réseaux souterrains, aériens ou subaquatiques et des canalisations (DT) auprès de chaque exploitant, par le téléservice « Construire sans détruire » (www.reseaux-et-canalisations.ineris.fr).`,
      `Le client fournit l’ensemble des diagnostics techniques nécessaires au projet et requis selon le type d’immeuble, sa localisation, sa destination, son statut ou la nature des travaux (dossier de diagnostic technique, art. L.271-4 à L.271-6 du code de la construction et de l’habitation ; carnet d’information du logement, art. L.126-35-2 ; diagnostic technique global, art. L.731-1 ; étude géotechnique en zone d’exposition au retrait-gonflement des argiles, art. L.132-4 et suivants).`,
      geoTxt,
      "## 2.2 — Mission confiée à l’architecte",
      `${box(complete)} Le client confie une mission complète à l’architecte, comprenant la conception du projet architectural, la sélection des entreprises et l’organisation du chantier, la direction des travaux et l’assistance aux opérations de réception.`,
      `${box(!complete)} Le client confie à l’architecte une mission partielle, librement définie par les parties, correspondant aux éléments de mission cochés ci-dessous et décrits à l’article 5.`,
      `<table class="c-tab c-miss">${["pc", "site", "int"].filter(k => k !== "int" || sel("int").length).map(k => `<tr class="grp"><td colspan="2">${esc(r.phases[k].title)}</td></tr>` + r.phases[k].missions.map(m => `<tr><td class="b">${box(m.selected)}</td><td>${m.code ? `<span class="code">${esc(m.code)}</span> ` : ""}${esc(m.name)}</td></tr>`).join("")).join("")}</table>`,
      conception && !hasDet ? `<table class="c-tab c-miss"><tr class="grp"><td colspan="2">Suivi de la conformité architecturale en phase chantier (hors DET)</td></tr><tr><td class="b">${box(!!P.suiviConf)}</td><td>Avis architectural sur les études d’exécution et suivi architectural de la réalisation</td></tr></table>` : "",
      conception && !hasDet ? `La direction de l’exécution des travaux n’étant pas confiée à l’architecte, le client la confie à un maître d’œuvre d’exécution dûment assuré, dont il communique à l’architecte les coordonnées et l’attestation d’assurance (article 10.1).` : "");

    /* 3 */
    art("Pièces contractuelles",
      `Les pièces constitutives du contrat sont, par ordre de priorité décroissant : le présent contrat ; l’annexe 1 (missions et prix) ; l’annexe 2 (attestation d’assurance de l’architecte) ; l’annexe 3 (déclaration des liens d’intérêt) ; l’annexe 4 (validation des étapes) ; l’annexe 5 (formulaire de rétractation${retract ? "" : ", sans objet pour ce contrat"}) ; les éléments de programmation du client ; la proposition d’honoraires réf. ${esc(ctx.ref)}. Ces pièces sont complémentaires et indissociables.`);

    /* 4 */
    const loan = s(P.loan);
    const showWorks = S.showWorks !== false && r.input.worksRef;
    art("Budget travaux et montant de la rémunération",
      "## 4.1 — Budget travaux du client",
      showWorks ? `Au jour de la signature du contrat, le client déclare disposer pour les travaux d’un budget de ${euro(Math.round(r.input.worksRef / 100) * 100)} HT, voirie et réseaux divers compris.${cl("cl3") ? " Ce budget constitue une référence pour l’établissement du projet et non un engagement de prix : le coût final dépend des choix du client, des offres des entreprises et des aléas." : ""}` : `Le client précise le budget dont il dispose pour les travaux au plus tard à l’esquisse.`,
      `Il est informé qu’à ce montant s’ajoutent les honoraires de l’architecte et d’autres dépenses à sa charge, notamment taxe d’aménagement, frais de raccordement aux réseaux, étude de sol, étude thermique, relevé de géomètre, assurance dommages-ouvrage.`,
      r.input.sr ? `En cas de travaux sur existant, le client reconnaît avoir connaissance du risque de travaux supplémentaires nécessaires et non prévus, découverts en cours de réalisation, et s’engage à les prendre en charge. L’architecte l’assiste dans la recherche d’adaptations financières lorsque cela est possible.` : "",
      `Conformément à l’article 36 du code de déontologie, l’architecte informe le client s’il estime ce budget manifestement insuffisant, et ne prend aucune décision ni ne donne aucun ordre pouvant entraîner une dépense non prévue ou non approuvée par le client.`,
      "## 4.2 — Montant de la rémunération de l’architecte",
      temps
        ? `La rémunération est calculée au temps passé, au taux de <b>${euro(rate)} HT de l’heure</b>${r.vatRate ? ` (${euro(ttc(rate))} TTC)` : ""}. À titre indicatif, le temps nécessaire est estimé à <b>${hf(r.totalHours)}</b>, soit <b>${ht(r.totalHT)}</b>. Cette estimation ne constitue pas un forfait (article 8).`
        : `Le montant forfaitaire de la rémunération de l’architecte est fixé à <b>${euro(r.totalHT)} HT</b>${r.vatRate ? `, soit ${euro(r.tva)} de TVA (${esc(vatTxt)}) et <b>${euro(r.totalTTC)} TTC</b>` : `, ${esc(vatTxt)}`}.`,
      `Sa décomposition par élément de mission, ses modalités et ses conditions d’évolution sont définies à l’article 8 et à l’annexe 1.`,
      r.insuranceHT > 0 ? `S’ajoute aux honoraires, au titre du poste « ${esc(r.insuranceLabel)} », la somme de <b>${ht(r.insuranceHT)}</b>, correspondant au coût de l’assurance pour cette opération. Elle est refacturée au client sans marge, sur justificatif, et payable ${lc.offPremisesConsumer ? "au plus tôt sept jours après la conclusion du contrat (art. L.221-10 du code de la consommation)" : "à la signature du contrat"}. Elle ne constitue pas une rémunération de l’architecte.` : "",
      consumer ? "## 4.3 — Protection des emprunteurs dans le domaine immobilier" : "",
      consumer ? `Lorsque le client a recours à un prêt pour financer les dépenses de l’opération, il bénéficie d’un régime protecteur obligatoire, sauf si le prêt est destiné à financer une activité professionnelle (art. L.313-1 et suivants du code de la consommation).` : "",
      consumer && loan === "loan" ? `Le client déclare recourir à un ou plusieurs prêts pour financer l’opération${s(P.loanDetail) ? ` (${esc(P.loanDetail)})` : ""}. Le présent contrat est conclu sous la condition suspensive de l’obtention de ce ou ces prêts (art. L.313-41 du code de la consommation). La condition court à compter de la signature du contrat, pour une durée de ${Math.max(1, Math.round(Number(P.loanMonths) || 1))} mois. Le client s’engage à solliciter plusieurs établissements de crédit et à fournir à bref délai à l’architecte une copie des offres reçues. Si la condition n’est pas réalisée dans ce délai, toute somme versée d’avance par le client à l’architecte lui est immédiatement et intégralement remboursée, sans retenue ni indemnité à quelque titre que ce soit.` : "",
      consumer && loan !== "loan" ? `Le client déclare ne pas recourir à un prêt. Il recopie de sa main, en toutes lettres, la mention suivante (art. L.313-42 du code de la consommation) : « Je soussigné(e) ………………………… (nom et prénom), maître d’ouvrage, déclare ne pas demander de prêt pour la réalisation de cette opération et reconnais avoir été informé(e) des conséquences de ma renonciation et notamment du fait que, si je recourais néanmoins à un prêt, je ne pourrais me prévaloir du bénéfice des dispositions protectrices du code de la consommation relatives au crédit immobilier. »` : "",
      consumer && loan !== "loan" ? `La mention est portée de la main du client sur l’exemplaire papier ; en cas de signature électronique, elle est apposée par un procédé garantissant qu’elle ne peut l’être que par lui (art. 1174 du code civil).` : "",
      consumer && loan !== "loan" ? `<div class="c-manus"><div class="lbl">Mention manuscrite du client</div><div class="lines"><i></i><i></i><i></i><i></i><i></i></div></div>` : "");

    /* 5 */
    const CNOA_DESC = {
      esq: "Sur la base du programme du client, l’architecte établit si besoin le relevé de l’existant, sauf s’il est fourni par le client dans une version exploitable. Il propose une ou plusieurs esquisses répondant au programme, qui précisent l’implantation et l’adaptation au terrain, l’orientation, les accès, l’enveloppe extérieure et ses ouvertures principales, l’organisation des espaces et leurs liaisons et, le cas échéant, les solutions d’amélioration de l’existant. Il établit pour chacune un coût prévisionnel indicatif des travaux et un calendrier prévisionnel.",
      aps: "L’architecte précise les dimensions de l’ouvrage et son aspect, présente les solutions retenues et détermine les surfaces des éléments du programme. Ces documents ne peuvent en aucun cas être utilisés directement pour réaliser la construction.",
      apd: "L’architecte arrête les surfaces, établit la notice descriptive précisant la nature des matériaux extérieurs et intérieurs et s’assure que l’estimation du coût prévisionnel des travaux reste cohérente avec le budget du client, déduction faite des travaux que celui-ci se réserve. En cas d’incohérence notable, les parties se rencontrent pour décider de la suite à donner au contrat. Toute modification du programme donne lieu à un avenant.",
      dp: "L’architecte établit et signe les documents graphiques et autres pièces écrites de sa compétence nécessaires au dossier de déclaration préalable, et assiste le client pour la constitution du dossier administratif après lui avoir indiqué son contenu obligatoire. Le client signe le dossier et le dépose auprès du service instructeur.",
      pcm: "L’architecte établit et signe les documents graphiques et autres pièces écrites de sa compétence nécessaires au dossier de demande de permis de construire, et assiste le client pour la constitution du dossier administratif après lui avoir indiqué son contenu obligatoire. Le client signe le dossier et le dépose auprès du service instructeur. Après le dépôt, l’architecte assiste le client, à sa demande, dans ses rapports avec l’administration ; le client l’informe de tout échange avec celle-ci, lui transmet copie de l’arrêté et de ses annexes et procède à l’affichage réglementaire sur le terrain. Ces documents ne peuvent en aucun cas être utilisés directement pour réaliser la construction."
    };
    art("Contenu des éléments de mission",
      `La mission confiée à l’architecte se décompose en éléments dont le contenu est défini ci-après. Les missions sont accomplies par l’architecte lui-même ou sous sa direction (art. 33 du code de déontologie) ; il peut se faire assister des collaborateurs de son choix. Il ne sous-traite pas la conception architecturale ; tout recours à un sous-traitant ou à un cotraitant spécialiste est soumis à l’accord préalable écrit du client sur l’intervenant et ses conditions de paiement (art. 37).`,
      phases.map(p => [`## ${esc(p.title)}`].concat(p.missions.filter(m => m.selected).map(m => `<b>${m.code ? esc(m.code) + " — " : ""}${esc(m.name)}.</b> ${esc(m.long)}${CNOA_DESC[m.id] ? " " + CNOA_DESC[m.id] : ""}`))),
      conception && !hasDet && P.suiviConf ? [`## Suivi de la conformité architecturale en phase chantier`,
        `Ce suivi consiste à s’assurer, au stade des études d’exécution et de la réalisation, que l’état apparent et accessible des ouvrages est en concordance avec les dispositions du projet architectural conçu par l’architecte ; il exclut toute vérification technique, qui relève du maître d’œuvre d’exécution. Il est conditionné à la communication par le client des coordonnées et de l’attestation d’assurance de ce maître d’œuvre. Le client communique les études d’exécution à l’architecte dans un délai de 60 jours à compter de leur réception ; l’architecte remet son avis dans un délai de ${vdays} jours ; à défaut d’observations écrites dans ce délai, les études sont réputées validées. ${rate ? `Cette prestation est rémunérée au temps passé, au taux de ${euro(rate)} HT de l’heure${r.vatRate ? ` (${euro(ttc(rate))} TTC)` : ""}, sur relevé.` : "Sa rémunération est fixée par avenant."}`] : "",
      `${cl("cl2") ? "L’obtention des autorisations d’urbanisme relève de l’autorité compétente et ne peut être garantie. " : ""}Lorsque le projet est soumis à permis de construire, l’architecte en est l’auteur au sens de l’article 3 de la loi n° 77-2 du 3 janvier 1977.`,
      `Ne sont pas comprises : ${cl("cl7") ? "les prestations de géomètre, de bureaux d’études techniques, de contrôle technique, de coordination en matière de sécurité et de protection de la santé, les diagnostics et études de sol, ainsi que " : ""}les missions non cochées à l’article 2.2. Ces intervenants sont choisis et rémunérés directement par le client, sur proposition de l’architecte s’il le souhaite.`,
      hasSite && cl("cl6") ? "La direction de l’exécution des travaux ne se substitue ni aux entreprises, seules responsables de leurs méthodes, de la sécurité de leur personnel et de l’exécution de leurs ouvrages, ni au coordonnateur en matière de sécurité et de protection de la santé. Lorsqu’il dirige les travaux, l’architecte s’assure qu’ils sont conduits conformément à ses plans et documents, vérifie les situations et mémoires des entreprises et les transmet au client avec ses propositions de paiement ; il vise les procès-verbaux de réception auxquels il assiste (art. 39 et 40)." : "");

    /* 6 */
    const steps = [];
    if (["fais", "plu", "rel", "diag", "esq"].some(has)) steps.push("Esquisse");
    if (["aps", "apd"].some(has)) steps.push("Avant-projet");
    if (["dp", "pcm"].some(has)) steps.push("Dossier de demande d’autorisation");
    if (["pro", "dce", "act"].some(has)) steps.push("Projet et consultation des entreprises");
    if (["visa", "det"].some(has)) steps.push("Direction de l’exécution des travaux");
    if (has("aor")) steps.push("Réception des travaux");
    if (sel("int").length) steps.push("Projet d’aménagement intérieur");
    const hasStepDelay = s => !/Direction de l’exécution|Réception/.test(s);
    art("Durée de la mission et délais d’exécution",
      "## 6.1 — Durée du contrat",
      `Le contrat prend effet à sa signature par les deux parties. La mission débute ${esc(S.startDelay || "à réception du contrat signé")}${retract && !S.expressStart ? ", et au plus tôt à l’expiration du délai de rétractation" : ""}. Elle s’achève à la remise au client du dernier élément de mission commandé${has("aor") ? " ou, pour l’assistance aux opérations de réception, à la levée des réserves" : ""}. Calendrier indicatif : ${esc(S.duration || "défini d’un commun accord")}.`,
      "## 6.2 — Délais d’exécution et d’approbation des éléments de mission",
      `<table class="c-tab c-delais"><tr><th>Élément de mission</th><th>Délai d’exécution par l’architecte</th><th>Délai d’approbation par le client</th></tr>${steps.map(t => `<tr><td>${esc(t)}</td><td>${hasStepDelay(t) ? `${xdays} jours` : "selon le calendrier des travaux"}</td><td>${vdays} jours</td></tr>`).join("")}</table>`,
      `Le délai d’exécution court à compter de la signature du contrat et du versement de l’acompte pour le premier élément de mission, puis de la réception des documents approuvés par le client pour les éléments suivants. Les délais d’instruction administrative et ceux des entreprises et des intervenants extérieurs ne dépendent pas de l’architecte.`);

    /* 7 */
    art("Approbation des livrables et des éléments de mission",
      "## 7.1 — Format des livrables",
      `Les prestations sont remises de façon dématérialisée, par tout moyen permettant d’en attester la date de remise, au format ${esc(S.deliverFormat || "PDF")} non modifiable, en ${Math.max(1, Math.round(Number(S.copies) || 1))} exemplaire${Number(S.copies) > 1 ? "s" : ""}.`,
      "## 7.2 — Forme de l’approbation",
      `Le client examine les documents remis à chaque élément de mission et les valide par écrit dans le délai fixé à l’article 6.2. En cas de refus, il en précise les motifs par écrit avant l’expiration de ce délai, et les parties déterminent ensemble la suite à donner à la mission. Tout document émanant du client est transmis par un moyen lui donnant une date certaine. À défaut de réponse dans le délai, les documents sont tacitement approuvés. Les étapes validées sont consignées à l’annexe 4.`,
      "## 7.3 — Effet de l’approbation",
      `La validation écrite des documents vaut approbation de l’élément de mission concerné. L’architecte n’engage l’élément suivant qu’après cette approbation ; le paiement des honoraires de l’élément vaut demande de poursuivre la mission.`);

    /* 8 */
    art("Modalités de rémunération",
      `Conformément à l’article 46 du code de déontologie, la rémunération est calculée en fonction des missions confiées, du contenu du programme et de la complexité de l’opération. Elle est la seule que perçoit l’architecte au titre de l’opération et lui est payée par le client exclusivement.`,
      temps
        ? [`La rémunération est établie sur la base des frais réels que constitue le temps passé par l’architecte, au taux de <b>${euro(rate)} HT de l’heure</b>${r.vatRate ? ` (${euro(ttc(rate))} TTC, ${esc(vatTxt)})` : ` (${esc(vatTxt)})`}. Le prix ne pouvant être calculé à l’avance avec certitude, l’architecte en communique le mode de calcul et une estimation (art. L.112-3 du code de la consommation) : <b>${hf(r.totalHours)}</b>, soit <b>${ht(r.totalHT)}</b>, répartis par mission à l’annexe 1. Cette estimation ne constitue pas un forfait.`,
           `L’architecte tient un relevé du temps passé par mission, joint à chaque facture et communiqué sur simple demande. S’il constate que le temps nécessaire risque de dépasser l’estimation, notamment en raison d’une modification du programme, de demandes ou d’allers-retours supplémentaires du client ou d’exigences administratives imprévues, il en informe le client par écrit en indiquant le dépassement prévisible. ${overrun ? `Au-delà de ${overrun} % de l’estimation` : "Pour tout dépassement de l’estimation"}, la poursuite de la mission est subordonnée à l’accord écrit du client. Les échéances sont des acomptes calculés sur l’estimation ; la facture définitive est établie sur le temps réellement passé, déduction faite des sommes déjà facturées. Le taux horaire est ferme pendant la durée prévisionnelle de la mission.`]
        : [`Le montant forfaitaire de la rémunération, fixé à <b>${ht(r.totalHT)}</b>, se décompose comme suit (détail par mission à l’annexe 1) :`,
           `<table class="c-tab c-dec">${phases.map(p => `<tr><td>${esc(p.title)}</td><td class="r">${euro(p.finalAmount)} HT</td>${r.vatRate ? `<td class="r">${euro(ttc(p.finalAmount))} TTC</td>` : ""}</tr>`).join("")}<tr class="tot"><td>Total</td><td class="r">${euro(r.totalHT)} HT</td>${r.vatRate ? `<td class="r">${euro(r.totalTTC)} TTC</td>` : ""}</tr></table>`,
           esc(S.revisionTerms || "Le forfait est ferme et non révisable pendant la durée prévisionnelle de la mission.") + " Le forfait ne peut être modifié qu’avec l’accord exprès des parties, notamment en cas de modification du programme ou de l’étendue des missions (art. 46).",
           S.showRate === true && rate ? `Le client est informé que le taux horaire de l’architecte, applicable aux prestations supplémentaires convenues par avenant, est de ${euro(rate)} HT${r.vatRate ? `, soit ${euro(ttc(rate))} TTC` : ""}.` : ""],
      `Les sommes versées d’avance par le client sont des acomptes et non des arrhes au sens de l’article L.214-1 du code de la consommation.`,
      r.vatRate ? `Les honoraires sont facturés au taux de TVA en vigueur. Si l’opération ouvre droit à un taux réduit, l’architecte rétrocède au client le trop-perçu de TVA sur la dernière facture.` : "",
      `En cas d’interruption définitive de la mission, les honoraires dus sont calculés d’après la valeur des éléments de mission fixée à l’annexe 1 et leur avancement, complétés le cas échéant de l’indemnité prévue à l’article 14.2.`,
      esc(S.expensesTerms || "Les honoraires comprennent les frais directs liés à la mission (déplacements, reproduction)."),
      "## 8.1 — Modification de la rémunération en cas de prestations supplémentaires",
      cl("cl4") ? `Toute augmentation de la mission, toute remise en cause du programme ou du calendrier, toute modification des documents approuvés, tout dossier de permis modificatif, qu’il soit demandé par le client, imposé par un tiers, entraîné par un changement de réglementation ou rendu nécessaire par un aléa imprévisible, et toute prestation supplémentaire consécutive à la défaillance d’une entreprise donnent lieu à un avenant écrit, accepté par le client avant son exécution, qui en fixe les honoraires.` : `Toute prestation non prévue au contrat fait l’objet d’un accord écrit préalable du client sur son prix.`,
      hasDet ? `Le dépassement de la durée des travaux du fait d’une entreprise ouvre droit à des honoraires supplémentaires permettant à l’architecte de prolonger sa présence sur le chantier. Le client est informé que ce montant peut être déduit du marché de l’entreprise responsable si la clause de pénalités de retard de ce marché le prévoit.` : "",
      "## 8.2 — Pénalités applicables à l’architecte",
      Number(S.penalty) > 0
        ? `En cas de retard imputable à l’architecte dans l’exécution de sa mission, celui-ci encourt une pénalité de ${euro(Number(S.penalty))} TTC par semaine de retard, dans la limite de ${nf2.format(Number(S.penaltyCap) || 1).replace(/,00$/, "")} % des honoraires de l’élément de mission en retard. Elle court à compter du lendemain de l’expiration du délai d’exécution fixé à l’article 6.2 et est libératoire. Aucune pénalité n’est due si le retard est imputable au client ou en cas de force majeure, c’est-à-dire de tout fait inévitable, imprévisible et indépendant de la volonté des parties.`
        : `Aucune pénalité de retard n’est stipulée à la charge de l’architecte. Il n’est pas responsable des retards imputables au client, aux tiers ou à un cas de force majeure, c’est-à-dire tout fait inévitable, imprévisible et indépendant de la volonté des parties.`);

    /* 9 */
    art("Modalités de règlement",
      "## 9.1 — Échelonnement des paiements",
      `Les honoraires sont payables au fur et à mesure de l’avancement de la mission, selon l’échéancier de la proposition d’honoraires réf. ${esc(ctx.ref)}${Number(S.acompte) > 0 ? `, qui prévoit un acompte de ${nf0.format(Number(S.acompte))} % du premier élément de mission ${lc.offPremisesConsumer ? "exigible au plus tôt sept jours après la conclusion du contrat" : "à la signature"}` : ""}. Les honoraires complémentaires fixés par avenant sont payés au fur et à mesure de l’avancement des prestations concernées.`,
      lc.offPremisesConsumer ? "Conformément à l’article L.221-10 du code de la consommation, aucun paiement ne peut être exigé avant l’expiration d’un délai de sept jours à compter de la conclusion du contrat." : "",
      "## 9.2 — Délais de paiement",
      `Les sommes dues sont payables par virement dans un délai de ${pdays} jours à compter de la réception de la facture${s(A.iban) ? ` (IBAN ${esc(A.iban)}${s(A.bic) ? `, BIC ${esc(A.bic)}` : ""})` : ""}. ${consumer ? "Passé ce délai, des intérêts moratoires sont dus au taux légal, après mise en demeure." : "En cas de retard, des pénalités sont dues au taux de la Banque centrale européenne majoré de dix points, ainsi qu’une indemnité forfaitaire pour frais de recouvrement de 40 € (art. L.441-10 et D.441-5 du code de commerce). Aucun escompte n’est accordé pour paiement anticipé."}`);

    /* 10 */
    art("Droits et obligations des parties",
      `Outre les dispositions du présent contrat, les parties respectent les lois et règlements en vigueur, notamment la loi n° 77-2 du 3 janvier 1977 sur l’architecture et ses décrets d’application, en particulier le code de déontologie des architectes, et la loi n° 78-12 du 4 janvier 1978 relative à la responsabilité et à l’assurance dans le domaine de la construction, codifiée aux articles 1792 et suivants du code civil et L.241-1 et suivants du code des assurances.`,
      "## 10.1 — Droits et obligations du client",
      `<b>Décisions et paiements.</b> Le client se prononce sur les documents qui lui sont soumis dans les délais convenus et règle les honoraires aux échéances prévues. Il garantit l’exactitude des informations qu’il fournit.`,
      hasSite || r.input.sn ? `<b>Coordination sécurité et protection de la santé.</b> Pour une opération de bâtiment entreprise par un particulier pour son usage personnel ou celui de ses proches, la coordination est assurée (art. L.4532-7 du code du travail) : lorsque l’opération est soumise à permis de construire, pendant la conception par la personne chargée de la conception et pendant la réalisation par la personne qui assure effectivement la maîtrise du chantier ; dans le cas contraire, par l’un des entrepreneurs présents sur le chantier pendant les travaux. ${hasDet ? "La direction de l’exécution des travaux confiée à l’architecte ne comprend pas la maîtrise effective du chantier ; les parties désignent par écrit, avant l’ouverture du chantier, la personne qui l’assure." : ""} Dans les autres cas, le client désigne un coordonnateur.` : "",
      `<b>Études complémentaires.</b> ${r.input.sn ? "Le client fait réaliser l’étude de sol et l’étude thermique nécessaires et les fournit à l’architecte" : "Le client fait réaliser les études et diagnostics nécessaires et les fournit à l’architecte"} dans des délais lui permettant d’exécuter sa mission. Si des circonstances imprévisibles imposent le recours à des spécialistes (ingénieur structure, acousticien…) ou si l’architecte conseille leur intervention, les dépenses correspondantes sont à la charge du client.`,
      hasSite ? `<b>Garantie de paiement des entrepreneurs.</b> Le client déclare avoir été informé des dispositions de l’article 1799-1 du code civil relatives à la garantie de paiement des sommes dues aux entrepreneurs lorsqu’elles dépassent 12 000 €, dans les cas où elles s’appliquent.` : "",
      hasSite ? `<b>Sous-traitance des entreprises.</b> Le client déclare avoir été informé des obligations résultant de la loi n° 75-1334 du 31 décembre 1975 : l’entrepreneur qui recourt à un sous-traitant doit le faire accepter et faire agréer ses conditions de paiement par le client ; à défaut de paiement direct ou de délégation de paiement, le client exige de l’entrepreneur une caution personnelle et solidaire d’un établissement financier garantissant les sommes dues au sous-traitant.` : "",
      r.input.sr || hasSite ? `<b>Constat de l’état des existants et des avoisinants.</b> Le client est informé de l’intérêt de faire établir, avant toute intervention, un constat contradictoire de l’état des ouvrages existants et avoisinants, par un expert judiciaire (référé préventif), par un commissaire de justice, les parties ayant été convoquées, ou, pour les opérations de moindre importance, par les architectes des parties concernées avec l’accord de leurs clients.` : "",
      `<b>Recours contre l’autorisation d’urbanisme.</b> Le client informe sans délai et par écrit l’architecte de tout recours contre l’autorisation obtenue ; la mission peut alors être suspendue dans les conditions de l’article 13.`,
      conception && !hasDet ? `<b>Suite de la mission.</b> Le client communique à l’architecte, auteur du projet, les coordonnées et l’attestation d’assurance du titulaire de la mission de suivi des travaux, ainsi que les données du projet, notamment les études d’exécution, permettant de vérifier que l’ouvrage respecte les dispositions du projet architectural.` : "",
      "## 10.2 — Droits et obligations de l’architecte",
      `<b>Information du client.</b> L’architecte exécute sa mission conformément aux règles de l’art et au code de déontologie. Il apporte au client son savoir et son expérience pendant toute la durée du contrat (art. 12), l’informe du déroulement de sa mission et par écrit de toute évolution significative du coût de l’opération, et lui remet les documents produits sur demande (art. 36). Sauf urgence liée à la sécurité des personnes ou des biens, toute décision entraînant un supplément de dépense fait l’objet d’un accord écrit préalable du client.`,
      `<b>Réglementation thermique et environnementale.</b> L’opération respecte la réglementation thermique ou environnementale, ou le label souhaité par le client, en vigueur à la date du dépôt de l’autorisation d’urbanisme. L’architecte est tenu, à ce titre, d’une obligation de moyens. Les consommations théoriques issues des logiciels de calcul ne l’engagent pas sur les consommations réelles, qui dépendent notamment du comportement des occupants et des conditions climatiques.`,
      `<b>Indépendance et liens d’intérêt.</b> L’architecte exerce en toute indépendance et prévient ou fait cesser sans délai toute situation de conflit d’intérêts (art. 13). Conformément à l’article 18 de la loi n° 77-2 et aux articles 15 et 29 du code de déontologie, il porte à la connaissance du client, avant tout engagement, les liens définis à l’article 29 : la déclaration figure à l’annexe 3, que le client vise.`);

    /* 11 */
    art("Responsabilité et assurances",
      "## 11.1 — Assurances du client",
      `Le client déclare avoir été informé de l’obligation de souscrire, avant l’ouverture du chantier, une assurance de dommages à l’ouvrage lorsqu’elle est obligatoire (art. L.242-1 du code des assurances), et de la possibilité de souscrire des assurances complémentaires, couvrant notamment les dommages aux existants et aux avoisinants. Toute information sur les garanties et exclusions de ces assurances relève de l’assureur.`,
      "## 11.2 — Responsabilité et assurance de l’architecte",
      `L’architecte assume sa responsabilité professionnelle, telle qu’elle est définie notamment par les articles 1792, 1792-2, 1792-3 et 1792-4-1 du code civil, dans les limites de la mission qui lui est confiée. Pour toute autre responsabilité, il ne peut être tenu, ni solidairement ni in solidum, des dommages imputables aux autres intervenants. Il en supporte les conséquences financières dans les limites des plafonds de garantie de son contrat d’assurance. Ces stipulations s’appliquent sans préjudice des garanties légales des articles 1792 et suivants du code civil, d’ordre public (art. 1792-5).`,
      `L’architecte ne peut être tenu d’anticiper l’illégalité d’une règle d’urbanisme régulièrement publiée, ni les règles ou servitudes résultant de titres particuliers qui ne lui ont pas été signalées ; il appartient au client de lui révéler toutes les contraintes connues de lui. Au-delà des questions d’urbanisme, il revient au client de s’assurer auprès des administrations concernées de la compatibilité de son projet avec les réglementations spécifiques qui lui sont applicables.`,
      `Conformément à l’article 16 de la loi n° 77-2 du 3 janvier 1977, l’architecte est assuré pour sa responsabilité professionnelle auprès de ${blank(A.insurer, 40)}${s(A.insurerAddress) ? `, ${esc(A.insurerAddress)}` : ""}, contrat n° ${blank(A.policy, 30)}${s(A.policyStart) || s(A.policyEnd) ? `, période du ${esc(longDate(A.policyStart) || "…")} au ${esc(longDate(A.policyEnd) || "…")}` : ""}, couverture géographique : ${esc(A.coverage || "France")}. L’attestation d’assurance est jointe au contrat (annexe 2).`);

    /* 12 */
    art("Propriété intellectuelle",
      cl("cl5") ? `L’architecte conserve ses droits d’auteur sur ses plans, esquisses, images et documents (art. L.111-1 du code de la propriété intellectuelle). Le client est titulaire du droit de réaliser le projet, en un seul exemplaire, dès lors qu’il est à jour du paiement des honoraires correspondants ; il ne peut faire usage des prestations dont il n’a pas acquitté les honoraires. Toute autre utilisation requiert l’accord écrit de l’architecte.` : `Le client est titulaire du droit de réaliser le projet, en un seul exemplaire, dès lors qu’il est à jour du paiement des honoraires correspondants.`,
      `Si le client poursuit l’opération sans le concours de l’architecte, il respecte son œuvre et le consulte avant toute modification envisagée.`,
      `L’architecte peut faire état de l’opération et en publier des photographies extérieures, sauf opposition écrite du client ; la prise et la publication de photographies des espaces intérieurs sont subordonnées à l’accord préalable écrit du client, dans le respect de sa vie privée. Le client appose le nom de l’architecte et la date d’achèvement de l’ouvrage sur l’une des façades extérieures, en application de l’article L.650-2 du code du patrimoine, selon les modalités convenues entre les parties.`);

    /* 13 */
    art("Suspension de la mission",
      `${cl("cl8") ? "" : ""}La suspension de la mission peut être demandée par l’une ou l’autre des parties, soit en cas d’événements imprévisibles et extérieurs mettant en cause le déroulement de l’opération, soit en cas de manquement de l’autre partie à ses obligations (retard de paiement des honoraires, non-respect des délais de remise ou d’approbation, immixtion du client dans l’exécution de la mission…). Elle n’intervient qu’après une mise en demeure par lettre recommandée avec accusé de réception restée sans effet pendant ${notice} jours, puis est notifiée par lettre recommandée.`,
      `Sauf accord des parties, les honoraires sont réglés à proportion des prestations exécutées et des frais engagés. À la reprise, les honoraires déjà versés viennent en déduction de la rémunération totale ; un avenant précise, le cas échéant, les conditions de reprise. À défaut de reprise dans un délai de trois mois suivant la notification de la suspension, le contrat est réputé résilié : les conséquences en sont fixées à l’amiable ou, à défaut, selon l’article 14.2 si la suspension ne résulte pas d’une faute de l’architecte, et selon l’article 14.4 dans le cas contraire.`);

    /* 14 */
    art("Résiliation du contrat",
      "## 14.1 — Résiliation d’un commun accord",
      `Les parties peuvent décider ensemble de résilier le contrat, par un écrit qui en détermine les conséquences, notamment le paiement des prestations et le remboursement des frais.`,
      "## 14.2 — Résiliation à l’initiative du client sans faute de l’architecte",
      temps
        ? `Le client peut mettre fin au contrat à tout moment, par écrit. L’architecte a droit au paiement du temps passé jusqu’à la date de résiliation, selon le relevé des temps, au taux horaire convenu, des intérêts moratoires en cas de retard${resil ? `, et d’une indemnité de résiliation égale à ${nf0.format(resil)} % des honoraires estimés restant à courir` : ""}. Les documents correspondants sont remis au client après règlement.`
        : `Le client peut mettre fin au contrat à tout moment, par écrit. L’architecte a droit au paiement des honoraires des prestations exécutées et des frais engagés à la date de résiliation, sur la base du prix de chaque mission indiqué à l’annexe 1 et au prorata de leur avancement, des intérêts moratoires en cas de retard${resil ? `, et d’une indemnité de résiliation égale à ${nf0.format(resil)} % de la part des honoraires qui lui aurait été versée si la mission n’avait pas été interrompue` : ""}. Les documents correspondants sont remis au client après règlement.`,
      "## 14.3 — Indisponibilité de l’architecte",
      `Si, par suite de maladie grave, de décès ou de toute autre cause sérieuse indépendante de sa volonté, l’architecte est dans l’impossibilité d’achever sa mission, le contrat est résilié. Le client peut accepter sa poursuite par les ayants droit architectes. À sa demande, le conseil régional de l’Ordre peut lui proposer une liste d’architectes susceptibles de succéder à l’architecte, par un nouveau contrat, dans le respect de l’article 22 du code de déontologie.`,
      "## 14.4 — Résiliation pour faute",
      `Le contrat peut être résilié par la partie qui n’est pas défaillante, ${notice} jours après une mise en demeure par lettre recommandée avec accusé de réception, restée sans effet, visant la présente clause ; la résiliation est prononcée par une seconde lettre recommandée.`,
      `En cas de faute de l’architecte, celui-ci a droit au paiement des prestations exécutées sans lien avec le manquement invoqué, sans indemnité de résiliation. L’architecte ne peut mettre fin au contrat que pour un motif juste et raisonnable au sens de l’article 38 du code de déontologie, notamment perte de confiance manifestée par le client, immixtion dans sa mission, impossibilité de respecter les règles de son art ou de sa déontologie, choix imposé d’une entreprise ne présentant pas les garanties nécessaires, conflit d’intérêts ou manquement du client à ses obligations ; il a alors droit au paiement des prestations exécutées et des intérêts moratoires ; les acomptes versés s’imputent sur ces sommes et l’éventuel excédent est restitué au client.`);

    /* 15 */
    art("Litiges",
      "## 15.1 — Règlement amiable",
      `Toute réclamation est adressée par écrit à l’architecte : ${esc([A.claims || A.email, A.address].filter(v => s(v)).join(", "))}. Il y est répondu dans un délai d’un mois.`,
      `En cas de différend sur le respect du contrat, ${consumer ? "l’architecte s’engage" : "les parties s’engagent"}, avant toute procédure judiciaire et hors mesures conservatoires, à saisir le conseil régional de l’Ordre des architectes dont il relève, qui peut émettre un avis ou organiser une conciliation. En matière de recouvrement d’honoraires, cette saisine est facultative.`,
      consumer ? "## 15.2 — Médiation de la consommation" : "",
      consumer ? `Après une réclamation écrite préalable restée sans suite ou sans résultat, le client consommateur peut recourir gratuitement au médiateur de la consommation dont relève l’architecte : ${blank(A.mediator, 45)}${s(A.mediatorContact) ? `, ${esc(A.mediatorContact)}` : ""} (art. L.612-1 et L.616-1 du code de la consommation). Il ne peut le saisir si l’assureur de l’architecte a expressément déclaré prendre en charge la totalité du sinistre. Le recours à la médiation est facultatif et n’empêche pas la saisine du juge compétent.` : "",
      `À défaut d’accord, le litige est porté devant la juridiction matériellement et territorialement compétente.`);

    /* 16 */
    art("Protection des données personnelles",
      `Les parties respectent le règlement (UE) 2016/679 du 27 avril 2016 (RGPD). L’architecte traite les données du client pour la gestion de la relation, l’exécution du contrat, le recouvrement des honoraires et le respect de ses obligations légales, notamment comptables, fiscales et ordinales. Il ne les communique qu’aux intervenants de l’opération et aux autorités, et met en œuvre les mesures de sécurité nécessaires à leur protection.`,
      `Les données sont conservées pendant la durée du contrat et dix ans après son terme ; les pièces comptables, dix ans à compter de la clôture de l’exercice. Le client dispose des droits d’accès, de rectification, d’effacement, de limitation et d’opposition, qu’il exerce auprès de l’architecte, dans les limites prévues par le règlement, et peut introduire une réclamation auprès de la CNIL (www.cnil.fr).`);

    /* 17 */
    art("Stipulations particulières",
      s(S.specialTerms) ? esc(S.specialTerms).replace(/\n/g, "<br>") : "Il n’est prévu aucune stipulation particulière.",
      `Le contrat est soumis au droit français.`);

    /* 18 */
    art("Droit de rétractation",
      retract
        ? [`Le contrat étant conclu à distance ou hors établissement, le client consommateur dispose d’un délai de quatorze jours à compter de la conclusion du contrat pour exercer son droit de rétractation, sans avoir à motiver sa décision ni à supporter de frais (art. L.221-18 du code de la consommation). Le délai court à compter du lendemain de la conclusion ; s’il expire un samedi, un dimanche ou un jour férié ou chômé, il est prorogé jusqu’au premier jour ouvrable suivant.`,
           `Le client notifie sa décision avant l’expiration du délai, au moyen du formulaire de l’annexe 5 ou de toute autre déclaration dénuée d’ambiguïté (${s(A.email) ? "lettre ou courriel à " + esc(A.email) : "lettre à l’adresse de l’architecte"}). L’architecte rembourse les sommes versées au plus tard quatorze jours après en avoir été informé, par le même moyen de paiement sauf accord exprès du client.`,
           `Si le client a demandé expressément le commencement de la mission avant la fin du délai, il reste redevable, en cas de rétractation, d’un montant proportionné aux prestations fournies jusqu’à la communication de sa décision (art. L.221-25) ; une fois la prestation entièrement exécutée, il ne dispose plus du droit de rétractation.`]
        : `Sans objet : ${consumer ? "le contrat est conclu au cabinet de l’architecte, hors démarchage et hors vente à distance" : "le client agit en qualité de professionnel"} ; le droit de rétractation prévu aux articles L.221-18 et suivants du code de la consommation ne s’applique pas.`);

    /* Annexes */
    const annex1 = phases.map(p => `<div class="c-a1-ph"><div class="c-a1-h"><span>${esc(p.title)}</span><span>${euro(p.finalAmount)} HT</span></div>
      ${p.missions.filter(m => m.selected).map(m => `<div class="c-a1-m"><div><b>${m.code ? esc(m.code) + " — " : ""}${esc(m.name)}</b><p>${esc(m.long)}</p></div><span>${temps ? `${hf(m.hours)} · ` : ""}${euro(m.price)}</span></div>`).join("")}</div>`).join("")
      + (temps ? `<div class="c-a1-tot2"><span>Temps estimé (indicatif) — taux ${euro(rate)} HT/h</span><span>${hf(r.totalHours)}</span></div>` : "")
      + `<div class="c-a1-tot"><span>${temps ? "Estimation HT" : "Total HT"}${r.insuranceHT > 0 ? " des honoraires" : ""}</span><span>${euro(r.totalHT)}</span></div>`
      + (r.insuranceHT > 0 ? `<div class="c-a1-tot2"><span>${esc(r.insuranceLabel)} HT</span><span>${euro(r.insuranceHT)}</span></div><div class="c-a1-tot"><span>Total HT</span><span>${euro(r.grandHT)}</span></div>` : "")
      + `<div class="c-a1-tot2"><span>${esc(vatTxt)}</span><span>${euro(r.grandTVA)}</span></div><div class="c-a1-tot"><span>Total TTC</span><span>${euro(r.grandTTC)}</span></div>`;
    const annex2 = `<p>Conformément à l’article 16 de la loi n° 77-2 du 3 janvier 1977, l’attestation d’assurance de responsabilité professionnelle de l’architecte, établie par l’assureur selon le modèle fixé par arrêté, est jointe au présent contrat.</p>
      <div class="c-box"><div>Assureur : <b>${blank(A.insurer, 50)}</b></div>${s(A.insurerAddress) ? `<div>Adresse : ${esc(A.insurerAddress)}</div>` : ""}<div>Contrat n° : <b>${blank(A.policy, 40)}</b></div><div>Période : ${s(A.policyStart) || s(A.policyEnd) ? `du ${esc(longDate(A.policyStart) || "…")} au ${esc(longDate(A.policyEnd) || "…")}` : blank("", 50)}</div><div>Couverture géographique : ${esc(A.coverage || "France")}</div></div>
      <p class="c-note">Joindre ici l’attestation délivrée par l’assureur pour l’année en cours.</p>`;
    const annex3 = `<p>Conformément à l’article 18 de la loi n° 77-2 du 3 janvier 1977 et aux articles 15 et 29 du code de déontologie des architectes, l’architecte porte à la connaissance du client les liens suivants :</p>
      <div class="c-box">${s(A.links) ? esc(A.links).replace(/\n/g, "<br>") : blank("", 120)}</div>
      <p>Le client atteste avoir reçu cette information en visant la présente déclaration.</p>
      <div class="c-visa"><div>Visa du client :</div><div>Date :</div></div>`;
    const annex4 = `<p>Chaque élément de mission est approuvé par écrit par le client dans un délai de ${vdays} jours à compter de la remise des documents (articles 6.2 et 7).</p>
      <table class="c-tab"><tr><th>Étape</th><th>Remise le</th><th>Validée le</th><th>Visa du client</th></tr>${steps.map(t => `<tr><td>${esc(t)}</td><td></td><td></td><td></td></tr>`).join("")}<tr><td>&nbsp;</td><td></td><td></td><td></td></tr></table>`;
    const annex5 = retract ? `<p>À compléter et renvoyer uniquement si vous êtes client consommateur et souhaitez vous rétracter du contrat.</p>
      <p>À l’attention de ${esc(A.full)}, architecte — ${esc([A.brand, A.address, A.email].filter(v => s(v)).join(", "))} :</p>
      <p>Je/Nous (*) vous notifie/notifions (*) par la présente ma/notre (*) rétractation du contrat portant sur la prestation de services ci-dessous :<br><b>Mission d’architecture — ${esc(P.name)}, ${esc(P.loc)} — réf. ${esc(ctx.ref)}</b></p>
      <p>Conclu le : <span class="fill" style="min-width:60mm"></span></p><p>Nom du (des) consommateur(s) : <span class="fill"></span></p><p>Adresse du (des) consommateur(s) : <span class="fill"></span></p>
      <p>Signature du (des) consommateur(s) (uniquement en cas de notification sur papier) :</p><div class="c-sigbox"></div><p>Date : <span class="fill" style="min-width:60mm"></span></p><p class="c-note">(*) Rayez la mention inutile.</p>`
      : `<p>Sans objet : ${consumer ? "le contrat est conclu au cabinet de l’architecte, hors démarchage et hors vente à distance" : "le client agit en qualité de professionnel"} ; le droit de rétractation prévu aux articles L.221-18 et suivants du code de la consommation ne s’applique pas.</p>`;

    const express = retract ? (S.expressStart
      ? `<div class="c-box"><span class="chk"></span><b>Demande expresse de commencement de la mission.</b> Je demande à l’architecte de commencer l’exécution de la mission avant l’expiration du délai de rétractation de quatorze jours. Je reconnais qu’en cas de rétractation après ce commencement, je serai redevable d’un montant proportionnel aux prestations déjà fournies, et qu’une fois la prestation entièrement exécutée je ne disposerai plus du droit de rétractation (art. L.221-25 et L.221-28 du code de la consommation).<div class="c-visa"><div>Date :</div><div>Signature du client :</div></div></div>`
      : `<div class="c-box">Sauf demande expresse du client, l’exécution de la mission ne commence qu’à l’expiration du délai de rétractation de quatorze jours.</div>`) : "";

    const sig = `${express}<div class="c-sigs-intro">Fait à ${blank(S.signPlace, 30)}, le <span class="blank" style="min-width:30mm"></span>, en deux exemplaires originaux${lc.mode === "distance" ? ", ou en un exemplaire électronique en cas de signature électronique" : ""}.</div>
      <div class="c-sigs"><div class="c-sig"><div class="lbl">Le client</div>${esc(clientName)}<div class="space">Mention manuscrite « Lu et approuvé » et signature</div></div>
      <div class="c-sig"><div class="lbl">L’architecte</div>${esc(A.short || A.full)}, architecte<div class="space">Signature</div></div></div>`;

    const annexes = [
      { n: 1, title: temps ? "Missions confiées et estimation du temps" : "Missions confiées et prix", html: annex1 },
      { n: 2, title: "Attestation d’assurance de responsabilité professionnelle", html: annex2 },
      { n: 3, title: "Déclaration des liens d’intérêt", html: annex3 },
      { n: 4, title: "Validation des étapes", html: annex4 },
      { n: 5, title: "Formulaire de rétractation", html: annex5 }
    ];
    return { model: MODEL, articles: arts, annexes, signature: sig, clientName };
  }

  // Découpe en blocs insécables pour la pagination : titre, sommaire, paragraphes (un sous-titre reste avec le
  // paragraphe qui le suit), signatures, annexes.
  function blocks(ctx, built) {
    const b = built || build(ctx);
    const out = [];
    out.push({ cls: "c-title", html: `<div class="c-h1">Contrat d’architecte</div><div class="c-sub">Client privé — modèle ${MODEL}, structure du contrat type de l’Ordre des architectes — réf. ${esc(ctx.ref)} — ${esc(longDate(ctx.date))}</div>` });
    out.push({ cls: "c-toc", html: `<ol>${b.articles.map(a => `<li>${esc(a.title)}</li>`).join("")}</ol>` });
    b.articles.forEach((a, i) => {
      let head = `<h4>Article ${i + 1} — ${esc(a.title)}</h4>`, pend = "";
      a.paras.forEach(p => {
        if (p.startsWith("## ")) { pend += `<h5>${p.slice(3)}</h5>`; return; }
        // Un tableau est découpé ligne par ligne pour pouvoir passer d’une page à l’autre.
        const m = p.match(/^(<table[^>]*>)([\s\S]*)<\/table>$/);
        const parts = m ? (m[2].match(/<tr[\s\S]*?<\/tr>/g) || [m[2]]).map(tr => `${m[1]}${tr}</table>`) : [p.startsWith("<") ? p : `<p>${p}</p>`];
        parts.forEach((body, j) => {
          out.push({ cls: "c-p" + (head ? "" : " cont") + (m ? " c-trow" : ""), html: head + pend + body });
          head = ""; pend = "";
        });
      });
      if (head || pend) out.push({ cls: "c-p", html: head + pend });
    });
    out.push({ cls: "c-sign", html: b.signature });
    b.annexes.forEach(a => {
      out.push({ cls: "c-annex", pageBreak: true, html: `<div class="c-h2">Annexe ${a.n} — ${esc(a.title)}</div><div class="c-sub">Contrat ${MODEL} — réf. ${esc(ctx.ref)}</div>` });
      if (a.n === 1) {
        const tmp = a.html.split(/(?=<div class="c-a1-ph">|<div class="c-a1-tot">)/);
        tmp.forEach(h => { if (h.trim()) out.push({ cls: "c-ann", html: h }); });
      } else out.push({ cls: "c-ann", html: a.html });
    });
    return out;
  }

  /* ---------- Pagination A4 réelle (navigateur) ---------- */
  // Remplit des feuilles A4 de hauteur fixe ; ajoute « Page x / y », la référence et les paraphes.
  function paginate(host, blockList, opts) {
    const o = Object.assign({ footer: "", nonCompliant: [] }, opts || {});
    const doc = host.ownerDocument;
    const pages = [];
    const banner = o.nonCompliant.length
      ? `<div class="c-banner">PROJET NON CONFORME — ne pas transmettre au client<small>${o.nonCompliant.map(esc).join(" · ")}</small></div>` : "";
    const newPage = () => {
      const sh = doc.createElement("div");
      sh.className = "sheet cpage" + (o.nonCompliant.length ? " nc" : "");
      sh.innerHTML = `${banner}<div class="cbody"></div><div class="cfoot"><span>${esc(o.footer)}</span><span class="paraphes">Paraphes : client <i></i> architecte <i></i></span><span class="pno"></span></div>`;
      host.appendChild(sh);
      pages.push(sh);
      return sh.querySelector(".cbody");
    };
    const fits = body => body.scrollHeight <= body.clientHeight + 1;
    let body = newPage();
    blockList.forEach(bk => {
      if (bk.pageBreak && body.children.length) body = newPage();
      const el = doc.createElement("div");
      el.className = "cb " + (bk.cls || "");
      el.innerHTML = bk.html;
      body.appendChild(el);
      if (!fits(body) && body.children.length > 1) {
        body.removeChild(el);
        // un titre d'article ne reste pas seul en bas de page
        body = newPage();
        body.appendChild(el);
      }
    });
    pages.forEach((p, i) => { p.querySelector(".pno").textContent = `Page ${i + 1} / ${pages.length}`; });
    return pages.length;
  }

  const api = { MODEL, compliance, build, blocks, paginate };
  root.StateraContract = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : this);
