import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { TranslatePipe } from '../../core/i18n/i18n.service';
import { ContractStatus } from '../../core/models';
import { AnalysisService } from '../../core/services/analysis.service';
import { Store } from '../../core/store';
import { daysUntil, sum } from '../../core/utils';
import { EmptyStateComponent, PageHeaderComponent, StatTileComponent } from '../../shared/components';
import { CategoryIconClassPipe, IconComponent } from '../../shared/icon.component';
import { CategoryColorPipe, EuroPipe } from '../../shared/pipes';

@Component({
  selector: 'app-contracts',
  standalone: true,
  imports: [
    RouterLink,
    TranslatePipe,
    PageHeaderComponent,
    StatTileComponent,
    EmptyStateComponent,
    IconComponent,
    CategoryIconClassPipe,
    CategoryColorPipe,
    EuroPipe,
  ],
  template: `
    <app-page-header [title]="'contracts.title' | t" subtitle="Clauses analysées, score de risque et résiliation assistée." />

    <section class="tile-grid" style="margin-top: 18px">
      <app-stat label="Contrats actifs" [value]="active().length" link="/contrats" />
      <app-stat label="Coût mensuel" [value]="totalMonthly()" suffix="€" [decimals]="2" link="/contrats" />
      <app-stat label="Coût annuel" [value]="totalMonthly() * 12" suffix="€" link="/contrats" />
      <app-stat
        label="Risque élevé"
        [value]="highRiskCount()"
        link="/contrats"
        [queryParams]="{ risque: 'eleve' }"
        [tone]="highRiskCount() > 0 ? 'danger' : 'success'"
      />
    </section>

    <!-- Filtres -->
    <div class="scroll-x" style="margin: 16px 0 10px">
      @for (f of statusFilters; track f.value) {
        <button
          type="button"
          class="chip"
          [class.chip--active]="!riskFilter() && status() === f.value"
          (click)="setStatus(f.value)"
        >
          {{ f.label }}
          <span class="chip__count">{{ countFor(f.value) }}</span>
        </button>
      }
      <button
        type="button"
        class="chip"
        [class.chip--active]="riskFilter() === 'eleve'"
        [attr.aria-pressed]="riskFilter() === 'eleve'"
        (click)="toggleRiskFilter()"
      >
        <app-icon name="danger" /> Risque élevé
        <span class="chip__count">{{ highRiskCount() }}</span>
      </button>
    </div>

    <div class="row" style="margin-bottom: 12px">
      <label class="sortlabel" for="sort">Trier par</label>
      <select id="sort" class="select" style="max-width: 220px" [value]="sort()" (change)="onSort($event)">
        <option value="cout">Coût décroissant</option>
        <option value="risque">Score de risque</option>
        <option value="echeance">Échéance la plus proche</option>
        <option value="nom">Nom</option>
      </select>
    </div>

    @if (visible().length) {
      <div class="list">
        @for (c of visible(); track c.id) {
          <a class="row-card contract" [routerLink]="['/contrats', c.id]">
            <span class="row-card__icon row-card__icon--cat" [style.--c]="c.category | catColor">
              <app-icon [cls]="c.category | catIconClass" />
            </span>

            <span class="row-card__body">
              <span class="row-card__title">{{ c.label }}</span>
              <span class="row-card__meta">
                <span>{{ c.provider }}</span>
                @if (c.status !== 'actif') {
                  <span class="badge">{{ c.status === 'resilie' ? 'Résilié' : 'Expiré' }}</span>
                }
                @if (c.renewalDate && c.status === 'actif' && daysLeft(c.renewalDate) <= 45) {
                  <span class="badge badge--warning">Échéance proche</span>
                }
              </span>
            </span>

            <span class="row-card__side">
              <span class="row-card__amount">{{ c.monthlyCost | euro }}</span>
              <span class="contract__unit">/ mois</span>
              <span class="riskpill" [class]="'riskpill--' + riskLevel(c.id)">{{ riskScore(c.id) }}</span>
            </span>
          </a>
        }
      </div>
    } @else {
      <app-empty
        icon="contracts"
        [title]="riskFilter() ? 'Aucun contrat à risque élevé' : 'Aucun contrat dans cette vue'"
      >
        @if (riskFilter()) {
          <button type="button" class="btn btn--sm btn--ghost" style="margin-top: 12px" (click)="toggleRiskFilter()">
            <app-icon name="refresh" /> Voir tous les contrats
          </button>
        }
      </app-empty>
    }
  `,
  styles: [
    `
      .sortlabel {
        font-size: 0.8rem;
        color: var(--text-muted);
        font-weight: 600;
        white-space: nowrap;
      }

      .chip__count {
        font-size: 0.7rem;
        opacity: 0.85;
      }

      .contract__unit {
        display: block;
        font-size: 0.72rem;
        color: var(--text-muted);
      }

      .riskpill {
        display: inline-block;
        margin-top: 6px;
        min-width: 34px;
        padding: 2px 7px;
        border-radius: 999px;
        font-size: 0.72rem;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .riskpill--faible {
        background: var(--success-soft);
        color: var(--success);
      }
      .riskpill--modere {
        background: var(--warning-soft);
        color: var(--warning);
      }
      .riskpill--eleve {
        background: var(--danger-soft);
        color: var(--danger);
      }
    `,
  ],
})
export class ContractsComponent {
  private readonly store = inject(Store);
  private readonly analysis = inject(AnalysisService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly statusFilters: { value: ContractStatus | 'tous'; label: string }[] = [
    { value: 'actif', label: 'Actifs' },
    { value: 'resilie', label: 'Résiliés' },
    { value: 'expire', label: 'Expirés' },
    { value: 'tous', label: 'Tous' },
  ];

  readonly status = signal<ContractStatus | 'tous'>('actif');
  readonly sort = signal<'cout' | 'risque' | 'echeance' | 'nom'>('cout');

  /**
   * Filtre par niveau de risque. Il vit dans l'URL plutôt que dans un signal
   * local : la tuile « Risque élevé » y renvoie, y compris depuis un autre
   * écran, et la vue filtrée reste partageable.
   */
  readonly riskFilter = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('risque'))),
    { initialValue: null },
  );

  readonly active = this.store.activeContracts;
  readonly totalMonthly = computed(() => sum(this.active().map((c) => c.monthlyCost)));

  readonly highRiskCount = computed(
    () => this.active().filter((c) => this.analysis.assessRisk(c).level === 'eleve').length,
  );

  readonly visible = computed(() => {
    const risk = this.riskFilter();
    const s = this.status();

    // Le filtre de risque porte sur les contrats actifs, comme la tuile qui y
    // renvoie : les deux affichent donc bien le même ensemble.
    const list = risk
      ? this.active().filter((c) => this.riskLevel(c.id) === risk)
      : s === 'tous'
        ? this.store.contracts()
        : this.store.contracts().filter((c) => c.status === s);

    const sorted = [...list];
    switch (this.sort()) {
      case 'risque':
        sorted.sort((a, b) => this.riskScore(b.id) - this.riskScore(a.id));
        break;
      case 'echeance':
        sorted.sort((a, b) => (a.renewalDate ?? '9999').localeCompare(b.renewalDate ?? '9999'));
        break;
      case 'nom':
        sorted.sort((a, b) => a.label.localeCompare(b.label, 'fr'));
        break;
      default:
        sorted.sort((a, b) => b.monthlyCost - a.monthlyCost);
    }
    return sorted;
  });

  countFor(status: ContractStatus | 'tous'): number {
    return status === 'tous'
      ? this.store.contracts().length
      : this.store.contracts().filter((c) => c.status === status).length;
  }

  riskScore(contractId: string): number {
    return this.analysis.riskByContract().get(contractId)?.score ?? 0;
  }

  riskLevel(contractId: string): string {
    return this.analysis.riskByContract().get(contractId)?.level ?? 'faible';
  }

  increaseFor(contractId: string): number | null {
    const inc = this.analysis.increases().find((i) => i.contract.id === contractId);
    return inc ? inc.percent : null;
  }

  daysLeft(iso: string): number {
    return daysUntil(iso);
  }

  onSort(event: Event): void {
    this.sort.set((event.target as HTMLSelectElement).value as 'cout' | 'risque' | 'echeance' | 'nom');
  }

  /** Choisir un statut lève le filtre de risque : les deux sont exclusifs. */
  setStatus(status: ContractStatus | 'tous'): void {
    this.status.set(status);
    if (this.riskFilter()) this.setRiskParam(null);
  }

  toggleRiskFilter(): void {
    this.setRiskParam(this.riskFilter() ? null : 'eleve');
  }

  private setRiskParam(value: string | null): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { risque: value },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
