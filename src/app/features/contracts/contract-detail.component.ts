import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CancellationLetter, ClauseSeverity } from '../../core/models';
import { AnalysisService } from '../../core/services/analysis.service';
import { LetterService, SendChannel } from '../../core/services/letter.service';
import { OffersService } from '../../core/services/offers.service';
import { UiService } from '../../core/services/ui.service';
import { Store } from '../../core/store';
import { daysUntil } from '../../core/utils';
import {
  CategoryBadgeComponent,
  EmptyStateComponent,
  PageHeaderComponent,
  RiskGaugeComponent,
  SheetComponent,
} from '../../shared/components';
import { CategoryIconClassPipe, DocTypeIconClassPipe, IconComponent } from '../../shared/icon.component';
import { EuroPipe, FrDatePipe, PercentPipe, RelativeDaysPipe } from '../../shared/pipes';
import { FEATURES } from '../../core/features';
import { ContractFormComponent } from './contract-form.component';

@Component({
  selector: 'app-contract-detail',
  standalone: true,
  imports: [
    RouterLink,
    PageHeaderComponent,
    RiskGaugeComponent,
    CategoryBadgeComponent,
    EmptyStateComponent,
    SheetComponent,
    IconComponent,
    CategoryIconClassPipe,
    DocTypeIconClassPipe,
    EuroPipe,
    FrDatePipe,
    PercentPipe,
    RelativeDaysPipe,
    ContractFormComponent,
  ],
  template: `
    @if (contract(); as c) {
      <app-page-header [title]="c.label" [subtitle]="c.provider" backTo="/contrats">
        <app-cat-badge [category]="c.category" />
        <button type="button" class="btn btn--sm btn--ghost" (click)="editOpen.set(true)">
          <app-icon name="edit" /> Modifier
        </button>
      </app-page-header>

      <app-contract-form
        [open]="editOpen()"
        [contract]="c"
        (close)="editOpen.set(false)"
        (updated)="editOpen.set(false)"
      />

      @if (c.status !== 'actif') {
        <div class="callout" style="margin-top: 14px">
          <app-icon class="callout__icon" name="archive" />
          <div>
            <strong>Contrat {{ c.status === 'resilie' ? 'résilié' : 'expiré' }}</strong>
            <p>
              @if (c.cancelledAt) {
                Résiliation enregistrée le {{ c.cancelledAt | frDate: 'long' }}.
              }
              @if (c.endDate) {
                Fin d'effet au {{ c.endDate | frDate: 'long' }}.
              }
            </p>
          </div>
        </div>
      }

      <!-- Score de risque -->
      @if (risk(); as r) {
        <div class="card riskcard" style="margin-top: 16px">
          <app-risk-gauge [score]="r.score" />
          <div class="riskcard__text">
            <h2>Score de risque contractuel</h2>
            <p class="muted">
              @switch (r.level) {
                @case ('faible') {
                  Ce contrat est peu contraignant : peu ou pas de clauses défavorables.
                }
                @case ('modere') {
                  Quelques points méritent votre attention avant le prochain renouvellement.
                }
                @default {
                  Ce contrat cumule plusieurs clauses défavorables. Une renégociation ou un changement se justifie.
                }
              }
            </p>
          </div>
        </div>

        <!-- Facteurs de risque -->
        @if (r.factors.length) {
          <div class="section-head"><h2>Ce qui pèse sur le score</h2></div>
          <div class="list">
            @for (f of r.factors; track f.label) {
              <div class="row-card factor">
                <span class="factor__points">+{{ f.points }}</span>
                <span class="row-card__body">
                  <span class="row-card__title">{{ f.label }}</span>
                  <span class="factor__detail">{{ f.detail }}</span>
                </span>
              </div>
            }
          </div>
        }
      }

      <!-- Clauses analysées -->
      @if (c.clauses.length) {
        <div class="section-head">
          <h2>Clauses analysées</h2>
          <span class="muted">{{ c.clauses.length }}</span>
        </div>
        <div class="list">
          @for (cl of c.clauses; track cl.id) {
            <div class="clause" [class]="'clause--' + cl.severity">
              <div class="clause__head">
                <app-icon [name]="severityIcon(cl.severity)" />
                <strong>{{ cl.title }}</strong>
                <span class="badge" [class]="'badge--' + severityTone(cl.severity)">{{ severityLabel(cl.severity) }}</span>
              </div>
              <blockquote class="clause__excerpt">{{ cl.excerpt }}</blockquote>
              <p class="clause__reason"><app-icon name="info" /> {{ cl.reason }}</p>
            </div>
          }
        </div>
      } @else {
        <div class="section-head"><h2>Clauses analysées</h2></div>
        <app-empty icon="success" title="Aucune clause problématique détectée" />
      }

      <!-- Caractéristiques -->
      <div class="section-head"><h2>Caractéristiques</h2></div>
      <dl class="kv-list card">
        <div class="kv"><dt>Coût mensuel</dt><dd>{{ c.monthlyCost | euro }}</dd></div>
        <div class="kv"><dt>Coût annuel</dt><dd>{{ c.monthlyCost * 12 | euro }}</dd></div>
        @if (c.previousMonthlyCost) {
          <div class="kv">
            <dt>Évolution sur un an</dt>
            <dd [class.text-danger]="evolution() > 0">{{ evolution() | pct: 1 }}</dd>
          </div>
        }
        @if (c.hiddenFees > 0) {
          <div class="kv"><dt>Frais annexes</dt><dd class="text-danger">{{ c.hiddenFees | euro }}</dd></div>
        }
        <div class="kv"><dt>Souscrit le</dt><dd>{{ c.startDate | frDate: 'long' }}</dd></div>
        @if (c.renewalDate) {
          <div class="kv">
            <dt>Prochaine échéance</dt>
            <dd>{{ c.renewalDate | frDate: 'long' }} ({{ daysLeft(c.renewalDate) | relDays }})</dd>
          </div>
        }
        @if (c.endDate) {
          <div class="kv"><dt>Fin d'engagement</dt><dd>{{ c.endDate | frDate: 'long' }}</dd></div>
        }
        <div class="kv"><dt>Engagement</dt><dd>{{ c.commitmentMonths || 'Aucun' }}{{ c.commitmentMonths ? ' mois' : '' }}</dd></div>
        <div class="kv"><dt>Préavis</dt><dd>{{ c.noticePeriodDays || 'Aucun' }}{{ c.noticePeriodDays ? ' jours' : '' }}</dd></div>
      </dl>

      <!-- Fenêtre de résiliation -->
      @if (c.status === 'actif' && c.renewalDate) {
        <div
          class="callout"
          [class.callout--success]="letters.canCancelAtRenewal(c)"
          [class.callout--danger]="!letters.canCancelAtRenewal(c)"
          style="margin-top: 14px"
        >
          <app-icon class="callout__icon" [name]="letters.canCancelAtRenewal(c) ? 'success' : 'warning'" />
          <div>
            @if (letters.canCancelAtRenewal(c)) {
              <strong>Vous pouvez encore résilier pour la prochaine échéance</strong>
              <p>
                Dernier jour utile : {{ noticeDeadline() | frDate: 'long' }} ({{ daysLeft(noticeDeadline()) | relDays }}).
              </p>
            } @else {
              <strong>Le préavis est dépassé pour cette échéance</strong>
              <p>
                Le contrat sera reconduit. La résiliation prendrait effet au
                {{ letters.effectiveDate(c) | frDate: 'long' }}.
              </p>
            }
          </div>
        </div>
      }

      <!-- Documents rattachés -->
      <div class="section-head"><h2>Documents rattachés</h2></div>
      @if (documents().length) {
        <div class="list">
          @for (d of documents(); track d.id) {
            <a class="row-card" [routerLink]="['/coffre', d.id]">
              <span class="row-card__icon"><app-icon [cls]="d.docType | docIconClass" /></span>
              <span class="row-card__body">
                <span class="row-card__title">{{ d.name }}</span>
                <span class="row-card__meta">{{ d.date | frDate }}</span>
              </span>
              <app-icon name="chevronRight" />
            </a>
          }
        </div>
      } @else {
        <app-empty icon="inbox" title="Aucune pièce archivée" hint="Ajoutez le contrat signé depuis le scanner.">
          <a class="btn btn--sm btn--primary" style="margin-top: 12px" routerLink="/scanner">Scanner un document</a>
        </app-empty>
      }

      <!-- Offres concurrentes -->
      @if (offersEnabled && c.status === 'actif' && offers().length) {
        <div class="section-head">
          <h2>Alternatives</h2>
          <a routerLink="/renouvellement">Tout comparer</a>
        </div>
        <div class="list">
          @for (o of offers(); track o.id) {
            <div class="row-card">
              <span class="row-card__icon"><app-icon [cls]="c.category | catIconClass" /></span>
              <span class="row-card__body">
                <span class="row-card__title">{{ o.provider }} — {{ o.label }}</span>
                <span class="row-card__meta">
                  @for (h of o.highlights; track h) {
                    <span class="badge">{{ h }}</span>
                  }
                </span>
              </span>
              <span class="row-card__side">
                <span class="row-card__amount">{{ o.monthlyCost | euro }}</span>
                @if (o.savingPerYear > 0) {
                  <span class="badge badge--success">−{{ o.savingPerYear | euro }}/an</span>
                }
              </span>
            </div>
          }
        </div>
      }

      <!-- Actions -->
      @if (c.status === 'actif') {
        <div class="row wrap" style="margin-top: 22px">
          <button type="button" class="btn btn--danger grow" (click)="openLetter()">
            <app-icon name="gavel" /> Résilier ce contrat
          </button>
          @if (offersEnabled) {
            <a class="btn btn--ghost" routerLink="/renouvellement"><app-icon name="scale" /> Comparer</a>
          }
        </div>
      }

      <!-- Lettre de résiliation -->
      <app-sheet [open]="letterOpen()" title="Lettre de résiliation" (close)="letterOpen.set(false)">
        @if (letter(); as l) {
          <dl class="kv-list" style="margin-bottom: 14px">
            <div class="kv"><dt>Destinataire</dt><dd class="letter__recipient">{{ l.recipient }}</dd></div>
            <div class="kv"><dt>Date d'effet</dt><dd>{{ l.effectiveDate | frDate: 'long' }}</dd></div>
          </dl>

          <div class="callout callout--info" style="margin-bottom: 14px">
            <app-icon class="callout__icon" name="info" />
            <div>
              <strong>Lettre pré-remplie avec vos données</strong>
              <p>
                Coordonnées, numéro de contrat et fondement juridique applicable sont insérés automatiquement.
                Relisez-la avant envoi.
              </p>
            </div>
          </div>

          <pre class="letter">{{ l.body }}</pre>

          <div class="row wrap" style="margin-top: 14px">
            <button type="button" class="btn btn--sm btn--ghost" (click)="copyLetter(l)">
              <app-icon name="copy" /> Copier
            </button>
            <button type="button" class="btn btn--sm btn--ghost" (click)="letters.print(l)">
              <app-icon name="print" /> Imprimer
            </button>
          </div>

          <hr />

          <p class="muted" style="margin-bottom: 10px">Comment souhaitez-vous l'envoyer ?</p>
          <div class="row wrap">
            <button type="button" class="btn btn--primary grow" (click)="send(l, 'email')">
              <app-icon name="mail" /> Par e-mail
            </button>
            <button type="button" class="btn btn--ghost grow" (click)="send(l, 'courrier')">
              <app-icon name="postal" /> En recommandé
            </button>
          </div>

          @if (sendFeedback(); as fb) {
            <div class="callout" [class.callout--success]="fb.ok" [class.callout--warning]="!fb.ok" style="margin-top: 14px">
              <app-icon class="callout__icon" [name]="fb.ok ? 'success' : 'warning'" />
              <div>
                <strong>{{ fb.ok ? 'Envoi préparé' : 'Envoi impossible' }}</strong>
                <p>{{ fb.message }}</p>
                @if (fb.tracking) {
                  <p>Numéro de suivi simulé : <code>{{ fb.tracking }}</code></p>
                }
              </div>
            </div>

            @if (fb.ok) {
              <button type="button" class="btn btn--danger btn--block" style="margin-top: 12px" (click)="markCancelled(l)">
                <app-icon name="check" /> Marquer ce contrat comme résilié
              </button>
            }
          }
        }
      </app-sheet>
    } @else {
      <app-empty icon="search" title="Contrat introuvable">
        <a class="btn btn--sm btn--primary" style="margin-top: 12px" routerLink="/contrats">Retour aux contrats</a>
      </app-empty>
    }
  `,
  styles: [
    `
      @use 'mixins' as *;

      .riskcard {
        display: flex;
        align-items: center;
        gap: 18px;
        flex-wrap: wrap;
      }
      .riskcard__text {
        flex: 1;
        min-width: 180px;
      }
      .riskcard__text h2 {
        font-size: 0.98rem;
        margin-bottom: 4px;
      }

      .factor {
        align-items: flex-start;
      }
      .factor__points {
        flex: 0 0 auto;
        min-width: 42px;
        padding: 4px 8px;
        border-radius: 8px;
        background: var(--danger-soft);
        color: var(--danger);
        font-weight: 700;
        font-size: 0.8rem;
        text-align: center;
        font-variant-numeric: tabular-nums;
      }
      .factor__detail {
        display: block;
        margin-top: 4px;
        font-size: 0.81rem;
        color: var(--text-muted);
        line-height: 1.5;
      }

      /* La gravité est déjà portée par l'icône et le badge de l'en-tête :
         le liseré gauche coloré n'apportait qu'une bordure de plus. */
      .clause {
        padding: 14px;
        border-radius: 14px;
        background: var(--surface);
        border: 1px solid var(--border);
      }
      .clause__head {
        display: flex;
        align-items: center;
        gap: 9px;
        flex-wrap: wrap;
        margin-bottom: 8px;
      }
      .clause__head strong {
        flex: 1;
        min-width: 0;
        font-size: 0.92rem;
      }
      .clause--info .clause__head app-icon {
        color: var(--info);
      }
      .clause--attention .clause__head app-icon {
        color: var(--warning);
      }
      .clause--risque .clause__head app-icon {
        color: var(--danger);
      }
      .clause__excerpt {
        margin: 0 0 8px;
        padding: 9px 12px;
        border-radius: 9px;
        background: var(--surface-2);
        font-size: 0.83rem;
        line-height: 1.55;
        font-style: italic;
        color: var(--text-soft);
      }
      .clause__reason {
        display: flex;
        gap: 8px;
        margin: 0;
        font-size: 0.82rem;
        color: var(--text-muted);
        line-height: 1.5;
      }
      .clause__reason app-icon {
        margin-top: 3px;
        font-size: 0.75rem;
      }

      .letter {
        margin: 0;
        padding: 16px;
        background: var(--surface-2);
        border-radius: 12px;
        font-family: Georgia, 'Times New Roman', serif;
        font-size: 0.82rem;
        line-height: 1.7;
        white-space: pre-wrap;
        word-break: break-word;
        max-height: 300px;
        overflow: auto;
      }
      .letter__recipient {
        text-align: right;
        font-weight: 500 !important;
        font-size: 0.8rem;
        max-width: 60%;
      }

      .text-danger {
        color: var(--danger);
      }
    `,
  ],
})
export class ContractDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly store = inject(Store);
  private readonly analysis = inject(AnalysisService);
  private readonly offersService = inject(OffersService);

  /** Comparateur d'offres : voir core/features.ts. */
  protected readonly offersEnabled = FEATURES.offers;

  /** Feuille de modification du contrat. */
  readonly editOpen = signal(false);
  protected readonly letters = inject(LetterService);
  private readonly ui = inject(UiService);

  private readonly id = this.route.snapshot.paramMap.get('id') ?? '';

  readonly contract = computed(() => this.store.contracts().find((c) => c.id === this.id));
  readonly risk = computed(() => {
    const c = this.contract();
    return c ? this.analysis.assessRisk(c) : null;
  });

  readonly documents = computed(() => {
    const c = this.contract();
    if (!c) return [];
    return this.store.documents().filter((d) => c.documentIds.includes(d.id));
  });

  readonly offers = computed(() => {
    const c = this.contract();
    return c ? this.offersService.compare(c) : [];
  });

  readonly evolution = computed(() => {
    const c = this.contract();
    if (!c?.previousMonthlyCost) return 0;
    return ((c.monthlyCost - c.previousMonthlyCost) / c.previousMonthlyCost) * 100;
  });

  readonly noticeDeadline = computed(() => {
    const c = this.contract();
    if (!c?.renewalDate) return '';
    const d = new Date(c.renewalDate);
    d.setDate(d.getDate() - c.noticePeriodDays);
    return d.toISOString().slice(0, 10);
  });

  readonly letterOpen = signal(false);
  readonly letter = signal<CancellationLetter | null>(null);
  readonly sendFeedback = signal<{ ok: boolean; message: string; tracking?: string } | null>(null);

  daysLeft(iso: string): number {
    return daysUntil(iso);
  }

  severityLabel(s: ClauseSeverity): string {
    return s === 'risque' ? 'Risque' : s === 'attention' ? 'Attention' : 'Information';
  }

  severityTone(s: ClauseSeverity): string {
    return s === 'risque' ? 'danger' : s === 'attention' ? 'warning' : 'info';
  }

  severityIcon(s: ClauseSeverity): 'danger' | 'warning' | 'info' {
    return s === 'risque' ? 'danger' : s === 'attention' ? 'warning' : 'info';
  }

  openLetter(): void {
    const c = this.contract();
    if (!c) return;
    this.letter.set(this.letters.build(c));
    this.sendFeedback.set(null);
    this.letterOpen.set(true);
  }

  async copyLetter(l: CancellationLetter): Promise<void> {
    const ok = await this.ui.copy(l.body);
    ok ? this.ui.success('Lettre copiée') : this.ui.error('Copie impossible');
  }

  send(l: CancellationLetter, channel: SendChannel): void {
    const c = this.contract();
    if (!c) return;
    const result = this.letters.send(c, l, channel);
    this.sendFeedback.set({ ok: result.ok, message: result.message, tracking: result.tracking });
    result.ok
      ? this.ui.success(channel === 'email' ? 'Messagerie ouverte' : 'Recommandé simulé', result.message)
      : this.ui.warn('Envoi impossible', result.message);
  }

  markCancelled(l: CancellationLetter): void {
    const c = this.contract();
    if (!c) return;
    if (!this.letters.markCancelled(c, l)) {
      this.ui.readOnlyBlocked();
      return;
    }
    this.letterOpen.set(false);
    this.ui.success('Contrat marqué comme résilié', 'Une échéance de vérification a été ajoutée au calendrier.');
  }
}
