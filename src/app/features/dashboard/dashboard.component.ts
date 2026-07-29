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
import {
  CategoryIconClassPipe,
  DeadlineIconClassPipe,
  IconComponent,
} from '../../shared/icon.component';
import { CategoryColorPipe, EuroPipe, FrDatePipe, PercentPipe, RelativeDaysPipe } from '../../shared/pipes';

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
    CategoryIconClassPipe,
    CategoryColorPipe,
    DeadlineIconClassPipe,
    EuroPipe,
    FrDatePipe,
    PercentPipe,
    RelativeDaysPipe,
  ],
  template: `
    <app-page-header
      [title]="'dashboard.greeting' | t: { name: profile().firstName }"
      [subtitle]="'dashboard.subtitle' | t"
    />

    <!-- Tuiles chiffrées -->
    <section class="tile-grid" style="margin-top: 18px">
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
        [hint]="nextDeadlineHint()"
      />
      <app-stat
        [label]="'dashboard.stat.savings' | t"
        [value]="savings().totalPerYear"
        suffix="€"
        link="/economies"
        tone="success"
        [hint]="savingsHint()"
      />
      <app-stat
        [label]="'dashboard.alerts' | t"
        [value]="unread()"
        link="/alertes"
        [tone]="unread() > 0 ? 'danger' : 'neutral'"
        [hint]="unread() > 0 ? 'À traiter' : 'Rien à signaler'"
      />
    </section>

    <!-- Mises en avant -->
    @if (topIncrease(); as inc) {
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
    }

    @if (topAnomaly(); as an) {
      <div class="callout callout--danger" style="margin-top: 10px">
        <app-icon class="callout__icon" name="anomalies" />
        <div class="grow">
          <strong>{{ an.message }}</strong>
          <p>Référence habituelle : {{ an.reference | euro }} — relevé : {{ an.amount | euro }}.</p>
          <a class="btn btn--sm btn--ghost" style="margin-top: 10px" routerLink="/anomalies">
            <app-icon name="anomalies" /> Analyser mes factures
          </a>
        </div>
      </div>
    }

    @if (renewal(); as r) {
      <div class="callout callout--info" style="margin-top: 10px">
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
              <span class="row-card__meta">
                <span>{{ d.date | frDate }}</span>
              </span>
            </span>
            <span class="row-card__side">
              <span
                class="badge"
                [class.badge--danger]="days(d.date) <= 7"
                [class.badge--warning]="days(d.date) > 7 && days(d.date) <= 30"
              >
                {{ days(d.date) | relDays }}
              </span>
            </span>
          </a>
        }
      </div>
    } @else {
      <app-empty icon="calendarEmpty" [title]="'dashboard.empty.deadlines' | t" />
    }

    <!-- Contrats actifs -->
    <div class="section-head">
      <h2>{{ 'dashboard.activeContracts' | t }}</h2>
      <a routerLink="/contrats">{{ 'action.seeAll' | t }}</a>
    </div>

    <div class="list">
      @for (c of topContracts(); track c.id) {
        <a class="row-card" [routerLink]="['/contrats', c.id]">
          <span class="row-card__icon row-card__icon--cat" [style.--c]="c.category | catColor">
            <app-icon [cls]="c.category | catIconClass" />
          </span>
          <span class="row-card__body">
            <span class="row-card__title">{{ c.label }}</span>
            <span class="row-card__meta">
              <span>{{ c.provider }}</span>
            </span>
          </span>
          <span class="row-card__side">
            <span class="row-card__amount">{{ c.monthlyCost | euro }}</span>
            <span class="row-card__unit">/ mois</span>
          </span>
        </a>
      }
    </div>

    <!-- Factures récentes -->
    <div class="section-head">
      <h2>{{ 'dashboard.recentBills' | t }}</h2>
      <a routerLink="/coffre">{{ 'action.seeAll' | t }}</a>
    </div>

    <div class="list">
      @for (d of recentBills(); track d.id) {
        <a class="row-card" [routerLink]="['/coffre', d.id]">
          <span class="row-card__icon row-card__icon--cat" [style.--c]="d.category | catColor">
            <app-icon name="docInvoice" />
          </span>
          <span class="row-card__body">
            <span class="row-card__title">{{ d.issuer }}</span>
            <span class="row-card__meta">
              <span>{{ d.date | frDate }}</span>
            </span>
          </span>
          <span class="row-card__side">
            <span class="row-card__amount">{{ d.amount | euro }}</span>
          </span>
        </a>
      } @empty {
        <app-empty icon="docInvoice" title="Aucune facture récente" />
      }
    </div>

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
      .row-card__unit {
        display: block;
        font-size: 0.72rem;
        color: var(--text-muted);
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

  readonly profile = this.store.profile;
  readonly activeContracts = this.store.activeContracts;
  readonly savings = this.analysis.savings;
  readonly missing = computed(() => this.analysis.missingDocuments().slice(0, 4));
  readonly unread = this.deadlineService.unreadCount;

  readonly totalMonthly = computed(() => sum(this.activeContracts().map((c) => c.monthlyCost)));
  readonly upcoming = computed(() => this.deadlineService.next90Days().slice(0, 5));
  readonly soonCount = computed(() => this.deadlineService.next90Days().filter((d) => daysUntil(d.date) <= 30).length);

  readonly topContracts = computed(() =>
    [...this.activeContracts()].sort((a, b) => b.monthlyCost - a.monthlyCost).slice(0, 5),
  );

  readonly recentBills = computed(() =>
    this.store
      .documents()
      .filter((d) => d.docType === 'facture' && !d.archived)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 4),
  );

  readonly topIncrease = computed(() => this.analysis.increases()[0]);
  readonly topAnomaly = computed(() => this.anomalyService.anomalies()[0]);
  readonly renewal = computed(() => this.offers.opportunities()[0]);

  readonly nextDeadlineHint = computed(() => {
    // Pas de coupe au caractère près : elle tombait en plein mot. La tuile
    // borne elle-même l'indice à deux lignes, avec une ellipse propre.
    const next = this.upcoming()[0];
    return next ? next.title : 'Rien de prévu';
  });

  readonly savingsHint = computed(() => {
    const r = this.savings();
    const parts: string[] = [];
    if (r.duplicates.length) parts.push(`${r.duplicates.length} doublon(s)`);
    if (r.unused.length) parts.push(`${r.unused.length} dormant(s)`);
    if (r.increases.length) parts.push(`${r.increases.length} hausse(s)`);
    return parts.join(' · ') || 'Rien à optimiser';
  });

  days(iso: string): number {
    return daysUntil(iso);
  }
}
