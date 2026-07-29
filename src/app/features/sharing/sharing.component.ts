import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/i18n.service';
import { FamilyMember, SHARE_SCOPE_LABEL, ShareScope } from '../../core/models';
import { UiService } from '../../core/services/ui.service';
import { Store } from '../../core/store';
import { todayIso, uid } from '../../core/utils';
import {
  EmptyStateComponent,
  PageHeaderComponent,
  SheetComponent,
} from '../../shared/components';
import { CategoryIconClassPipe, IconComponent } from '../../shared/icon.component';
import { EuroPipe, FrDatePipe } from '../../shared/pipes';

/** Couleurs proposées aux nouveaux membres, pour les distinguer d'un coup d'œil. */
const PALETTE = ['#24507f', '#126b4f', '#a04d1c', '#62388f', '#9e2f47', '#10646c'];

const SCOPE_ICONS: Record<ShareScope, 'catLogement' | 'catVehicule' | 'catAssurance' | 'catSante' | 'catBanque'> = {
  logement: 'catLogement',
  vehicule: 'catVehicule',
  assurance: 'catAssurance',
  sante: 'catSante',
  finances: 'catBanque',
};

@Component({
  selector: 'app-sharing',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    TranslatePipe,
    PageHeaderComponent,
    EmptyStateComponent,
    SheetComponent,
    IconComponent,
    CategoryIconClassPipe,
    EuroPipe,
    FrDatePipe,
  ],
  template: `
    <app-page-header
      [title]="'sharing.title' | t"
      subtitle="Donnez accès au logement, au véhicule ou aux assurances, sans tout ouvrir."
    >
      <button type="button" class="btn btn--sm btn--primary" (click)="openInvite()">
        <app-icon name="userPlus" /> Inviter
      </button>
    </app-page-header>

    <!-- Membres -->
    @if (members().length) {
      <div class="stack" style="margin-top: 18px">
        @for (m of members(); track m.id) {
          <div class="card member">
            <div class="member__head">
              <span class="avatar" [style.background]="m.color">{{ initials(m.name) }}</span>
              <div class="grow">
                <div class="row wrap" style="gap: 8px">
                  <strong>{{ m.name }}</strong>
                  @if (m.status === 'invite') {
                    <span class="badge badge--warning">Invitation en attente</span>
                  }
                  @if (m.readOnly) {
                    <span class="badge"><app-icon name="eye" /> Lecture seule</span>
                  }
                </div>
                <div class="muted">{{ m.relation }} · {{ m.email }}</div>
              </div>
              <button
                type="button"
                class="btn btn--sm btn--quiet"
                (click)="confirmRemoveId.set(m.id)"
                [attr.aria-label]="'Retirer ' + m.name"
              >
                <app-icon name="trash" />
              </button>
            </div>

            <p class="member__label">Ce que {{ firstName(m.name) }} peut voir</p>
            <div class="row wrap">
              @for (scope of scopes; track scope) {
                <button
                  type="button"
                  class="chip"
                  [class.chip--active]="m.scopes.includes(scope)"
                  (click)="toggleScope(m, scope)"
                  [attr.aria-pressed]="m.scopes.includes(scope)"
                >
                  <app-icon [name]="scopeIcon(scope)" />
                  {{ scopeLabel(scope) }}
                </button>
              }
            </div>

            <div class="member__stats">
              <span><app-icon name="vault" /> {{ documentCount(m.id) }} document(s)</span>
              <span><app-icon name="contracts" /> {{ contractCount(m.id) }} contrat(s)</span>
              <span><app-icon name="calendar" /> depuis le {{ m.invitedAt | frDate }}</span>
            </div>

            <label class="switch">
              <input type="checkbox" [checked]="m.readOnly" (change)="toggleReadOnly(m)" />
              <span>Accès en lecture seule</span>
            </label>
          </div>
        }
      </div>
    } @else {
      <app-empty
        icon="users"
        title="Personne n'a encore accès"
        hint="Invitez votre conjoint ou un proche pour partager logement, véhicule et assurances."
      />
    }

    <!-- Ce qui est partagé, par domaine -->
    <div class="section-head"><h2>Partagé par domaine</h2></div>
    <div class="card-grid">
      @for (scope of scopes; track scope) {
        <div class="card scope">
          <div class="row" style="margin-bottom: 8px">
            <app-icon class="scope__icon" [name]="scopeIcon(scope)" />
            <strong>{{ scopeLabel(scope) }}</strong>
          </div>
          @if (membersFor(scope).length) {
            <div class="avatars">
              @for (m of membersFor(scope); track m.id) {
                <span class="avatar avatar--sm" [style.background]="m.color" [title]="m.name">{{ initials(m.name) }}</span>
              }
            </div>
            <p class="muted" style="margin: 8px 0 0">
              {{ membersFor(scope).length }} personne(s) y ont accès.
            </p>
          } @else {
            <p class="muted" style="margin: 0">Non partagé.</p>
          }
        </div>
      }
    </div>

    <!-- Contrats partagés -->
    <div class="section-head">
      <h2>Contrats partagés</h2>
      <a routerLink="/contrats">Tous les contrats</a>
    </div>

    @if (sharedContracts().length) {
      <div class="list">
        @for (c of sharedContracts(); track c.id) {
          <a class="row-card" [routerLink]="['/contrats', c.id]">
            <span class="row-card__icon"><app-icon [cls]="c.category | catIconClass" /></span>
            <span class="row-card__body">
              <span class="row-card__title">{{ c.label }} — {{ c.provider }}</span>
              <span class="row-card__meta">
                <span>{{ c.monthlyCost | euro }} / mois</span>
              </span>
            </span>
            <span class="avatars">
              @for (m of membersOf(c.sharedWith); track m.id) {
                <span class="avatar avatar--sm" [style.background]="m.color" [title]="m.name">{{ initials(m.name) }}</span>
              }
            </span>
          </a>
        }
      </div>
    } @else {
      <app-empty icon="contracts" title="Aucun contrat partagé" />
    }

    <!-- Documents partagés -->
    <div class="section-head">
      <h2>Documents partagés</h2>
      <a routerLink="/coffre">Le coffre</a>
    </div>

    @if (sharedDocuments().length) {
      <div class="list">
        @for (d of sharedDocuments().slice(0, 8); track d.id) {
          <a class="row-card" [routerLink]="['/coffre', d.id]">
            <span class="row-card__icon"><app-icon [cls]="d.category | catIconClass" /></span>
            <span class="row-card__body">
              <span class="row-card__title">{{ d.name }}</span>
              <span class="row-card__meta">{{ d.issuer }} · {{ d.date | frDate }}</span>
            </span>
            <span class="avatars">
              @for (m of membersOf(d.sharedWith); track m.id) {
                <span class="avatar avatar--sm" [style.background]="m.color" [title]="m.name">{{ initials(m.name) }}</span>
              }
            </span>
          </a>
        }
      </div>
    } @else {
      <app-empty icon="vault" title="Aucun document partagé" />
    }

    <!-- Invitation -->
    <app-sheet [open]="inviteOpen()" title="Inviter un proche" (close)="inviteOpen.set(false)">
      <div class="field">
        <label for="i-name">Nom complet</label>
        <input id="i-name" class="input" [(ngModel)]="draftName" placeholder="Ex. Camille Dupont" />
      </div>
      <div class="field">
        <label for="i-rel">Lien</label>
        <input id="i-rel" class="input" [(ngModel)]="draftRelation" placeholder="Conjoint, parent, enfant…" />
      </div>
      <div class="field">
        <label for="i-mail">Adresse e-mail</label>
        <input id="i-mail" class="input" type="email" [(ngModel)]="draftEmail" placeholder="prenom@exemple.fr" />
      </div>

      <div class="field">
        <label>Domaines partagés</label>
        <div class="row wrap">
          @for (scope of scopes; track scope) {
            <button
              type="button"
              class="chip"
              [class.chip--active]="draftScopes().includes(scope)"
              (click)="toggleDraftScope(scope)"
            >
              <app-icon [name]="scopeIcon(scope)" /> {{ scopeLabel(scope) }}
            </button>
          }
        </div>
      </div>

      <label class="switch">
        <input type="checkbox" [(ngModel)]="draftReadOnly" />
        <span>Accès en lecture seule</span>
      </label>

      <div class="callout callout--info" style="margin: 14px 0">
        <app-icon class="callout__icon" name="info" />
        <div>
          <p>
            Dans cette démonstration, aucun e-mail n'est envoyé : le membre est créé directement avec le statut
            « invitation en attente ».
          </p>
        </div>
      </div>

      <div class="row">
        <button type="button" class="btn btn--ghost grow" (click)="inviteOpen.set(false)">Annuler</button>
        <button type="button" class="btn btn--primary grow" [disabled]="!draftName || !draftEmail" (click)="invite()">
          Envoyer l'invitation
        </button>
      </div>
    </app-sheet>

    <!-- Confirmation de retrait -->
    <app-sheet [open]="!!confirmRemoveId()" title="Retirer ce membre ?" (close)="confirmRemoveId.set(null)">
      <p>
        L'accès sera immédiatement révoqué sur l'ensemble des documents et contrats. Les données elles-mêmes ne sont
        pas supprimées.
      </p>
      <div class="row" style="margin-top: 16px">
        <button type="button" class="btn btn--ghost grow" (click)="confirmRemoveId.set(null)">Annuler</button>
        <button type="button" class="btn btn--danger grow" (click)="removeMember()">Retirer l'accès</button>
      </div>
    </app-sheet>
  `,
  styles: [
    `
      .member__head {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 14px;
      }
      .avatar {
        flex: 0 0 auto;
        display: grid;
        place-items: center;
        width: 42px;
        height: 42px;
        border-radius: 50%;
        color: #fff;
        font-weight: 700;
        font-size: 0.85rem;
        letter-spacing: 0.02em;
      }
      .avatar--sm {
        width: 28px;
        height: 28px;
        font-size: 0.68rem;
        border: 2px solid var(--surface);
      }
      .avatars {
        display: flex;
        flex-shrink: 0;
      }
      .avatars .avatar--sm + .avatar--sm {
        margin-left: -9px;
      }

      .member__label {
        margin: 0 0 8px;
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--text-muted);
        font-weight: 650;
      }
      .member__stats {
        display: flex;
        flex-wrap: wrap;
        gap: 14px;
        margin-top: 14px;
        padding-top: 12px;
        border-top: 1px solid var(--border);
        font-size: 0.78rem;
        color: var(--text-muted);
      }
      .member__stats span {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      .scope__icon {
        color: var(--primary);
      }

      .switch {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: 12px;
        font-size: 0.86rem;
        cursor: pointer;      }
    `,
  ],
})
export class SharingComponent {
  private readonly store = inject(Store);
  private readonly ui = inject(UiService);

  readonly scopes = Object.keys(SHARE_SCOPE_LABEL) as ShareScope[];
  readonly members = this.store.members;

  readonly inviteOpen = signal(false);
  readonly confirmRemoveId = signal<string | null>(null);

  readonly sharedContracts = computed(() => this.store.contracts().filter((c) => c.sharedWith.length > 0));
  readonly sharedDocuments = computed(() =>
    this.store
      .documents()
      .filter((d) => d.sharedWith.length > 0)
      .sort((a, b) => b.date.localeCompare(a.date)),
  );

  /* Brouillon d'invitation */
  draftName = '';
  draftRelation = '';
  draftEmail = '';
  draftReadOnly = true;
  readonly draftScopes = signal<ShareScope[]>(['logement']);

  scopeLabel(scope: ShareScope): string {
    return SHARE_SCOPE_LABEL[scope];
  }

  scopeIcon(scope: ShareScope) {
    return SCOPE_ICONS[scope];
  }

  initials(name: string): string {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  firstName(name: string): string {
    return name.split(/\s+/)[0];
  }

  membersFor(scope: ShareScope): FamilyMember[] {
    return this.members().filter((m) => m.scopes.includes(scope));
  }

  membersOf(ids: string[]): FamilyMember[] {
    return this.members().filter((m) => ids.includes(m.id));
  }

  documentCount(memberId: string): number {
    return this.store.documents().filter((d) => d.sharedWith.includes(memberId)).length;
  }

  contractCount(memberId: string): number {
    return this.store.contracts().filter((c) => c.sharedWith.includes(memberId)).length;
  }

  toggleScope(member: FamilyMember, scope: ShareScope): void {
    const scopes = member.scopes.includes(scope)
      ? member.scopes.filter((s) => s !== scope)
      : [...member.scopes, scope];
    if (!this.store.updateMember(member.id, { scopes })) {
      this.ui.readOnlyBlocked();
    }
  }

  toggleReadOnly(member: FamilyMember): void {
    if (!this.store.updateMember(member.id, { readOnly: !member.readOnly })) {
      this.ui.readOnlyBlocked();
    }
  }

  toggleDraftScope(scope: ShareScope): void {
    this.draftScopes.update((list) => (list.includes(scope) ? list.filter((s) => s !== scope) : [...list, scope]));
  }

  openInvite(): void {
    this.draftName = '';
    this.draftRelation = '';
    this.draftEmail = '';
    this.draftReadOnly = true;
    this.draftScopes.set(['logement']);
    this.inviteOpen.set(true);
  }

  invite(): void {
    const member: FamilyMember = {
      id: uid('m'),
      name: this.draftName.trim(),
      relation: this.draftRelation.trim() || 'Proche',
      email: this.draftEmail.trim(),
      color: PALETTE[this.members().length % PALETTE.length],
      scopes: this.draftScopes(),
      readOnly: this.draftReadOnly,
      invitedAt: todayIso(),
      status: 'invite',
    };

    if (!this.store.addMember(member)) {
      this.ui.readOnlyBlocked();
      return;
    }
    this.inviteOpen.set(false);
    this.ui.success('Invitation créée', `${member.name} apparaît désormais dans votre cercle familial.`);
  }

  removeMember(): void {
    const id = this.confirmRemoveId();
    if (!id) return;
    if (!this.store.removeMember(id)) {
      this.ui.readOnlyBlocked();
      return;
    }
    this.confirmRemoveId.set(null);
    this.ui.info('Accès révoqué');
  }
}
