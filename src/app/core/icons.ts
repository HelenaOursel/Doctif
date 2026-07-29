/**
 * Registre des icônes — Font Awesome 7 Free.
 *
 * Seules les familles gratuites sont utilisées : `fa-solid`, `fa-regular` et
 * `fa-brands`. Aucune icône Pro n'est référencée ici ; centraliser la table
 * garantit que cette contrainte reste vérifiable d'un seul coup d'œil.
 *
 * Les valeurs sont les classes complètes à poser sur un `<i>`.
 */
export const ICONS = {
  /* --- Marque & chrome --- */
  brand: 'fa-solid fa-folder-tree',
  menu: 'fa-solid fa-bars',
  close: 'fa-solid fa-xmark',
  back: 'fa-solid fa-arrow-left',
  themeDark: 'fa-solid fa-moon',
  themeLight: 'fa-solid fa-sun',
  bell: 'fa-solid fa-bell',
  lock: 'fa-solid fa-lock',
  language: 'fa-solid fa-language',
  chevronDown: 'fa-solid fa-chevron-down',
  chevronRight: 'fa-solid fa-chevron-right',
  ellipsis: 'fa-solid fa-ellipsis',

  /* --- Navigation --- */
  dashboard: 'fa-solid fa-gauge-high',
  vault: 'fa-solid fa-vault',
  scanner: 'fa-solid fa-camera',
  calendar: 'fa-solid fa-calendar-days',
  alerts: 'fa-solid fa-bell',
  contracts: 'fa-solid fa-file-contract',
  savings: 'fa-solid fa-piggy-bank',
  renewal: 'fa-solid fa-arrows-rotate',
  anomalies: 'fa-solid fa-chart-line',
  tax: 'fa-solid fa-file-invoice-dollar',
  sharing: 'fa-solid fa-people-roof',
  moving: 'fa-solid fa-boxes-packing',
  estate: 'fa-solid fa-landmark',
  timeline: 'fa-solid fa-clock-rotate-left',
  chat: 'fa-solid fa-comments',
  archive: 'fa-solid fa-box-archive',
  settings: 'fa-solid fa-gear',

  /* --- Catégories de documents --- */
  catAssurance: 'fa-solid fa-shield-halved',
  catEnergie: 'fa-solid fa-bolt',
  catInternet: 'fa-solid fa-wifi',
  catBanque: 'fa-solid fa-building-columns',
  catLogement: 'fa-solid fa-house',
  catImpots: 'fa-solid fa-file-invoice-dollar',
  catSante: 'fa-solid fa-stethoscope',
  catVehicule: 'fa-solid fa-car',
  catAutre: 'fa-solid fa-folder',

  /* --- Types d'échéances --- */
  deadlineContract: 'fa-solid fa-file-circle-xmark',
  deadlineBirthday: 'fa-solid fa-cake-candles',
  deadlineTechnical: 'fa-solid fa-screwdriver-wrench',
  deadlineInsurance: 'fa-solid fa-shield-halved',
  deadlineTax: 'fa-solid fa-file-invoice-dollar',
  deadlineOther: 'fa-solid fa-thumbtack',

  /* --- Types de documents --- */
  docInvoice: 'fa-solid fa-receipt',
  docContract: 'fa-solid fa-file-signature',
  docCertificate: 'fa-solid fa-certificate',
  docNotice: 'fa-solid fa-file-invoice',
  docStatement: 'fa-solid fa-file-lines',
  docLetter: 'fa-solid fa-envelope-open-text',
  docProof: 'fa-solid fa-file-shield',
  docPrescription: 'fa-solid fa-prescription',
  docOther: 'fa-solid fa-file',

  /* --- Statuts & retours --- */
  success: 'fa-solid fa-circle-check',
  warning: 'fa-solid fa-triangle-exclamation',
  danger: 'fa-solid fa-circle-exclamation',
  info: 'fa-solid fa-circle-info',
  blocked: 'fa-solid fa-ban',
  pending: 'fa-regular fa-clock',
  check: 'fa-solid fa-check',
  checkCircle: 'fa-regular fa-circle-check',
  emptyCircle: 'fa-regular fa-circle',

  /* --- Actions --- */
  search: 'fa-solid fa-magnifying-glass',
  filter: 'fa-solid fa-sliders',
  add: 'fa-solid fa-plus',
  edit: 'fa-solid fa-pen',
  trash: 'fa-solid fa-trash',
  import: 'fa-solid fa-file-import',
  export: 'fa-solid fa-file-export',
  download: 'fa-solid fa-download',
  upload: 'fa-solid fa-cloud-arrow-up',
  print: 'fa-solid fa-print',
  copy: 'fa-regular fa-copy',
  send: 'fa-solid fa-paper-plane',
  mail: 'fa-solid fa-envelope',
  postal: 'fa-solid fa-envelopes-bulk',
  link: 'fa-solid fa-arrow-up-right-from-square',
  refresh: 'fa-solid fa-rotate',
  share: 'fa-solid fa-share-nodes',
  eye: 'fa-solid fa-eye',

  /* --- Divers métier --- */
  user: 'fa-solid fa-user',
  users: 'fa-solid fa-users',
  userPlus: 'fa-solid fa-user-plus',
  money: 'fa-solid fa-money-bill-wave',
  trendUp: 'fa-solid fa-arrow-trend-up',
  trendDown: 'fa-solid fa-arrow-trend-down',
  duplicate: 'fa-solid fa-clone',
  sleep: 'fa-solid fa-moon',
  scale: 'fa-solid fa-scale-balanced',
  gavel: 'fa-solid fa-gavel',
  robot: 'fa-solid fa-wand-magic-sparkles',
  sparkles: 'fa-solid fa-wand-magic-sparkles',
  inbox: 'fa-solid fa-inbox',
  calendarEmpty: 'fa-regular fa-calendar-xmark',
  image: 'fa-regular fa-image',
  camera: 'fa-solid fa-camera',
  boxOpen: 'fa-solid fa-box-open',
  clipboard: 'fa-solid fa-clipboard-list',
  star: 'fa-solid fa-star',
  starHalf: 'fa-solid fa-star-half-stroke',
  starEmpty: 'fa-regular fa-star',
} as const;

export type IconName = keyof typeof ICONS;

/** Icône associée à une catégorie de document. */
export const CATEGORY_ICON: Record<string, string> = {
  assurance: ICONS.catAssurance,
  energie: ICONS.catEnergie,
  internet: ICONS.catInternet,
  banque: ICONS.catBanque,
  logement: ICONS.catLogement,
  impots: ICONS.catImpots,
  sante: ICONS.catSante,
  vehicule: ICONS.catVehicule,
  autre: ICONS.catAutre,
};

/** Icône associée à un type d'échéance. */
export const DEADLINE_ICON: Record<string, string> = {
  'fin-contrat': ICONS.deadlineContract,
  anniversaire: ICONS.deadlineBirthday,
  'controle-technique': ICONS.deadlineTechnical,
  'renouvellement-assurance': ICONS.deadlineInsurance,
  impots: ICONS.deadlineTax,
  autre: ICONS.deadlineOther,
};

/** Icône associée à un type de document. */
export const DOC_TYPE_ICON: Record<string, string> = {
  facture: ICONS.docInvoice,
  contrat: ICONS.docContract,
  attestation: ICONS.docCertificate,
  avis: ICONS.docNotice,
  releve: ICONS.docStatement,
  courrier: ICONS.docLetter,
  justificatif: ICONS.docProof,
  ordonnance: ICONS.docPrescription,
  autre: ICONS.docOther,
};
