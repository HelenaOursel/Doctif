import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

/** Construit l'URL absolue d'une route de l'API. */
export function apiUrl(path: string): string {
  return `${environment.apiBaseUrl}${path}`;
}

/**
 * Ajoute le jeton aux appels vers notre API, et à eux seuls : un intercepteur
 * qui l'attacherait à toute requête sortante le divulguerait au premier
 * domaine tiers appelé.
 *
 * Le jeton voyage en en-tête `Authorization`. Ce n'est pas un détail : une
 * application Capacitor est servie depuis `capacitor://localhost` (iOS) ou
 * `https://localhost` (Android), origines auxquelles aucun cookie de l'API ne
 * peut être rattaché.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).token();
  if (!token || !req.url.startsWith(environment.apiBaseUrl)) return next(req);
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
