import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TimelineEvent, TimelineKind } from '../../core/models';
import { TimelineService } from '../../core/services/timeline.service';
import { CategoryBadgeComponent, EmptyStateComponent } from '../../shared/components';
import { IconComponent } from '../../shared/icon.component';
import { FrDatePipe } from '../../shared/pipes';

const KIND_META: Record<TimelineKind, { icon: 'contracts' | 'blocked' | 'money' | 'moving' | 'docProof' | 'tax' | 'catSante' | 'catVehicule'; label: string; color: string }> = {
  contrat: { icon: 'contracts', label: 'Contrat', color: 'var(--cat-assurance)' },
  resiliation: { icon: 'blocked', label: 'Résiliation', color: 'var(--danger)' },
  achat: { icon: 'money', label: 'Achat', color: 'var(--cat-banque)' },
  demenagement: { icon: 'moving', label: 'Déménagement', color: 'var(--cat-logement)' },
  document: { icon: 'docProof', label: 'Document', color: 'var(--text-muted)' },
  fiscal: { icon: 'tax', label: 'Fiscal', color: 'var(--cat-impots)' },
  sante: { icon: 'catSante', label: 'Santé', color: 'var(--cat-sante)' },
  vehicule: { icon: 'catVehicule', label: 'Véhicule', color: 'var(--cat-vehicule)' },
};

/**
 * Onglet « Historique » du calendrier : la même donnée temporelle, lue vers le
 * passé. Le composant ne porte pas d’en-tête — c’est le calendrier qui l’affiche.
 */
@Component({
  selector: 'app-timeline',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    CategoryBadgeComponent,
    EmptyStateComponent,
    IconComponent,
    FrDatePipe,
  ],
  template: `
    <!-- Recherche en langage naturel -->
    <div class="searchbar" style="margin-top: 16px">
      <app-icon name="search" />
      <input
        class="input"
        type="search"
        [(ngModel)]="query"
        (ngModelChange)="onQuery($event)"
        placeholder="Ex. Quand ai-je changé d'assurance auto ?"
        aria-label="Rechercher dans la chronologie"
      />
      @if (query) {
        <button type="button" class="btn btn--quiet btn--sm" (click)="clearQuery()" aria-label="Effacer">
          <app-icon name="close" />
        </button>
      }
    </div>

    @if (query && answer(); as a) {
      <div class="callout callout--success" style="margin-top: 12px">
        <app-icon class="callout__icon" name="success" />
        <div>
          <strong>{{ a.sentence }}</strong>
          <p>{{ a.event.description }}</p>
        </div>
      </div>
    } @else if (query && !answer()) {
      <div class="callout callout--warning" style="margin-top: 12px">
        <app-icon class="callout__icon" name="warning" />
        <div>
          <strong>Aucun événement ne correspond</strong>
          <p>Essayez avec le nom du fournisseur (MAIF, AXA, Orange…) ou le type de contrat.</p>
        </div>
      </div>
    }

    <!-- Filtres par nature d'événement -->
    <div class="scroll-x" style="margin: 14px 0">
      <button type="button" class="chip" [class.chip--active]="!kindFilter()" (click)="kindFilter.set(null)">
        Tout ({{ events().length }})
      </button>
      @for (k of kinds; track k) {
        @if (countFor(k) > 0) {
          <button
            type="button"
            class="chip"
            [class.chip--active]="kindFilter() === k"
            (click)="kindFilter.set(kindFilter() === k ? null : k)"
          >
            <app-icon [name]="meta(k).icon" /> {{ meta(k).label }}
            <span class="chip__count">{{ countFor(k) }}</span>
          </button>
        }
      }
    </div>

    <!-- Chronologie -->
    @if (grouped().length) {
      @for (year of grouped(); track year.year) {
        <section class="year">
          <h2 class="year__head">
            <span class="year__label">{{ year.year }}</span>
            <span class="year__count">{{ year.events.length }} événement(s)</span>
          </h2>

          <ol class="tl">
            @for (e of year.events; track e.id) {
              <li class="tl__item">
                <span class="tl__marker" [style.background]="meta(e.kind).color">
                  <app-icon [name]="meta(e.kind).icon" />
                </span>
                <div class="tl__card">
                  <div class="tl__head">
                    <strong>{{ e.title }}</strong>
                    <span class="tl__date">{{ e.date | frDate }}</span>
                  </div>
                  <p class="tl__desc">{{ e.description }}</p>
                  <div class="row wrap">
                    <app-cat-badge [category]="e.category" />
                    @if (e.contractId) {
                      <a class="badge badge--primary" [routerLink]="['/contrats', e.contractId]">
                        <app-icon name="contracts" /> Voir le contrat
                      </a>
                    }
                    @if (e.documentId) {
                      <a class="badge badge--primary" [routerLink]="['/coffre', e.documentId]">
                        <app-icon name="vault" /> Voir le document
                      </a>
                    }
                  </div>
                </div>
              </li>
            }
          </ol>
        </section>
      }
    } @else {
      <app-empty
        icon="timeline"
        title="Aucun événement"
        hint="La chronologie se remplit au fur et à mesure que vous ajoutez contrats et documents."
      />
    }
  `,
  styles: [
    `
      .searchbar {
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 0 13px;
        background: var(--surface);
        border: 1px solid var(--border-strong);
        border-radius: 12px;
        color: var(--text-muted);

        .input {
          border: 0;
          background: transparent;
          padding-left: 0;
          color: var(--text);

          &:focus {
            box-shadow: none;
          }
        }
      }

      .chip__count {
        font-size: 0.7rem;
        opacity: 0.85;
      }

      .year {
        margin-bottom: 26px;
      }
      .year__head {
        display: flex;
        align-items: baseline;
        gap: 12px;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 2px solid var(--border);
      }
      .year__label {
        font-size: 1.5rem;
        font-weight: 700;
        letter-spacing: -0.03em;
        font-variant-numeric: tabular-nums;
      }
      .year__count {
        font-size: 0.78rem;
        color: var(--text-muted);
        font-weight: 500;
      }

      .tl {
        list-style: none;
        margin: 0;
        padding: 0 0 0 8px;
        position: relative;
      }
      /* Le fil vertical qui relie les événements */
      .tl::before {
        content: '';
        position: absolute;
        left: 21px;
        top: 12px;
        bottom: 12px;
        width: 2px;
        background: var(--border);
      }
      .tl__item {
        display: flex;
        gap: 14px;
        margin-bottom: 12px;
        position: relative;
      }
      .tl__marker {
        flex: 0 0 auto;
        display: grid;
        place-items: center;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        color: #fff;
        font-size: 0.68rem;
        margin-top: 8px;
        border: 3px solid var(--bg);
        z-index: 1;
      }
      .tl__card {
        flex: 1;
        min-width: 0;
        padding: 12px 14px;
        border-radius: 12px;
        background: var(--surface);
        border: 1px solid var(--border);
      }
      .tl__head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 4px;
      }
      .tl__head strong {
        font-size: 0.9rem;
      }
      .tl__date {
        flex: 0 0 auto;
        font-size: 0.75rem;
        color: var(--text-muted);
        font-variant-numeric: tabular-nums;
      }
      .tl__desc {
        margin: 0 0 8px;
        font-size: 0.82rem;
        color: var(--text-muted);
        line-height: 1.5;
      }

      a.badge {
        text-decoration: none;
      }
    `,
  ],
})
export class TimelineComponent {
  private readonly service = inject(TimelineService);

  readonly kinds = Object.keys(KIND_META) as TimelineKind[];
  readonly events = this.service.events;

  readonly kindFilter = signal<TimelineKind | null>(null);
  readonly searchTerm = signal('');

  query = '';

  readonly answer = computed(() => {
    const q = this.searchTerm();
    return q ? this.service.answerWhen(q) : undefined;
  });

  /** Résultat filtré, regroupé par année décroissante. */
  readonly grouped = computed(() => {
    const q = this.searchTerm();
    const kind = this.kindFilter();

    let list: TimelineEvent[] = q ? this.service.search(q) : this.events();
    if (kind) list = list.filter((e) => e.kind === kind);

    const years = new Map<number, TimelineEvent[]>();
    for (const e of list) {
      const y = Number(e.date.slice(0, 4));
      const bucket = years.get(y);
      bucket ? bucket.push(e) : years.set(y, [e]);
    }

    return [...years.entries()]
      .map(([year, events]) => ({ year, events: events.sort((a, b) => b.date.localeCompare(a.date)) }))
      .sort((a, b) => b.year - a.year);
  });

  meta(kind: TimelineKind) {
    return KIND_META[kind] ?? KIND_META.document;
  }

  countFor(kind: TimelineKind): number {
    return this.events().filter((e) => e.kind === kind).length;
  }

  onQuery(value: string): void {
    this.searchTerm.set(value);
  }

  clearQuery(): void {
    this.query = '';
    this.searchTerm.set('');
  }
}
