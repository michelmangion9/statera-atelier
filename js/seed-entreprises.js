// Base de départ — entreprises de Corse-du-Sud (Ajaccio, Sartène / Propriano, Porto-Vecchio)
// Relevé d'annuaires publics (Obat, PagesJaunes, Pappers, Mappy, offres d'emploi) — novembre 2026.
// Rien n'est garanti : coordonnées, activité, Kbis et attestation décennale sont À VÉRIFIER avant consultation.
// [nom, ville, lots, adresse, source]
const OBAT = 'travaux.obat.fr';
const RAW = [
  // 01 VRD · Terrassement
  ['Roch Leandri BTP', 'Propriano', ['01', '03'], '', 'pmebtp.com (bâtiment, terrassement, VRD, toute la Corse-du-Sud)'],
  ['Muselli Paul-Louis', 'Propriano', ['01'], '', 'pagesjaunes.fr (terrassement, VRD, viabilisation)'],
  ['GS Terrassement', 'Sartène', ['01'], '', 'travaux.com'],
  ['Construction Lotissement Terrassement', 'Ajaccio', ['01', '03'], '', OBAT],
  ['Graziani TP', 'Porto-Vecchio', ['01'], '', 'pmebtp.com'],
  // 02 Aménagements extérieurs
  ['Casa Bati Chiara', 'Porto-Vecchio', ['02', '10'], '', OBAT + ' (aménagements extérieurs, carrelage)'],
  ['SARL Goncalves', 'Porto-Vecchio', ['02', '03'], 'Av. Doct. Joseph Balesi', OBAT + ' / pagesjaunes.fr'],
  ['A Vostra Casa', 'Ajaccio', ['02', '03'], '', OBAT + ' (maçon, terrassier)'],
  ['Baracca', 'Sartène', ['02', '03'], '', 'travaux.com (maçonnerie générale et TP)'],
  // 03 Gros œuvre
  ['Cesari Constructions', 'Lecci / Porto-Vecchio', ['03'], 'Porto-Vecchiaccio, 20137 Lecci', 'mappy.com / pmebtp.com (créée en 1957)'],
  ['Nat Construction', 'Porto-Vecchio', ['03', '10'], 'Route de Benciugno', OBAT + ' (rayon 30 km : Sartène, Bonifacio, Figari…)'],
  ['ACL Construction', 'Porto-Vecchio', ['03'], '', OBAT],
  ['Bati-Technic', 'Porto-Vecchio', ['03'], 'Chemin de Tenda', OBAT + ' / justacote.com'],
  ['Farrucci Constructions', 'Ajaccio', ['03'], '', OBAT],
  ['Serra Constructions', 'Ajaccio', ['03'], '', OBAT],
  ['CL Concept', 'Ajaccio', ['03'], '', OBAT + ' (fondée en 1994)'],
  ['Christophe Sarrazin', 'Ajaccio', ['03'], '', 'pagesjaunes.fr (maisons, piscines, murs banchés)'],
  ['Garcia Jean', 'Sartène', ['03'], 'Bd Jacques Nicolai, 20100 Sartène', 'pappers.fr (maçonnerie, créée en 1986)'],
  ['NP Goncalves', 'Propriano', ['03', '10'], '', OBAT],
  // 04 Menuiseries extérieures
  ['Miroiterie Orsoni', 'Ajaccio', ['04', '06'], '9 av. Noël Franchini, 20000 Ajaccio', 'mappy.com (alu, PVC, stores)'],
  ['AMP', 'Ajaccio', ['04', '14'], '21 cours Lucien Bonaparte, 20000 Ajaccio', 'pagesjaunes.fr / 118000.fr'],
  ['Delta Aluminium', 'Ajaccio', ['04'], 'Rue du Soleil Levant, 20090 Ajaccio', '118000.fr'],
  ['Caséo Monte-Biancu', 'Ajaccio', ['04'], 'Route de Campo dell’Oro, 20090 Ajaccio', '118000.fr'],
  ['Menuiserie Conseil Avenir', 'Porto-Vecchio', ['04', '14'], '', OBAT],
  // 05 Charpente · Couverture · Étanchéité
  ['Kallist’Étanchéité', 'Ajaccio', ['05'], '', OBAT],
  ['Charpente Margaroli Concept', 'Porto-Vecchio', ['05'], '', OBAT],
  ['LC Charpente', 'Porto-Vecchio', ['05'], '', 'pmebtp.com (charpente, ossature bois, couverture)'],
  ['Latarredda', 'Porto-Vecchio', ['05'], '', OBAT + ' (étanchéité, couverture)'],
  ['G-R Couverture', 'Conca', ['05'], '', OBAT],
  ['Pierre Coanet', 'Bastelicaccia', ['05'], '', OBAT],
  // 06 Serrurerie · Métallerie
  ['Ferronnerie E P', 'Porto-Vecchio', ['06'], 'Quartier Fossi', 'justacote.com (portails, garde-corps, escaliers)'],
  ['Usidel Concept', 'Porto-Vecchio', ['06'], 'Mortone', 'mappy.com'],
  ['Ange Martini', 'Porto-Vecchio', ['06'], '', OBAT],
  ['Sud Métallerie', 'Sarrola-Carcopino', ['06'], 'Baleone', 'justacote.com'],
  ['Projets Stores Menuiseries', 'Ajaccio', ['06', '04'], '', OBAT],
  // 07 Plâtrerie
  ['Iso Casa Corsa', 'Alata', ['07'], '', OBAT + ' (plâtrerie, isolation)'],
  ['Patrick Corti', 'Sartène', ['07', '08'], '', OBAT],
  ['Application Moderne', 'Ajaccio', ['07'], '', OBAT],
  ['Pieri et Martins Cloisons', 'Cuttoli-Corticchiato', ['07'], '', OBAT],
  ['Andria Décor', 'Porto-Vecchio', ['07', '08'], '', OBAT],
  ['Gilles Puchol', 'Porto-Vecchio', ['07', '08'], '', OBAT],
  // 08 Peinture
  ['Primacolor', 'Ajaccio', ['08'], '', OBAT],
  ['PF Façades', 'Ajaccio', ['08'], '', OBAT + ' (peinture, façades)'],
  ['Bouda Déco', 'Porto-Vecchio', ['08'], '', OBAT],
  ['Philippe Renaud', 'Porto-Vecchio', ['08'], '', OBAT],
  // 09 / 10 Sols souples · Carrelage
  ['Ajaccio Revêtements Carrelages', 'Ajaccio', ['09', '10'], '', OBAT],
  ['Santunione', 'Ajaccio', ['09', '10'], '', OBAT],
  ['Fabrice Feydel', 'Porto-Vecchio', ['09', '10'], '', OBAT],
  ['Procarl', 'Porto-Vecchio', ['09', '10'], '', OBAT + ' (carrelage, revêtements, villas et promotions)'],
  // 11 Plomberie · 12 CVC
  ['Guglielmi et Fils', 'Porto-Vecchio', ['11', '12'], '', OBAT],
  ['Capanaccia Jean-Noël (Capanaccia Bains)', 'Porto-Vecchio', ['11', '12'], '', 'pmebtp.com (plomberie familiale)'],
  ['Établissements Plaisent', 'Ajaccio', ['11', '12'], '', OBAT],
  ['Fluides High Tech', 'Ajaccio', ['11', '12', '13'], '', OBAT],
  ['Félix Martinetti', 'Ajaccio', ['11'], '', OBAT],
  ['Alain Bastaert Climatique', 'Ajaccio', ['12'], '', OBAT],
  ['Clim Sud', 'Ajaccio', ['12'], '', OBAT],
  ['ST Équipements', 'Sartène', ['12'], '', OBAT],
  ['Anthony Ciabrini', 'Porto-Vecchio', ['12'], '', OBAT],
  // 13 Électricité
  ['Pireddu Électricité', 'Ajaccio', ['13', '12'], '', OBAT],
  ['SAS Pierre Culioli', 'Ajaccio', ['13'], '', OBAT],
  ['Savime', 'Ajaccio', ['13'], '', OBAT],
  ['Danelec', 'Porto-Vecchio', ['13'], '', OBAT],
  ['Florent Kammer', 'Porto-Vecchio', ['13'], '', OBAT],
  ['SARL EA Elec', 'Sartène', ['13'], '', 'travaux.com'],
  ['Elecdiffusion', 'Viggianello', ['13'], '', OBAT],
  // 14 Menuiseries intérieures · Agencement
  ['G.Z.B. Conception Meubles', 'Ajaccio', ['14'], '', OBAT + ' (menuisier, agenceur)'],
  ['Sud Créations', 'Porto-Vecchio', ['14'], '', OBAT + ' (agencement)'],
  // 15 Luminaires · 16 Décoration (fournisseurs / showrooms)
  ['Cinna Ajaccio', 'Ajaccio', ['16', '15'], '109 cours Napoléon, 20000 Ajaccio', 'au-magasin.fr'],
  ['Roche Bobois Porto-Vecchio', 'Porto-Vecchio', ['16', '15'], 'Poretta di Lavonieddu, Lago Nieullu', 'roche-bobois.com'],
  ['Corsica Déco', 'Ajaccio', ['16'], '', 'pagesjaunes.fr (aménagement et décoration intérieure)'],
  ['Ambiance Décoration', 'Ajaccio', ['16'], 'Route de Mezzavia, 20090 Ajaccio', 'au-magasin.fr']
];

export const SEED_VERSION = 'cds-2026-11';
export function seedEntreprises() {
  const now = new Date().toISOString();
  return RAW.map(([nom, ville, lots, adresse, source], i) => ({
    id: 'seed-' + String(i + 1).padStart(3, '0'),
    nom, ville, lots, adresse: adresse || ville,
    contact: '', tel: '', email: '', siret: '',
    notes: 'Base de départ — à vérifier (coordonnées, Kbis, attestation décennale). Source : ' + source + '.',
    aVerifier: true, seed: SEED_VERSION, createdAt: now
  }));
}
