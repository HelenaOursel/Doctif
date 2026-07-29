import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling, withRouterConfig } from '@angular/router';

import { StorageService } from './core/services/storage.service';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    // Le stockage natif est asynchrone : on le charge en mémoire avant le
    // démarrage, pour que le Store puisse lire son état de façon synchrone.
    provideAppInitializer(() => inject(StorageService).hydrate()),
    provideRouter(
      routes,
      // Chaque écran s'ouvre en haut ; le retour arrière restaure la position.
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
      withRouterConfig({ paramsInheritanceStrategy: 'always' }),
    ),
  ],
};
