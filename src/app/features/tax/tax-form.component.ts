import { Component, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DocumentItem, TAX_KIND_LABEL, TaxKind, TaxRecord } from '../../core/models';
import { UiService } from '../../core/services/ui.service';
import { Store } from '../../core/store';
import { SheetComponent } from '../../shared/components';
import { IconComponent } from '../../shared/icon.component';
import { todayIso, uid } from '../../core/utils';

interface Draft {
  year: number;
  kind: TaxKind;
  amount: number | null;
  status: TaxRecord['status'];
  dueDate: string;
  note: string;
}

/** Ajout d'une ligne au suivi fiscal : déclaration, avis, taxe ou justificatif. */
@Component({
  selector: 'app-tax-form',
  standalone: true,
  imports: [FormsModule, SheetComponent, IconComponent],
  template: `
    <app-sheet [open]="open()" title="Ajouter au suivi fiscal" (close)="close.emit()">
      @if (document(); as d) {
        <p class="muted" style="margin: 0 0 16px">
          <app-icon name="info" /> Pré-rempli d'après « {{ d.name }} ».
        </p>
      }

      <div class="grid2">
        <div class="field">
          <label for="tf-kind">Nature</label>
          <select id="tf-kind" class="input" [(ngModel)]="draft.kind">
            @for (k of kinds; track k) {
              <option [value]="k">{{ label(k) }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label for="tf-year">Année fiscale</label>
          <input id="tf-year" class="input" type="number" min="1990" max="2200" step="1" [(ngModel)]="draft.year" />
        </div>
      </div>

      <div class="grid2">
        <div class="field">
          <label for="tf-amount">Montant (€, facultatif)</label>
          <input id="tf-amount" class="input" type="number" min="0" step="1" [(ngModel)]="draft.amount" />
        </div>
        <div class="field">
          <label for="tf-due">Date limite (facultatif)</label>
          <input id="tf-due" class="input" type="date" [(ngModel)]="draft.dueDate" />
        </div>
      </div>

      <div class="field">
        <label for="tf-status">Statut</label>
        <select id="tf-status" class="input" [(ngModel)]="draft.status">
          <option value="a-faire">À faire</option>
          <option value="en-cours">En cours</option>
          <option value="depose">Déposé</option>
          <option value="paye">Payé</option>
        </select>
      </div>

      <div class="field">
        <label for="tf-note">Note (facultatif)</label>
        <input id="tf-note" class="input" [(ngModel)]="draft.note" placeholder="Solde restant après prélèvement à la source" />
      </div>

      <p class="hint">
        Une date limite alimente le calendrier et déclenche les alertes à J-30, J-7 et J-1.
      </p>

      @if (error()) {
        <p class="form-error" role="alert"><app-icon name="warning" /> {{ error() }}</p>
      }

      <div class="row" style="margin-top: 18px">
        <button type="button" class="btn btn--ghost grow" (click)="close.emit()">Annuler</button>
        <button type="button" class="btn btn--primary grow" (click)="submit()">
          <app-icon name="check" /> Ajouter
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
export class TaxFormComponent {
  private readonly store = inject(Store);
  private readonly ui = inject(UiService);

  readonly open = input.required<boolean>();
  readonly document = input<DocumentItem | null>(null);

  readonly close = output<void>();
  readonly created = output<TaxRecord>();

  protected readonly kinds = Object.keys(TAX_KIND_LABEL) as TaxKind[];
  protected readonly error = signal('');

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

  protected label(kind: TaxKind): string {
    return TAX_KIND_LABEL[kind];
  }

  private blank(): Draft {
    const d = this.document();
    return {
      // L'année vient du document quand il y en a un : un avis déposé en 2027
      // porte le plus souvent sur les revenus de l'année précédente.
      year: Number((d?.date ?? todayIso()).slice(0, 4)),
      kind: d?.docType === 'avis' ? 'avis-imposition' : 'declaration',
      amount: d?.amount ?? null,
      status: 'a-faire',
      dueDate: '',
      note: '',
    };
  }

  protected submit(): void {
    const draft = this.draft;

    if (!Number.isInteger(Number(draft.year)) || draft.year < 1990 || draft.year > 2200) {
      this.error.set("L'année fiscale doit être comprise entre 1990 et 2200.");
      return;
    }

    const record: TaxRecord = {
      id: uid('tax'),
      year: Number(draft.year),
      kind: draft.kind,
      amount: draft.amount === null || Number.isNaN(draft.amount) ? undefined : Number(draft.amount),
      status: draft.status,
      dueDate: draft.dueDate || undefined,
      documentId: this.document()?.id,
      note: draft.note.trim() || undefined,
    };

    if (!this.store.addTax(record)) {
      this.ui.readOnlyBlocked();
      return;
    }

    this.ui.success(
      'Ajouté au suivi fiscal',
      record.dueDate ? 'La date limite apparaît dans votre calendrier.' : 'Sans date limite, aucune alerte ne sera émise.',
    );
    this.created.emit(record);
  }
}
