/**
 * Modèle de données de l'assistant d'administration personnelle.
 * Tout est sérialisable en JSON : le store persiste dans localStorage.
 */

export const CATEGORIES = [
  'assurance',
  'energie',
  'internet',
  'banque',
  'logement',
  'impots',
  'sante',
  'vehicule',
  'autre',
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Libellé, icône Font Awesome et variable CSS de couleur, par catégorie. */
export const CATEGORY_META: Record<Category, { label: string; icon: string; cssVar: string }> = {
  assurance: { label: 'Assurance', icon: 'fa-solid fa-shield-halved', cssVar: '--cat-assurance' },
  energie: { label: 'Énergie', icon: 'fa-solid fa-bolt', cssVar: '--cat-energie' },
  internet: { label: 'Internet', icon: 'fa-solid fa-wifi', cssVar: '--cat-internet' },
  banque: { label: 'Banque', icon: 'fa-solid fa-building-columns', cssVar: '--cat-banque' },
  logement: { label: 'Logement', icon: 'fa-solid fa-house', cssVar: '--cat-logement' },
  impots: { label: 'Impôts', icon: 'fa-solid fa-file-invoice-dollar', cssVar: '--cat-impots' },
  sante: { label: 'Santé', icon: 'fa-solid fa-stethoscope', cssVar: '--cat-sante' },
  vehicule: { label: 'Véhicule', icon: 'fa-solid fa-car', cssVar: '--cat-vehicule' },
  autre: { label: 'Autre', icon: 'fa-solid fa-folder', cssVar: '--cat-autre' },
};

export type DocSource = 'pdf' | 'photo' | 'email' | 'scan';

export type DocType =
  | 'facture'
  | 'contrat'
  | 'attestation'
  | 'avis'
  | 'releve'
  | 'courrier'
  | 'justificatif'
  | 'ordonnance'
  | 'autre';

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  facture: 'Facture',
  contrat: 'Contrat',
  attestation: 'Attestation',
  avis: "Avis d'imposition",
  releve: 'Relevé',
  courrier: 'Courrier',
  justificatif: 'Justificatif',
  ordonnance: 'Ordonnance',
  autre: 'Document',
};

/** Un document du coffre-fort. */
export interface DocumentItem {
  id: string;
  /** Nom normalisé généré automatiquement au dépôt. */
  name: string;
  originalName: string;
  category: Category;
  docType: DocType;
  source: DocSource;
  /** Émetteur détecté (EDF, MAIF, DGFiP…). */
  issuer: string;
  /** Date du document (ISO yyyy-mm-dd). */
  date: string;
  addedAt: string;
  sizeKb: number;
  /** Texte extrait — base de la recherche plein texte. */
  text: string;
  amount?: number;
  tags: string[];
  contractId?: string;
  /** Identifiants des membres de la famille ayant accès. */
  sharedWith: string[];
  /** Conservé en lecture seule (archivage à vie). */
  archived: boolean;
  /** Score de confiance du classement automatique (0–1). */
  confidence: number;
  /** Vignette : data-URL pour les documents scannés/photographiés. */
  thumbnail?: string;
}

export type ClauseSeverity = 'info' | 'attention' | 'risque';

export interface Clause {
  id: string;
  title: string;
  excerpt: string;
  severity: ClauseSeverity;
  reason: string;
}

export type ContractStatus = 'actif' | 'resilie' | 'expire';

/** Un contrat / abonnement suivi. */
export interface Contract {
  id: string;
  label: string;
  provider: string;
  category: Category;
  monthlyCost: number;
  /** Coût mensuel de la période précédente — sert au calcul d'augmentation. */
  previousMonthlyCost?: number;
  startDate: string;
  /** Fin d'engagement. */
  endDate?: string;
  /** Date anniversaire / tacite reconduction. */
  renewalDate?: string;
  noticePeriodDays: number;
  commitmentMonths: number;
  status: ContractStatus;
  clauses: Clause[];
  /** Frais annexes annuels (frais de dossier, options facturées…). */
  hiddenFees: number;
  sharedWith: string[];
  /** Dernière utilisation constatée — détecte les abonnements dormants. */
  lastUsedAt?: string;
  usagePerMonth?: number;
  documentIds: string[];
  /** Objet couvert, sert au regroupement des doublons (ex. « habitation », « Clio IV »). */
  coverageOf?: string;
  cancelledAt?: string;
}

export type DeadlineKind =
  | 'fin-contrat'
  | 'anniversaire'
  | 'controle-technique'
  | 'renouvellement-assurance'
  | 'impots'
  | 'autre';

export const DEADLINE_KIND_LABEL: Record<DeadlineKind, string> = {
  'fin-contrat': 'Fin de contrat',
  anniversaire: 'Date anniversaire',
  'controle-technique': 'Contrôle technique',
  'renouvellement-assurance': "Renouvellement d'assurance",
  impots: 'Échéance fiscale',
  autre: 'Échéance',
};

export interface Deadline {
  id: string;
  title: string;
  /** ISO yyyy-mm-dd. */
  date: string;
  kind: DeadlineKind;
  category: Category;
  contractId?: string;
  documentId?: string;
  /** Détectée automatiquement à partir d'un contrat ou d'un document. */
  detected: boolean;
  done: boolean;
  note?: string;
}

export type AlertLevel = 'J-30' | 'J-7' | 'J-1' | 'depassee';

/** Alerte dérivée d'une échéance — recalculée, jamais persistée telle quelle. */
export interface AlertItem {
  id: string;
  deadlineId: string;
  level: AlertLevel;
  daysLeft: number;
  title: string;
  date: string;
  category: Category;
  kind: DeadlineKind;
  read: boolean;
}

export type ShareScope = 'logement' | 'vehicule' | 'assurance' | 'sante' | 'finances';

export const SHARE_SCOPE_LABEL: Record<ShareScope, string> = {
  logement: 'Logement',
  vehicule: 'Véhicule',
  assurance: 'Assurances',
  sante: 'Santé',
  finances: 'Finances',
};

export interface FamilyMember {
  id: string;
  name: string;
  relation: string;
  email: string;
  color: string;
  scopes: ShareScope[];
  /** Accès en lecture seule (ex. enfant, notaire). */
  readOnly: boolean;
  invitedAt: string;
  status: 'actif' | 'invite';
}

/** Une ligne de facturation, base de la détection d'anomalies. */
export interface Bill {
  id: string;
  category: Category;
  provider: string;
  /** Période au format yyyy-MM. */
  period: string;
  amount: number;
  contractId?: string;
  documentId?: string;
}

export type TaxKind = 'declaration' | 'avis-imposition' | 'taxe-fonciere' | 'taxe-habitation' | 'revenus';

export const TAX_KIND_LABEL: Record<TaxKind, string> = {
  declaration: 'Déclaration de revenus',
  'avis-imposition': "Avis d'imposition",
  'taxe-fonciere': 'Taxe foncière',
  'taxe-habitation': "Taxe d'habitation",
  revenus: 'Justificatif de revenus',
};

export interface TaxRecord {
  id: string;
  year: number;
  kind: TaxKind;
  amount?: number;
  status: 'a-faire' | 'en-cours' | 'depose' | 'paye';
  dueDate?: string;
  documentId?: string;
  note?: string;
}

export type TimelineKind =
  | 'contrat'
  | 'resiliation'
  | 'achat'
  | 'demenagement'
  | 'document'
  | 'fiscal'
  | 'sante'
  | 'vehicule';

export interface TimelineEvent {
  id: string;
  date: string;
  title: string;
  description: string;
  kind: TimelineKind;
  category: Category;
  contractId?: string;
  documentId?: string;
}

export type MovingGroup = 'administratif' | 'contrats' | 'logistique' | 'apres';

export const MOVING_GROUP_LABEL: Record<MovingGroup, string> = {
  administratif: "Changements d'adresse",
  contrats: 'Contrats à transférer ou résilier',
  logistique: 'Logistique',
  apres: 'Après le déménagement',
};

export interface MovingTask {
  id: string;
  label: string;
  group: MovingGroup;
  /** Décalage en jours par rapport à la date de déménagement (négatif = avant). */
  offsetDays: number;
  done: boolean;
  hint?: string;
  contractId?: string;
}

export interface MovingProject {
  id: string;
  fromAddress: string;
  toAddress: string;
  date: string;
  tasks: MovingTask[];
  active: boolean;
}

export type EstateKind = 'immobilier' | 'assurance-vie' | 'compte' | 'vehicule' | 'objet' | 'document';

export const ESTATE_KIND_LABEL: Record<EstateKind, string> = {
  immobilier: 'Bien immobilier',
  'assurance-vie': 'Assurance vie',
  compte: 'Compte bancaire',
  vehicule: 'Véhicule',
  objet: 'Bien de valeur',
  document: 'Document important',
};

export interface EstateAsset {
  id: string;
  label: string;
  kind: EstateKind;
  value?: number;
  institution?: string;
  /** Identifiants de membres de la famille désignés bénéficiaires. */
  beneficiaries: string[];
  documentIds: string[];
  notes?: string;
}

/** Une démarche type et la liste des pièces qu'elle exige. */
export interface Procedure {
  id: string;
  title: string;
  /** Mots-clés utilisés par l'assistant conversationnel. */
  keywords: string[];
  intro: string;
  items: ProcedureItem[];
}

export interface ProcedureItem {
  label: string;
  required: boolean;
  category: Category;
  /** Termes recherchés dans le coffre pour savoir si la pièce est déjà présente. */
  match: string[];
  hint?: string;
}

/** Résultat de l'évaluation d'une démarche contre le contenu du coffre. */
export interface ProcedureCheck {
  procedure: Procedure;
  present: { item: ProcedureItem; document: DocumentItem }[];
  missing: ProcedureItem[];
  completion: number;
}

export interface Offer {
  id: string;
  provider: string;
  label: string;
  category: Category;
  monthlyCost: number;
  highlights: string[];
  rating: number;
  affiliate: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  at: string;
  /** Suggestions de relance proposées sous la réponse. */
  suggestions?: string[];
  links?: { label: string; route: string }[];
  /** Liste de pièces à cocher rendue sous la réponse. */
  checklist?: { label: string; ok: boolean; hint?: string }[];
}

export interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  address: string;
  postalCode: string;
  city: string;
  phone: string;
  birthDate: string;
  /** Le service est résilié : accès en lecture seule (archivage à vie). */
  readOnlyMode: boolean;
}

/** Racine persistée. */
export interface AppState {
  version: number;
  profile: UserProfile;
  documents: DocumentItem[];
  contracts: Contract[];
  deadlines: Deadline[];
  members: FamilyMember[];
  bills: Bill[];
  taxes: TaxRecord[];
  estate: EstateAsset[];
  moving: MovingProject | null;
  chat: ChatMessage[];
  readAlertIds: string[];
  timelineExtra: TimelineEvent[];
}

/* -------------------------------------------------------------------------
   Types dérivés (calculés, non persistés)
   ------------------------------------------------------------------------- */

export interface DuplicateInsurance {
  coverage: string;
  contracts: Contract[];
  wastedPerYear: number;
}

export interface UnusedSubscription {
  contract: Contract;
  monthsIdle: number;
  wastedPerYear: number;
}

export interface PriceIncrease {
  contract: Contract;
  previous: number;
  current: number;
  percent: number;
  extraPerYear: number;
}

export interface SavingsReport {
  duplicates: DuplicateInsurance[];
  unused: UnusedSubscription[];
  increases: PriceIncrease[];
  totalPerYear: number;
}

/** Pièce attendue au vu de la situation de l'utilisateur mais absente du coffre. */
export interface MissingDocument {
  id: string;
  label: string;
  reason: string;
  category: Category;
  severity: 'info' | 'attention' | 'risque';
}

export interface RiskAssessment {
  contractId: string;
  score: number;
  level: 'faible' | 'modere' | 'eleve';
  factors: { label: string; points: number; detail: string }[];
}

export type AnomalyKind = 'facture-elevee' | 'prelevement-inhabituel' | 'hausse-brutale' | 'doublon-facture';

export interface Anomaly {
  id: string;
  kind: AnomalyKind;
  category: Category;
  provider: string;
  period: string;
  amount: number;
  reference: number;
  deviationPercent: number;
  message: string;
  severity: 'info' | 'attention' | 'risque';
}

export interface CancellationLetter {
  contractId: string;
  subject: string;
  body: string;
  recipient: string;
  /** Date d'effet calculée à partir du préavis. */
  effectiveDate: string;
}
