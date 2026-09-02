import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Bill, CATEGORIES, Category, DocumentItem } from '../../core/models';
import { UiService } from '../../core/services/ui.service';
import { Store } from '../../core/store';
import { SheetComponent } from '../../shared/components';
import { IconComponent } from '../../shared/icon.component';
import { CategoryLabelPipe } from '../../shared/pipes';
import { period as periodOf, todayIso, uid } from '../../core/utils';

interface Draft {
  provider: string;
  category: Category;
  period: string;
  amount: number | null;
  contractId: string;
}

/**
 * Saisie d'une facture.
 *
 * Une facture n'est pas un document : c'est une ligne montant + période +
 * fournisseur, et c'est le seul matériau de la détection d'anomalies, qui
 * compare chaque montant à l'historique du même fournisseur.
 */
@Component({
  selector: 'app-bill-form',
  standalone: true,
  imports: [FormsModule, SheetComponent, IconComponent, CategoryLabelPipe],
  template: `
    <app-sheet [open]="open()" title="Enregistrer une facture" (close)="close.emit()">
      @if (document(); as d) {
        <p class="muted" style="margin: 0 0 16px">
          <app-icon name="info" /> Pré-rempli d'après « {{ d.name }} ».
        </p>
      }

      <div class="grid2">
        <div class="field">
          <label for="bf-provider">Fournisseur</label>
          <input id="bf-provider" class="input" [(ngModel)]="draft.provider" placeholder="EDF" />
        </div>
        <div class="field">
          <label for="bf-category">Catégorie</label>
          <select id="bf-category" class="input" [(ngModel)]="draft.category">
            @for (c of categories; track c) {
              <option [value]="c">{{ c | catLabel }}</option>
            }
          </select>
        </div>
      </div>

      <div class="grid2">
        <div class="field">
          <label for="bf-period">Période facturée</label>
          <input id="bf-period" class="input" type="month" [(ngModel)]="draft.period" />
        </div>
        <div class="field">
          <label for="bf-amount">Montant (€)</label>
          <input id="bf-amount" class="input" type="number" min="0" step="0.01" [(ngModel)]="draft.amount" />
        </div>
      </div>

      @if (contracts().length) {
        <div class="field">
          <label for="bf-contract">Contrat concerné (facultatif)</label>
          <select id="bf-contract" class="input" [(ngModel)]="draft.contractId">
            <option value="">Aucun</option>
            @for (c of contracts(); track c.id) {
              <option [value]="c.id">{{ c.label }} — {{ c.provider }}</option>
            }
          </select>
        </div>
      }

      <p class="hint">
        La détection d'anomalies compare chaque montant aux précédents du même fournisseur. Il lui faut au moins
        trois périodes pour établir une référence utile.
      </p>

      @if (error()) {
        <p class="form-error" role="alert"><app-icon name="warning" /> {{ error() }}</p>
      }

      <div class="row" style="margin-top: 18px">
        <button type="button" class="btn btn--ghost grow" (click)="close.emit()">Annuler</button>
        <button type="button" class="btn btn--primary grow" (click)="submit()">
          <app-icon name="check" /> Enregistrer
        </button>
      </div>
    </app-sheet>
  `,
  styles: [
    `
      .hint {
        margin: 12px 0 0;
        font-size: 0.76rem;
        color: var(--text-muted);
        line-height: 1.5;
      }
      .form-error {
        display: flex;
        gap: 8px;
        align-items: center;
        margin: 14px 0 0;
        padding: 10px 12px;
        border-radius: 8px;
        background: rgb(220 38 38 / 10%);
        color: var(--danger, #dc2626);
        font-size: 0.84rem;
      }
    `,
  ],
})
export class BillFormComponent {
  private readonly store = inject(Store);
  private readonly ui = inject(UiService);

  readonly open = input.required<boolean>();
  readonly document = input<DocumentItem | null>(null);

  readonly close = output<void>();
  readonly created = output<Bill>();

  protected readonly categories = CATEGORIES;
  protected readonly error = signal('');
  protected readonly contracts = computed(() => this.store.contracts());

  protected draft: Draft = this.blank();

  constructor() {
    effect(() => {
      if (this.open()) this.reset();
    });
  }

  reset(): void {
    this.draft = this.blank();
    this.error.set('');
  }

  private blank(): Draft {
    const d = this.document();
    return {
      provider: d?.issuer && d.issuer !== 'Émetteur inconnu' ? d.issuer : '',
      category: d?.category ?? 'autre',
      // La période vient de la date du document, pas d'aujourd'hui : une facture
      // déposée en retard concerne le mois qu'elle porte.
      period: periodOf(d?.date ?? todayIso()),
      amount: d?.amount ?? null,
      contractId: d?.contractId ?? '',
    };
  }

  protected submit(): void {
    const draft = this.draft;

    if (!draft.provider.trim()) {
      this.error.set("Indiquez le fournisseur : c'est sur lui que se fait la comparaison.");
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(draft.period)) {
      this.error.set('Choisissez la période facturée (mois et année).');
      return;
    }
    if (draft.amount === null || Number.isNaN(draft.amount) || draft.amount < 0) {
      this.error.set('Indiquez le montant de la facture.');
      return;
    }

    const doc = this.document();
    const bill: Bill = {
      id: uid('b'),
      category: draft.category,
      provider: draft.provider.trim(),
      period: draft.period,
      amount: Number(draft.amount),
      contractId: draft.contractId || undefined,
      documentId: doc?.id,
    };

    if (!this.store.addBill(bill)) {
      this.ui.readOnlyBlocked();
      return;
    }

    const memeFournisseur = this.store.bills().filter((b) => b.provider === bill.provider).length;
    this.ui.success(
      'Facture enregistrée',
      memeFournisseur >= 3
        ? `${memeFournisseur} périodes pour ${bill.provider} : les écarts inhabituels sont désormais détectables.`
        : `${memeFournisseur} période(s) pour ${bill.provider}. À partir de trois, les anomalies deviennent détectables.`,
    );
    this.created.emit(bill);
  }
}
