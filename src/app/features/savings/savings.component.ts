import { Component, computed, inject, linkedSignal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { TranslatePipe } from '../../core/i18n/i18n.service';
import { AnalysisService } from '../../core/services/analysis.service';
import { OffersService } from '../../core/services/offers.service';
import { CategoryBadgeComponent, EmptyStateComponent, PageHeaderComponent, StatTileComponent } from '../../shared/components';
import { CategoryIconClassPipe, IconComponent } from '../../shared/icon.component';
import { EuroPipe, FrDatePipe, PercentPipe } from '../../shared/pipes';
import { FEATURES } from '../../core/features';
import { AnomaliesComponent } from '../anomalies/anomalies.component';
import { RenewalComponent } from '../renewal/renewal.component';

type SavingsView = 'optimisations' | 'anomalies' | 'offres';

/** Onglet inconnu ou absent : on retombe sur les optimisations. */
const normalizeView = (raw: string | null): SavingsView =>
  raw === 'anomalies' || (raw === 'offres' && FEATURES.offers) ? raw : 'optimisations';


/**
 * Coque « Économies » : les optimisations de contrats, les anomalies de
 * facturation et — quand la fonctionnalité est active — la comparaison des
 * offres sont trois vues d'une même intention, récupérer de l'argent.
 */
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
    AnomaliesComponent,
    RenewalComponent,
    IconComponent,
    CategoryIconClassPipe,
    EuroPipe,
    FrDatePipe,
    PercentPipe,
  ],
  template: `
    <app-page-header [title]="'savings.title' | t" />

    <!-- Trois angles sur la même question : où part l’argent, et comment en
         récupérer. Les anomalies de facturation en font partie. -->
    <div class="row" style="margin-top: 16px">
      <div class="scroll-x segmented" role="tablist">
        @for (tab of tabs; track tab.value) {
          <button
            type="button"
            role="tab"
            class="segmented__btn"
            [attr.aria-selected]="view() === tab.value"
            [class.segmented__btn--active]="view() === tab.value"
            (click)="setView(tab.value)"
          >
            <app-icon [name]="tab.icon" /> {{ tab.label }}
          </button>
        }
      </div>
    </div>

    @if (view() === 'anomalies') {
      <app-anomalies />
    } @else if (view() === 'offres') {
      <app-renewal />
    } @else {
      <section class="tile-grid" style="margin-top: 18px">
        <app-stat
          label="Doublons"
          [value]="report().duplicates.length"
          link="/economies"
          fragment="doublons"
          [tone]="report().duplicates.length ? 'danger' : 'neutral'"
        />
        <app-stat
          label="Dormants"
          [value]="report().unused.length"
          link="/economies"
          fragment="dormants"
          [tone]="report().unused.length ? 'warning' : 'neutral'"
        />
        <app-stat
          label="Hausses"
          [value]="report().increases.length"
          link="/economies"
          fragment="hausses"
          [tone]="report().increases.length ? 'warning' : 'neutral'"
        />
      </section>

      @if (report().totalPerYear > 0) {
        <div class="callout callout--success" style="margin-top: 18px">
          <app-icon class="callout__icon" name="money" />
          <div>
            <strong>{{ report().totalPerYear | euro }} d'économies annuelles identifiées</strong>
            <p>
              En résiliant les doublons et les abonnements inutilisés, et en renégociant les contrats ayant augmenté.
              @if (offersEnabled) {
                À cela s'ajoutent jusqu'à {{ potential() | euro }} par an en changeant de fournisseur.
              }
            </p>
          </div>
        </div>
      }

      <!-- Doublons -->
      <div class="section-head" id="doublons">
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
      <div class="section-head" id="dormants">
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
      <div class="section-head" id="hausses">
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
    }
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

      .segmented {
        display: inline-flex;
        max-width: 100%;
        padding: 3px;
        border-radius: 12px;
        background: var(--surface-2);
        gap: 3px;
      }
      .segmented__btn {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 7px 14px;
        border: 0;
        border-radius: 9px;
        background: transparent;
        color: var(--text-muted);
        font-size: 0.84rem;
        font-weight: 620;
        white-space: nowrap;
        cursor: pointer;
      }
      .segmented__btn--active {
        background: var(--surface);
        color: var(--text);
        box-shadow: var(--shadow-sm);
      }
    `,
  ],
})
export class SavingsComponent {
  private readonly analysis = inject(AnalysisService);
  private readonly offers = inject(OffersService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /** Comparateur d'offres : voir core/features.ts. */
  protected readonly offersEnabled = FEATURES.offers;

  readonly tabs = [
    { value: 'optimisations' as const, label: 'Optimisations', icon: 'savings' as const },
    { value: 'anomalies' as const, label: 'Anomalies', icon: 'anomalies' as const },
    ...(FEATURES.offers ? [{ value: 'offres' as const, label: 'Offres', icon: 'scale' as const }] : []),
  ];

  /**
   * L'onglet vit dans l'URL : /anomalies et /renouvellement y redirigent, et
   * un lien partagé rouvre la bonne vue.
   */
  private readonly urlView = toSignal(this.route.queryParamMap.pipe(map((q) => normalizeView(q.get('vue')))), {
    initialValue: normalizeView(this.route.snapshot.queryParamMap.get('vue')),
  });
  readonly view = linkedSignal(() => this.urlView());

  setView(view: SavingsView): void {
    this.view.set(view);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { vue: view === 'optimisations' ? null : view },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  readonly report = this.analysis.savings;
  readonly potential = this.offers.potentialSavings;

}
