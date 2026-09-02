import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CATEGORIES, Category, Contract, ContractStatus, DocumentItem } from '../../core/models';
import { UiService } from '../../core/services/ui.service';
import { Store } from '../../core/store';
import { SheetComponent } from '../../shared/components';
import { IconComponent } from '../../shared/icon.component';
import { CategoryLabelPipe } from '../../shared/pipes';
import { todayIso, uid } from '../../core/utils';

/** Valeurs éditables. Les clauses et le partage se règlent depuis la fiche. */
interface Draft {
  label: string;
  provider: string;
  category: Category;
  monthlyCost: number | null;
  /** Tarif précédent — c'est lui qui rend la hausse mesurable. */
  previousMonthlyCost: number | null;
  startDate: string;
  renewalDate: string;
  endDate: string;
  noticePeriodDays: number;
  commitmentMonths: number;
  hiddenFees: number;
  status: ContractStatus;
  coverageOf: string;
}

/**
 * Création d'un contrat.
 *
 * Accessible depuis « Mes contrats » (formulaire vierge) et depuis la fiche
 * d'un document (pré-rempli par le classement, et rattaché à celui-ci). Un
 * seul formulaire pour les deux : ce sont les mêmes champs, seule l'amorce
 * change.
 */
@Component({
  selector: 'app-contract-form',
  standalone: true,
  imports: [FormsModule, SheetComponent, IconComponent, CategoryLabelPipe],
  template: `
    <app-sheet
      [open]="open()"
      [title]="editing() ? 'Modifier le contrat' : fromDocument() ? 'Contrat à partir du document' : 'Nouveau contrat'"
      (close)="close.emit()"
    >
      @if (!editing() && fromDocument(); as d) {
        <p class="muted" style="margin: 0 0 16px">
          <app-icon name="info" />
          Pré-rempli d'après « {{ d.name }} ». Le document restera rattaché au contrat.
        </p>
      }

      <div class="field">
        <label for="cf-label">Intitulé</label>
        <input id="cf-label" class="input" [(ngModel)]="draft.label" placeholder="Électricité — résidence principale" />
      </div>

      <div class="grid2">
        <div class="field">
          <label for="cf-provider">Fournisseur</label>
          <input id="cf-provider" class="input" [(ngModel)]="draft.provider" placeholder="EDF" />
        </div>
        <div class="field">
          <label for="cf-category">Catégorie</label>
          <select id="cf-category" class="input" [(ngModel)]="draft.category">
            @for (c of categories; track c) {
              <option [value]="c">{{ c | catLabel }}</option>
            }
          </select>
        </div>
      </div>

      <div class="grid2">
        <div class="field">
          <label for="cf-cost">Coût mensuel (€)</label>
          <input id="cf-cost" class="input" type="number" min="0" step="0.01" [(ngModel)]="draft.monthlyCost" />
        </div>
        <div class="field">
          <label for="cf-previous">Coût mensuel précédent (€)</label>
          <input
            id="cf-previous"
            class="input"
            type="number"
            min="0"
            step="0.01"
            [(ngModel)]="draft.previousMonthlyCost"
            placeholder="facultatif"
          />
        </div>
      </div>

      @if (editing()) {
        <p class="hint">
          En modifiant le coût mensuel, l'ancien montant ({{ editing()!.monthlyCost }} €) devient
          automatiquement le coût précédent — sauf si vous renseignez vous-même le champ ci-dessus. Videz-le si
          vous corrigez une simple faute de saisie.
        </p>
      } @else {
        <p class="hint">
          Le coût précédent est facultatif : c'est lui qui permet de mesurer une hausse dans « Économies possibles ».
        </p>
      }

      <div class="grid2">
        <div class="field">
          <label for="cf-fees">Frais annexes annuels (€)</label>
          <input id="cf-fees" class="input" type="number" min="0" step="1" [(ngModel)]="draft.hiddenFees" />
        </div>
        <div class="field">
          <label for="cf-coverage">Objet couvert</label>
          <input
            id="cf-coverage"
            class="input"
            [(ngModel)]="draft.coverageOf"
            placeholder="habitation, Peugeot 308…"
          />
        </div>
      </div>

      <p class="hint">
        Deux contrats portant le même objet couvert sont signalés comme doublon.
      </p>

      <div class="grid2">
        <div class="field">
          <label for="cf-start">Date de souscription</label>
          <input id="cf-start" class="input" type="date" [(ngModel)]="draft.startDate" />
        </div>
        <div class="field">
          <label for="cf-renewal">Reconduction / anniversaire</label>
          <input id="cf-renewal" class="input" type="date" [(ngModel)]="draft.renewalDate" />
        </div>
      </div>

      <div class="grid2">
        <div class="field">
          <label for="cf-notice">Préavis (jours)</label>
          <input id="cf-notice" class="input" type="number" min="0" step="1" [(ngModel)]="draft.noticePeriodDays" />
        </div>
        <div class="field">
          <label for="cf-commit">Engagement (mois)</label>
          <input id="cf-commit" class="input" type="number" min="0" step="1" [(ngModel)]="draft.commitmentMonths" />
        </div>
      </div>

      <div class="grid2">
        <div class="field">
          <label for="cf-end">Fin d'engagement</label>
          <input id="cf-end" class="input" type="date" [(ngModel)]="draft.endDate" />
        </div>
        @if (editing()) {
          <div class="field">
            <label for="cf-status">Statut</label>
            <select id="cf-status" class="input" [(ngModel)]="draft.status">
              <option value="actif">Actif</option>
              <option value="resilie">Résilié</option>
              <option value="expire">Expiré</option>
            </select>
          </div>
        }
      </div>

      <p class="hint">
        Le préavis et la date de reconduction alimentent seuls le calendrier et les alertes de résiliation. Les
        laisser vides prive le contrat de tout rappel.
      </p>

      @if (error()) {
        <p class="form-error" role="alert"><app-icon name="warning" /> {{ error() }}</p>
      }

      <div class="row" style="margin-top: 18px">
        <button type="button" class="btn btn--ghost grow" (click)="close.emit()">Annuler</button>
        <button type="button" class="btn btn--primary grow" (click)="submit()">
          <app-icon name="check" /> {{ editing() ? 'Enregistrer' : 'Créer le contrat' }}
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
export class ContractFormComponent {
  private readonly store = inject(Store);
  private readonly ui = inject(UiService);

  readonly open = input.required<boolean>();
  /** Document d'origine, quand la création part du coffre. */
  readonly document = input<DocumentItem | null>(null);
  /** Contrat à modifier. Renseigné, le formulaire passe en édition. */
  readonly contract = input<Contract | null>(null);

  readonly close = output<void>();
  readonly created = output<Contract>();
  readonly updated = output<Contract>();

  protected readonly categories = CATEGORIES;
  protected readonly error = signal('');
  protected readonly fromDocument = computed(() => this.document());
  protected readonly editing = computed(() => this.contract());

  protected draft: Draft = this.blank();

  constructor() {
    // Le formulaire se réamorce à chaque ouverture : rouvrir après une
    // annulation ne doit pas retrouver la saisie précédente, et l'amorce doit
    // suivre le document dont on part.
    effect(() => {
      if (this.open()) this.reset();
    });
  }

  reset(): void {
    this.draft = this.blank();
    this.error.set('');
  }

  private blank(): Draft {
    const c = this.contract();
    if (c) {
      return {
        label: c.label,
        provider: c.provider,
        category: c.category,
        monthlyCost: c.monthlyCost,
        previousMonthlyCost: c.previousMonthlyCost ?? null,
        startDate: c.startDate,
        renewalDate: c.renewalDate ?? '',
        endDate: c.endDate ?? '',
        noticePeriodDays: c.noticePeriodDays,
        commitmentMonths: c.commitmentMonths,
        hiddenFees: c.hiddenFees,
        status: c.status,
        coverageOf: c.coverageOf ?? '',
      };
    }

    const d = this.document();
    return {
      label: d ? `${d.issuer} — ${d.name.replace(/[-_]/g, ' ')}`.slice(0, 60) : '',
      provider: d?.issuer && d.issuer !== 'Émetteur inconnu' ? d.issuer : '',
      category: d?.category ?? 'autre',
      monthlyCost: null,
      previousMonthlyCost: null,
      startDate: d?.date ?? todayIso(),
      renewalDate: '',
      endDate: '',
      noticePeriodDays: 30,
      commitmentMonths: 0,
      hiddenFees: 0,
      status: 'actif',
      coverageOf: '',
    };
  }

  protected submit(): void {
    const draft = this.draft;

    if (!draft.label.trim()) {
      this.error.set("Donnez un intitulé au contrat, c'est ce qui l'identifie dans vos listes.");
      return;
    }
    if (draft.monthlyCost === null || Number.isNaN(draft.monthlyCost) || draft.monthlyCost < 0) {
      this.error.set('Indiquez un coût mensuel — même 0 si le contrat est gratuit.');
      return;
    }
    if (!draft.startDate) {
      this.error.set('La date de souscription est nécessaire pour situer le contrat.');
      return;
    }
    if (draft.endDate && draft.endDate < draft.startDate) {
      this.error.set("La fin d'engagement ne peut pas précéder la souscription.");
      return;
    }

    const commun = {
      label: draft.label.trim(),
      provider: draft.provider.trim(),
      category: draft.category,
      monthlyCost: Number(draft.monthlyCost),
      startDate: draft.startDate,
      endDate: draft.endDate || undefined,
      renewalDate: draft.renewalDate || undefined,
      noticePeriodDays: Number(draft.noticePeriodDays) || 0,
      commitmentMonths: Number(draft.commitmentMonths) || 0,
      status: draft.status,
      hiddenFees: Number(draft.hiddenFees) || 0,
      coverageOf: draft.coverageOf.trim() || undefined,
    };

    const existant = this.contract();
    if (existant) return this.applyEdit(existant, commun, draft);

    const doc = this.document();
    const contract: Contract = {
      ...commun,
      id: uid('c'),
      previousMonthlyCost: draft.previousMonthlyCost ?? undefined,
      clauses: [],
      sharedWith: [],
      documentIds: doc ? [doc.id] : [],
    };

    if (!this.store.addContract(contract)) {
      this.ui.readOnlyBlocked();
      return;
    }

    // Le rattachement va dans les deux sens : le contrat liste ses pièces, le
    // document sait de quel contrat il relève.
    if (doc) this.store.updateDocument(doc.id, { contractId: contract.id });

    this.ui.success(
      'Contrat créé',
      contract.renewalDate
        ? 'Les échéances de préavis et de reconduction apparaissent dans votre calendrier.'
        : 'Ajoutez une date de reconduction pour être alerté avant la tacite reconduction.',
    );
    this.created.emit(contract);
  }

  /**
   * Enregistre une modification.
   *
   * Le point délicat est le tarif précédent. Quand le coût change, l'ancien est
   * conservé automatiquement : c'est ce report qui rend la hausse mesurable,
   * sans rien demander à l'utilisateur. Mais s'il a lui-même touché au champ,
   * son choix prime — corriger une faute de frappe ne doit pas inventer une
   * augmentation.
   */
  private applyEdit(
    existant: Contract,
    commun: Omit<Contract, 'id' | 'clauses' | 'sharedWith' | 'documentIds' | 'previousMonthlyCost'>,
    draft: Draft,
  ): void {
    const coutChange = commun.monthlyCost !== existant.monthlyCost;
    const champTouche = (draft.previousMonthlyCost ?? null) !== (existant.previousMonthlyCost ?? null);

    const previousMonthlyCost = champTouche
      ? (draft.previousMonthlyCost ?? undefined)
      : coutChange
        ? existant.monthlyCost
        : existant.previousMonthlyCost;

    if (!this.store.updateContract(existant.id, { ...commun, previousMonthlyCost })) {
      this.ui.readOnlyBlocked();
      return;
    }

    const hausse =
      previousMonthlyCost && commun.monthlyCost > previousMonthlyCost
        ? Math.round(((commun.monthlyCost - previousMonthlyCost) / previousMonthlyCost) * 100)
        : 0;

    this.ui.success(
      'Contrat mis à jour',
      hausse >= 3
        ? `Hausse de ${hausse} % enregistrée : elle apparaît dans « Économies possibles ».`
        : 'Modifications enregistrées.',
    );
    this.updated.emit({ ...existant, ...commun, previousMonthlyCost });
  }
}
