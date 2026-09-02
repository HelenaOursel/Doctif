/**
 * Dictionnaires de traduction.
 *
 * Ajouter une langue = créer un objet respectant le type `Dictionary` et
 * l'enregistrer dans `LOCALES`. Le français fait office de référence : toute
 * clé absente d'une autre langue retombe automatiquement sur lui, ce qui
 * permet de livrer une traduction partielle sans casser l'interface.
 */

export type LocaleCode = 'fr' | 'en';

export interface LocaleMeta {
  code: LocaleCode;
  /** Nom de la langue, écrit dans cette langue. */
  label: string;
  flag: string;
  /** Étiquette BCP 47 posée sur <html lang> et utilisée par Intl. */
  tag: string;
}

/** Le dictionnaire français définit l'ensemble des clés valides. */
export const FR = {
  /* --- Chrome applicatif --- */
  'app.name': "Assistant d'administration",
  'app.skipLink': 'Aller au contenu principal',
  'app.menu.open': 'Ouvrir le menu de navigation',
  'app.menu.close': 'Fermer le menu',
  'app.theme.toLight': 'Passer au thème clair',
  'app.theme.toDark': 'Passer au thème sombre',
  'app.theme.light': 'Thème clair',
  'app.theme.dark': 'Thème sombre',
  'app.alerts.aria': 'Alertes',
  'app.alerts.unread': '{count} alertes non lues',
  'app.readOnly.title': 'Mode archive — lecture seule',
  'app.readOnly.body':
    "Vos documents restent consultables et exportables, mais aucune modification n'est possible.",
  'app.readOnly.manage': 'Gérer',
  'app.language': 'Langue',

  /* --- Groupes de navigation --- */
  'nav.group.daily': 'Quotidien',
  'nav.group.money': 'Contrats & argent',
  'nav.group.life': 'Vie & famille',
  'nav.group.help': 'Assistance',

  /* --- Entrées de navigation --- */
  'nav.dashboard': 'Tableau de bord',
  'nav.dashboard.short': 'Accueil',
  'nav.dashboard.desc': 'Ce qui demande votre attention',
  'nav.vault': 'Coffre-fort',
  'nav.vault.short': 'Coffre',
  'nav.vault.desc': 'Tous vos documents, classés et cherchables',
  'nav.scanner': 'Scanner',
  'nav.scanner.desc': 'Photographier un document et le classer automatiquement',
  'nav.calendar': 'Calendrier',
  'nav.calendar.short': 'Agenda',
  'nav.calendar.desc': 'Échéances, alertes et chronologie',
  'nav.contracts': 'Contrats',
  'nav.contracts.desc': 'Vérification des clauses et score de risque',
  'nav.savings': 'Économies',
  'nav.savings.desc': 'Doublons, hausses et anomalies de facturation',
  'nav.tax': 'Espace fiscal',
  'nav.tax.short': 'Fiscal',
  'nav.tax.desc': 'Déclarations, avis, taxes et rappels',
  'nav.sharing': 'Partage familial',
  'nav.sharing.short': 'Partage',
  'nav.sharing.desc': 'Logement, véhicule et assurances partagés',
  'nav.moving': 'Déménagement',
  'nav.moving.desc': 'Checklist et transferts de contrats',
  'nav.estate': 'Succession',
  'nav.estate.desc': 'Patrimoine, bénéficiaires et documents clés',
  'nav.chat': 'Assistant',
  'nav.chat.desc': 'Posez vos questions administratives',
  'nav.settings': 'Paramètres',
  'nav.settings.short': 'Réglages',
  'nav.settings.desc': 'Profil, données, archivage et export',

  /* --- Actions communes --- */
  'action.add': 'Ajouter',
  'action.save': 'Enregistrer',
  'action.cancel': 'Annuler',
  'action.close': 'Fermer',
  'action.delete': 'Supprimer',
  'action.edit': 'Modifier',
  'action.search': 'Rechercher',
  'action.filter': 'Filtrer',
  'action.reset': 'Réinitialiser',
  'action.seeAll': 'Tout voir',
  'action.open': 'Ouvrir',
  'action.copy': 'Copier',
  'action.copied': 'Copié',
  'action.download': 'Télécharger',
  'action.print': 'Imprimer',
  'action.send': 'Envoyer',
  'action.share': 'Partager',
  'action.confirm': 'Confirmer',
  'action.back': 'Retour',
  'action.import': 'Importer',
  'action.export': 'Exporter',
  'action.markDone': 'Marquer comme fait',
  'action.markAllRead': 'Tout marquer comme lu',

  /* --- Vocabulaire transverse --- */
  'common.category': 'Catégorie',
  'common.categories': 'Catégories',
  'common.date': 'Date',
  'common.amount': 'Montant',
  'common.provider': 'Fournisseur',
  'common.issuer': 'Émetteur',
  'common.status': 'Statut',
  'common.none': 'Aucun',
  'common.all': 'Tout',
  'common.perMonth': 'par mois',
  'common.perYear': 'par an',
  'common.document': 'Document',
  'common.documents': 'Documents',
  'common.contract': 'Contrat',
  'common.contracts': 'Contrats',
  'common.deadline': 'Échéance',
  'common.deadlines': 'Échéances',
  'common.loading': 'Chargement…',
  'common.noResult': 'Aucun résultat',
  'common.demoData': 'Données de démonstration',

  /* --- Tableau de bord --- */
  'dashboard.title': 'Tableau de bord',
  'dashboard.greeting': 'Bonjour {name}',
  'dashboard.stat.contracts': 'Contrats actifs',
  'dashboard.stat.monthly': 'Coût mensuel',
  'dashboard.stat.deadlines': 'Échéances < 30 j',
  'dashboard.stat.savings': 'Économies /an',
  'dashboard.upcoming': 'Échéances proches',
  'dashboard.missing': 'Documents manquants',
  'dashboard.empty.deadlines': 'Aucune échéance dans les 90 prochains jours.',
  'dashboard.empty.missing': 'Votre coffre est complet.',

  /* --- Coffre-fort --- */
  'vault.title': 'Coffre-fort documentaire',
  'vault.subtitle': '{count} documents classés automatiquement.',
  'vault.searchPlaceholder': 'Rechercher dans le contenu des documents…',
  'vault.filters': 'Filtres',
  'vault.includeArchived': 'Inclure les archives',
  'vault.onlyShared': 'Partagés uniquement',
  'vault.results': '{count} résultat(s)',
  'vault.empty': 'Aucun document ne correspond à votre recherche.',
  'vault.import': 'Importer',
  'vault.dropHint': 'Glissez vos PDF, photos ou e-mails ici',

  /* --- Scanner --- */
  'scanner.title': 'Scanner intelligent',
  'scanner.subtitle': 'Photographiez un document : le type est reconnu, le texte extrait, le fichier renommé.',

  /* --- Alertes --- */
  'alerts.title': 'Alertes',
  'alerts.empty': 'Aucune alerte en cours.',

  /* --- Divers écrans --- */
  'calendar.title': 'Calendrier des échéances',
  'contracts.title': 'Mes contrats',
  'savings.title': 'Économies possibles',
  'renewal.title': 'Renouvellement intelligent',
  'anomalies.title': 'Détection d’anomalies',
  'sharing.title': 'Partage familial',
  'tax.title': 'Espace fiscal',
  'moving.title': 'Assistant déménagement',
  'estate.title': 'Assistant succession',
  'timeline.title': 'Chronologie administrative',
  'chat.title': 'Assistant administratif',
  'archive.title': 'Archivage à vie',
  'settings.title': 'Paramètres',
} as const;

export type TranslationKey = keyof typeof FR;
export type Dictionary = Record<TranslationKey, string>;

/**
 * Traduction anglaise — partielle et volontairement assumée : les clés
 * manquantes retombent sur le français. Elle sert surtout à valider que la
 * bascule de langue fonctionne de bout en bout.
 */
export const EN: Partial<Dictionary> = {
  'app.name': 'Personal admin assistant',
  'app.skipLink': 'Skip to main content',
  'app.menu.open': 'Open navigation menu',
  'app.menu.close': 'Close menu',
  'app.theme.toLight': 'Switch to light theme',
  'app.theme.toDark': 'Switch to dark theme',
  'app.theme.light': 'Light theme',
  'app.theme.dark': 'Dark theme',
  'app.alerts.aria': 'Alerts',
  'app.alerts.unread': '{count} unread alerts',
  'app.readOnly.title': 'Archive mode — read only',
  'app.readOnly.body': 'Your documents remain viewable and exportable, but no changes are possible.',
  'app.readOnly.manage': 'Manage',
  'app.language': 'Language',

  'nav.group.daily': 'Everyday',
  'nav.group.money': 'Contracts & money',
  'nav.group.life': 'Life & family',
  'nav.group.help': 'Support',

  'nav.dashboard': 'Dashboard',
  'nav.dashboard.short': 'Home',
  'nav.dashboard.desc': 'What needs your attention',
  'nav.vault': 'Document vault',
  'nav.vault.short': 'Vault',
  'nav.vault.desc': 'All your documents, sorted and searchable',
  'nav.scanner': 'Scanner',
  'nav.scanner.desc': 'Photograph a document and file it automatically',
  'nav.calendar': 'Calendar',
  'nav.calendar.short': 'Calendar',
  'nav.calendar.desc': 'Deadlines, alerts and timeline',
  'nav.contracts': 'Contracts',
  'nav.contracts.desc': 'Clause review and risk score',
  'nav.savings': 'Savings',
  'nav.savings.desc': 'Duplicates, price rises and billing anomalies',
  'nav.tax': 'Tax centre',
  'nav.tax.short': 'Tax',
  'nav.tax.desc': 'Returns, notices, taxes and reminders',
  'nav.sharing': 'Family sharing',
  'nav.sharing.short': 'Sharing',
  'nav.sharing.desc': 'Shared home, vehicle and insurance',
  'nav.moving': 'Moving house',
  'nav.moving.desc': 'Checklist and contract transfers',
  'nav.estate': 'Estate',
  'nav.estate.desc': 'Assets, beneficiaries and key documents',
  'nav.chat': 'Assistant',
  'nav.chat.desc': 'Ask your admin questions',
  'nav.settings': 'Settings',
  'nav.settings.short': 'Settings',
  'nav.settings.desc': 'Profile, data, archiving and export',

  'action.add': 'Add',
  'action.save': 'Save',
  'action.cancel': 'Cancel',
  'action.close': 'Close',
  'action.delete': 'Delete',
  'action.edit': 'Edit',
  'action.search': 'Search',
  'action.filter': 'Filter',
  'action.reset': 'Reset',
  'action.seeAll': 'See all',
  'action.open': 'Open',
  'action.copy': 'Copy',
  'action.copied': 'Copied',
  'action.download': 'Download',
  'action.print': 'Print',
  'action.send': 'Send',
  'action.share': 'Share',
  'action.confirm': 'Confirm',
  'action.back': 'Back',
  'action.import': 'Import',
  'action.export': 'Export',
  'action.markDone': 'Mark as done',
  'action.markAllRead': 'Mark all as read',

  'common.category': 'Category',
  'common.categories': 'Categories',
  'common.date': 'Date',
  'common.amount': 'Amount',
  'common.provider': 'Provider',
  'common.issuer': 'Issuer',
  'common.status': 'Status',
  'common.none': 'None',
  'common.all': 'All',
  'common.perMonth': 'per month',
  'common.perYear': 'per year',
  'common.document': 'Document',
  'common.documents': 'Documents',
  'common.contract': 'Contract',
  'common.contracts': 'Contracts',
  'common.deadline': 'Deadline',
  'common.deadlines': 'Deadlines',
  'common.loading': 'Loading…',
  'common.noResult': 'No result',
  'common.demoData': 'Demo data',

  'dashboard.title': 'Dashboard',
  'dashboard.greeting': 'Hello {name}',
  'dashboard.stat.contracts': 'Active contracts',
  'dashboard.stat.monthly': 'Monthly cost',
  'dashboard.stat.deadlines': 'Deadlines < 30 d',
  'dashboard.stat.savings': 'Savings /year',
  'dashboard.upcoming': 'Upcoming deadlines',
  'dashboard.missing': 'Missing documents',
  'dashboard.empty.deadlines': 'No deadline in the next 90 days.',
  'dashboard.empty.missing': 'Your vault is complete.',

  'vault.title': 'Document vault',
  'vault.subtitle': '{count} documents filed automatically.',
  'vault.searchPlaceholder': 'Search inside document contents…',
  'vault.filters': 'Filters',
  'vault.includeArchived': 'Include archives',
  'vault.onlyShared': 'Shared only',
  'vault.results': '{count} result(s)',
  'vault.empty': 'No document matches your search.',
  'vault.import': 'Import',
  'vault.dropHint': 'Drop your PDFs, photos or emails here',

  'scanner.title': 'Smart scanner',
  'scanner.subtitle': 'Photograph a document: the type is recognised, the text extracted, the file renamed.',

  'alerts.title': 'Alerts',
  'alerts.empty': 'No active alert.',

  'calendar.title': 'Deadline calendar',
  'contracts.title': 'My contracts',
  'savings.title': 'Possible savings',
  'renewal.title': 'Smart renewal',
  'anomalies.title': 'Anomaly detection',
  'sharing.title': 'Family sharing',
  'tax.title': 'Tax centre',
  'moving.title': 'Moving assistant',
  'estate.title': 'Estate assistant',
  'timeline.title': 'Admin timeline',
  'chat.title': 'Admin assistant',
  'archive.title': 'Lifetime archive',
  'settings.title': 'Settings',
};

export const LOCALES: Record<LocaleCode, { meta: LocaleMeta; dictionary: Partial<Dictionary> }> = {
  fr: {
    meta: { code: 'fr', label: 'Français', flag: '🇫🇷', tag: 'fr-FR' },
    dictionary: FR,
  },
  en: {
    meta: { code: 'en', label: 'English', flag: '🇬🇧', tag: 'en-GB' },
    dictionary: EN,
  },
};

export const DEFAULT_LOCALE: LocaleCode = 'fr';
