import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/i18n.service';
import { AlertItem, AlertLevel } from '../../core/models';
import { DeadlineService } from '../../core/services/deadline.service';
import { UiService } from '../../core/services/ui.service';
import { Store } from '../../core/store';
import { CategoryBadgeComponent, EmptyStateComponent, PageHeaderComponent } from '../../shared/components';
import { DeadlineIconClassPipe, IconComponent } from '../../shared/icon.component';
import { FrDatePipe, RelativeDaysPipe } from '../../shared/pipes';

/** Ordre et présentation des paliers d'alerte. */
const LEVELS: { level: AlertLevel; label: string; hint: string; tone: string }[] = [
  { level: 'depassee', label: 'Dépassée', hint: 'La date limite est passée.', tone: 'danger' },
  { level: 'J-1', label: 'J-1', hint: "C'est demain, ou aujourd'hui.", tone: 'danger' },
  { level: 'J-7', label: 'J-7', hint: 'Dans une semaine au plus.', tone: 'warning' },
  { level: 'J-30', label: 'J-30', hint: "Dans un mois — c'est le moment d'anticiper.", tone: 'info' },
];

@Component({
  selector: 'app-alerts',
  standalone: true,
  imports: [
    RouterLink,
    TranslatePipe,
    PageHeaderComponent,
    CategoryBadgeComponent,
    EmptyStateComponent,
    IconComponent,
    DeadlineIconClassPipe,
    FrDatePipe,
    RelativeDaysPipe,
  ],
  template: `
    <app-page-header [title]="'alerts.title' | t" subtitle="Rappels automatiques à J-30, J-7 et J-1 avant chaque échéance.">
      @if (unreadCount() > 0) {
        <button type="button" class="btn btn--sm btn--ghost" (click)="markAllRead()">
          <app-icon name="check" /> {{ 'action.markAllRead' | t }}
        </button>
      }
    </app-page-header>

    <!-- Rappel du fonctionnement -->
    <div class="thresholds">
      @for (l of levels; track l.level) {
        @if (l.level !== 'depassee') {
          <div class="threshold" [class]="'threshold--' + l.tone">
            <strong>{{ l.label }}</strong>
            <span>{{ l.hint }}</span>
            <span class="threshold__count">{{ countFor(l.level) }}</span>
          </div>
        }
      }
    </div>

    <!-- Filtre lu / non lu -->
    <div class="row" style="margin: 16px 0 4px">
      <button type="button" class="chip" [class.chip--active]="!onlyUnread()" (click)="onlyUnread.set(false)">
        Toutes ({{ alerts().length }})
      </button>
      <button type="button" class="chip" [class.chip--active]="onlyUnread()" (click)="onlyUnread.set(true)">
        Non lues ({{ unreadCount() }})
      </button>
    </div>

    @if (visible().length) {
      @for (group of grouped(); track group.level) {
        @if (group.items.length) {
          <div class="section-head">
            <h2 [class]="'text-' + group.tone">{{ group.label }}</h2>
            <span class="muted">{{ group.hint }}</span>
          </div>
          <div class="list">
            @for (a of group.items; track a.id) {
              <a
                class="row-card alert"
                [class.alert--unread]="!a.read"
                routerLink="/calendrier"
                (click)="markRead(a)"
              >
                <span class="row-card__icon" [class]="'row-card__icon--' + group.tone">
                  <app-icon [cls]="a.kind | deadlineIconClass" />
                </span>
                <span class="row-card__body">
                  <span class="row-card__title">{{ a.title }}</span>
                  <span class="row-card__meta">
                    <app-cat-badge [category]="a.category" />
                    <span>{{ a.date | frDate: 'long' }}</span>
                  </span>
                </span>
                <span class="row-card__side">
                  <span class="badge" [class]="'badge--' + group.tone">{{ a.daysLeft | relDays }}</span>
                  @if (!a.read) {
                    <span class="alert__dot" aria-label="Non lue"></span>
                  }
                </span>
              </a>
            }
          </div>
        }
      }
    } @else {
      <app-empty
        icon="success"
        [title]="onlyUnread() ? 'Aucune alerte non lue' : ('alerts.empty' | t)"
        hint="Les alertes apparaissent automatiquement à 30, 7 et 1 jour d'une échéance."
      >
        <a class="btn btn--sm btn--primary" style="margin-top: 12px" routerLink="/calendrier">Voir le calendrier</a>
      </app-empty>
    }
  `,
  styles: [
    `
      @use 'mixins' as *;

      .thresholds {
        display: grid;
        gap: 8px;
        margin-top: 18px;
        grid-template-columns: minmax(0, 1fr);

        @include up(600px) {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }
      .threshold {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 12px 14px;
        border-radius: 12px;
        background: var(--surface);
        border: 1px solid var(--border);
        position: relative;

        strong {
          font-size: 0.9rem;
        }
        span {
          font-size: 0.78rem;
          color: var(--text-muted);
        }
      }
      /* Le liseré gauche portait seul le niveau du seuil : sa couleur passe
         sur le compteur, sans ajouter de bordure au bloc. */
      .threshold__count {
        position: absolute;
        top: 10px;
        right: 12px;
        font-size: 1.15rem !important;
        font-weight: 700;
        color: var(--text) !important;
        font-variant-numeric: tabular-nums;
      }
      .threshold--danger .threshold__count {
        color: var(--danger) !important;
      }
      .threshold--warning .threshold__count {
        color: var(--warning) !important;
      }
      .threshold--info .threshold__count {
        color: var(--info) !important;
      }

      .alert--unread {
        border-color: var(--border-strong);
        background: var(--surface);
      }
      .alert--unread .row-card__title {
        font-weight: 700;
      }
      .alert__dot {
        display: block;
        width: 8px;
        height: 8px;
        margin: 6px auto 0;
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

  readonly levels = LEVELS;
  readonly onlyUnread = signal(false);

  readonly alerts = this.service.alerts;
  readonly unreadCount = this.service.unreadCount;

  readonly visible = computed(() => (this.onlyUnread() ? this.alerts().filter((a) => !a.read) : this.alerts()));

  readonly grouped = computed(() =>
    LEVELS.map((l) => ({
      ...l,
      items: this.visible().filter((a) => a.level === l.level),
    })),
  );

  countFor(level: AlertLevel): number {
    return this.alerts().filter((a) => a.level === level).length;
  }

  markRead(alert: AlertItem): void {
    if (alert.read) return;
    // Le mode archive n'empêche pas d'accuser réception d'une alerte : c'est
    // une préférence d'affichage, pas une donnée administrative.
    this.service.markRead(alert.id);
  }

  markAllRead(): void {
    this.service.markAllRead();
    if (this.store.readOnly()) return;
    this.ui.success('Alertes marquées comme lues');
  }
}
