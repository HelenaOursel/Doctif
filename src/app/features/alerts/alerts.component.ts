import { Component, computed, inject, input, signal } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/i18n.service';
import { AlertItem, AlertLevel } from '../../core/models';
import { DeadlineService } from '../../core/services/deadline.service';
import { UiService } from '../../core/services/ui.service';
import { Store } from '../../core/store';
import { CategoryBadgeComponent, EmptyStateComponent } from '../../shared/components';
import { DeadlineIconClassPipe, IconComponent } from '../../shared/icon.component';
import { FrDatePipe, RelativeDaysPipe } from '../../shared/pipes';

/** Ordre et présentation des paliers d'alerte. */
const LEVELS: { level: AlertLevel; label: string; tone: string }[] = [
  { level: 'depassee', label: 'Dépassée', tone: 'danger' },
  { level: 'J-1', label: "Demain ou aujourd'hui", tone: 'danger' },
  { level: 'J-7', label: 'Dans la semaine', tone: 'warning' },
  { level: 'J-30', label: 'Dans le mois', tone: 'info' },
];

/**
 * Onglet « Alertes » du calendrier.
 *
 * Écran fusionné : les alertes sont entièrement dérivées des échéances, elles
 * n'ont donc plus de destination propre. Le composant ne porte pas d'en-tête —
 * c'est le calendrier qui l'affiche.
 */
@Component({
  selector: 'app-alerts',
  standalone: true,
  imports: [
    TranslatePipe,
    CategoryBadgeComponent,
    EmptyStateComponent,
    IconComponent,
    DeadlineIconClassPipe,
    FrDatePipe,
    RelativeDaysPipe,
  ],
  template: `
    @if (filtersOpen()) {
      <div class="filterpanel">
        <p class="filter-group">Filtrer par état</p>
        <div class="chip-wrap">
          <button type="button" class="chip" [class.chip--active]="!onlyUnread()" (click)="onlyUnread.set(false)">
            Toutes ({{ alerts().length }})
          </button>
          <button type="button" class="chip" [class.chip--active]="onlyUnread()" (click)="onlyUnread.set(true)">
            Non lues ({{ unreadCount() }})
          </button>
        </div>
      </div>
    }

    @if (visible().length) {
      @for (group of grouped(); track group.level) {
        @if (group.items.length) {
          <div class="section-head">
            <h2 [class]="'text-' + group.tone">{{ group.label }}</h2>
            <span class="muted">{{ group.items.length }}</span>
          </div>
          <div class="list">
            @for (a of group.items; track a.id) {
              <button
                type="button"
                class="row-card alert"
                [class.alert--unread]="!a.read"
                (click)="markRead(a)"
              >
                <span class="row-card__icon" [class]="'row-card__icon--' + group.tone">
                  <app-icon [cls]="a.kind | deadlineIconClass" />
                </span>
                <span class="row-card__body">
                  <span class="row-card__tags">
                    <span class="badge" [class]="'badge--' + group.tone">{{ a.daysLeft | relDays }}</span>
                    <app-cat-badge [category]="a.category" />
                  </span>
                  <span class="row-card__title">{{ a.title }}</span>
                  <span class="row-card__meta">
                    <span>{{ a.date | frDate: 'long' }}</span>
                  </span>
                </span>
                <span class="row-card__side">
                  @if (!a.read) {
                    <span class="alert__dot" aria-label="Non lue"></span>
                  }
                </span>
              </button>
            }
          </div>
        }
      }
    } @else {
      <app-empty
        icon="success"
        [title]="onlyUnread() ? 'Aucune alerte non lue' : ('alerts.empty' | t)"
        hint="Les alertes apparaissent automatiquement à 30, 7 et 1 jour d'une échéance."
      />
    }
  `,
  styles: [
    `
      button.row-card {
        width: 100%;
        text-align: left;
        border: 1px solid var(--border);
        cursor: pointer;
        font: inherit;
        color: inherit;
      }

      .alert--unread {
        border-color: var(--border-strong);
        background: var(--surface);
      }
      .alert--unread .row-card__title {
        font-weight: 700;
      }
      .alert__dot {
        flex: 0 0 auto;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--primary);
      }

      .row-card__icon--danger {
        background: var(--danger-soft);
        color: var(--danger);
      }
      .row-card__icon--warning {
        background: var(--warning-soft);
        color: var(--warning);
      }
      .row-card__icon--info {
        background: var(--info-soft);
        color: var(--info);
      }

      .text-danger {
        color: var(--danger);
      }
      .text-warning {
        color: var(--warning);
      }
      .text-info {
        color: var(--info);
      }
    `,
  ],
})
export class AlertsComponent {
  private readonly service = inject(DeadlineService);
  private readonly store = inject(Store);
  private readonly ui = inject(UiService);

  readonly onlyUnread = signal(false);

  /** Ouverture pilotée par le bouton « Filtres » de l'écran qui nous héberge. */
  readonly filtersOpen = input(false);

  /** Vrai quand la liste affichée est restreinte. */
  readonly hasActiveFilters = computed(() => this.onlyUnread());

  readonly alerts = this.service.alerts;
  readonly unreadCount = this.service.unreadCount;

  readonly visible = computed(() => (this.onlyUnread() ? this.alerts().filter((a) => !a.read) : this.alerts()));

  readonly grouped = computed(() =>
    LEVELS.map((l) => ({
      ...l,
      items: this.visible().filter((a) => a.level === l.level),
    })),
  );

  markRead(alert: AlertItem): void {
    if (alert.read) return;
    // Le mode archive n'empêche pas d'accuser réception d'une alerte : c'est
    // une préférence d'affichage, pas une donnée administrative.
    this.service.markRead(alert.id);
  }

  markAllRead(): void {
    this.service.markAllRead();
    // En mode archive la mutation est refusée : ne pas annoncer un succès.
    if (this.store.readOnly()) return;
    this.ui.success('Alertes marquées comme lues');
  }
}
