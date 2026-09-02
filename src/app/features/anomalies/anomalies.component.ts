import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { AnomalyService, ProviderSeries } from '../../core/services/anomaly.service';
import { Store } from '../../core/store';
import { periodLabel } from '../../core/utils';
import { CategoryBadgeComponent, EmptyStateComponent } from '../../shared/components';
import { CategoryIconClassPipe, IconComponent } from '../../shared/icon.component';
import { EuroPipe, PercentPipe } from '../../shared/pipes';
import { BillFormComponent } from './bill-form.component';

/**
 * Onglet « Anomalies » des économies : les factures anormales sont un motif
 * d'économie parmi d'autres. Le composant ne porte pas d'en-tête — c'est la
 * coque « Économies » qui l'affiche.
 */
@Component({
  selector: 'app-anomalies',
  standalone: true,
  imports: [
    CategoryBadgeComponent,
    EmptyStateComponent,
    IconComponent,
    CategoryIconClassPipe,
    EuroPipe,
    PercentPipe,
    BillFormComponent,
  ],
  template: `
    <div class="row row--between wrap" style="margin: 16px 0 4px; gap: 8px">
      <p class="muted">Chaque facture est comparée à l’historique du même fournisseur.</p>
      <button type="button" class="btn btn--sm btn--primary" (click)="billFormOpen.set(true)">
        <app-icon name="add" /> Ajouter une facture
      </button>
    </div>

    <app-bill-form [open]="billFormOpen()" (close)="billFormOpen.set(false)" (created)="billFormOpen.set(false)" />

    <!-- Anomalies détectées -->
    <div class="section-head" id="liste">
      <h2>Anomalies détectées</h2>
      @if (severityFilter()) {
        <button type="button" class="btn btn--sm btn--quiet" (click)="clearSeverity()">
          <app-icon name="close" /> Critiques uniquement
        </button>
      } @else {
        <span class="muted">{{ anomalies().length }}</span>
      }
    </div>

    @if (visible().length) {
      <div class="list">
        @for (a of visible(); track a.id) {
          <div class="row-card anomaly" [class]="'anomaly--' + a.severity">
            <span class="row-card__icon" [class]="'row-card__icon--' + a.severity">
              <app-icon [name]="iconFor(a.kind)" />
            </span>
            <span class="row-card__body">
              <span class="row-card__title">{{ a.message }}</span>
              <span class="row-card__meta">
                <app-cat-badge [category]="a.category" />
                <span>{{ a.provider }}</span>
                <span>· {{ label(a.period) }}</span>
              </span>
              <span class="anomaly__legend">
                Moyenne {{ a.reference | euro }} · relevé {{ a.amount | euro }}
              </span>
            </span>
            <span class="row-card__side">
              <span class="badge" [class]="'badge--' + toneFor(a.severity)">{{ a.deviationPercent | pct }}</span>
            </span>
          </div>
        }
      </div>
    } @else if (severityFilter()) {
      <app-empty icon="success" title="Aucune anomalie critique" hint="Les écarts relevés restent modérés.">
        <button type="button" class="btn btn--sm btn--ghost" style="margin-top: 12px" (click)="clearSeverity()">
          <app-icon name="refresh" /> Voir toutes les anomalies
        </button>
      </app-empty>
    } @else if (bills().length) {
      <app-empty
        icon="success"
        title="Aucune anomalie détectée"
        hint="Vos factures suivent leur trajectoire habituelle."
      />
    } @else {
      <app-empty icon="inbox" title="Aucune facture enregistrée">
        <p class="muted" style="margin: 8px 0 0">
          La détection compare chaque montant à l'historique du même fournisseur. Sans facture, elle n'a rien à
          comparer — comptez trois périodes avant que les écarts deviennent significatifs.
        </p>
        <button type="button" class="btn btn--sm btn--primary" style="margin-top: 12px" (click)="billFormOpen.set(true)">
          <app-icon name="add" /> Ajouter ma première facture
        </button>
      </app-empty>
    }

    <!-- Factures enregistrées : sans cette liste, elles ne seraient visibles
         nulle part, puisque seule la détection les consomme. -->
    @if (bills().length) {
      <div class="section-head" id="factures">
        <h2>Factures enregistrées</h2>
        <span class="muted">{{ bills().length }}</span>
      </div>
      <div class="list">
        @for (b of recentBills(); track b.id) {
          <div class="row-card">
            <span class="row-card__icon row-card__icon--cat">
              <app-icon [cls]="b.category | catIconClass" />
            </span>
            <span class="row-card__body">
              <span class="row-card__title">{{ b.provider }}</span>
              <span class="row-card__meta">{{ periodLabel(b.period) }}</span>
            </span>
            <span class="row-card__side">
              <span class="row-card__amount">{{ b.amount | euro }}</span>
            </span>
          </div>
        }
      </div>
      @if (bills().length > recentBills().length) {
        <p class="muted" style="margin-top: 10px; font-size: 0.8rem">
          {{ bills().length - recentBills().length }} facture(s) plus ancienne(s) non affichée(s).
        </p>
      }
    }

    <!-- Séries par fournisseur -->
    <div class="section-head" id="series"><h2>Évolution par fournisseur</h2></div>

    <div class="stack">
      @for (s of series(); track s.provider) {
        <div class="card serie">
          <div class="row row--between wrap" style="margin-bottom: 12px">
            <div class="row">
              <span class="row-card__icon"><app-icon [cls]="s.category | catIconClass" /></span>
              <div>
                <strong>{{ s.provider }}</strong>
                <div class="muted">Moyenne {{ s.average | euro }}</div>
              </div>
            </div>
            <span
              class="badge"
              [class.badge--danger]="s.trendPercent >= 25"
              [class.badge--warning]="s.trendPercent >= 8 && s.trendPercent < 25"
              [class.badge--success]="s.trendPercent < 0"
            >
              <app-icon [name]="s.trendPercent >= 0 ? 'trendUp' : 'trendDown'" />
              {{ s.trendPercent | pct }}
            </span>
          </div>

          <!-- Histogramme : chaque barre est un relevé mensuel -->
          <div class="chart" role="img" [attr.aria-label]="chartLabel(s)">
            @for (p of s.points; track p.period) {
              <div class="chart__col" [title]="label(p.period) + ' : ' + fmt(p.amount)">
                <div
                  class="chart__bar"
                  [class.chart__bar--anomalous]="p.anomalous"
                  [style.height.%]="barHeight(p.amount, s)"
                ></div>
              </div>
            }
          </div>

          <div class="chart__axis">
            <span>{{ label(s.points[0].period) }}</span>
            <span>{{ label(s.points[s.points.length - 1].period) }}</span>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .anomaly__legend {
        display: block;
        margin-top: 6px;
        font-size: 0.76rem;
        color: var(--text-muted);
      }

      .row-card__icon--risque {
        background: var(--danger-soft);
        color: var(--danger);
      }
      .row-card__icon--attention {
        background: var(--warning-soft);
        color: var(--warning);
      }
      .row-card__icon--info {
        background: var(--info-soft);
        color: var(--info);
      }

      .chart {
        display: flex;
        align-items: flex-end;
        gap: 3px;
        height: 90px;
        padding-top: 4px;
      }
      .chart__col {
        flex: 1;
        height: 100%;
        display: flex;
        align-items: flex-end;
        min-width: 4px;
      }
      .chart__bar {
        width: 100%;
        border-radius: 3px 3px 0 0;
        background: var(--primary);
        opacity: 0.72;
        transition: opacity 0.15s ease;
        min-height: 3px;
      }
      .chart__col:hover .chart__bar {
        opacity: 1;
      }
      .chart__bar--anomalous {
        background: var(--danger);
        opacity: 1;
      }
      .chart__axis {
        display: flex;
        justify-content: space-between;
        margin-top: 6px;
        font-size: 0.7rem;
        color: var(--text-muted);
      }
    `,
  ],
})
export class AnomaliesComponent {
  private readonly service = inject(AnomalyService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly store = inject(Store);

  readonly billFormOpen = signal(false);
  readonly bills = this.store.bills;

  /** Les plus récentes d'abord ; la liste complète n'aurait pas d'usage ici. */
  readonly recentBills = computed(() =>
    [...this.bills()].sort((a, b) => b.period.localeCompare(a.period)).slice(0, 12),
  );

  protected readonly periodLabel = periodLabel;

  readonly anomalies = this.service.anomalies;
  readonly series = this.service.series;
  readonly critical = this.service.criticalCount;

  /** Filtre de gravité porté par l'URL, donc partageable et réversible. */
  readonly severityFilter = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('gravite'))),
    { initialValue: null },
  );

  readonly visible = computed(() => {
    const severity = this.severityFilter();
    return severity ? this.anomalies().filter((a) => a.severity === severity) : this.anomalies();
  });

  clearSeverity(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { gravite: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  label(period: string): string {
    return periodLabel(period);
  }

  fmt(amount: number): string {
    return `${amount.toFixed(2).replace('.', ',')} €`;
  }

  toneFor(severity: string): string {
    return severity === 'risque' ? 'danger' : severity === 'attention' ? 'warning' : 'info';
  }

  iconFor(kind: string): 'trendUp' | 'duplicate' | 'anomalies' {
    if (kind === 'doublon-facture') return 'duplicate';
    if (kind === 'hausse-brutale' || kind === 'ecart-contrat') return 'trendUp';
    return 'anomalies';
  }


  barHeight(amount: number, series: ProviderSeries): number {
    const max = Math.max(...series.points.map((p) => p.amount), 1);
    return Math.max(3, (amount / max) * 100);
  }

  chartLabel(s: ProviderSeries): string {
    return `Évolution des factures ${s.provider} sur ${s.points.length} mois, de ${this.fmt(
      Math.min(...s.points.map((p) => p.amount)),
    )} à ${this.fmt(Math.max(...s.points.map((p) => p.amount)))}.`;
  }
}
