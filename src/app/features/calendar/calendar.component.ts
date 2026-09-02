import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { TranslatePipe } from '../../core/i18n/i18n.service';
import { CATEGORIES, Category, DEADLINE_KIND_LABEL, Deadline, DeadlineKind } from '../../core/models';
import { DeadlineService } from '../../core/services/deadline.service';
import { UiService } from '../../core/services/ui.service';
import { Store } from '../../core/store';
import { daysUntil, todayIso } from '../../core/utils';
import {
  EmptyStateComponent,
  PageHeaderComponent,
  SheetComponent,
} from '../../shared/components';
import { DeadlineIconClassPipe, IconComponent } from '../../shared/icon.component';
import { CategoryLabelPipe, FrDatePipe, RelativeDaysPipe } from '../../shared/pipes';
import { AlertsComponent } from '../alerts/alerts.component';
import { TimelineComponent } from '../timeline/timeline.component';

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

type CalendarView = 'liste' | 'mois' | 'alertes' | 'historique';

/** Onglet inconnu ou absent : on retombe sur la liste des échéances. */
const normalizeView = (raw: string | null): CalendarView =>
  raw === 'mois' || raw === 'alertes' || raw === 'historique' ? raw : 'liste';


@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [
    FormsModule,
    NgTemplateOutlet,
    TranslatePipe,
    PageHeaderComponent,
    EmptyStateComponent,
    SheetComponent,
    IconComponent,
    AlertsComponent,
    TimelineComponent,
    DeadlineIconClassPipe,
    CategoryLabelPipe,
    FrDatePipe,
    RelativeDaysPipe,
  ],
  template: `
    <app-page-header [title]="'calendar.title' | t">
      @if (deadlineView()) {
        <button type="button" class="btn btn--sm btn--ghost" (click)="filtersOpen.set(true)">
          <app-icon name="filter" /> Filtres
          @if (hasActiveFilters()) {
            <span class="dot-marker" aria-hidden="true"></span>
          }
        </button>
        <button type="button" class="btn btn--sm btn--primary" (click)="openCreate()">
          <app-icon name="add" /> Ajouter
        </button>
      }
    </app-page-header>

    <!-- Vues d'une même donnée temporelle : les échéances à venir (en liste
         ou en mois), les rappels qui en découlent, et l'historique écrit. -->
    <div class="segmented" role="tablist" style="margin-top: 16px">
      @for (tab of tabs; track tab.value) {
        <button
          type="button"
          role="tab"
          class="segmented__btn"
          [attr.aria-selected]="view() === tab.value"
          [class.segmented__btn--active]="view() === tab.value"
          (click)="setView(tab.value)"
        >
          <app-icon class="segmented__icon" [name]="tab.icon" />
          <span class="segmented__label">{{ tab.label }}</span>
          @if (tab.value === 'alertes' && unreadCount() > 0) {
            <span class="segmented__badge">{{ unreadCount() }}</span>
          }
        </button>
      }
    </div>

    @if (deadlineView()) {
      <!-- Suggestions issues des contrats -->
      @if (suggestions().length) {
        <div class="callout callout--info" style="margin-top: 16px">
          <app-icon class="callout__icon" name="sparkles" />
          <div class="grow">
            <strong>{{ suggestions().length }} échéance(s) déductible(s) de vos contrats</strong>
            <div class="row wrap" style="margin-top: 10px">
              <button type="button" class="btn btn--sm btn--primary" (click)="acceptAll()">
                <app-icon name="check" /> Tout ajouter
              </button>
              <button type="button" class="btn btn--sm btn--ghost" (click)="suggestionsOpen.set(true)">
                <app-icon name="eye" /> Examiner
              </button>
            </div>
          </div>
        </div>
      }

    }

    @if (view() === 'alertes') {
      <app-alerts />
    } @else if (view() === 'historique') {
      <app-timeline />
    } @else if (view() === 'mois') {
      <!-- Vue mensuelle -->
      <div class="cal card">
        <div class="cal__head">
          <button type="button" class="btn btn--quiet btn--icon" (click)="shiftMonth(-1)" aria-label="Mois précédent">
            <app-icon cls="fa-solid fa-chevron-left" />
          </button>
          <strong>{{ month().label }}</strong>
          <button type="button" class="btn btn--quiet btn--icon" (click)="shiftMonth(1)" aria-label="Mois suivant">
            <app-icon name="chevronRight" />
          </button>
        </div>

        <div class="cal__grid cal__grid--weekdays" aria-hidden="true">
          @for (d of weekdays; track $index) {
            <span>{{ d }}</span>
          }
        </div>

        <div class="cal__grid">
          @for (cell of month().cells; track cell.date) {
            <button
              type="button"
              class="cal__cell"
              [class.cal__cell--out]="!cell.inMonth"
              [class.cal__cell--today]="cell.isToday"
              [class.cal__cell--selected]="selectedDate() === cell.date"
              (click)="selectedDate.set(cell.date)"
              [attr.aria-label]="cell.date + (cell.deadlines.length ? ', ' + cell.deadlines.length + ' échéance(s)' : '')"
            >
              <span class="cal__num">{{ cell.dayOfMonth }}</span>
              @if (cell.deadlines.length) {
                <span class="cal__dots">
                  @for (d of cell.deadlines.slice(0, 3); track d.id) {
                    <span class="cal__dot" [style.background]="colorFor(d)"></span>
                  }
                </span>
              }
            </button>
          }
        </div>
      </div>

      @if (selectedDayDeadlines().length) {
        <div class="section-head"><h2>{{ selectedDate() | frDate: 'long' }}</h2></div>
        <div class="list">
          @for (d of selectedDayDeadlines(); track d.id) {
            <div class="row-card">
              <span class="row-card__icon"><app-icon [cls]="d.kind | deadlineIconClass" /></span>
              <span class="row-card__body">
                <span class="row-card__title">{{ d.title }}</span>
                <span class="row-card__meta">{{ kindLabel(d.kind) }}</span>
              </span>
              <button type="button" class="btn btn--sm btn--quiet" (click)="toggleDone(d.id)">
                <app-icon [name]="d.done ? 'checkCircle' : 'emptyCircle'" />
              </button>
            </div>
          }
        </div>
      } @else if (selectedDate()) {
        <p class="muted" style="margin-top: 12px">Aucune échéance le {{ selectedDate() | frDate: 'long' }}.</p>
      }
    } @else {
      <!-- Vue liste groupée -->
      @if (showPending()) {
        @if (overdue().length) {
          <div class="section-head"><h2 class="text-danger">En retard</h2></div>
          <div class="list">
            @for (d of overdue(); track d.id) {
              <ng-container *ngTemplateOutlet="row; context: { $implicit: d }" />
            }
          </div>
        }

        @for (group of groups(); track group.label) {
          @if (group.items.length) {
            <div class="section-head">
              <h2>{{ group.label }}</h2>
              <span class="muted">{{ group.items.length }}</span>
            </div>
            <div class="list">
              @for (d of group.items; track d.id) {
                <ng-container *ngTemplateOutlet="row; context: { $implicit: d }" />
              }
            </div>
          }
        }

        @if (!overdue().length && !hasAny()) {
          <app-empty icon="calendarEmpty" title="Aucune échéance à venir" hint="Ajoutez-en une, ou importez un document contenant une date limite." />
        }
      }

      @if (showDone()) {
        @if (doneList().length) {
          @if (statusFilter() === 'toutes') {
            <div class="section-head"><h2>Traitées</h2></div>
          }
          <div class="list">
            @for (d of doneList(); track d.id) {
              <div class="row-card row-card--done">
                <span class="row-card__icon"><app-icon name="success" /></span>
                <span class="row-card__body">
                  <span class="row-card__title">{{ d.title }}</span>
                  <span class="row-card__meta">{{ d.date | frDate }}</span>
                </span>
                <button type="button" class="btn btn--sm btn--ghost" (click)="toggleDone(d.id)">
                  <app-icon name="refresh" /> Rouvrir
                </button>
              </div>
            }
          </div>
        } @else if (statusFilter() === 'traitees') {
          <app-empty icon="calendarEmpty" title="Aucune échéance traitée" hint="Les échéances que vous cochez viendront ici." />
        }
      }
    }

    <!-- Gabarit de ligne réutilisé par les groupes -->
    <ng-template #row let-d>
      <div class="row-card">
        <span class="row-card__icon" [style.background]="colorFor(d) + '1f'" [style.color]="colorFor(d)">
          <app-icon [cls]="d.kind | deadlineIconClass" />
        </span>
        <span class="row-card__body">
          <span class="row-card__title">{{ d.title }}</span>
          <span class="row-card__meta">
            <span>{{ d.date | frDate }}</span>
          </span>
        </span>
        <span class="row-card__side">
          <span
            class="badge"
            [class.badge--danger]="days(d.date) <= 7"
            [class.badge--warning]="days(d.date) > 7 && days(d.date) <= 30"
          >
            {{ days(d.date) | relDays }}
          </span>
          <button type="button" class="btn btn--sm btn--quiet" (click)="toggleDone(d.id)" aria-label="Marquer comme fait">
            <app-icon name="emptyCircle" />
          </button>
        </span>
      </div>
    </ng-template>

    <!-- Suggestions détaillées -->
    <app-sheet [open]="suggestionsOpen()" title="Échéances détectées" (close)="suggestionsOpen.set(false)">
      <div class="list">
        @for (s of suggestions(); track s.title + s.date) {
          <div class="row-card">
            <span class="row-card__icon"><app-icon [cls]="s.kind | deadlineIconClass" /></span>
            <span class="row-card__body">
              <span class="row-card__title">{{ s.title }}</span>
              <span class="row-card__meta">{{ s.date | frDate: 'long' }}</span>
              @if (s.note) {
                <span class="row-card__note">{{ s.note }}</span>
              }
            </span>
            <button type="button" class="btn btn--sm btn--primary" (click)="accept(s)">
              <app-icon name="add" />
            </button>
          </div>
        }
      </div>
    </app-sheet>

    <!-- Filtres : statut et catégorie au même endroit, sous la même forme. -->
    <app-sheet [open]="filtersOpen()" title="Filtres" (close)="filtersOpen.set(false)">
      <p class="filter-group">Filtrer par statut</p>
      <div class="chip-wrap">
        @for (f of statusFilters; track f.value) {
          <button
            type="button"
            class="chip"
            [class.chip--active]="statusFilter() === f.value"
            [attr.aria-pressed]="statusFilter() === f.value"
            (click)="statusFilter.set(f.value)"
          >
            {{ f.label }}
            <span class="chip__count">{{ countForStatus(f.value) }}</span>
          </button>
        }
      </div>

      <p class="filter-group">Filtrer par catégorie</p>
      <div class="chip-wrap">
        <button
          type="button"
          class="chip"
          [class.chip--active]="!categoryFilter()"
          (click)="categoryFilter.set(null)"
        >
          {{ 'common.all' | t }}
        </button>
        @for (c of categories; track c) {
          <button
            type="button"
            class="chip"
            [class.chip--active]="categoryFilter() === c"
            (click)="categoryFilter.set(categoryFilter() === c ? null : c)"
          >
            {{ c | catLabel }}
          </button>
        }
      </div>
    </app-sheet>

    <!-- Création manuelle -->
    <app-sheet [open]="createOpen()" title="Nouvelle échéance" (close)="createOpen.set(false)">
      <div class="field">
        <label for="n-title">Intitulé</label>
        <input id="n-title" class="input" [(ngModel)]="draftTitle" placeholder="Ex. Renouveler le passeport" />
      </div>
      <div class="field">
        <label for="n-date">Date</label>
        <input id="n-date" class="input" type="date" [(ngModel)]="draftDate" />
      </div>
      <div class="field">
        <label for="n-kind">Type</label>
        <select id="n-kind" class="select" [(ngModel)]="draftKind">
          @for (k of kinds; track k) {
            <option [value]="k">{{ kindLabel(k) }}</option>
          }
        </select>
      </div>
      <div class="field">
        <label for="n-cat">Catégorie</label>
        <select id="n-cat" class="select" [(ngModel)]="draftCategory">
          @for (c of categories; track c) {
            <option [value]="c">{{ c | catLabel }}</option>
          }
        </select>
      </div>
      <div class="field">
        <label for="n-note">Note</label>
        <textarea id="n-note" class="textarea" [(ngModel)]="draftNote" rows="3"></textarea>
      </div>

      <div class="row">
        <button type="button" class="btn btn--ghost grow" (click)="createOpen.set(false)">Annuler</button>
        <button type="button" class="btn btn--primary grow" [disabled]="!draftTitle || !draftDate" (click)="create()">
          Créer
        </button>
      </div>
    </app-sheet>
  `,
  styles: [
    `
      @use 'mixins' as *;

      .chip__count {
        font-size: 0.7rem;
        opacity: 0.85;
        font-variant-numeric: tabular-nums;
      }

      /* Une grille, jamais un défileur : quatre onglets côte à côte ne tiennent
         pas sur un téléphone, et « Historique » s'y retrouvait coupé en deux
         dans un contrôle qui n'a pas l'air de défiler. Deux colonnes sur deux
         lignes en dessous de 600 px — rien n'est tronqué, il n'y a rien à
         deviner. */
      .segmented {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 4px;
        padding: 4px;
        border-radius: 999px;
        background: var(--surface-2);

        /* Sur grand écran la barre n'a aucune raison de traverser la page. */
        @include up(600px) {
          max-width: 620px;
        }
      }

      /* Les quatre onglets tiennent sur une ligne à toute largeur. Sous 600 px
         l'icône s'efface et le libellé rétrécit : c'est le mot qui doit
         survivre, pas le pictogramme. L'ellipse n'est qu'un dernier recours,
         pour qu'un libellé plus long qu'attendu se coupe proprement au lieu de
         déborder du contrôle. */
      .segmented__icon {
        display: none;

        @include up(600px) {
          display: inline-block;
        }
      }
      .segmented__label {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .segmented__btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        min-width: 0;
        padding: 8px 4px;
        /* Bordure transparente et non absente : l'onglet actif en révèle une
           sans que la taille des autres bouge d'un pixel. */
        border: 1px solid transparent;
        border-radius: 999px;
        background: transparent;
        color: var(--text-muted);
        font-size: clamp(0.72rem, 2.9vw, 0.86rem);
        font-weight: 620;
        white-space: nowrap;
        cursor: pointer;

        @include up(600px) {
          padding: 8px 14px;
        }
      }
      .segmented__badge {
        display: inline-grid;
        place-items: center;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        border-radius: 999px;
        background: var(--danger);
        color: #fff;
        font-size: 0.68rem;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      /* Même aplat que la chip active : sur cet écran, « sélectionné » ne
         doit avoir qu'une seule apparence. */
      .segmented__btn--active {
        background: var(--primary-surface);
        border-color: var(--primary-surface-border);
        color: var(--on-primary-surface);
      }

      /* Intitulé de groupe dans le panneau de filtres. */
      .filter-group {
        margin: 0 0 10px;
        font-size: 0.82rem;
        font-weight: 600;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .chip-wrap + .filter-group {
        margin-top: 22px;
      }

      .chip-wrap {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .cal__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
        font-size: 0.98rem;
      }
      .cal__grid {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 3px;
      }
      .cal__grid--weekdays {
        margin-bottom: 4px;

        span {
          text-align: center;
          font-size: 0.7rem;
          font-weight: 700;
          color: var(--text-muted);
          padding: 4px 0;
        }
      }
      .cal__cell {
        aspect-ratio: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3px;
        border: 1px solid transparent;
        border-radius: 9px;
        background: transparent;
        color: var(--text);
        cursor: pointer;
        font-variant-numeric: tabular-nums;

        &:hover {
          background: var(--surface-2);
        }
      }
      .cal__cell--out {
        color: var(--text-muted);
        opacity: 0.45;
      }
      .cal__cell--today {
        border-color: var(--primary);
        font-weight: 700;
      }
      .cal__cell--selected {
        background: var(--primary-soft);
        border-color: var(--primary);
      }
      .cal__num {
        font-size: 0.84rem;
      }
      .cal__dots {
        display: flex;
        gap: 2px;
      }
      .cal__dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
      }

      .row-card__note {
        display: block;
        margin-top: 5px;
        font-size: 0.79rem;
        color: var(--text-muted);
        line-height: 1.45;
      }
      .row-card--done {
        opacity: 0.62;
      }
      .row-card--done .row-card__title {
        text-decoration: line-through;
      }
      .row-card__side {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .text-danger {
        color: var(--danger);
      }
    `,
  ],
})
export class CalendarComponent {
  private readonly service = inject(DeadlineService);
  private readonly store = inject(Store);
  private readonly ui = inject(UiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly categories = CATEGORIES;
  readonly kinds = Object.keys(DEADLINE_KIND_LABEL) as DeadlineKind[];
  readonly weekdays = WEEKDAYS;

  readonly tabs = [
    { value: 'liste' as const, label: 'Liste', icon: 'clipboard' as const },
    { value: 'mois' as const, label: 'Mois', icon: 'calendar' as const },
    { value: 'alertes' as const, label: 'Alertes', icon: 'bell' as const },
    { value: 'historique' as const, label: 'Historique', icon: 'timeline' as const },
  ];

  /**
   * L'onglet vit dans l'URL : les anciennes adresses (/alertes, /chronologie)
   * y redirigent, et un lien partagé rouvre la bonne vue.
   */
  private readonly urlView = toSignal(this.route.queryParamMap.pipe(map((q) => normalizeView(q.get('vue')))), {
    initialValue: normalizeView(this.route.snapshot.queryParamMap.get('vue')),
  });
  readonly view = linkedSignal(() => this.urlView());

  readonly deadlineView = computed(() => this.view() === 'liste' || this.view() === 'mois');
  readonly unreadCount = this.service.unreadCount;
  readonly categoryFilter = signal<Category | null>(null);
  readonly filtersOpen = signal(false);

  /** Pastille sur le bouton : quelque chose masque une partie de la liste. */
  readonly hasActiveFilters = computed(
    () => this.categoryFilter() !== null || this.statusFilter() !== 'a-traiter',
  );

  /** Filtre par état de traitement. Par défaut, ce qui reste à faire. */
  readonly statusFilters = [
    { value: 'a-traiter' as const, label: 'À traiter' },
    { value: 'traitees' as const, label: 'Traitées' },
    { value: 'toutes' as const, label: 'Toutes' },
  ];
  readonly statusFilter = signal<'a-traiter' | 'traitees' | 'toutes'>('a-traiter');

  readonly showPending = computed(() => this.statusFilter() !== 'traitees');
  readonly showDone = computed(() => this.statusFilter() !== 'a-traiter');

  readonly selectedDate = signal<string>(todayIso());
  readonly suggestionsOpen = signal(false);
  readonly createOpen = signal(false);

  private readonly cursor = signal(new Date());

  readonly suggestions = this.service.suggestions;

  setView(view: CalendarView): void {
    this.view.set(view);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { vue: view === 'liste' ? null : view },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  readonly month = computed(() => {
    const c = this.cursor();
    return this.service.buildMonth(c.getFullYear(), c.getMonth());
  });

  private readonly filtered = computed(() => {
    const cat = this.categoryFilter();
    const all = this.store.deadlines();
    return cat ? all.filter((d) => d.category === cat) : all;
  });

  readonly overdue = computed(() =>
    this.filtered()
      .filter((d) => !d.done && daysUntil(d.date) < 0)
      .sort((a, b) => a.date.localeCompare(b.date)),
  );

  readonly doneList = computed(() =>
    this.filtered()
      .filter((d) => d.done)
      .sort((a, b) => b.date.localeCompare(a.date)),
  );

  /** Regroupement par horizon temporel : c'est ainsi qu'on lit un calendrier. */
  readonly groups = computed(() => {
    const upcoming = this.filtered()
      .filter((d) => !d.done && daysUntil(d.date) >= 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    const bucket = (min: number, max: number) =>
      upcoming.filter((d) => {
        const n = daysUntil(d.date);
        return n >= min && n <= max;
      });

    return [
      { label: 'Cette semaine', items: bucket(0, 7) },
      { label: 'Ce mois-ci', items: bucket(8, 30) },
      { label: 'Dans 3 mois', items: bucket(31, 90) },
      { label: 'Plus tard', items: upcoming.filter((d) => daysUntil(d.date) > 90) },
    ];
  });

  readonly hasAny = computed(() => this.groups().some((g) => g.items.length > 0));

  readonly selectedDayDeadlines = computed(() =>
    this.filtered()
      .filter((d) => d.date === this.selectedDate())
      .filter((d) => (d.done ? this.showDone() : this.showPending())),
  );

  /** Compte affiché sur chaque puce de filtre, catégorie courante comprise. */
  countForStatus(status: 'a-traiter' | 'traitees' | 'toutes'): number {
    const list = this.filtered();
    if (status === 'toutes') return list.length;
    const done = status === 'traitees';
    return list.filter((d) => d.done === done).length;
  }

  /* Brouillon de création */
  draftTitle = '';
  draftDate = todayIso();
  draftKind: DeadlineKind = 'autre';
  draftCategory = 'autre';
  draftNote = '';

  days(iso: string): number {
    return daysUntil(iso);
  }

  kindLabel(kind: DeadlineKind): string {
    return DEADLINE_KIND_LABEL[kind] ?? 'Échéance';
  }

  colorFor(d: Deadline): string {
    const n = daysUntil(d.date);
    if (n < 0) return 'var(--danger)';
    if (n <= 7) return 'var(--danger)';
    if (n <= 30) return 'var(--warning)';
    return 'var(--info)';
  }

  shiftMonth(delta: number): void {
    this.cursor.update((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));
  }

  toggleDone(id: string): void {
    // Le mode archive est vérifié avant la mutation, et non après : sinon le
    // refus était signalé alors que l'écriture avait déjà été tentée.
    if (this.store.readOnly()) {
      this.ui.readOnlyBlocked();
      return;
    }
    const before = this.store.deadlines().find((d) => d.id === id);
    this.service.toggleDone(id);
    if (!before) return;
    before.done
      ? this.ui.info('Échéance rouverte', before.title)
      : this.ui.success('Échéance traitée', before.title);
  }

  accept(deadline: Deadline): void {
    if (!this.service.acceptSuggestion(deadline)) {
      this.ui.readOnlyBlocked();
      return;
    }
    this.ui.success('Échéance ajoutée', deadline.title);
  }

  acceptAll(): void {
    const n = this.service.acceptAllSuggestions();
    if (!n) {
      this.ui.readOnlyBlocked();
      return;
    }
    this.ui.success(`${n} échéance(s) ajoutée(s)`, 'Votre calendrier est à jour.');
  }

  openCreate(): void {
    this.draftTitle = '';
    this.draftDate = todayIso();
    this.draftKind = 'autre';
    this.draftCategory = 'autre';
    this.draftNote = '';
    this.createOpen.set(true);
  }

  create(): void {
    const ok = this.service.create({
      title: this.draftTitle.trim(),
      date: this.draftDate,
      kind: this.draftKind,
      category: this.draftCategory as never,
      note: this.draftNote.trim() || undefined,
    });
    if (!ok) {
      this.ui.readOnlyBlocked();
      return;
    }
    this.createOpen.set(false);
    this.ui.success('Échéance créée');
  }
}
