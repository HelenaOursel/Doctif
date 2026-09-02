import { ViewportScroller } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { I18nService, TranslatePipe } from './core/i18n/i18n.service';
import { ALL_NAV_ITEMS, BOTTOM_NAV, NAV_GROUPS } from './core/navigation';
import { AuthService } from './core/services/auth.service';
import { DeadlineService } from './core/services/deadline.service';
import { SyncService } from './core/services/sync.service';
import { UiService } from './core/services/ui.service';
import { Store } from './core/store';
import { IconComponent } from './shared/icon.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe, IconComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  // Sans session, la coque de navigation n'a rien à proposer : la feuille de
  // style la masque et l'écran de connexion occupe seul la page.
  host: { '[class.app--anon]': '!authenticated()' },
})
export class App {
  protected readonly ui = inject(UiService);
  protected readonly i18n = inject(I18nService);
  private readonly store = inject(Store);
  private readonly deadlines = inject(DeadlineService);
  private readonly router = inject(Router);
  private readonly scroller = inject(ViewportScroller);

  constructor() {
    // Le défilement vers une ancre passe par `window.scrollTo` avec un décalage
    // explicite, et non par `scrollIntoView` : `scroll-margin-top` est donc
    // ignoré et le titre visé finirait masqué par l'en-tête collant. La hauteur
    // est mesurée au moment du défilement, ce qui couvre aussi bien le passage
    // en desktop — où l'en-tête disparaît — que les encoches d'écran.
    this.scroller.setOffset(() => {
      const header = document.querySelector<HTMLElement>('.app-header');
      const visible = header && getComputedStyle(header).display !== 'none';
      return [0, visible ? header.getBoundingClientRect().height + 14 : 20];
    });
  }

  protected readonly navGroups = NAV_GROUPS;
  protected readonly bottomNav = BOTTOM_NAV;

  protected readonly profile = this.store.profile;
  protected readonly readOnly = this.store.readOnly;
  protected readonly unreadAlerts = this.deadlines.unreadCount;
  protected readonly authenticated = inject(AuthService).isAuthenticated;
  protected readonly sync = inject(SyncService);

  /** URL courante, pour afficher le titre de l'écran dans l'en-tête mobile. */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly currentTitle = computed(() => {
    const url = this.url();
    // Le préfixe le plus long l'emporte, pour que /contrats/:id reste « Contrats ».
    const match = ALL_NAV_ITEMS.filter((item) => url.startsWith(item.route)).sort(
      (a, b) => b.route.length - a.route.length,
    )[0];
    return match ? this.i18n.t(match.labelKey) : this.i18n.t('app.name');
  });
}
