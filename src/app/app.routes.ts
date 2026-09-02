import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { FEATURES } from './core/features';

/**
 * Redirection vers un onglet d'un écran fusionné.
 *
 * Les alertes, la chronologie, les anomalies et le comparateur d'offres ne
 * sont plus des destinations autonomes : ce sont des vues du calendrier ou des
 * économies. Leurs anciennes URL restent valides — liens de l'assistant,
 * notifications déjà envoyées, favoris — et arrivent sur le bon onglet.
 */
const toTab = (target: string, tab: string) => () => inject(Router).parseUrl(`${target}?vue=${tab}`);

export const routes: Routes = [
  {
    path: 'connexion',
    title: 'Connexion — Assistant administratif',
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },

  // Route sans segment servant uniquement de porte : le garde s'applique une
  // fois à l'ensemble des écrans, plutôt que d'être répété sur chacun.
  {
    path: '',
    canActivateChild: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'tableau-de-bord' },

      {
        path: 'tableau-de-bord',
        title: 'Tableau de bord — Assistant administratif',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'coffre',
        title: 'Coffre-fort documentaire',
        loadComponent: () => import('./features/vault/vault.component').then((m) => m.VaultComponent),
      },
      {
        path: 'coffre/:id',
        title: 'Document',
        loadComponent: () =>
          import('./features/vault/document-detail.component').then((m) => m.DocumentDetailComponent),
      },
      {
        path: 'scanner',
        title: 'Scanner intelligent',
        loadComponent: () => import('./features/scanner/scanner.component').then((m) => m.ScannerComponent),
      },

      // Calendrier : échéances, alertes et chronologie sous un même toit.
      {
        path: 'calendrier',
        title: 'Calendrier des échéances',
        loadComponent: () =>
          import('./features/calendar/calendar.component').then((m) => m.CalendarComponent),
      },
      { path: 'alertes', redirectTo: toTab('/calendrier', 'alertes') },
      { path: 'chronologie', redirectTo: toTab('/calendrier', 'historique') },

      {
        path: 'contrats',
        title: 'Mes contrats',
        loadComponent: () =>
          import('./features/contracts/contracts.component').then((m) => m.ContractsComponent),
      },
      {
        path: 'contrats/:id',
        title: 'Détail du contrat',
        loadComponent: () =>
          import('./features/contracts/contract-detail.component').then((m) => m.ContractDetailComponent),
      },

      // Économies : optimisations, anomalies et — quand la fonctionnalité est
      // active — comparaison des offres.
      {
        path: 'economies',
        title: 'Économies possibles',
        loadComponent: () => import('./features/savings/savings.component').then((m) => m.SavingsComponent),
      },
      { path: 'anomalies', redirectTo: toTab('/economies', 'anomalies') },
      ...(FEATURES.offers ? [{ path: 'renouvellement', redirectTo: toTab('/economies', 'offres') }] : []),

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
        path: 'assistant',
        title: 'Assistant administratif',
        loadComponent: () => import('./features/chat/chat.component').then((m) => m.ChatComponent),
      },

      // Archivage : conservation, mode lecture seule et portabilité sont
      // devenus des sections des paramètres.
      {
        path: 'parametres',
        title: 'Paramètres',
        loadComponent: () => import('./features/settings/settings.component').then((m) => m.SettingsComponent),
      },
      { path: 'archives', redirectTo: '/parametres' },

      { path: '**', redirectTo: 'tableau-de-bord' },
    ],
  },
];
