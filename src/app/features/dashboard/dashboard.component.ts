import { LowerCasePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/i18n.service';
import { AnalysisService } from '../../core/services/analysis.service';
import { AnomalyService } from '../../core/services/anomaly.service';
import { DeadlineService } from '../../core/services/deadline.service';
import { OffersService } from '../../core/services/offers.service';
import { Store } from '../../core/store';
import { daysUntil, sum } from '../../core/utils';
import { EmptyStateComponent, PageHeaderComponent, StatTileComponent } from '../../shared/components';
import { DeadlineIconClassPipe, IconComponent } from '../../shared/icon.component';
import { CategoryColorPipe, EuroPipe, FrDatePipe, PercentPipe, RelativeDaysPipe } from '../../shared/pipes';
import { FEATURES } from '../../core/features';

/**
 * Écran d'accueil.
 *
 * Il répond à une seule question — qu'est-ce qui demande mon attention — et
 * s'y tient : trois chiffres, une seule mise en avant (la plus grave), les
 * échéances proches et les pièces qui manquent. Tout le reste appartient à
 * l'écran dont c'est le sujet, où les tuiles conduisent.
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    LowerCasePipe,
    TranslatePipe,
    PageHeaderComponent,
    StatTileComponent,
    EmptyStateComponent,
    IconComponent,
    CategoryColorPipe,
    DeadlineIconClassPipe,
    EuroPipe,
    FrDatePipe,
    PercentPipe,
    RelativeDaysPipe,
  ],
  template: `
    <app-page-header [title]="'dashboard.greeting' | t: { name: profile().firstName }" />

    <!-- Tuiles chiffrées : chacune conduit à l'écran qui la détaille. Les
         alertes n'en ont plus : la cloche de l'en-tête les porte déjà. -->
    <section class="tile-grid tile-grid--3" style="margin-top: 18px">
      <app-stat
        [label]="'dashboard.stat.contracts' | t"
        [value]="activeContracts().length"
        link="/contrats"
        [hint]="(totalMonthly() | euro) + ' / mois'"
      />
      <app-stat
        [label]="'dashboard.stat.deadlines' | t"
        [value]="soonCount()"
        link="/calendrier"
        [tone]="soonCount() > 0 ? 'warning' : 'neutral'"
      />
      <app-stat
        [label]="'dashboard.stat.savings' | t"
        [value]="savings().totalPerYear"
        suffix="€"
        link="/economies"
        tone="success"
      />
    </section>

    <!-- Une seule mise en avant, la plus grave : trois encarts empilés
         redisaient ce que les tuiles chiffrent déjà. -->
    @if (topAnomaly(); as an) {
      <div class="callout callout--danger" style="margin-top: 20px">
        <app-icon class="callout__icon" name="anomalies" />
        <div class="grow">
          <strong>{{ an.message }}</strong>
          <p>Référence habituelle : {{ an.reference | euro }} — relevé : {{ an.amount | euro }}.</p>
          <a class="btn btn--sm btn--ghost" style="margin-top: 10px" routerLink="/anomalies">
            <app-icon name="anomalies" /> Analyser mes factures
          </a>
        </div>
      </div>
    } @else if (topIncrease(); as inc) {
      <div class="callout callout--warning" style="margin-top: 20px">
        <app-icon class="callout__icon" name="trendUp" />
        <div class="grow">
          <strong>Votre {{ inc.contract.label | lowercase }} a augmenté de {{ inc.percent | pct }} cette année.</strong>
          <p>
            {{ inc.previous | euro }} → {{ inc.current | euro }} par mois, soit {{ inc.extraPerYear | euro }} de plus
            par an.
          </p>
          <a class="btn btn--sm btn--primary" style="margin-top: 10px" [routerLink]="['/contrats', inc.contract.id]">
            <app-icon name="gavel" /> Voir le contrat et résilier
          </a>
        </div>
      </div>
    } @else if (offersEnabled && renewal(); as r) {
      <div class="callout callout--info" style="margin-top: 20px">
        <app-icon class="callout__icon" name="renewal" />
        <div class="grow">
          <strong>Votre {{ r.contract.label | lowercase }} expire dans {{ r.daysLeft }} jours.</strong>
          <p>
            {{ r.offers.length }} offres concurrentes identifiées, jusqu'à {{ r.bestSavingPerYear | euro }} d'économie
            par an.
          </p>
          <a class="btn btn--sm btn--primary" style="margin-top: 10px" routerLink="/renouvellement">
            <app-icon name="scale" /> Comparer les offres
          </a>
        </div>
      </div>
    }

    <!-- Échéances proches -->
    <div class="section-head">
      <h2>{{ 'dashboard.upcoming' | t }}</h2>
      <a routerLink="/calendrier">{{ 'action.seeAll' | t }}</a>
    </div>

    @if (upcoming().length) {
      <div class="list">
        @for (d of upcoming(); track d.id) {
          <a class="row-card" routerLink="/calendrier">
            <span class="row-card__icon row-card__icon--cat" [style.--c]="d.category | catColor">
              <app-icon [cls]="d.kind | deadlineIconClass" />
            </span>
            <span class="row-card__body">
              <span class="row-card__title">{{ d.title }}</span>
              <span class="row-card__meta">{{ d.date | frDate }}</span>
            </span>
            @if (days(d.date) <= 30) {
              <span class="row-card__side">
                <span class="badge" [class.badge--danger]="days(d.date) <= 7" [class.badge--warning]="days(d.date) > 7">
                  {{ days(d.date) | relDays }}
                </span>
              </span>
            }
          </a>
        }
      </div>
    } @else {
      <app-empty icon="calendarEmpty" [title]="'dashboard.empty.deadlines' | t" />
    }

    <!-- Documents manquants -->
    <div class="section-head">
      <h2>{{ 'dashboard.missing' | t }}</h2>
      <a routerLink="/assistant">Demander à l'assistant</a>
    </div>

    @if (missing().length) {
      <div class="list">
        @for (m of missing(); track m.id) {
          <div class="row-card">
            <span class="row-card__icon" [class.row-card__icon--danger]="m.severity === 'risque'">
              <app-icon [name]="m.severity === 'risque' ? 'blocked' : 'warning'" />
            </span>
            <span class="row-card__body">
              <span class="row-card__title">{{ m.label }}</span>
              <span class="row-card__meta">{{ m.reason }}</span>
            </span>
            <a class="btn btn--sm btn--ghost" routerLink="/scanner"><app-icon name="add" /> Ajouter</a>
          </div>
        }
      </div>
    } @else {
      <app-empty icon="success" [title]="'dashboard.empty.missing' | t" />
    }
  `,
  styles: [
    `
      @use 'mixins' as *;

      /* Trois tuiles : sur large écran elles occupent la ligne entière plutôt
         que de laisser une quatrième place vide. */
      .tile-grid--3 {
        @include up(768px) {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }

      .row-card__icon--danger {
        background: var(--danger-soft);
        color: var(--danger);
      }
      .row-card__meta {
        line-height: 1.4;
      }
    `,
  ],
})
export class DashboardComponent {
  private readonly store = inject(Store);
  private readonly deadlineService = inject(DeadlineService);
  private readonly analysis = inject(AnalysisService);
  private readonly anomalyService = inject(AnomalyService);
  private readonly offers = inject(OffersService);

  /** Comparateur d'offres : voir core/features.ts. */
  protected readonly offersEnabled = FEATURES.offers;

  readonly profile = this.store.profile;
  readonly activeContracts = this.store.activeContracts;
  readonly savings = this.analysis.savings;
  readonly missing = computed(() => this.analysis.missingDocuments().slice(0, 3));

  readonly totalMonthly = computed(() => sum(this.activeContracts().map((c) => c.monthlyCost)));
  readonly upcoming = computed(() => this.deadlineService.next90Days().slice(0, 3));
  readonly soonCount = computed(() => this.deadlineService.next90Days().filter((d) => daysUntil(d.date) <= 30).length);

  readonly topIncrease = computed(() => this.analysis.increases()[0]);
  readonly topAnomaly = computed(() => this.anomalyService.anomalies()[0]);
  readonly renewal = computed(() => this.offers.opportunities()[0]);

  days(iso: string): number {
    return daysUntil(iso);
  }
}
