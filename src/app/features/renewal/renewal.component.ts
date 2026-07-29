import { LowerCasePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/i18n.service';
import { Contract } from '../../core/models';
import { LetterService } from '../../core/services/letter.service';
import { OffersService } from '../../core/services/offers.service';
import { UiService } from '../../core/services/ui.service';
import { Store } from '../../core/store';
import { CategoryBadgeComponent, EmptyStateComponent, PageHeaderComponent } from '../../shared/components';
import { CategoryIconClassPipe, IconComponent } from '../../shared/icon.component';
import { EuroPipe, RelativeDaysPipe } from '../../shared/pipes';

@Component({
  selector: 'app-renewal',
  standalone: true,
  imports: [
    RouterLink,
    LowerCasePipe,
    TranslatePipe,
    PageHeaderComponent,
    CategoryBadgeComponent,
    EmptyStateComponent,
    IconComponent,
    CategoryIconClassPipe,
    EuroPipe,
    RelativeDaysPipe,
  ],
  template: `
    <app-page-header
      [title]="'renewal.title' | t"
      subtitle="Avant chaque expiration, les alternatives du marché sont mises en regard de votre contrat."
    />

    <!-- Transparence sur le modèle économique -->
    <div class="callout callout--info" style="margin-top: 16px">
      <app-icon class="callout__icon" name="info" />
      <div>
        <strong>Transparence sur les offres</strong>
        <p>
          Certaines offres sont signalées « partenaire » : leur souscription donnerait lieu à une commission
          d'affiliation. Le classement reste établi sur l'économie annuelle réelle, jamais sur la rémunération.
          Ce catalogue est fictif dans cette démonstration.
        </p>
      </div>
    </div>

    <!-- Contrats arrivant à échéance -->
    @if (opportunities().length) {
      @for (opp of opportunities(); track opp.contract.id) {
        <div class="card opp" style="margin-top: 16px">
          <div class="opp__head">
            <span class="row-card__icon"><app-icon [cls]="opp.contract.category | catIconClass" /></span>
            <div class="grow">
              <strong>{{ opp.contract.label }} — {{ opp.contract.provider }}</strong>
              <div class="row wrap" style="margin-top: 4px">
                <app-cat-badge [category]="opp.contract.category" />
                <span class="badge" [class.badge--danger]="opp.daysLeft <= 30" [class.badge--warning]="opp.daysLeft > 30">
                  Expire {{ opp.daysLeft | relDays }}
                </span>
              </div>
            </div>
          </div>

          <p class="opp__pitch">
            Votre {{ opp.contract.label | lowercase }} expire dans {{ opp.daysLeft }} jours. Voici
            {{ opp.offers.length }} offres concurrentes.
          </p>

          <!-- Contrat actuel en référence -->
          <div class="offer offer--current">
            <div class="offer__main">
              <strong>{{ opp.contract.provider }}</strong>
              <span class="badge">Votre contrat actuel</span>
            </div>
            <div class="offer__price">
              <span class="offer__amount">{{ opp.contract.monthlyCost | euro }}</span>
              <span class="offer__unit">/ mois</span>
            </div>
          </div>

          @for (o of opp.offers; track o.id; let i = $index) {
            <div class="offer" [class.offer--best]="i === 0 && o.savingPerYear > 0">
              <div class="offer__main">
                <div class="row wrap" style="gap: 7px">
                  <strong>{{ o.provider }}</strong>
                  @if (i === 0 && o.savingPerYear > 0) {
                    <span class="badge badge--success">Meilleure offre</span>
                  }
                  @if (o.affiliate) {
                    <span class="badge badge--info" title="Une commission d'affiliation serait perçue">Partenaire</span>
                  }
                </div>
                <div class="offer__label">{{ o.label }}</div>
                <div class="offer__rating">
                  <app-icon name="star" /> {{ o.rating.toFixed(1) }}
                </div>
                <div class="row wrap" style="margin-top: 7px">
                  @for (h of o.highlights; track h) {
                    <span class="badge">{{ h }}</span>
                  }
                </div>
              </div>
              <div class="offer__price">
                <span class="offer__amount">{{ o.monthlyCost | euro }}</span>
                <span class="offer__unit">/ mois</span>
                @if (o.savingPerYear > 0) {
                  <span class="badge badge--success offer__saving">−{{ o.savingPerYear | euro }}/an</span>
                } @else {
                  <span class="badge offer__saving">+{{ -o.savingPerYear | euro }}/an</span>
                }
              </div>
            </div>
          }

          <div class="row wrap" style="margin-top: 14px">
            <a class="btn btn--ghost" [routerLink]="['/contrats', opp.contract.id]">
              <app-icon name="eye" /> Voir mon contrat
            </a>
            <button type="button" class="btn btn--primary" (click)="prepareSwitch(opp.contract)">
              <app-icon name="gavel" /> Préparer la résiliation
            </button>
          </div>

          @if (noticeInfo()[opp.contract.id]; as info) {
            <div class="callout" [class.callout--success]="info.ok" [class.callout--warning]="!info.ok" style="margin-top: 12px">
              <app-icon class="callout__icon" [name]="info.ok ? 'success' : 'warning'" />
              <div>
                <strong>{{ info.title }}</strong>
                <p>{{ info.body }}</p>
              </div>
            </div>
          }
        </div>
      }
    } @else {
      <app-empty
        icon="success"
        title="Aucun contrat n'arrive à échéance"
        hint="Les alternatives apparaissent automatiquement dans les 60 jours précédant une expiration."
      >
        <a class="btn btn--sm btn--primary" style="margin-top: 12px" routerLink="/contrats">Voir mes contrats</a>
      </app-empty>
    }

    <!-- Comparaison libre de tous les contrats actifs -->
    <div class="section-head"><h2>Comparer un autre contrat</h2></div>
    <div class="list">
      @for (c of otherContracts(); track c.id) {
        <button type="button" class="row-card" style="width: 100%; text-align: left" (click)="toggleExpanded(c.id)">
          <span class="row-card__icon"><app-icon [cls]="c.category | catIconClass" /></span>
          <span class="row-card__body">
            <span class="row-card__title">{{ c.label }} — {{ c.provider }}</span>
            <span class="row-card__meta">
              <span>{{ c.monthlyCost | euro }} / mois</span>
              @if (bestSaving(c); as s) {
                @if (s > 0) {
                  <span class="badge badge--success">Jusqu'à −{{ s | euro }}/an</span>
                }
              }
            </span>
          </span>
          <app-icon [name]="expanded().includes(c.id) ? 'chevronDown' : 'chevronRight'" />
        </button>

        @if (expanded().includes(c.id)) {
          <div class="card" style="margin-bottom: 8px">
            @for (o of compare(c); track o.id) {
              <div class="offer">
                <div class="offer__main">
                  <div class="row wrap" style="gap: 7px">
                    <strong>{{ o.provider }}</strong>
                    @if (o.affiliate) {
                      <span class="badge badge--info">Partenaire</span>
                    }
                  </div>
                  <div class="offer__label">{{ o.label }}</div>
                </div>
                <div class="offer__price">
                  <span class="offer__amount">{{ o.monthlyCost | euro }}</span>
                  @if (o.savingPerYear > 0) {
                    <span class="badge badge--success offer__saving">−{{ o.savingPerYear | euro }}/an</span>
                  }
                </div>
              </div>
            } @empty {
              <p class="muted" style="margin: 0">Aucune offre concurrente répertoriée pour cette catégorie.</p>
            }
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      .opp__head {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 10px;
      }
      .opp__pitch {
        margin: 0 0 14px;
        padding: 11px 13px;
        border-radius: 10px;
        background: var(--primary-soft);
        color: var(--text);
        font-size: 0.88rem;
        font-weight: 600;
        line-height: 1.5;
      }

      .offer {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 14px;
        padding: 12px 0;
        border-bottom: 1px solid var(--border);

        &:last-child {
          border-bottom: 0;
        }
      }
      .offer--current {
        opacity: 0.75;
      }
      .offer--best {
        margin: 0 -8px;
        padding-left: 8px;
        padding-right: 8px;
        border-radius: 10px;
        background: var(--success-soft);
        border-bottom-color: transparent;
      }
      .offer__main {
        flex: 1;
        min-width: 0;
      }
      .offer__label {
        margin-top: 2px;
        font-size: 0.82rem;
        color: var(--text-muted);
      }
      .offer__rating {
        display: flex;
        align-items: center;
        gap: 5px;
        margin-top: 4px;
        font-size: 0.78rem;
        color: var(--warning);
        font-weight: 650;
      }
      .offer__price {
        flex: 0 0 auto;
        text-align: right;
      }
      .offer__amount {
        font-size: 1rem;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .offer__unit {
        display: block;
        font-size: 0.72rem;
        color: var(--text-muted);
      }
      .offer__saving {
        margin-top: 5px;
      }
    `,
  ],
})
export class RenewalComponent {
  private readonly offers = inject(OffersService);
  private readonly store = inject(Store);
  private readonly letters = inject(LetterService);
  private readonly ui = inject(UiService);

  readonly opportunities = this.offers.opportunities;
  readonly expanded = signal<string[]>([]);
  readonly noticeInfo = signal<Record<string, { ok: boolean; title: string; body: string }>>({});

  /** Contrats actifs non déjà listés comme opportunités. */
  readonly otherContracts = computed(() => {
    const urgent = new Set(this.opportunities().map((o) => o.contract.id));
    return this.store.activeContracts().filter((c) => !urgent.has(c.id));
  });

  compare(contract: Contract) {
    return this.offers.compare(contract);
  }

  bestSaving(contract: Contract): number {
    return this.offers.compare(contract, 1)[0]?.savingPerYear ?? 0;
  }

  toggleExpanded(id: string): void {
    this.expanded.update((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  /** Explique la fenêtre de préavis avant d'envoyer l'utilisateur sur la lettre. */
  prepareSwitch(contract: Contract): void {
    const canCancel = this.letters.canCancelAtRenewal(contract);
    const effective = this.letters.effectiveDate(contract);

    this.noticeInfo.update((map) => ({
      ...map,
      [contract.id]: canCancel
        ? {
            ok: true,
            title: 'Le préavis peut encore être respecté',
            body: `En envoyant la lettre maintenant, la résiliation prendra effet le ${fr(effective)}. Ouvrez la fiche du contrat pour générer le courrier pré-rempli.`,
          }
        : {
            ok: false,
            title: 'Préavis dépassé pour cette échéance',
            body: `Le contrat sera reconduit. La résiliation prendrait effet le ${fr(effective)}. Selon le type de contrat, la loi Hamon peut permettre de résilier à tout moment après un an.`,
          },
    }));

    this.ui.info('Fenêtre de résiliation calculée', 'Ouvrez la fiche du contrat pour générer la lettre.');
  }
}

function fr(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
