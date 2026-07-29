import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { I18nService, TranslatePipe } from './core/i18n/i18n.service';
import { ALL_NAV_ITEMS, BOTTOM_NAV, NAV_GROUPS } from './core/navigation';
import { DeadlineService } from './core/services/deadline.service';
import { UiService } from './core/services/ui.service';
import { Store } from './core/store';
import { IconComponent } from './shared/icon.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe, IconComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly ui = inject(UiService);
  protected readonly i18n = inject(I18nService);
  private readonly store = inject(Store);
  private readonly deadlines = inject(DeadlineService);
  private readonly router = inject(Router);

  protected readonly navGroups = NAV_GROUPS;
  protected readonly bottomNav = BOTTOM_NAV;

  protected readonly profile = this.store.profile;
  protected readonly readOnly = this.store.readOnly;
  protected readonly unreadAlerts = this.deadlines.unreadCount;

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
