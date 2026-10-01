import { Injectable, inject } from '@angular/core';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';

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
  private queryOnlyChange = false;

  /**
   * Entrées empilées dans l'historique depuis l'ouverture de l'application.
   *
   * La flèche de retour ne peut pas se contenter d'un lien fixe : le même
   * détail de contrat s'atteint depuis « Mes contrats » comme depuis
   * « Économies », et remonter toujours au même endroit renvoie l'utilisateur
   * là où il n'était pas. Mais `history.back()` seul sortirait de
   * l'application quand la page a été ouverte directement — d'où ce compte,
   * qui dit s'il reste quelque chose à quoi revenir.
   *
   * Les navigations qui remplacent l'entrée courante (changement d'onglet du
   * calendrier, par exemple) n'empilent rien et ne comptent donc pas.
   */
  private depth = 0;
  private pendingDepth = 0;
  private firstNavigationDone = false;

  constructor() {
    this.router.events.subscribe((event) => {
      if (!(event instanceof NavigationStart)) return;

      if (event.navigationTrigger === 'popstate') this.next = 'back';

      const replaced = this.router.getCurrentNavigation()?.extras.replaceUrl === true;
      // Un retour dans l'historique dépile ; la navigation initiale occupe
      // l'entrée courante sans en créer une nouvelle.
      this.pendingDepth =
        event.navigationTrigger === 'popstate' ? -1 : !this.firstNavigationDone || replaced ? 0 : 1;

      // `router.url` vaut encore l'URL courante tant que la navigation n'est
      // pas achevée : la comparaison porte donc bien sur avant / après.
      const samePath = pathOf(event.url) === pathOf(this.router.url);
      this.inPageJump = samePath && event.url.includes('#');

      // Même écran, paramètres différents : un onglet ou un filtre inscrit dans
      // l'URL. Rien ne se déplace, seul le contenu est remplacé — le
      // glissement latéral raconterait un trajet qui n'a pas lieu.
      this.queryOnlyChange = samePath && !this.inPageJump && event.url !== this.router.url;

      // Le défilement animé n'a de sens que pour un saut interne. Sur un
      // changement d'écran, il ferait remonter la page à vue avant d'afficher
      // la suivante.
      document.documentElement.style.scrollBehavior =
        this.inPageJump && !prefersReducedMotion() ? 'smooth' : 'auto';
    });

    this.router.events.subscribe((event) => {
      if (!(event instanceof NavigationEnd)) return;
      this.depth = Math.max(0, this.depth + this.pendingDepth);
      this.pendingDepth = 0;
      this.firstNavigationDone = true;
    });
  }

  /** Vrai lorsque la navigation vise une ancre de l'écran déjà affiché. */
  isInPageJump(): boolean {
    return this.inPageJump;
  }

  /** Vrai lorsque seuls les paramètres de l'écran courant changent. */
  isQueryOnlyChange(): boolean {
    return this.queryOnlyChange;
  }

  /**
   * Vrai lorsqu'un écran de l'application attend en arrière dans l'historique.
   * Faux sur une page ouverte directement : la flèche doit alors retomber sur
   * sa destination déclarée plutôt que de quitter l'application.
   */
  canGoBack(): boolean {
    return this.depth > 0;
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
