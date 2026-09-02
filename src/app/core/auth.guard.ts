import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './services/auth.service';

/**
 * Interdit l'accès aux écrans sans session.
 *
 * Le contrôle est local : il ne prouve pas que le jeton est encore valide,
 * seulement qu'il en existe un. La vraie vérification a lieu côté serveur, qui
 * répond 401 — `SyncService` déconnecte alors proprement. Ce garde évite
 * simplement d'afficher l'application à quelqu'un qui n'est jamais entré.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) return true;

  // `returnTo` ramène l'utilisateur là où il allait après connexion.
  return router.createUrlTree(['/connexion'], { queryParams: { returnTo: state.url } });
};
