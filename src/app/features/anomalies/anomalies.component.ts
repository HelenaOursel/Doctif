import { Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/i18n.service';
import { AnomalyService, ProviderSeries } from '../../core/services/anomaly.service';
import { periodLabel } from '../../core/utils';
import { CategoryBadgeComponent, EmptyStateComponent, PageHeaderComponent, StatTileComponent } from '../../shared/components';
import { CategoryIconClassPipe, IconComponent } from '../../shared/icon.component';
import { EuroPipe, PercentPipe } from '../../shared/pipes';

@Component({
  selector: 'app-anomalies',
  standalone: true,
  imports: [
    TranslatePipe,
    PageHeaderComponent,
    StatTileComponent,
    CategoryBadgeComponent,
    EmptyStateComponent,
    IconComponent,
    CategoryIconClassPipe,
    EuroPipe,
    PercentPipe,
  ],
  template: `
    <app-page-header
      [title]="'anomalies.title' | t"
      subtitle="Chaque facture est comparée à votre historique par fournisseur."
    />

    <section class="tile-grid" style="margin-top: 18px">
      <app-stat
        label="Anomalies"
        [value]="anomalies().length"
        link="/anomalies"
        [tone]="anomalies().length ? 'warning' : 'success'"
      />
      <app-stat label="Critiques" [value]="critical()" link="/anomalies" [tone]="critical() ? 'danger' : 'neutral'" />
      <app-stat label="Fournisseurs suivis" [value]="series().length" link="/anomalies" />
      <app-stat label="Relevés analysés" [value]="totalPoints()" link="/anomalies" />
    </section>

    <!-- Anomalies détectées -->
    <div class="section-head">
      <h2>Anomalies détectées</h2>
      <span class="muted">{{ anomalies().length }}</span>
    </div>

    @if (anomalies().length) {
      <div class="list">
        @for (a of anomalies(); track a.id) {
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
              <span class="anomaly__compare">
                <span class="anomaly__bar">
                  <span class="anomaly__ref" [style.width.%]="refWidth(a.reference, a.amount)"></span>
                  <span class="anomaly__cur" [style.width.%]="100"></span>
                </span>
                <span class="anomaly__legend">
                  Moyenne {{ a.reference | euro }} · relevé {{ a.amount | euro }}
                </span>
              </span>
            </span>
            <span class="row-card__side">
              <span class="badge" [class]="'badge--' + toneFor(a.severity)">{{ a.deviationPercent | pct }}</span>
            </span>
          </div>
        }
      </div>
    } @else {
      <app-empty
        icon="success"
        title="Aucune anomalie détectée"
        hint="Vos factures suivent leur trajectoire habituelle."
      />
    }

    <!-- Séries par fournisseur -->
    <div class="section-head"><h2>Évolution par fournisseur</h2></div>

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
      .anomaly__compare {
        display: block;
        margin-top: 8px;
      }
      .anomaly__bar {
        position: relative;
        display: block;
        height: 6px;
        border-radius: 999px;
        background: var(--surface-3);
        overflow: hidden;
      }
      .anomaly__cur,
      .anomaly__ref {
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        border-radius: 999px;
      }
      .anomaly__cur {
        background: var(--danger);
        z-index: 0;
      }
      .anomaly__ref {
        background: var(--text-muted);
        z-index: 1;
      }
      .anomaly__legend {
        display: block;
        margin-top: 5px;
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

  readonly anomalies = this.service.anomalies;
  readonly series = this.service.series;
  readonly critical = this.service.criticalCount;

  readonly totalPoints = computed(() => this.series().reduce((a, s) => a + s.points.length, 0));

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
    if (kind === 'hausse-brutale') return 'trendUp';
    return 'anomalies';
  }

  /** Largeur relative de la référence par rapport au relevé anormal. */
  refWidth(reference: number, amount: number): number {
    return amount > 0 ? Math.min(100, (reference / amount) * 100) : 0;
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
