import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { I18nService, TranslatePipe } from '../../core/i18n/i18n.service';
import { UiService } from '../../core/services/ui.service';
import { Store } from '../../core/store';
import { PageHeaderComponent, SheetComponent } from '../../shared/components';
import { IconComponent } from '../../shared/icon.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [RouterLink, FormsModule, TranslatePipe, PageHeaderComponent, SheetComponent, IconComponent],
  template: `
    <app-page-header [title]="'settings.title' | t" subtitle="Profil, apparence, langue et données." />

    <!-- Profil -->
    <div class="section-head"><h2>Profil</h2></div>
    <div class="card">
      <p class="muted" style="margin-bottom: 14px">
        Ces informations alimentent les lettres de résiliation et les démarches pré-remplies.
      </p>

      <div class="grid2">
        <div class="field">
          <label for="p-first">Prénom</label>
          <input id="p-first" class="input" [(ngModel)]="draft.firstName" />
        </div>
        <div class="field">
          <label for="p-last">Nom</label>
          <input id="p-last" class="input" [(ngModel)]="draft.lastName" />
        </div>
      </div>

      <div class="field">
        <label for="p-mail">Adresse e-mail</label>
        <input id="p-mail" class="input" type="email" [(ngModel)]="draft.email" />
      </div>
      <div class="field">
        <label for="p-addr">Adresse</label>
        <input id="p-addr" class="input" [(ngModel)]="draft.address" />
      </div>

      <div class="grid2">
        <div class="field">
          <label for="p-cp">Code postal</label>
          <input id="p-cp" class="input" [(ngModel)]="draft.postalCode" />
        </div>
        <div class="field">
          <label for="p-city">Ville</label>
          <input id="p-city" class="input" [(ngModel)]="draft.city" />
        </div>
      </div>

      <div class="grid2">
        <div class="field">
          <label for="p-phone">Téléphone</label>
          <input id="p-phone" class="input" [(ngModel)]="draft.phone" />
        </div>
        <div class="field">
          <label for="p-birth">Date de naissance</label>
          <input id="p-birth" class="input" type="date" [(ngModel)]="draft.birthDate" />
        </div>
      </div>

      <button type="button" class="btn btn--primary" (click)="saveProfile()">
        <app-icon name="check" /> Enregistrer
      </button>
    </div>

    <!-- Apparence -->
    <div class="section-head"><h2>Apparence</h2></div>
    <div class="card">
      <div class="row row--between wrap" style="gap: 12px">
        <div class="grow">
          <strong>Thème</strong>
          <p class="muted" style="margin: 3px 0 0">
            Bleu nuit et sable — le mode sombre inverse les rôles des deux couleurs.
          </p>
        </div>
        <div class="segmented">
          <button
            type="button"
            class="segmented__btn"
            [class.segmented__btn--active]="ui.theme() === 'light'"
            (click)="setTheme('light')"
          >
            <app-icon name="themeLight" /> Clair
          </button>
          <button
            type="button"
            class="segmented__btn"
            [class.segmented__btn--active]="ui.theme() === 'dark'"
            (click)="setTheme('dark')"
          >
            <app-icon name="themeDark" /> Sombre
          </button>
        </div>
      </div>

      <div class="swatches">
        <div class="swatch"><span style="background: #0a1c31"></span><code>#0a1c31</code></div>
        <div class="swatch"><span style="background: #f0e0c4"></span><code>#f0e0c4</code></div>
      </div>
    </div>

    <!-- Langue -->
    <div class="section-head"><h2>{{ 'app.language' | t }}</h2></div>
    <div class="card">
      <p class="muted" style="margin-bottom: 12px">
        Le changement est immédiat. Les traductions manquantes retombent automatiquement sur le français, ce qui
        permet d'ajouter une langue progressivement.
      </p>
      <div class="row wrap">
        @for (loc of i18n.available; track loc.code) {
          <button
            type="button"
            class="chip"
            [class.chip--active]="i18n.locale() === loc.code"
            (click)="i18n.setLocale(loc.code)"
            [attr.aria-pressed]="i18n.locale() === loc.code"
          >
            {{ loc.label }} <span class="muted">({{ loc.tag }})</span>
          </button>
        }
      </div>
    </div>

    <!-- Données -->
    <div class="section-head"><h2>Données</h2></div>
    <div class="card">
      <div class="datastat">
        <span><strong>{{ counts().documents }}</strong> documents</span>
        <span><strong>{{ counts().contracts }}</strong> contrats</span>
        <span><strong>{{ counts().deadlines }}</strong> échéances</span>
        <span><strong>{{ counts().members }}</strong> membres</span>
      </div>

      <div class="callout callout--info" style="margin: 14px 0">
        <app-icon class="callout__icon" name="info" />
        <div>
          <strong>Tout est stocké localement</strong>
          <p>
            Aucune donnée n'est transmise à un serveur. Vider le stockage du navigateur effacerait l'application —
            exportez régulièrement votre archive.
          </p>
        </div>
      </div>

      <div class="row wrap">
        <a class="btn btn--ghost" routerLink="/archives"><app-icon name="export" /> Exporter mes données</a>
        <button type="button" class="btn btn--danger" (click)="confirmReset.set(true)">
          <app-icon name="refresh" /> Réinitialiser la démonstration
        </button>
      </div>
    </div>

    <p class="footnote">
      Application de démonstration. Les fournisseurs, montants, contrats et offres sont fictifs ; les références
      juridiques citées dans les lettres de résiliation renvoient au droit français en vigueur et ne valent pas
      conseil juridique.
    </p>

    <app-sheet [open]="confirmReset()" title="Réinitialiser ?" (close)="confirmReset.set(false)">
      <p>
        Toutes vos données seront remplacées par le jeu de démonstration d'origine. Les documents que vous avez
        importés seront perdus.
      </p>
      <div class="row" style="margin-top: 16px">
        <button type="button" class="btn btn--ghost grow" (click)="confirmReset.set(false)">Annuler</button>
        <button type="button" class="btn btn--danger grow" (click)="reset()">Réinitialiser</button>
      </div>
    </app-sheet>
  `,
  styles: [
    `
      @use 'mixins' as *;

      .grid2 {
        display: grid;
        gap: 0 14px;
        grid-template-columns: minmax(0, 1fr);

        @include up(600px) {
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        }
      }

      .segmented {
        display: inline-flex;
        padding: 3px;
        border-radius: 12px;
        background: var(--surface-2);
        gap: 3px;
      }
      .segmented__btn {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 8px 14px;
        border: 0;
        border-radius: 9px;
        background: transparent;
        color: var(--text-muted);
        font-size: 0.84rem;
        font-weight: 620;
        cursor: pointer;
      }
      .segmented__btn--active {
        background: var(--surface);
        color: var(--text);
        box-shadow: var(--shadow-sm);
      }

      .swatches {
        display: flex;
        gap: 14px;
        margin-top: 16px;
        padding-top: 14px;
        border-top: 1px solid var(--border);
      }
      .swatch {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.78rem;
      }
      .swatch span {
        width: 30px;
        height: 30px;
        border-radius: 8px;
        border: 1px solid var(--border-strong);
      }

      .datastat {
        display: flex;
        flex-wrap: wrap;
        gap: 18px;
        font-size: 0.85rem;
        color: var(--text-muted);
      }
      .datastat strong {
        color: var(--text);
        font-size: 1.05rem;
        font-variant-numeric: tabular-nums;
      }

      .footnote {
        margin-top: 26px;
        font-size: 0.76rem;
        color: var(--text-muted);
        line-height: 1.6;
      }
    `,
  ],
})
export class SettingsComponent {
  private readonly store = inject(Store);
  protected readonly ui = inject(UiService);
  protected readonly i18n = inject(I18nService);

  readonly confirmReset = signal(false);

  /** Copie éditable du profil ; rien n'est écrit tant qu'on n'enregistre pas. */
  draft = { ...this.store.profile() };

  readonly counts = computed(() => ({
    documents: this.store.documents().length,
    contracts: this.store.contracts().length,
    deadlines: this.store.deadlines().length,
    members: this.store.members().length,
  }));

  setTheme(theme: 'light' | 'dark'): void {
    if (this.ui.theme() !== theme) this.ui.toggleTheme();
  }

  saveProfile(): void {
    this.store.setProfile({ ...this.draft });
    this.ui.success('Profil enregistré', 'Vos lettres et démarches utiliseront ces coordonnées.');
  }

  reset(): void {
    this.store.reset();
    this.draft = { ...this.store.profile() };
    this.confirmReset.set(false);
    this.ui.info('Démonstration réinitialisée');
  }
}
