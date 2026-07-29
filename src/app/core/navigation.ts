import { TranslationKey } from './i18n/translations';
import { IconName } from './icons';

export interface NavItem {
  route: string;
  /** Clés de traduction — le libellé n'est jamais codé en dur. */
  labelKey: TranslationKey;
  shortKey?: TranslationKey;
  descKey: TranslationKey;
  /** Clé du registre d'icônes Font Awesome. */
  icon: IconName;
}

export interface NavGroup {
  titleKey: TranslationKey;
  items: NavItem[];
}

/** Structure de navigation partagée par le rail latéral et le tiroir mobile. */
export const NAV_GROUPS: NavGroup[] = [
  {
    titleKey: 'nav.group.daily',
    items: [
      {
        route: '/tableau-de-bord',
        labelKey: 'nav.dashboard',
        shortKey: 'nav.dashboard.short',
        descKey: 'nav.dashboard.desc',
        icon: 'dashboard',
      },
      {
        route: '/coffre',
        labelKey: 'nav.vault',
        shortKey: 'nav.vault.short',
        descKey: 'nav.vault.desc',
        icon: 'vault',
      },
      { route: '/scanner', labelKey: 'nav.scanner', descKey: 'nav.scanner.desc', icon: 'scanner' },
      {
        route: '/calendrier',
        labelKey: 'nav.calendar',
        shortKey: 'nav.calendar.short',
        descKey: 'nav.calendar.desc',
        icon: 'calendar',
      },
      { route: '/alertes', labelKey: 'nav.alerts', descKey: 'nav.alerts.desc', icon: 'alerts' },
    ],
  },
  {
    titleKey: 'nav.group.money',
    items: [
      { route: '/contrats', labelKey: 'nav.contracts', descKey: 'nav.contracts.desc', icon: 'contracts' },
      { route: '/economies', labelKey: 'nav.savings', descKey: 'nav.savings.desc', icon: 'savings' },
      { route: '/renouvellement', labelKey: 'nav.renewal', descKey: 'nav.renewal.desc', icon: 'renewal' },
      { route: '/anomalies', labelKey: 'nav.anomalies', descKey: 'nav.anomalies.desc', icon: 'anomalies' },
      {
        route: '/fiscal',
        labelKey: 'nav.tax',
        shortKey: 'nav.tax.short',
        descKey: 'nav.tax.desc',
        icon: 'tax',
      },
    ],
  },
  {
    titleKey: 'nav.group.life',
    items: [
      {
        route: '/partage',
        labelKey: 'nav.sharing',
        shortKey: 'nav.sharing.short',
        descKey: 'nav.sharing.desc',
        icon: 'sharing',
      },
      { route: '/demenagement', labelKey: 'nav.moving', descKey: 'nav.moving.desc', icon: 'moving' },
      { route: '/succession', labelKey: 'nav.estate', descKey: 'nav.estate.desc', icon: 'estate' },
      { route: '/chronologie', labelKey: 'nav.timeline', descKey: 'nav.timeline.desc', icon: 'timeline' },
    ],
  },
  {
    titleKey: 'nav.group.help',
    items: [
      { route: '/assistant', labelKey: 'nav.chat', descKey: 'nav.chat.desc', icon: 'chat' },
      {
        route: '/archives',
        labelKey: 'nav.archive',
        shortKey: 'nav.archive.short',
        descKey: 'nav.archive.desc',
        icon: 'archive',
      },
      {
        route: '/parametres',
        labelKey: 'nav.settings',
        shortKey: 'nav.settings.short',
        descKey: 'nav.settings.desc',
        icon: 'settings',
      },
    ],
  },
];

/** Éléments épinglés dans la barre inférieure mobile (le 3e est le bouton central). */
export const BOTTOM_NAV: NavItem[] = [
  NAV_GROUPS[0].items[0], // Tableau de bord
  NAV_GROUPS[0].items[1], // Coffre-fort
  NAV_GROUPS[0].items[2], // Scanner
  NAV_GROUPS[0].items[3], // Calendrier
  NAV_GROUPS[3].items[0], // Assistant
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
