import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  provideRouter,
  withInMemoryScrolling,
  withRouterConfig,
  withViewTransitions,
} from '@angular/router';

import { authInterceptor } from './core/services/api';
import { AuthService } from './core/services/auth.service';
import { NavDirectionService } from './core/services/nav-direction.service';
import { StorageService } from './core/services/storage.service';
import { SyncService } from './core/services/sync.service';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(withInterceptors([authInterceptor])),
    // Le stockage natif est asynchrone : on le charge en mémoire avant le
    // démarrage, pour que le Store puisse lire son état de façon synchrone.
    provideAppInitializer(async () => {
      const storage = inject(StorageService);
      const auth = inject(AuthService);
      const sync = inject(SyncService);

      await storage.hydrate();
      auth.restore();

      if (auth.isAuthenticated()) {
        sync.resume();
        // Volontairement non attendu : l'application démarre sur son cache
        // local et se met à jour à la réception. Attendre le réseau ici
        // retarderait l'affichage, et le figerait si le serveur ne répond pas.
        void sync.pull();
      }
    }),
    provideRouter(
      routes,
      // Chaque écran s'ouvre en haut ; le retour arrière restaure la position.
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
      withRouterConfig({ paramsInheritanceStrategy: 'always' }),
      // Transition entre écrans via l'API View Transitions du navigateur. Le
      // sens est posé en attribut sur <html> : la feuille de style choisit
      // l'animation, et l'attribut est retiré une fois la transition finie.
      // Là où l'API n'existe pas (Firefox), Angular navigue sans animation.
      withViewTransitions({
        onViewTransitionCreated: ({ transition }) => {
          const nav = inject(NavDirectionService);

          // Saut vers une section de l'écran déjà affiché : il n'y a pas de
          // changement de page à animer. La transition latérale masquerait le
          // défilement, qui est justement ce qu'il faut donner à voir.
          if (nav.isInPageJump()) {
            transition.skipTransition();
            nav.consume();
            return;
          }

          const root = document.documentElement;
          root.dataset['nav'] = nav.consume();
          void transition.finished.finally(() => delete root.dataset['nav']);
        },
      }),
    ),
  ],
};
