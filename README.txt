STATERA Atelier — V1.2.0
=======================

Application de gestion de projets d'architecture pour iPad et iPhone (PWA).
Charte reprise de STATERA Honoraires : Jost + EB Garamond italique, #161616 / #F4F3F0 / #E7E5E0 / #BFBDB6, angles vifs.

Fonctions
---------
- Projets : fiche (identification, maître d'ouvrage, terrain et urbanisme, programme), suivi des phases FAI → AOR,
  alertes (seuil 150 m², décennale expirée), validations de phase signées sur tablette (PDF horodaté dans 00_ADMIN).
- Notes : RDV client, visite de site, présentation, urbanisme, BET, appel ; ordre du jour type, notes, croquis à
  l'Apple Pencil (pression, paume ignorée), décisions, actions, photos annotées ; export en compte rendu PDF.
- Plans : import PDF ou image ; zoom au doigt ; stylo, feutre, surligneur, texte, gomme, annulation ;
  points numérotés rattachés à un lot et à l'entreprise du chantier, statut, échéance, photos annotées ;
  déplacement d'un point ; export du plan annoté en PDF.
- Points : liste par statut, lot et plan ; tableau par lot (ouverts, en retard, levés) ; levée rapide.
- Fichiers : arborescence 00_ADMIN … 08_RECUS, nommage AAMMJJ_CODE_PHASE_TYPE_Objet_Ind, partage.
- Chantier : entreprises affectées par lot ; réunions (présences, avancement, observations générales) ;
  CR complet pour le maître d'ouvrage et CR par lot pour chaque entreprise, avec extrait de plan et photo ;
  partage du PDF (Mail) ou e-mail pré-rempli ; prochaine réunion en .ics pour l'agenda.
- Entreprises : base commune, lots, contacts, assurance décennale (date, attestation), chantiers.
- Réglages : en-tête du cabinet, mention de fin de CR, sauvegarde et restauration JSON, stockage.

Données
-------
Tout est stocké sur l'appareil (IndexedDB), hors ligne compris. Exporter régulièrement la sauvegarde
(Réglages › Exporter tout) dans le Drive : le stockage d'un iPad n'est pas une archive.

Déploiement
-----------
Projet 100 % statique, sans build : déposer le dossier (ou le ZIP) sur Vercel. Puis, sur l'iPad,
Safari › Partager › « Sur l'écran d'accueil ».

Étape suivante (mise en ligne)
------------------------------
Connexion Google Workspace (OAuth interne) : copie des fichiers dans Drive, RDV de l'Agenda,
envoi des CR par Gmail depuis contact@statera-architecture.fr ; synchronisation entre iPad et iPhone.

Bibliothèques incluses : pdf.js (Apache-2.0), pdf-lib et fontkit (MIT), perfect-freehand (MIT),
polices Jost et EB Garamond (SIL OFL).
