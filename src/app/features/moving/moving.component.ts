import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/i18n.service';
import { MovingService } from '../../core/services/moving.service';
import { UiService } from '../../core/services/ui.service';
import { Store } from '../../core/store';
import { addDays, daysUntil, todayIso } from '../../core/utils';
import {
  EmptyStateComponent,
  PageHeaderComponent,
  ProgressBarComponent,
  SheetComponent,
} from '../../shared/components';
import { IconComponent } from '../../shared/icon.component';
import { FrDatePipe, RelativeDaysPipe } from '../../shared/pipes';

@Component({
  selector: 'app-moving',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    TranslatePipe,
    PageHeaderComponent,
    ProgressBarComponent,
    EmptyStateComponent,
    SheetComponent,
    IconComponent,
    FrDatePipe,
    RelativeDaysPipe,
  ],
  template: `
    <app-page-header
      [title]="'moving.title' | t"
      subtitle="Checklist générée depuis vos contrats : rien à composer soi-même."
    >
      @if (service.active()) {
        <button type="button" class="btn btn--sm btn--ghost" (click)="editOpen.set(true)">
          <app-icon name="edit" /> Modifier
        </button>
      }
    </app-page-header>

    @if (!service.active()) {
      <!-- Démarrage -->
      <div class="card" style="margin-top: 18px">
        <h2 style="font-size: 1rem; margin-bottom: 6px">Planifier un déménagement</h2>
        <p class="muted" style="margin-bottom: 16px">
          Indiquez la date et les adresses : la checklist se construit à partir de vos {{ contractCount() }} contrats
          actifs, en distinguant ceux qui suivent le logement de ceux qui suivent le foyer.
        </p>

        <div class="field">
          <label for="m-from">Adresse actuelle</label>
          <input id="m-from" class="input" [(ngModel)]="draftFrom" />
        </div>
        <div class="field">
          <label for="m-to">Nouvelle adresse</label>
          <input id="m-to" class="input" [(ngModel)]="draftTo" placeholder="Ex. 8 rue de la Paix, 69006 Lyon" />
        </div>
        <div class="field">
          <label for="m-date">Date du déménagement</label>
          <input id="m-date" class="input" type="date" [(ngModel)]="draftDate" />
        </div>

        <button type="button" class="btn btn--primary btn--block" [disabled]="!draftTo || !draftDate" (click)="start()">
          <app-icon name="moving" /> Générer ma checklist
        </button>
      </div>

      <div class="section-head"><h2>Ce que la checklist couvre</h2></div>
      <div class="card-grid">
        @for (p of pillars; track p.title) {
          <div class="card">
            <app-icon class="pillar__icon" [name]="p.icon" />
            <h3 style="font-size: 0.92rem; margin-top: 8px">{{ p.title }}</h3>
            <p class="muted" style="margin: 4px 0 0">{{ p.body }}</p>
          </div>
        }
      </div>
    } @else if (project(); as p) {
      <!-- Suivi -->
      <div class="card" style="margin-top: 18px">
        <div class="row row--between wrap" style="margin-bottom: 12px">
          <div>
            <strong>{{ p.date | frDate: 'long' }}</strong>
            <div class="muted">{{ daysLeft(p.date) | relDays }}</div>
          </div>
          <span class="badge badge--primary">{{ service.progress() }} % effectué</span>
        </div>

        <app-progress [value]="service.progress()" label="Avancement du déménagement" />

        <div class="addresses">
          <div class="addresses__item">
            <span class="addresses__label">Départ</span>
            <span>{{ p.fromAddress }}</span>
          </div>
          <app-icon class="addresses__arrow" name="chevronRight" />
          <div class="addresses__item">
            <span class="addresses__label">Arrivée</span>
            <span>{{ p.toAddress }}</span>
          </div>
        </div>
      </div>

      <!-- Tâches urgentes -->
      @if (service.urgent().length) {
        <div class="callout callout--warning" style="margin-top: 14px">
          <app-icon class="callout__icon" name="warning" />
          <div>
            <strong>{{ service.urgent().length }} tâche(s) à traiter sous 15 jours</strong>
            <p>{{ service.urgent()[0].label }}{{ service.urgent().length > 1 ? ', et d’autres ci-dessous.' : '' }}</p>
          </div>
        </div>
      }

      <!-- Sections -->
      @for (section of service.sections(); track section.group) {
        @if (section.tasks.length) {
          <div class="section-head">
            <h2>{{ section.label }}</h2>
            <span class="muted">{{ section.done }} / {{ section.total }}</span>
          </div>
          <div class="list">
            @for (task of section.tasks; track task.id) {
              <label class="row-card task" [class.task--done]="task.done">
                <input type="checkbox" [checked]="task.done" (change)="toggle(task.id)" />
                <span class="row-card__body">
                  <span class="row-card__title">{{ task.label }}</span>
                  <span class="row-card__meta">
                    <span
                      class="badge"
                      [class.badge--danger]="!task.done && task.daysLeft < 0"
                      [class.badge--warning]="!task.done && task.daysLeft >= 0 && task.daysLeft <= 14"
                    >
                      {{ task.dueDate | frDate }}
                    </span>
                    @if (task.contractId) {
                      <a class="tasklink" [routerLink]="['/contrats', task.contractId]" (click)="$event.stopPropagation()">
                        Voir le contrat
                      </a>
                    }
                  </span>
                  @if (task.hint) {
                    <span class="task__hint">{{ task.hint }}</span>
                  }
                </span>
              </label>
            }
          </div>
        }
      }

      <!-- Ajout d'une tâche -->
      <div class="row" style="margin-top: 18px">
        <button type="button" class="btn btn--ghost grow" (click)="addOpen.set(true)">
          <app-icon name="add" /> Ajouter une tâche
        </button>
        <button type="button" class="btn btn--quiet" (click)="cancelOpen.set(true)">Annuler le projet</button>
      </div>

      <!-- Modification -->
      <app-sheet [open]="editOpen()" title="Modifier le déménagement" (close)="editOpen.set(false)">
        <div class="field">
          <label for="e-from">Adresse actuelle</label>
          <input id="e-from" class="input" [(ngModel)]="draftFrom" />
        </div>
        <div class="field">
          <label for="e-to">Nouvelle adresse</label>
          <input id="e-to" class="input" [(ngModel)]="draftTo" />
        </div>
        <div class="field">
          <label for="e-date">Date</label>
          <input id="e-date" class="input" type="date" [(ngModel)]="draftDate" />
        </div>
        <div class="row">
          <button type="button" class="btn btn--ghost grow" (click)="editOpen.set(false)">Annuler</button>
          <button type="button" class="btn btn--primary grow" (click)="saveEdit()">Enregistrer</button>
        </div>
      </app-sheet>

      <!-- Nouvelle tâche -->
      <app-sheet [open]="addOpen()" title="Nouvelle tâche" (close)="addOpen.set(false)">
        <div class="field">
          <label for="t-label">Intitulé</label>
          <input id="t-label" class="input" [(ngModel)]="taskLabel" />
        </div>
        <div class="field">
          <label for="t-group">Section</label>
          <select id="t-group" class="select" [(ngModel)]="taskGroup">
            <option value="logistique">Logistique</option>
            <option value="contrats">Contrats à transférer ou résilier</option>
            <option value="administratif">Changements d'adresse</option>
            <option value="apres">Après le déménagement</option>
          </select>
        </div>
        <div class="field">
          <label for="t-offset">Jours par rapport au déménagement</label>
          <input id="t-offset" class="input" type="number" [(ngModel)]="taskOffset" />
          <small class="muted">Valeur négative = avant le jour J.</small>
        </div>
        <div class="row">
          <button type="button" class="btn btn--ghost grow" (click)="addOpen.set(false)">Annuler</button>
          <button type="button" class="btn btn--primary grow" [disabled]="!taskLabel" (click)="addTask()">Ajouter</button>
        </div>
      </app-sheet>

      <!-- Annulation -->
      <app-sheet [open]="cancelOpen()" title="Annuler le projet ?" (close)="cancelOpen.set(false)">
        <p>La checklist et son avancement seront effacés. Vos contrats et documents ne sont pas touchés.</p>
        <div class="row" style="margin-top: 16px">
          <button type="button" class="btn btn--ghost grow" (click)="cancelOpen.set(false)">Revenir</button>
          <button type="button" class="btn btn--danger grow" (click)="cancelProject()">Annuler le projet</button>
        </div>
      </app-sheet>
    } @else {
      <app-empty icon="moving" title="Aucun projet en cours" />
    }
  `,
  styles: [
    `
      .pillar__icon {
        font-size: 1.2rem;
        color: var(--primary);
        display: block;
      }

      .addresses {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 16px;
        padding-top: 14px;
        border-top: 1px solid var(--border);
        flex-wrap: wrap;
      }
      .addresses__item {
        flex: 1;
        min-width: 140px;
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-size: 0.85rem;
      }
      .addresses__label {
        font-size: 0.68rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--text-muted);
        font-weight: 700;
      }
      .addresses__arrow {
        color: var(--text-muted);
        font-size: 0.75rem;
      }

      .task {
        cursor: pointer;
        align-items: flex-start;

        input {
          margin-top: 2px;
        }
      }
      .task--done {
        opacity: 0.58;
      }
      .task--done .row-card__title {
        text-decoration: line-through;
      }
      .task__hint {
        display: block;
        margin-top: 5px;
        font-size: 0.78rem;
        color: var(--text-muted);
        line-height: 1.45;
      }
      .tasklink {
        font-size: 0.76rem;
        font-weight: 600;
      }
    `,
  ],
})
export class MovingComponent {
  protected readonly service = inject(MovingService);
  private readonly store = inject(Store);
  private readonly ui = inject(UiService);

  readonly pillars = [
    { icon: 'clipboard' as const, title: 'Logistique', body: 'Préavis, devis, monte-meuble, relevés de compteurs.' },
    { icon: 'contracts' as const, title: 'Contrats', body: 'Chaque contrat actif devient une tâche : transfert ou résiliation.' },
    { icon: 'mail' as const, title: "Changements d'adresse", body: 'Impôts, CPAM, banque, employeur, carte grise.' },
    { icon: 'success' as const, title: 'Après', body: 'Listes électorales, dépôt de garantie, anciens prélèvements.' },
  ];

  readonly project = this.service.project;
  readonly contractCount = computed(() => this.store.activeContracts().length);

  readonly editOpen = signal(false);
  readonly addOpen = signal(false);
  readonly cancelOpen = signal(false);

  draftFrom = '';
  draftTo = '';
  draftDate = addDays(todayIso(), 60);

  taskLabel = '';
  taskGroup: 'logistique' | 'contrats' | 'administratif' | 'apres' = 'logistique';
  taskOffset = -7;

  constructor() {
    const p = this.project();
    const profile = this.store.profile();
    this.draftFrom = p?.fromAddress || `${profile.address}, ${profile.postalCode} ${profile.city}`;
    this.draftTo = p?.toAddress ?? '';
    this.draftDate = p?.date ?? addDays(todayIso(), 60);
  }

  daysLeft(iso: string): number {
    return daysUntil(iso);
  }

  start(): void {
    const ok = this.service.start({
      fromAddress: this.draftFrom.trim(),
      toAddress: this.draftTo.trim(),
      date: this.draftDate,
    });
    if (!ok) {
      this.ui.readOnlyBlocked();
      return;
    }
    this.ui.success('Checklist générée', 'Vos contrats actifs ont été transformés en tâches.');
  }

  saveEdit(): void {
    if (!this.service.update({ fromAddress: this.draftFrom, toAddress: this.draftTo, date: this.draftDate })) {
      this.ui.readOnlyBlocked();
      return;
    }
    this.editOpen.set(false);
    this.ui.success('Projet mis à jour');
  }

  toggle(taskId: string): void {
    if (!this.service.toggleTask(taskId)) this.ui.readOnlyBlocked();
  }

  addTask(): void {
    if (!this.service.addTask(this.taskLabel.trim(), this.taskGroup, Number(this.taskOffset) || 0)) {
      this.ui.readOnlyBlocked();
      return;
    }
    this.taskLabel = '';
    this.addOpen.set(false);
    this.ui.success('Tâche ajoutée');
  }

  cancelProject(): void {
    if (!this.service.cancel()) {
      this.ui.readOnlyBlocked();
      return;
    }
    this.cancelOpen.set(false);
    this.ui.info('Projet annulé');
  }
}
