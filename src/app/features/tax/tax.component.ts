import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/i18n.service';
import { TAX_KIND_LABEL, TaxKind, TaxRecord } from '../../core/models';
import { UiService } from '../../core/services/ui.service';
import { Store } from '../../core/store';
import { daysUntil, groupBy, sum } from '../../core/utils';
import { EmptyStateComponent, PageHeaderComponent, StatTileComponent } from '../../shared/components';
import { IconComponent } from '../../shared/icon.component';
import { EuroPipe, FrDatePipe, RelativeDaysPipe } from '../../shared/pipes';
import { TaxFormComponent } from './tax-form.component';

const STATUS_META: Record<TaxRecord['status'], { label: string; tone: string }> = {
  'a-faire': { label: 'À faire', tone: 'danger' },
  'en-cours': { label: 'En cours', tone: 'warning' },
  depose: { label: 'Déposé', tone: 'success' },
  paye: { label: 'Payé', tone: 'success' },
};

@Component({
  selector: 'app-tax',
  standalone: true,
  imports: [
    RouterLink,
    TranslatePipe,
    PageHeaderComponent,
    StatTileComponent,
    EmptyStateComponent,
    IconComponent,
    EuroPipe,
    FrDatePipe,
    RelativeDaysPipe,
    TaxFormComponent,
  ],
  template: `
    <app-page-header
      [title]="'tax.title' | t"
      subtitle="Déclarations, avis d'imposition, taxes foncières et justificatifs de revenus."
    >
      <button type="button" class="btn btn--sm btn--primary" (click)="formOpen.set(true)">
        <app-icon name="add" /> Ajouter
      </button>
    </app-page-header>

    <app-tax-form [open]="formOpen()" (close)="formOpen.set(false)" (created)="formOpen.set(false)" />

    <section class="tile-grid" style="margin-top: 18px">
      <app-stat label="À traiter" [value]="todo().length" link="/fiscal" fragment="a-traiter" [tone]="todo().length ? 'danger' : 'success'" />
      <app-stat label="Dû cette année" [value]="dueThisYear()" suffix="€" link="/fiscal" fragment="historique" tone="warning" />
      <app-stat label="Payé cette année" [value]="paidThisYear()" suffix="€" link="/fiscal" fragment="historique" tone="success" />
      <app-stat label="Pièces archivées" [value]="taxDocuments().length" link="/fiscal" fragment="pieces" />
    </section>

    <!-- Échéances fiscales imminentes -->
    @if (todo().length) {
      <div class="section-head" id="a-traiter"><h2>Échéances à traiter</h2></div>
      <div class="list">
        @for (t of todo(); track t.id) {
          <div class="row-card">
            <span class="row-card__icon row-card__icon--warning"><app-icon name="tax" /></span>
            <span class="row-card__body">
              <span class="row-card__title">{{ kindLabel(t.kind) }} {{ t.year }}</span>
              <span class="row-card__meta">
                @if (t.dueDate) {
                  <span>Échéance {{ t.dueDate | frDate: 'long' }}</span>
                  <span
                    class="badge"
                    [class.badge--danger]="daysLeft(t.dueDate) <= 7"
                    [class.badge--warning]="daysLeft(t.dueDate) > 7"
                  >
                    {{ daysLeft(t.dueDate) | relDays }}
                  </span>
                }
              </span>
              @if (t.note) {
                <span class="note">{{ t.note }}</span>
              }
            </span>
            <span class="row-card__side">
              @if (t.amount) {
                <span class="row-card__amount">{{ t.amount | euro }}</span>
              }
              <button type="button" class="btn btn--sm btn--ghost" (click)="markPaid(t)">
                <app-icon name="check" /> Fait
              </button>
            </span>
          </div>
        }
      </div>
    }

    <!-- Historique par année -->
    <div class="section-head" id="historique"><h2>Historique fiscal</h2></div>

    @if (byYear().length) {
      @for (group of byYear(); track group.year) {
        <div class="card year" style="margin-bottom: 10px">
          <div class="row row--between" style="margin-bottom: 10px">
            <strong class="year__title">{{ group.year }}</strong>
            <span class="badge">{{ group.total | euro }}</span>
          </div>
          <div class="list">
            @for (t of group.items; track t.id) {
              <div class="row-card">
                <span class="row-card__icon"><app-icon [name]="iconFor(t.kind)" /></span>
                <span class="row-card__body">
                  <span class="row-card__title">{{ kindLabel(t.kind) }}</span>
                  <span class="row-card__meta">
                    <span class="badge" [class]="'badge--' + statusTone(t.status)">{{ statusLabel(t.status) }}</span>
                    @if (t.dueDate) {
                      <span>{{ t.dueDate | frDate }}</span>
                    }
                  </span>
                </span>
                <span class="row-card__side">
                  @if (t.amount) {
                    <span class="row-card__amount">{{ t.amount | euro }}</span>
                  }
                </span>
              </div>
            }
          </div>
        </div>
      }
    } @else {
      <app-empty icon="tax" title="Aucun élément fiscal enregistré" />
    }

    <!-- Documents fiscaux du coffre -->
    <div class="section-head" id="pieces">
      <h2>Pièces fiscales du coffre</h2>
      <a routerLink="/coffre">Tout le coffre</a>
    </div>

    @if (taxDocuments().length) {
      <div class="list">
        @for (d of taxDocuments(); track d.id) {
          <a class="row-card" [routerLink]="['/coffre', d.id]">
            <span class="row-card__icon"><app-icon name="docNotice" /></span>
            <span class="row-card__body">
              <span class="row-card__title">{{ d.name }}</span>
              <span class="row-card__meta">{{ d.issuer }} · {{ d.date | frDate }}</span>
            </span>
            <span class="row-card__side">
              @if (d.amount) {
                <span class="row-card__amount">{{ d.amount | euro }}</span>
              }
            </span>
          </a>
        }
      </div>
    } @else {
      <app-empty icon="inbox" title="Aucune pièce fiscale archivée">
        <a class="btn btn--sm btn--primary" style="margin-top: 12px" routerLink="/scanner">Scanner un avis</a>
      </app-empty>
    }

    <!-- Rappels du calendrier fiscal français -->
    <div class="section-head"><h2>Repères du calendrier fiscal</h2></div>
    <div class="card-grid">
      @for (r of reminders; track r.title) {
        <div class="card">
          <div class="row" style="margin-bottom: 6px">
            <app-icon class="reminder__icon" name="calendar" />
            <strong>{{ r.title }}</strong>
          </div>
          <p class="muted" style="margin: 0">{{ r.body }}</p>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .year__title {
        font-size: 1.05rem;
        letter-spacing: -0.02em;
      }
      .note {
        display: block;
        margin-top: 5px;
        font-size: 0.79rem;
        color: var(--text-muted);
      }
      .row-card__icon--warning {
        background: var(--warning-soft);
        color: var(--warning);
      }
      .row-card__side {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .reminder__icon {
        color: var(--primary);
      }
    `,
  ],
})
export class TaxComponent {
  private readonly store = inject(Store);
  private readonly ui = inject(UiService);

  readonly formOpen = signal(false);

  readonly reminders = [
    {
      title: 'Avril — mai',
      body: 'Ouverture puis clôture de la déclaration en ligne des revenus, par vagues selon le département.',
    },
    { title: 'Août — septembre', body: "Réception de l'avis d'impôt sur le revenu et solde éventuel à payer." },
    { title: 'Octobre', body: 'Avis de taxe foncière : paiement au 15 octobre, ou 20 octobre en ligne.' },
    { title: 'Décembre', body: 'Ajustement du taux de prélèvement à la source pour l’année suivante.' },
  ];

  readonly taxes = this.store.taxes;

  readonly todo = computed(() =>
    this.taxes()
      .filter((t) => t.status === 'a-faire' || t.status === 'en-cours')
      .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')),
  );

  readonly byYear = computed(() => {
    const groups = groupBy(this.taxes(), (t) => t.year);
    return [...groups.entries()]
      .map(([year, items]) => ({
        year,
        items: items.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '')),
        total: sum(items.map((i) => i.amount ?? 0)),
      }))
      .sort((a, b) => b.year - a.year);
  });

  readonly dueThisYear = computed(() => {
    const y = new Date().getFullYear();
    return sum(
      this.taxes()
        .filter((t) => t.year === y && t.status === 'a-faire')
        .map((t) => t.amount ?? 0),
    );
  });

  readonly paidThisYear = computed(() => {
    const y = new Date().getFullYear();
    return sum(
      this.taxes()
        .filter((t) => t.year === y && (t.status === 'paye' || t.status === 'depose'))
        .map((t) => t.amount ?? 0),
    );
  });

  readonly taxDocuments = computed(() =>
    this.store
      .documents()
      .filter((d) => d.category === 'impots')
      .sort((a, b) => b.date.localeCompare(a.date)),
  );

  kindLabel(kind: TaxKind): string {
    return TAX_KIND_LABEL[kind];
  }

  statusLabel(status: TaxRecord['status']): string {
    return STATUS_META[status].label;
  }

  statusTone(status: TaxRecord['status']): string {
    return STATUS_META[status].tone;
  }

  iconFor(kind: TaxKind): 'docNotice' | 'docStatement' | 'catLogement' | 'money' {
    if (kind === 'taxe-fonciere' || kind === 'taxe-habitation') return 'catLogement';
    if (kind === 'revenus') return 'money';
    if (kind === 'declaration') return 'docStatement';
    return 'docNotice';
  }

  daysLeft(iso: string): number {
    return daysUntil(iso);
  }

  markPaid(record: TaxRecord): void {
    const next = record.kind === 'declaration' ? 'depose' : 'paye';
    if (!this.store.updateTax(record.id, { status: next })) {
      this.ui.readOnlyBlocked();
      return;
    }
    this.ui.success('Échéance fiscale traitée', `${this.kindLabel(record.kind)} ${record.year}`);
  }
}
