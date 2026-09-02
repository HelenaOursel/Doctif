import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/i18n.service';
import { ESTATE_KIND_LABEL, EstateAsset, EstateKind, FamilyMember } from '../../core/models';
import { ProceduresService } from '../../core/services/procedures.service';
import { UiService } from '../../core/services/ui.service';
import { Store } from '../../core/store';
import { sum, uid } from '../../core/utils';
import {
  EmptyStateComponent,
  PageHeaderComponent,
  ProgressBarComponent,
  SheetComponent,
  StatTileComponent,
} from '../../shared/components';
import { IconComponent } from '../../shared/icon.component';
import { EuroPipe } from '../../shared/pipes';

const KIND_ICONS: Record<EstateKind, 'catLogement' | 'catAssurance' | 'catBanque' | 'catVehicule' | 'star' | 'docProof'> = {
  immobilier: 'catLogement',
  'assurance-vie': 'catAssurance',
  compte: 'catBanque',
  vehicule: 'catVehicule',
  objet: 'star',
  document: 'docProof',
};

@Component({
  selector: 'app-estate',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    TranslatePipe,
    PageHeaderComponent,
    StatTileComponent,
    ProgressBarComponent,
    EmptyStateComponent,
    SheetComponent,
    IconComponent,
    EuroPipe,
  ],
  template: `
    <app-page-header
      [title]="'estate.title' | t"
      subtitle="Recenser le patrimoine, désigner les bénéficiaires, rassembler les pièces avant qu'on en ait besoin."
    >
      <button type="button" class="btn btn--sm btn--primary" (click)="openCreate()">
        <app-icon name="add" /> Ajouter
      </button>
    </app-page-header>

    <section class="tile-grid" style="margin-top: 18px">
      <!-- Somme des actifs listés plus bas : rien de plus précis à montrer. -->
      <app-stat label="Patrimoine estimé" [value]="totalValue()" suffix="€" tone="primary" />
      <app-stat label="Actifs recensés" [value]="assets().length" link="/succession" fragment="actifs" />
      <app-stat
        label="Sans bénéficiaire"
        [value]="withoutBeneficiary().length"
        link="/succession"
        fragment="actifs"
        [queryParams]="{ beneficiaire: 'aucun' }"
        [tone]="withoutBeneficiary().length ? 'warning' : 'success'"
      />
      <app-stat label="Pièces rattachées" [value]="linkedDocsCount()" link="/succession" fragment="actifs" />
    </section>

    <!-- Préparation du dossier -->
    @if (check(); as c) {
      <div class="card" style="margin-top: 18px">
        <div class="row row--between" style="margin-bottom: 10px">
          <strong>Dossier de succession</strong>
          <span class="badge" [class.badge--success]="c.completion === 100" [class.badge--warning]="c.completion < 100">
            {{ c.completion }} % complet
          </span>
        </div>
        <app-progress [value]="c.completion" label="Complétude du dossier de succession" />
        <p class="muted" style="margin: 12px 0 0">{{ c.procedure.intro }}</p>

        <ul class="checklist">
          @for (item of c.procedure.items; track item.label) {
            <li class="checklist__item" [class.checklist__item--ok]="isPresent(item.label)">
              <app-icon [name]="isPresent(item.label) ? 'success' : item.required ? 'blocked' : 'emptyCircle'" />
              <span>
                {{ item.label }}
                @if (!item.required) {
                  <span class="muted"> (facultatif)</span>
                }
                @if (foundDoc(item.label); as d) {
                  <a class="checklist__link" [routerLink]="['/coffre', d.id]">{{ d.name }}</a>
                }
              </span>
            </li>
          }
        </ul>
      </div>
    }

    <!-- Actifs par nature -->
    <div id="actifs" class="section-head">
      <h2>Actifs</h2>
      @if (beneficiaryFilter()) {
        <button type="button" class="btn btn--sm btn--quiet" (click)="clearBeneficiaryFilter()">
          <app-icon name="close" /> Sans bénéficiaire uniquement
        </button>
      } @else {
        <span class="muted">{{ assets().length }}</span>
      }
    </div>

    @for (group of byKind(); track group.kind) {
      <div class="section-head">
        <h2>{{ kindLabel(group.kind) }}</h2>
        <span class="muted">{{ group.total | euro }}</span>
      </div>
      <div class="list">
        @for (a of group.items; track a.id) {
          <div class="row-card asset">
            <span class="row-card__icon"><app-icon [name]="kindIcon(a.kind)" /></span>
            <span class="row-card__body">
              <span class="row-card__title">{{ a.label }}</span>
              <span class="row-card__meta">
                @if (a.institution) {
                  <span>{{ a.institution }}</span>
                }
                @if (a.beneficiaries.length) {
                  <span class="avatars">
                    @for (m of beneficiariesOf(a); track m.id) {
                      <span class="avatar" [style.background]="m.color" [title]="m.name">{{ initials(m.name) }}</span>
                    }
                  </span>
                } @else {
                  <span class="badge badge--warning">Aucun bénéficiaire désigné</span>
                }
              </span>
              @if (a.notes) {
                <span class="asset__notes">{{ a.notes }}</span>
              }
              @if (docsOf(a).length) {
                <span class="row wrap" style="margin-top: 7px">
                  @for (d of docsOf(a); track d.id) {
                    <a class="badge badge--info" [routerLink]="['/coffre', d.id]" [title]="d.name">
                      <app-icon name="docProof" />
                      <span class="truncate">{{ d.name }}</span>
                    </a>
                  }
                </span>
              }
            </span>
            <span class="row-card__side">
              @if (a.value) {
                <span class="row-card__amount">{{ a.value | euro: 0 }}</span>
              }
              <button type="button" class="btn btn--sm btn--quiet" (click)="openEdit(a)" aria-label="Modifier">
                <app-icon name="edit" />
              </button>
            </span>
          </div>
        }
      </div>
    } @empty {
      <app-empty
        icon="estate"
        title="Aucun actif recensé"
        hint="Commencez par les biens immobiliers, les assurances vie et les comptes bancaires."
      />
    }

    <!-- Rappel de méthode -->
    <div class="callout callout--info" style="margin-top: 20px">
      <app-icon class="callout__icon" name="info" />
      <div>
        <strong>Pourquoi anticiper</strong>
        <p>
          Au décès, les héritiers disposent de six mois pour déposer la déclaration de succession. Recenser les
          contrats d'assurance vie et leurs clauses bénéficiaires à l'avance évite les fonds oubliés, qui restent
          fréquents.
        </p>
      </div>
    </div>

    <!-- Édition / création -->
    <app-sheet [open]="formOpen()" [title]="editingId() ? 'Modifier l’actif' : 'Nouvel actif'" (close)="formOpen.set(false)">
      <div class="field">
        <label for="a-label">Libellé</label>
        <input id="a-label" class="input" [(ngModel)]="draftLabel" placeholder="Ex. Appartement rue Garibaldi" />
      </div>
      <div class="field">
        <label for="a-kind">Nature</label>
        <select id="a-kind" class="select" [(ngModel)]="draftKind">
          @for (k of kinds; track k) {
            <option [value]="k">{{ kindLabel(k) }}</option>
          }
        </select>
      </div>
      <div class="field">
        <label for="a-value">Valeur estimée (€)</label>
        <input id="a-value" class="input" type="number" [(ngModel)]="draftValue" />
      </div>
      <div class="field">
        <label for="a-inst">Établissement</label>
        <input id="a-inst" class="input" [(ngModel)]="draftInstitution" placeholder="Banque, notaire, assureur…" />
      </div>

      <div class="field">
        <label>Bénéficiaires</label>
        <div class="row wrap">
          @for (m of members(); track m.id) {
            <button
              type="button"
              class="chip"
              [class.chip--active]="draftBeneficiaries().includes(m.id)"
              (click)="toggleBeneficiary(m.id)"
            >
              {{ m.name }}
            </button>
          } @empty {
            <p class="muted" style="margin: 0">
              Aucun membre enregistré. <a routerLink="/partage">Ajoutez votre famille</a> pour désigner des bénéficiaires.
            </p>
          }
        </div>
      </div>

      <div class="field">
        <label for="a-notes">Notes</label>
        <textarea id="a-notes" class="textarea" rows="3" [(ngModel)]="draftNotes"></textarea>
      </div>

      <div class="row">
        @if (editingId()) {
          <button type="button" class="btn btn--danger" (click)="remove()"><app-icon name="trash" /></button>
        }
        <button type="button" class="btn btn--ghost grow" (click)="formOpen.set(false)">Annuler</button>
        <button type="button" class="btn btn--primary grow" [disabled]="!draftLabel" (click)="save()">Enregistrer</button>
      </div>
    </app-sheet>
  `,
  styles: [
    `
      .checklist {
        list-style: none;
        margin: 14px 0 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 9px;
      }
      .checklist__item {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        font-size: 0.86rem;
        color: var(--text-soft);
      }
      .checklist__item > span {
        min-width: 0;
      }
      .checklist__item app-icon {
        flex: 0 0 auto;
        margin-top: 3px;
        font-size: 0.85rem;
        color: var(--text-muted);
      }
      .checklist__item--ok {
        color: var(--text);
      }
      .checklist__item--ok app-icon {
        color: var(--success);
      }
      .checklist__link {
        display: block;
        margin-top: 2px;
        font-size: 0.77rem;
      }

      .avatar {
        display: grid;
        place-items: center;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        color: #fff;
        font-size: 0.62rem;
        font-weight: 700;
        border: 2px solid var(--surface);
      }
      .avatars {
        display: inline-flex;
      }
      .avatars .avatar + .avatar {
        margin-left: -8px;
      }

      .asset__notes {
        display: block;
        margin-top: 5px;
        font-size: 0.79rem;
        color: var(--text-muted);
        line-height: 1.45;
      }
      .row-card__side {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      a.badge {
        text-decoration: none;
      }
    `,
  ],
})
export class EstateComponent {
  private readonly store = inject(Store);
  private readonly procedures = inject(ProceduresService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly ui = inject(UiService);

  readonly kinds = Object.keys(ESTATE_KIND_LABEL) as EstateKind[];
  readonly assets = this.store.estate;
  readonly members = this.store.members;

  readonly totalValue = computed(() => sum(this.assets().map((a) => a.value ?? 0)));
  readonly withoutBeneficiary = computed(() => this.assets().filter((a) => a.beneficiaries.length === 0));
  readonly linkedDocsCount = computed(() => sum(this.assets().map((a) => a.documentIds.length)));

  /** Dossier type « régler une succession », confronté au coffre. */
  readonly check = computed(() => {
    const procedure = this.procedures.byId('succession');
    return procedure ? this.procedures.check(procedure) : null;
  });

  /** Filtre porté par l'URL : la tuile « Sans bénéficiaire » y renvoie. */
  readonly beneficiaryFilter = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('beneficiaire'))),
    { initialValue: null },
  );

  readonly byKind = computed(() => {
    const order: EstateKind[] = ['immobilier', 'assurance-vie', 'compte', 'vehicule', 'objet', 'document'];
    const source =
      this.beneficiaryFilter() === 'aucun'
        ? this.assets().filter((a) => a.beneficiaries.length === 0)
        : this.assets();
    return order
      .map((kind) => {
        const items = source.filter((a) => a.kind === kind);
        return { kind, items, total: sum(items.map((i) => i.value ?? 0)) };
      })
      .filter((g) => g.items.length > 0);
  });

  clearBeneficiaryFilter(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { beneficiaire: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  readonly formOpen = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly draftBeneficiaries = signal<string[]>([]);

  draftLabel = '';
  draftKind: EstateKind = 'immobilier';
  draftValue: number | null = null;
  draftInstitution = '';
  draftNotes = '';

  kindLabel(kind: EstateKind): string {
    return ESTATE_KIND_LABEL[kind];
  }

  kindIcon(kind: EstateKind) {
    return KIND_ICONS[kind];
  }

  initials(name: string): string {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('');
  }

  beneficiariesOf(asset: EstateAsset): FamilyMember[] {
    return this.members().filter((m) => asset.beneficiaries.includes(m.id));
  }

  docsOf(asset: EstateAsset) {
    return this.store.documents().filter((d) => asset.documentIds.includes(d.id));
  }

  isPresent(label: string): boolean {
    return !!this.check()?.present.some((p) => p.item.label === label);
  }

  foundDoc(label: string) {
    return this.check()?.present.find((p) => p.item.label === label)?.document;
  }

  toggleBeneficiary(id: string): void {
    this.draftBeneficiaries.update((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  openCreate(): void {
    this.editingId.set(null);
    this.draftLabel = '';
    this.draftKind = 'immobilier';
    this.draftValue = null;
    this.draftInstitution = '';
    this.draftNotes = '';
    this.draftBeneficiaries.set([]);
    this.formOpen.set(true);
  }

  openEdit(asset: EstateAsset): void {
    this.editingId.set(asset.id);
    this.draftLabel = asset.label;
    this.draftKind = asset.kind;
    this.draftValue = asset.value ?? null;
    this.draftInstitution = asset.institution ?? '';
    this.draftNotes = asset.notes ?? '';
    this.draftBeneficiaries.set([...asset.beneficiaries]);
    this.formOpen.set(true);
  }

  save(): void {
    const patch = {
      label: this.draftLabel.trim(),
      kind: this.draftKind,
      value: this.draftValue ? Number(this.draftValue) : undefined,
      institution: this.draftInstitution.trim() || undefined,
      notes: this.draftNotes.trim() || undefined,
      beneficiaries: this.draftBeneficiaries(),
    };

    const id = this.editingId();
    const ok = id
      ? this.store.updateAsset(id, patch)
      : this.store.addAsset({ id: uid('as'), documentIds: [], ...patch });

    if (!ok) {
      this.ui.readOnlyBlocked();
      return;
    }
    this.formOpen.set(false);
    this.ui.success(id ? 'Actif mis à jour' : 'Actif ajouté');
  }

  remove(): void {
    const id = this.editingId();
    if (!id) return;
    if (!this.store.removeAsset(id)) {
      this.ui.readOnlyBlocked();
      return;
    }
    this.formOpen.set(false);
    this.ui.info('Actif supprimé');
  }
}
