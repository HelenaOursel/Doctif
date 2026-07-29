import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'tableau-de-bord' },

  {
    path: 'tableau-de-bord',
    title: 'Tableau de bord — Assistant administratif',
    loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'coffre',
    title: 'Coffre-fort documentaire',
    loadComponent: () => import('./features/vault/vault.component').then((m) => m.VaultComponent),
  },
  {
    path: 'coffre/:id',
    title: 'Document',
    loadComponent: () => import('./features/vault/document-detail.component').then((m) => m.DocumentDetailComponent),
  },
  {
    path: 'scanner',
    title: 'Scanner intelligent',
    loadComponent: () => import('./features/scanner/scanner.component').then((m) => m.ScannerComponent),
  },
  {
    path: 'calendrier',
    title: 'Calendrier des échéances',
    loadComponent: () => import('./features/calendar/calendar.component').then((m) => m.CalendarComponent),
  },
  {
    path: 'alertes',
    title: 'Alertes',
    loadComponent: () => import('./features/alerts/alerts.component').then((m) => m.AlertsComponent),
  },
  {
    path: 'contrats',
    title: 'Mes contrats',
    loadComponent: () => import('./features/contracts/contracts.component').then((m) => m.ContractsComponent),
  },
  {
    path: 'contrats/:id',
    title: 'Détail du contrat',
    loadComponent: () =>
      import('./features/contracts/contract-detail.component').then((m) => m.ContractDetailComponent),
  },
  {
    path: 'economies',
    title: 'Économies possibles',
    loadComponent: () => import('./features/savings/savings.component').then((m) => m.SavingsComponent),
  },
  {
    path: 'renouvellement',
    title: 'Renouvellement intelligent',
    loadComponent: () => import('./features/renewal/renewal.component').then((m) => m.RenewalComponent),
  },
  {
    path: 'anomalies',
    title: 'Détection d’anomalies',
    loadComponent: () => import('./features/anomalies/anomalies.component').then((m) => m.AnomaliesComponent),
  },
  {
    path: 'partage',
    title: 'Partage familial',
    loadComponent: () => import('./features/sharing/sharing.component').then((m) => m.SharingComponent),
  },
  {
    path: 'fiscal',
    title: 'Espace fiscal',
    loadComponent: () => import('./features/tax/tax.component').then((m) => m.TaxComponent),
  },
  {
    path: 'demenagement',
    title: 'Assistant déménagement',
    loadComponent: () => import('./features/moving/moving.component').then((m) => m.MovingComponent),
  },
  {
    path: 'succession',
    title: 'Assistant succession',
    loadComponent: () => import('./features/estate/estate.component').then((m) => m.EstateComponent),
  },
  {
    path: 'chronologie',
    title: 'Chronologie administrative',
    loadComponent: () => import('./features/timeline/timeline.component').then((m) => m.TimelineComponent),
  },
  {
    path: 'assistant',
    title: 'Assistant administratif',
    loadComponent: () => import('./features/chat/chat.component').then((m) => m.ChatComponent),
  },
  {
    path: 'archives',
    title: 'Archivage à vie',
    loadComponent: () => import('./features/archive/archive.component').then((m) => m.ArchiveComponent),
  },
  {
    path: 'parametres',
    title: 'Paramètres',
    loadComponent: () => import('./features/settings/settings.component').then((m) => m.SettingsComponent),
  },

  { path: '**', redirectTo: 'tableau-de-bord' },
];
