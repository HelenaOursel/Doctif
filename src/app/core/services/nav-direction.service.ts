import { Injectable, inject } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';

export type NavDirection = 'forward' | 'back';

/** Chemin seul, sans paramètres ni ancre. */
function pathOf(url: string): string {
  return url.split(/[?#]/)[0];
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Nature de la navigation en cours. Elle détermine deux choses.
 *
 * **Le sens de la transition.** Un écran qui arrive glisse depuis la droite, un
 * retour depuis la gauche. Deux sources de « retour » coexistent : le bouton
 * matériel ou le geste du système, qui produisent un `popstate` ; et la flèche
 * de retour de l'en-tête, qui est un `routerLink` ordinaire — indiscernable
 * d'une navigation avant sans indication explicite, d'où `markBack()`.
 *
 * **Le saut interne à la page.** Cliquer une tuile chiffrée mène à une section
 * du même écran : il ne s'agit pas d'un changement de page. La transition
 * latérale est donc supprimée et le défilement devient progressif, pour que le
 * regard suive le trajet jusqu'à la donnée visée.
 */
@Injectable({ providedIn: 'root' })
export class NavDirectionService {
  private readonly router = inject(Router);
  private next: NavDirection | null = null;
  private inPageJump = false;

  constructor() {
    this.router.events.subscribe((event) => {
      if (!(event instanceof NavigationStart)) return;

      if (event.navigationTrigger === 'popstate') this.next = 'back';

      // `router.url` vaut encore l'URL courante tant que la navigation n'est
      // pas achevée : la comparaison porte donc bien sur avant / après.
      this.inPageJump = pathOf(event.url) === pathOf(this.router.url) && event.url.includes('#');

      // Le défilement animé n'a de sens que pour un saut interne. Sur un
      // changement d'écran, il ferait remonter la page à vue avant d'afficher
      // la suivante.
      document.documentElement.style.scrollBehavior =
        this.inPageJump && !prefersReducedMotion() ? 'smooth' : 'auto';
    });
  }

  /** Vrai lorsque la navigation vise une ancre de l'écran déjà affiché. */
  isInPageJump(): boolean {
    return this.inPageJump;
  }

  /** À appeler juste avant une navigation qui remonte dans la hiérarchie. */
  markBack(): void {
    this.next = 'back';
  }

  /** Lit le sens de la navigation courante et le réinitialise. */
  consume(): NavDirection {
    const direction = this.next ?? 'forward';
    this.next = null;
    return direction;
  }
}
