// Référentiels métier : phases de mission, lots, types de RDV, arborescence du Drive

export const PHASES = [
  { id: 'FAI', nom: 'Faisabilité', court: 'FAI', dossier: '01_ESQ' },
  { id: 'ESQ', nom: 'Esquisse', court: 'ESQ', dossier: '01_ESQ' },
  { id: 'APS', nom: 'Avant-projet sommaire', court: 'APS', dossier: '02_APS' },
  { id: 'APD', nom: 'Avant-projet définitif', court: 'APD', dossier: '03_APD' },
  { id: 'PC', nom: 'Permis de construire', court: 'PC', dossier: '04_PC' },
  { id: 'PRO', nom: 'Projet', court: 'PRO', dossier: '05_DCE' },
  { id: 'DCE', nom: 'Consultation des entreprises', court: 'DCE', dossier: '05_DCE' },
  { id: 'ACT', nom: 'Marchés de travaux', court: 'ACT', dossier: '05_DCE' },
  { id: 'DET', nom: 'Direction des travaux', court: 'DET', dossier: '06_CHANTIER' },
  { id: 'AOR', nom: 'Réception', court: 'AOR', dossier: '06_CHANTIER' },
  { id: 'CLOS', nom: 'Dossier clos', court: 'CLOS', dossier: '00_ADMIN' }
];
export const phase = (id) => PHASES.find((p) => p.id === id) || PHASES[1];

export const LOTS = [
  ['01', 'VRD · Terrassement', 'VRD'],
  ['02', 'Gros œuvre · Maçonnerie', 'GO'],
  ['03', 'Charpente · Couverture · Zinguerie', 'CHA'],
  ['04', 'Étanchéité', 'ETA'],
  ['05', 'Menuiseries extérieures', 'MEX'],
  ['06', 'Menuiseries intérieures', 'MIN'],
  ['07', 'Plâtrerie · Isolation · Faux plafonds', 'PLA'],
  ['08', 'Électricité', 'ELE'],
  ['09', 'Plomberie · Sanitaires', 'PLB'],
  ['10', 'Chauffage · Ventilation · Climatisation', 'CVC'],
  ['11', 'Revêtements de sols · Faïence', 'REV'],
  ['12', 'Peinture', 'PEI'],
  ['13', 'Serrurerie · Métallerie', 'SER'],
  ['14', 'Aménagements extérieurs', 'AEX']
].map(([id, nom, code]) => ({ id, nom, code }));
export const lot = (id) => LOTS.find((l) => l.id === id) || { id: id || '—', nom: 'Lot non attribué', code: '—' };

export const NOTE_TYPES = [
  { id: 'rdv', nom: 'RDV client', court: 'RDV CLIENT' },
  { id: 'site', nom: 'Visite de site', court: 'VISITE DE SITE' },
  { id: 'presentation', nom: 'Présentation de phase', court: 'PRÉSENTATION' },
  { id: 'urbanisme', nom: 'RDV urbanisme / mairie', court: 'URBANISME' },
  { id: 'bet', nom: 'Réunion BET / partenaires', court: 'BET' },
  { id: 'appel', nom: 'Appel téléphonique', court: 'APPEL' },
  { id: 'libre', nom: 'Note libre', court: 'NOTE' }
];
export const noteType = (id) => NOTE_TYPES.find((t) => t.id === id) || NOTE_TYPES[NOTE_TYPES.length - 1];

// Ordres du jour proposés selon le type de RDV et la phase
export const AGENDAS = {
  rdv: ['Attentes et programme du client', 'Budget et calendrier souhaités', 'Contraintes du terrain', 'Suite à donner'],
  site: ['Relevé : limites, accès, réseaux', 'Orientation, ensoleillement, vues', 'Topographie, talus, végétation', 'Bâti voisin, alignements', 'Photos du site'],
  presentation: ['Rappel du programme et du budget', 'Présentation des plans', 'Points à arbitrer', 'Estimation', 'Validation de la phase'],
  urbanisme: ['Règles applicables (zone, servitudes)', 'Points sensibles du projet', 'Pièces attendues', 'Délais d’instruction'],
  bet: ['Données d’entrée', 'Hypothèses', 'Échéances de rendu'],
  appel: [],
  libre: []
};

export const FOLDERS = [
  { id: '00_ADMIN', nom: 'Administratif', desc: 'Convention, validations signées, courriers' },
  { id: '01_ESQ', nom: 'Esquisse', desc: 'Relevés, esquisses, CR de RDV' },
  { id: '02_APS', nom: 'APS', desc: 'Avant-projet sommaire' },
  { id: '03_APD', nom: 'APD', desc: 'Avant-projet définitif, estimation' },
  { id: '04_PC', nom: 'Permis', desc: 'Dossier de PC, pièces, arrêté' },
  { id: '05_DCE', nom: 'DCE', desc: 'Plans EXE, CCTP, offres, marchés' },
  { id: '06_CHANTIER', nom: 'Chantier', desc: 'CR de réunion, PV, réserves' },
  { id: '07_PHOTOS', nom: 'Photos', desc: 'Site, chantier, réception' },
  { id: '08_RECUS', nom: 'Reçus', desc: 'Documents du client et des tiers' }
];

export const DOC_TYPES = [
  ['PLA', 'Plan'], ['CR', 'Compte rendu'], ['NOT', 'Notice'], ['EST', 'Estimation'], ['PHO', 'Photos'],
  ['COU', 'Courrier'], ['VAL', 'Validation'], ['PV', 'Procès-verbal'], ['CCT', 'CCTP'], ['DIV', 'Divers']
];

export const POINT_STATUS = [
  { id: 'ouvert', nom: 'Nouveau' },
  { id: 'encours', nom: 'En cours' },
  { id: 'leve', nom: 'Levé' }
];
export const POINT_NATURE = [
  { id: 'obs', nom: 'Observation' },
  { id: 'res', nom: 'Réserve (réception)' },
  { id: 'info', nom: 'Information' }
];
export const status = (id) => POINT_STATUS.find((s) => s.id === id) || POINT_STATUS[0];

// Convention de nommage de l'agence : AAMMJJ_CODE_PHASE_TYPE_Objet_Ind
import { yymmdd, slug } from './lib.js';
export function fileName({ date, code, phase: ph, type, objet, ind, ext }) {
  const parts = [yymmdd(date), (code || 'XXX').toUpperCase(), ph || 'ESQ', type || 'DIV', slug(objet || 'Document') || 'Document', (ind || 'A').toUpperCase()];
  return parts.join('_') + (ext ? '.' + ext.replace(/^\./, '') : '');
}

export const CABINET_DEFAULT = {
  nom: 'STATERA ARCHITECTURE',
  architecte: 'Michel Mangion, architecte',
  adresse: 'Prumaticciu, Qua de l’Église – Village, 20100 Foce',
  tel: '07 81 16 49 21',
  email: 'contact@statera-architecture.fr',
  site: 'www.statera-architecture.fr',
  ordre: 'Inscrit à l’Ordre des architectes, n° national 094661',
  siren: 'SIREN 831 975 206'
};
