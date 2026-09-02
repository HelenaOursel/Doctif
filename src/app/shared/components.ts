import { NgClass, NgTemplateOutlet } from '@angular/common';
import {
  Component,
  ElementRef,
  Input,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  numberAttribute,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconName } from '../core/icons';
import { CATEGORY_META, Category } from '../core/models';
import { NavDirectionService } from '../core/services/nav-direction.service';
import { UiService } from '../core/services/ui.service';
import { IconComponent } from './icon.component';
import { CategoryLabelPipe } from './pipes';

/* =========================================================================
   En-tête de page
   ========================================================================= */
@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `
    <header class="ph">
      @if (backTo()) {
        <a
          class="ph__back"
          [routerLink]="backTo()"
          (click)="navDirection.markBack()"
          aria-label="Revenir à l'écran précédent"
        >
          <app-icon name="back" />
        </a>
      }
      <div class="ph__text">
        <h1>{{ title() }}</h1>
        @if (subtitle()) {
          <p>{{ subtitle() }}</p>
        }
      </div>
      <div class="ph__actions"><ng-content /></div>
    </header>
  `,
  styles: [
    `
      @use 'mixins' as *;

      .ph {
        display: flex;
        align-items: flex-start;
        gap: 12px 14px;
        /* Titre long + actions : sur mobile les actions passent à la ligne
           plutôt que d'écraser le titre ou de sortir de l'écran. */
        flex-wrap: wrap;
        margin-bottom: 8px;
      }
      .ph__back {
        flex: 0 0 auto;
        display: grid;
        place-items: center;
        width: 38px;
        height: 38px;
        border-radius: 10px;
        background: var(--surface-2);
        color: var(--text);
        font-size: 1.1rem;
        text-decoration: none;
      }
      .ph__text {
        /* Base non nulle : le bloc titre occupe la ligne et repousse les
           actions en dessous dès qu'elles ne tiennent plus à côté. */
        flex: 1 1 200px;
        min-width: 0;
      }
      h1 {
        font-size: 1.35rem;
        @include up(768px) {
          font-size: 1.6rem;
        }
      }
      p {
        margin: 6px 0 0;
        color: var(--text-muted);
        font-size: 0.9rem;
        line-height: 1.5;
      }
      .ph__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        min-width: 0;
        max-width: 100%;
      }
      .ph__actions:empty {
        display: none;
      }
    `,
  ],
})
export class PageHeaderComponent {
  /** La flèche de retour remonte la hiérarchie : la transition doit s'inverser. */
  protected readonly navDirection = inject(NavDirectionService);

  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  readonly backTo = input<string | null>(null);
}

/* =========================================================================
   État vide
   ========================================================================= */
@Component({
  selector: 'app-empty',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="empty">
      <app-icon class="empty__icon" [name]="icon()" />
      <p class="empty__title">{{ title() }}</p>
      @if (hint()) {
        <p class="empty__hint">{{ hint() }}</p>
      }
      <ng-content />
    </div>
  `,
  styles: [
    `
      .empty {
        text-align: center;
        padding: 40px 22px;
        border: 1px dashed var(--border-strong);
        border-radius: 14px;
        background: var(--surface);
      }
      .empty__icon {
        display: block;
        font-size: 1.8rem;
        margin-bottom: 10px;
        color: var(--text-muted);
      }
      .empty__title {
        margin: 0;
        font-weight: 600;
      }
      .empty__hint {
        margin: 8px 0 0;
        color: var(--text-muted);
        font-size: 0.88rem;
        max-width: 44ch;
        margin-inline: auto;
        line-height: 1.5;
      }
    `,
  ],
})
export class EmptyStateComponent {
  readonly icon = input<IconName>('inbox');
  readonly title = input.required<string>();
  readonly hint = input('');
}

/* =========================================================================
   Tuile chiffrée (compteur animé par jQuery)
   ========================================================================= */
@Component({
  selector: 'app-stat',
  standalone: true,
  imports: [RouterLink, NgClass, NgTemplateOutlet],
  template: `
    @if (link()) {
      <a
        class="stat stat--link"
        [ngClass]="'stat--' + tone()"
        [routerLink]="link()"
        [queryParams]="queryParams()"
        [fragment]="fragment()"
      >
        <ng-container *ngTemplateOutlet="body" />
      </a>
    } @else {
      <!-- Sans destination, la tuile ne doit pas se présenter comme cliquable. -->
      <div class="stat" [ngClass]="'stat--' + tone()">
        <ng-container *ngTemplateOutlet="body" />
      </div>
    }

    <ng-template #body>
      <span class="stat__label">{{ label() }}</span>
      <span class="stat__value" #valueEl>{{ display() }}</span>
      @if (hint()) {
        <span class="stat__hint">{{ hint() }}</span>
      }
    </ng-template>
  `,
  styles: [
    `
      @use 'mixins' as *;

      /* Arrivée : la tuile descend en place. Le décalage est appliqué par la
         grille (voir .tile-grid dans styles.scss) pour que les quatre se
         posent l'une après l'autre plutôt que d'un bloc. */
      @keyframes stat-drop {
        from {
          opacity: 0;
          transform: translateY(-10px);
        }
      }

      .stat {
        display: flex;
        flex-direction: column;
        gap: 4px;
        animation: stat-drop 320ms cubic-bezier(0.22, 1, 0.36, 1) both;
        animation-delay: var(--stat-delay, 0ms);
        /* Item de grille : sans min-width nul, la tuile ne descend pas sous
           la largeur de son plus long mot et élargit la colonne. */
        min-width: 0;
        /* Occupe toute la rangée pour que les quatre tuiles s'alignent. */
        height: 100%;
        padding: 18px;
        border-radius: 14px;
        background: var(--surface);
        border: 1px solid var(--border);
        box-shadow: var(--shadow-sm);
        text-decoration: none;
        color: inherit;
        transition:
          transform 0.12s ease,
          box-shadow 0.15s ease;
      }
      /* Seule une tuile menant quelque part réagit au survol et au toucher. */
      .stat--link {
        cursor: pointer;
      }
      .stat--link:hover {
        text-decoration: none;
        box-shadow: var(--shadow-md);
      }
      .stat--link:active {
        transform: scale(0.99);
      }
      .stat__label {
        font-size: 0.78rem;
        line-height: 1.35;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-muted);
        font-weight: 650;
        /* Deux lignes réservées : les valeurs des quatre tuiles restent
           alignées entre elles, que le libellé tienne sur une ou deux lignes. */
        min-height: calc(2 * 1.35em);
        @include clamp-lines(2);
      }
      .stat__value {
        /* Deux tuiles par ligne sur mobile : un montant à six chiffres ne
           tient pas à 1.5 rem sur un écran de 320 px. La taille suit la
           largeur disponible et redescend jamais sous 1.05 rem. */
        font-size: clamp(1.05rem, 5.4vw, 1.5rem);
        font-weight: 700;
        letter-spacing: -0.03em;
        font-variant-numeric: tabular-nums;

        @media (min-width: 768px) {
          font-size: 1.5rem;
        }
      }
      .stat__hint {
        font-size: 0.8rem;
        line-height: 1.45;
        color: var(--text-muted);
        /* Ancré en bas : l'indice s'aligne d'une tuile à l'autre même quand
           le libellé du voisin occupe une ligne de plus. Deux lignes au plus,
           pour qu'un indice bavard n'étire pas toute la rangée. */
        margin-top: auto;
        padding-top: 4px;
        @include clamp-lines(2);
      }
      .stat--danger .stat__value {
        color: var(--danger);
      }
      .stat--warning .stat__value {
        color: var(--warning);
      }
      .stat--success .stat__value {
        color: var(--success);
      }
      .stat--primary .stat__value {
        color: var(--primary);
      }
    `,
  ],
})
export class StatTileComponent {
  private readonly ui = inject(UiService);

  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly hint = input('');
  /** Destination. Vide, la tuile reste purement informative. */
  readonly link = input<string | null>(null);
  /** Paramètres d'URL transmis au lien — sert aux tuiles qui filtrent l'écran. */
  readonly queryParams = input<Record<string, string> | null>(null);
  /** Ancre de la section détaillant ce chiffre sur l'écran de destination. */
  readonly fragment = input<string | undefined>(undefined);
  readonly tone = input<'neutral' | 'primary' | 'success' | 'warning' | 'danger'>('neutral');
  /** Suffixe ajouté à la valeur (« € », « % »…). */
  readonly suffix = input('');
  readonly decimals = input(0, { transform: numberAttribute });

  private readonly valueEl = viewChild<ElementRef<HTMLElement>>('valueEl');

  readonly display = computed(() => this.format(this.value()));

  constructor() {
    // Anime la tuile dès que l'élément est disponible, puis à chaque
    // changement de valeur. `viewChild` étant un signal, l'effet se
    // ré-exécute automatiquement une fois la vue rendue.
    effect(() => {
      const target = this.value();
      const el = this.valueEl()?.nativeElement;
      if (el) this.ui.countUp(el, target, (n) => this.format(n));
    });
  }

  private format(n: number): string {
    const d = this.decimals();
    const base = d > 0 ? n.toFixed(d).replace('.', ',') : Math.round(n).toLocaleString('fr-FR');
    return `${base}${this.suffix() ? ` ${this.suffix()}` : ''}`;
  }
}

/* =========================================================================
   Pastille de catégorie
   ========================================================================= */
@Component({
  selector: 'app-cat-badge',
  standalone: true,
  imports: [CategoryLabelPipe, IconComponent],
  template: `
    <span class="cat" [style.--c]="color()">
      <app-icon class="cat__dot" [cls]="meta().icon" />
      @if (!compact()) {
        <span>{{ category() | catLabel }}</span>
      }
    </span>
  `,
  styles: [
    `
      .cat {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 3px 9px 3px 5px;
        border-radius: 999px;
        font-size: 0.72rem;
        font-weight: 650;
        color: var(--c);
        background: color-mix(in srgb, var(--c) 13%, transparent);
        white-space: nowrap;
      }
      .cat__dot {
        font-size: 0.76rem;
      }
    `,
  ],
})
export class CategoryBadgeComponent {
  readonly category = input.required<Category>();
  readonly compact = input(false, { transform: booleanAttribute });

  readonly meta = computed(() => CATEGORY_META[this.category()] ?? CATEGORY_META.autre);
  readonly color = computed(() => `var(${this.meta().cssVar})`);
}

/* =========================================================================
   Jauge de score de risque
   ========================================================================= */
@Component({
  selector: 'app-risk-gauge',
  standalone: true,
  template: `
    <div class="gauge" [class.gauge--sm]="compact()">
      <svg viewBox="0 0 120 68" role="img" [attr.aria-label]="'Score de risque ' + score() + ' sur 100, niveau ' + levelLabel()">
        <path class="gauge__track" d="M10 60 A50 50 0 0 1 110 60" />
        <path
          class="gauge__fill"
          d="M10 60 A50 50 0 0 1 110 60"
          [style.stroke]="color()"
          [style.stroke-dasharray]="circumference"
          [style.stroke-dashoffset]="offset()"
        />
      </svg>
      <div class="gauge__value" [style.color]="color()">
        <strong>{{ score() }}</strong>
        <span>/100</span>
      </div>
      <div class="gauge__level">{{ levelLabel() }}</div>
    </div>
  `,
  styles: [
    `
      .gauge {
        position: relative;
        width: 148px;
        text-align: center;
      }
      .gauge--sm {
        width: 104px;
      }
      svg {
        width: 100%;
        display: block;
        overflow: visible;
      }
      path {
        fill: none;
        stroke-width: 9;
        stroke-linecap: round;
      }
      .gauge__track {
        stroke: var(--surface-3);
      }
      .gauge__fill {
        transition: stroke-dashoffset 0.6s cubic-bezier(0.22, 1, 0.36, 1);
      }
      .gauge__value {
        margin-top: -18px;
        font-variant-numeric: tabular-nums;
      }
      .gauge__value strong {
        font-size: 1.5rem;
        letter-spacing: -0.03em;
      }
      .gauge--sm .gauge__value strong {
        font-size: 1.15rem;
      }
      .gauge__value span {
        font-size: 0.74rem;
        color: var(--text-muted);
      }
      .gauge__level {
        font-size: 0.76rem;
        font-weight: 650;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-muted);
      }
    `,
  ],
})
export class RiskGaugeComponent {
  readonly score = input.required<number>();
  readonly compact = input(false, { transform: booleanAttribute });

  /** Longueur du demi-cercle de rayon 50. */
  readonly circumference = Math.PI * 50;

  readonly offset = computed(() => this.circumference * (1 - Math.min(100, Math.max(0, this.score())) / 100));

  readonly color = computed(() => {
    const s = this.score();
    if (s < 25) return 'var(--success)';
    if (s < 55) return 'var(--warning)';
    return 'var(--danger)';
  });

  readonly levelLabel = computed(() => {
    const s = this.score();
    return s < 25 ? 'Risque faible' : s < 55 ? 'Risque modéré' : 'Risque élevé';
  });
}

/* =========================================================================
   Barre de progression
   ========================================================================= */
@Component({
  selector: 'app-progress',
  standalone: true,
  template: `
    <div
      class="pg"
      role="progressbar"
      [attr.aria-valuenow]="value()"
      aria-valuemin="0"
      aria-valuemax="100"
      [attr.aria-label]="label()"
    >
      <div class="pg__fill" [style.width.%]="value()" [style.background]="color()"></div>
    </div>
  `,
  styles: [
    `
      .pg {
        height: 7px;
        border-radius: 999px;
        background: var(--surface-3);
        overflow: hidden;
      }
      .pg__fill {
        height: 100%;
        border-radius: 999px;
        transition: width 0.5s cubic-bezier(0.22, 1, 0.36, 1);
      }
    `,
  ],
})
export class ProgressBarComponent {
  readonly value = input.required<number>();
  readonly label = input('Progression');
  readonly color = input('var(--primary)');
}

/* =========================================================================
   Feuille modale (bottom sheet sur mobile, dialogue centré sur desktop)
   ========================================================================= */
@Component({
  selector: 'app-sheet',
  standalone: true,
  imports: [IconComponent],
  template: `
    @if (open()) {
      <div class="sheet-overlay" (click)="onOverlay($event)">
        <div class="sheet" role="dialog" aria-modal="true" [attr.aria-label]="title()" (click)="$event.stopPropagation()">
          <div class="sheet__grip" aria-hidden="true"></div>
          <header class="sheet__head">
            <h2>{{ title() }}</h2>
            <button type="button" class="btn btn--quiet btn--icon" (click)="close.emit()" aria-label="Fermer">
              <app-icon name="close" />
            </button>
          </header>
          <div class="sheet__body"><ng-content /></div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      @use 'mixins' as *;

      .sheet-overlay {
        position: fixed;
        inset: 0;
        z-index: 300;
        background: var(--overlay);
        display: flex;
        align-items: flex-end;
        justify-content: center;
        animation: fade 0.16s ease;

        @include up(768px) {
          align-items: center;
          padding: 24px;
        }
      }
      .sheet {
        width: 100%;
        max-height: 88vh;
        display: flex;
        flex-direction: column;
        background: var(--surface);
        border-radius: 20px 20px 0 0;
        box-shadow: var(--shadow-lg);
        animation: rise 0.22s cubic-bezier(0.22, 1, 0.36, 1);
        padding-bottom: var(--safe-bottom);

        @include up(768px) {
          max-width: 620px;
          border-radius: 18px;
          max-height: 84vh;
        }
      }
      .sheet__grip {
        width: 38px;
        height: 4px;
        border-radius: 999px;
        background: var(--border-strong);
        margin: 8px auto 0;

        @include up(768px) {
          display: none;
        }
      }
      .sheet__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 16px 8px;
        border-bottom: 1px solid var(--border);
      }
      .sheet__head h2 {
        font-size: 1.02rem;
      }
      .sheet__body {
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        padding: 16px;
      }
      @keyframes rise {
        from {
          transform: translateY(22px);
          opacity: 0.6;
        }
      }
      @keyframes fade {
        from {
          opacity: 0;
        }
      }
    `,
  ],
})
export class SheetComponent {
  readonly open = input.required<boolean>();
  readonly title = input('');
  readonly close = output<void>();

  onOverlay(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close.emit();
  }
}

/* =========================================================================
   Bloc repliable — l'animation est confiée à jQuery
   ========================================================================= */
@Component({
  selector: 'app-collapse',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="col">
      <button type="button" class="col__head" [attr.aria-expanded]="expanded()" (click)="toggle()">
        <span class="col__title">{{ title() }}</span>
        @if (badge()) {
          <span class="badge">{{ badge() }}</span>
        }
        <app-icon class="col__chev" [class.col__chev--open]="expanded()" name="chevronDown" />
      </button>
      <div class="col__body" #body>
        <ng-content />
      </div>
    </div>
  `,
  styles: [
    `
      .col {
        border: 1px solid var(--border);
        border-radius: 14px;
        background: var(--surface);
        overflow: hidden;
      }
      .col__head {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 13px 14px;
        background: transparent;
        border: 0;
        cursor: pointer;
        text-align: left;
        color: inherit;
      }
      .col__head:hover {
        background: var(--surface-2);
      }
      .col__title {
        flex: 1;
        min-width: 0;
        font-weight: 650;
        font-size: 0.92rem;
      }
      .col__chev {
        flex: 0 0 auto;
        color: var(--text-muted);
        transition: transform 0.2s ease;
        font-size: 0.8rem;
      }
      .col__chev--open {
        transform: rotate(180deg);
      }
      .col__body {
        padding: 0 14px 14px;
      }
    `,
  ],
})
export class CollapseComponent {
  private readonly ui = inject(UiService);

  readonly title = input.required<string>();
  readonly badge = input<string | number | null>(null);
  @Input({ transform: booleanAttribute }) set openByDefault(value: boolean) {
    this.expanded.set(value);
  }

  readonly expanded = signal(false);

  private readonly body = viewChild<ElementRef<HTMLElement>>('body');

  constructor() {
    // L'état initial est posé une seule fois, en style inline : ensuite c'est
    // jQuery qui pilote `display` pendant les animations de repli/dépli, et une
    // liaison Angular sur la même propriété entrerait en conflit avec lui.
    let initialised = false;
    effect(() => {
      const el = this.body()?.nativeElement;
      if (!el || initialised) return;
      initialised = true;
      el.style.display = this.expanded() ? 'block' : 'none';
    });
  }

  toggle(): void {
    const el = this.body()?.nativeElement;
    const wasExpanded = this.expanded();
    if (el) this.ui.toggleCollapse(el, wasExpanded);
    this.expanded.set(!wasExpanded);
  }
}
