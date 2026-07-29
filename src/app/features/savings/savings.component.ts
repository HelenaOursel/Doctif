import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/i18n.service';
import { AnalysisService } from '../../core/services/analysis.service';
import { OffersService } from '../../core/services/offers.service';
import { CategoryBadgeComponent, EmptyStateComponent, PageHeaderComponent, StatTileComponent } from '../../shared/components';
import { CategoryIconClassPipe, IconComponent } from '../../shared/icon.component';
import { EuroPipe, FrDatePipe, PercentPipe } from '../../shared/pipes';

@Component({
  selector: 'app-savings',
  standalone: true,
  imports: [
    RouterLink,
    TranslatePipe,
    PageHeaderComponent,
    StatTileComponent,
    CategoryBadgeComponent,
    EmptyStateComponent,
    IconComponent,
    CategoryIconClassPipe,
    EuroPipe,
    FrDatePipe,
    PercentPipe,
  ],
  template: `
    <app-page-header
      [title]="'savings.title' | t"
      subtitle="Doublons de couverture, abonnements dormants et hausses tarifaires."
    />

    <section class="tile-grid" style="margin-top: 18px">
      <app-stat
        label="Économies /an"
        [value]="report().totalPerYear"
        suffix="€"
        tone="success"
        link="/economies"
        hint="Total identifié"
      />
      <app-stat label="Doublons" [value]="report().duplicates.length" link="/economies" [tone]="report().duplicates.length ? 'danger' : 'neutral'" />
      <app-stat label="Dormants" [value]="report().unused.length" link="/economies" [tone]="report().unused.length ? 'warning' : 'neutral'" />
      <app-stat label="Hausses" [value]="report().increases.length" link="/economies" [tone]="report().increases.length ? 'warning' : 'neutral'" />
    </section>

    @if (report().totalPerYear > 0) {
      <div class="callout callout--success" style="margin-top: 18px">
        <app-icon class="callout__icon" name="money" />
        <div>
          <strong>{{ report().totalPerYear | euro }} d'économies annuelles identifiées</strong>
          <p>
            En résiliant les doublons et les abonnements inutilisés, et en renégociant les contrats ayant augmenté.
            À cela s'ajoutent jusqu'à {{ potential() | euro }} par an en changeant de fournisseur.
          </p>
        </div>
      </div>
    }

    <!-- Doublons -->
    <div class="section-head">
      <h2><app-icon name="duplicate" /> Doublons de couverture</h2>
      <span class="muted">{{ report().duplicates.length }}</span>
    </div>

    @if (report().duplicates.length) {
      @for (d of report().duplicates; track d.coverage) {
        <div class="card dup">
          <div class="row row--between wrap" style="margin-bottom: 10px">
            <strong>Deux contrats couvrent « {{ d.coverage }} »</strong>
            <span class="badge badge--danger">{{ d.wastedPerYear | euro }} / an</span>
          </div>
          <p class="muted" style="margin-bottom: 12px">
            Une seule couverture est nécessaire. Résilier la moins avantageuse libère la totalité de sa cotisation.
          </p>
          <div class="list">
            @for (c of d.contracts; track c.id; let first = $first) {
              <a class="row-card" [routerLink]="['/contrats', c.id]">
                <span class="row-card__icon"><app-icon [cls]="c.category | catIconClass" /></span>
                <span class="row-card__body">
                  <span class="row-card__title">{{ c.provider }} — {{ c.label }}</span>
                  <span class="row-card__meta">
                    <app-cat-badge [category]="c.category" />
                    @if (first) {
                      <span class="badge badge--success">À conserver</span>
                    } @else {
                      <span class="badge badge--danger">Candidat à la résiliation</span>
                    }
                  </span>
                </span>
                <span class="row-card__side">
                  <span class="row-card__amount">{{ c.monthlyCost | euro }}</span>
                  <span class="unit">/ mois</span>
                </span>
              </a>
            }
          </div>
        </div>
      }
    } @else {
      <app-empty icon="success" title="Aucun doublon détecté" hint="Chaque risque n'est couvert qu'une seule fois." />
    }

    <!-- Abonnements dormants -->
    <div class="section-head">
      <h2><app-icon name="sleep" /> Abonnements inutilisés</h2>
      <span class="muted">{{ report().unused.length }}</span>
    </div>

    @if (report().unused.length) {
      <div class="list">
        @for (u of report().unused; track u.contract.id) {
          <a class="row-card" [routerLink]="['/contrats', u.contract.id]">
            <span class="row-card__icon"><app-icon [cls]="u.contract.category | catIconClass" /></span>
            <span class="row-card__body">
              <span class="row-card__title">{{ u.contract.label }} — {{ u.contract.provider }}</span>
              <span class="row-card__meta">
                <span>Dernière utilisation : {{ u.contract.lastUsedAt | frDate }}</span>
                <span class="badge badge--warning">{{ u.monthsIdle }} mois sans usage</span>
              </span>
            </span>
            <span class="row-card__side">
              <span class="row-card__amount">{{ u.wastedPerYear | euro }}</span>
              <span class="unit">/ an</span>
            </span>
          </a>
        }
      </div>
    } @else {
      <app-empty icon="success" title="Tous vos abonnements servent" />
    }

    <!-- Augmentations -->
    <div class="section-head">
      <h2><app-icon name="trendUp" /> Augmentations tarifaires</h2>
      <span class="muted">{{ report().increases.length }}</span>
    </div>

    @if (report().increases.length) {
      <div class="list">
        @for (i of report().increases; track i.contract.id) {
          <a class="row-card" [routerLink]="['/contrats', i.contract.id]">
            <span class="row-card__icon"><app-icon [cls]="i.contract.category | catIconClass" /></span>
            <span class="row-card__body">
              <span class="row-card__title">{{ i.contract.label }} — {{ i.contract.provider }}</span>
              <span class="row-card__meta">
                <span>{{ i.previous | euro }} → {{ i.current | euro }} par mois</span>
              </span>
              <span class="increase__bar" aria-hidden="true">
                <span class="increase__fill" [style.width.%]="barWidth(i.percent)"></span>
              </span>
            </span>
            <span class="row-card__side">
              <span class="badge" [class.badge--danger]="i.percent >= 10" [class.badge--warning]="i.percent < 10">
                {{ i.percent | pct: 1 }}
              </span>
              <span class="unit">+{{ i.extraPerYear | euro }}/an</span>
            </span>
          </a>
        }
      </div>
    } @else {
      <app-empty icon="success" title="Aucune hausse significative" />
    }

    <div class="row" style="margin-top: 22px">
      <a class="btn btn--primary btn--block" routerLink="/renouvellement">
        <app-icon name="scale" /> Comparer les offres du marché
      </a>
    </div>
  `,
  styles: [
    `
      .section-head h2 {
        display: flex;
        align-items: center;
        gap: 9px;
      }
      .section-head app-icon {
        font-size: 0.9rem;
        color: var(--text-muted);
      }

      .dup {
        margin-bottom: 10px;
      }

      .unit {
        display: block;
        font-size: 0.72rem;
        color: var(--text-muted);
      }

      .increase__bar {
        display: block;
        height: 5px;
        margin-top: 8px;
        border-radius: 999px;
        background: var(--surface-3);
        overflow: hidden;
      }
      .increase__fill {
        display: block;
        height: 100%;
        border-radius: 999px;
        background: var(--warning);
      }
    `,
  ],
})
export class SavingsComponent {
  private readonly analysis = inject(AnalysisService);
  private readonly offers = inject(OffersService);

  readonly report = this.analysis.savings;
  readonly potential = this.offers.potentialSavings;

  /** Barre visuelle plafonnée à 30 % de hausse pour rester lisible. */
  barWidth(percent: number): number {
    return Math.min(100, (percent / 30) * 100);
  }
}
