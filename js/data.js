// Référentiels métier : phases de mission, lots, types de RDV, arborescence du Drive

export const PHASES = [
  { id: 'FAI', nom: 'Faisabilité', court: 'FAI', dossier: '01_DONNEES_ENTREE' },
  { id: 'ESQ', nom: 'Esquisse', court: 'ESQ', dossier: '02_ESQ' },
  { id: 'APS', nom: 'Avant-projet sommaire', court: 'APS', dossier: '03_APS' },
  { id: 'APD', nom: 'Avant-projet définitif', court: 'APD', dossier: '04_APD' },
  { id: 'PC', nom: 'Autorisations', court: 'PC', dossier: '05_AUTORISATIONS' },
  { id: 'PRO', nom: 'Projet', court: 'PRO', dossier: '06_PRO' },
  { id: 'DCE', nom: 'Consultation des entreprises', court: 'DCE', dossier: '07_DCE' },
  { id: 'ACT', nom: 'Marchés de travaux', court: 'ACT', dossier: '08_ACT' },
  { id: 'DET', nom: 'Direction des travaux', court: 'DET', dossier: '09_CHANTIER_DET' },
  { id: 'AOR', nom: 'Réception', court: 'AOR', dossier: '10_RECEPTION_AOR' },
  { id: 'CLOS', nom: 'Dossier clos', court: 'CLOS', dossier: '99_ARCHIVES' }
];
export const phase = (id) => PHASES.find((p) => p.id === id) || PHASES[1];

// Corps d'état : liste modifiable (Réglages), avec une couleur par corps d'état pour les pastilles
const LOT_COLORS = ['#1E5AA8', '#C62828', '#2E7D32', '#E07B00', '#6A1B9A', '#00838F', '#AD1457', '#5D4037', '#F9A825', '#3949AB', '#558B2F', '#D84315', '#455A64', '#8E24AA', '#00695C', '#9E9D24', '#757575', '#161616'];
export const DEFAULT_LOTS = [
  ['GEN', 'Remarque générale', 'GEN', '#161616'],
  ['MOA', 'Maître d\u2019ouvrage', 'MOA', '#8E24AA'],
  ['BC', 'Bureau de contrôle', 'BC', '#C62828'],
  ['SPS', 'Coordination SPS', 'SPS', '#757575'],
  ['01', 'VRD · Terrassement · Réseaux', 'VRD', '#5D4037'],
  ['02', 'Aménagements extérieurs · Paysage', 'AEX', '#7CB342'],
  ['03', 'Gros œuvre · Maçonnerie', 'GO', '#455A64'],
  ['04', 'Menuiseries extérieures', 'MEX', '#1E5AA8'],
  ['05', 'Charpente · Couverture · Étanchéité', 'COU', '#00695C'],
  ['06', 'Serrurerie · Métallerie', 'SER', '#6A1B9A'],
  ['07', 'Plâtrerie · Placo · Isolation', 'PLA', '#9E9D24'],
  ['08', 'Peinture', 'PEI', '#AD1457'],
  ['09', 'Sols souples', 'SOL', '#8D6E63'],
  ['10', 'Carrelage · Faïence', 'CAR', '#D84315'],
  ['11', 'Plomberie · Sanitaires', 'PLB', '#2E7D32'],
  ['12', 'Chauffage · Ventilation · Climatisation', 'CVC', '#00838F'],
  ['13', 'Électricité · Courants faibles', 'ELE', '#E07B00'],
  ['14', 'Menuiseries intérieures · Agencement', 'MIN', '#3949AB'],
  ['15', 'Luminaires', 'LUM', '#F9A825'],
  ['16', 'Décoration · Mobilier', 'DEC', '#C2185B']
].map(([id, nom, code, color]) => ({ id, nom, code, color }));
export const LOTS_VERSION = 2;
export const LOTS = DEFAULT_LOTS.map((l) => ({ ...l }));
export { LOT_COLORS };
export function setLots(list) { LOTS.splice(0, LOTS.length, ...list); }
export const lot = (id) => LOTS.find((l) => l.id === id) || (id ? { id, nom: 'Lot ' + id, code: id, color: '#757575' } : { id: '', nom: 'Non attribué', code: '—', color: '#757575' });
export const lotLabel = (id) => { const l = lot(id); return /^\d+$/.test(l.id) ? l.id + ' · ' + l.nom : l.nom; };

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

// Arborescence du dossier projet dans le Drive (Mon Drive › 2026 › 2026-006_ORTOLI_OLMICCIA)
export const FOLDERS = [
  { id: '00_ADMIN', nom: 'Administratif', desc: 'Convention, validations signées, courriers' },
  { id: '01_DONNEES_ENTREE', nom: 'Données d\u2019entrée', desc: 'Programme client, foncier et urbanisme, relevés, photos du site' },
  { id: '02_ESQ', nom: 'Esquisse', phase: true },
  { id: '03_APS', nom: 'APS', phase: true },
  { id: '04_APD', nom: 'APD', phase: true },
  { id: '05_AUTORISATIONS', nom: 'Autorisations', phase: true },
  { id: '06_PRO', nom: 'PRO', phase: true },
  { id: '07_DCE', nom: 'DCE', phase: true },
  { id: '08_ACT', nom: 'ACT', phase: true },
  { id: '09_CHANTIER_DET', nom: 'Chantier', phase: true },
  { id: '10_RECEPTION_AOR', nom: 'Réception', phase: true },
  { id: '11_COMMUNICATION', nom: 'Communication', desc: 'Images, publications' },
  { id: '99_ARCHIVES', nom: 'Archives', desc: 'Versions remplacées' }
];
export const SUBFOLDERS = [
  { id: '01_Entrant', nom: 'Entrant' }, { id: '02_Travail', nom: 'Travail' }, { id: '03_Emis', nom: 'Émis' }, { id: '04_Valide', nom: 'Validé' }
];
// Anciens dossiers de la V1 → arborescence du Drive
const FOLDER_MAP = { '01_ESQ': '02_ESQ', '02_APS': '03_APS', '03_APD': '04_APD', '04_PC': '05_AUTORISATIONS', '05_DCE': '07_DCE', '06_CHANTIER': '09_CHANTIER_DET', '07_PHOTOS': '01_DONNEES_ENTREE', '08_RECUS': '01_DONNEES_ENTREE' };
export const normFolder = (f) => FOLDER_MAP[f] || f;
// Code d'affaire : « 2026-006 » ; code des noms de fichiers : « 26006 »
export function fileCode(p) {
  const m = String((p && p.code) || '').match(/^(\d{2})?(\d{2})-?(\d{3})$/);
  if (m) return m[2] + m[3];
  return (p && (p.abbr || p.code) || 'XXXXX').replace(/-/g, '');
}
export function driveFolderName(p) {
  return p.driveFolder || ((p.code || 'AAAA-NNN') + '_' + (slug(p.nom || 'PROJET').replace(/-/g, '_').toUpperCase()));
}

export const DOC_TYPES = [
  ['PLN', 'Plan'], ['CR', 'Compte rendu'], ['NOT', 'Notice'], ['EST', 'Estimation'], ['PHO', 'Photos'],
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
  const obj = (slug(objet || 'Document') || 'Document').replace(/-/g, '_').toUpperCase();
  const parts = [yymmdd(date), String(code || 'XXXXX').replace(/-/g, '').toUpperCase(), ph || 'ESQ', type || 'DIV', obj, (ind || 'A').toUpperCase()];
  return parts.join('_') + (ext ? '.' + ext.replace(/^\./, '') : '');
}

export const CABINET_DEFAULT = {
  nom: 'STATERA ARCHITECTURE',
  architecte: 'Michel Mangion, architecte',
  adresse: 'Prumaticciu, Qua de l’Église – Village, 20100 Foce',
  tel: '07 81 16 49 21',
  email: 'contact@statera-architecture.fr',
  site: 'www.statera-architecture.fr',
  forme: 'entrepreneur individuel',
  ordre: 'Inscrit à l\u2019Ordre des architectes, région Corse, n° 094661',
  siren: 'SIRET 831 975 206 00028'
};
