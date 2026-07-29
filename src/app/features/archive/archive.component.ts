import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/i18n.service';
import { UiService } from '../../core/services/ui.service';
import { Store } from '../../core/store';
import { fileSize, sum, todayIso } from '../../core/utils';
import {
  EmptyStateComponent,
  PageHeaderComponent,
  SheetComponent,
  StatTileComponent,
} from '../../shared/components';
import { CategoryIconClassPipe, IconComponent } from '../../shared/icon.component';
import { FrDatePipe } from '../../shared/pipes';

@Component({
  selector: 'app-archive',
  standalone: true,
  imports: [
    RouterLink,
    TranslatePipe,
    PageHeaderComponent,
    StatTileComponent,
    EmptyStateComponent,
    SheetComponent,
    IconComponent,
    CategoryIconClassPipe,
    FrDatePipe,
  ],
  template: `
    <app-page-header
      [title]="'archive.title' | t"
      subtitle="Vos documents restent accessibles même si vous cessez d'utiliser le service."
    />

    <!-- Engagement de conservation -->
    <div class="card pledge" style="margin-top: 18px">
      <app-icon class="pledge__icon" name="lock" />
      <div>
        <h2>Conservation longue durée</h2>
        <p class="muted">
          Toutes vos données sont stockées localement, dans votre navigateur. Aucun serveur n'en détient de copie.
          Le mode archive verrouille les modifications tout en préservant la consultation, la recherche et l'export
          intégral.
        </p>
      </div>
    </div>

    <section class="tile-grid" style="margin-top: 16px">
      <app-stat label="Documents" [value]="allDocs().length" link="/coffre" />
      <app-stat label="Archivés" [value]="archived().length" link="/archives" />
      <app-stat label="Contrats clos" [value]="closedContracts().length" link="/contrats" />
      <app-stat label="Ancienneté" [value]="ageYears()" suffix="ans" link="/chronologie" />
    </section>

    <!-- Volume et durées -->
    <dl class="kv-list card" style="margin-top: 16px">
      <div class="kv"><dt>Volume total</dt><dd>{{ totalSize() }}</dd></div>
      <div class="kv"><dt>Document le plus ancien</dt><dd>{{ oldest() | frDate: 'long' }}</dd></div>
      <div class="kv"><dt>Dernière modification</dt><dd>{{ today | frDate: 'long' }}</dd></div>
      <div class="kv"><dt>Emplacement</dt><dd>Stockage local du navigateur</dd></div>
    </dl>

    <!-- Bascule du mode archive -->
    <div class="section-head"><h2>Mode archive</h2></div>
    <div class="card">
      <div class="row row--between wrap" style="gap: 12px">
        <div class="grow">
          <strong>{{ readOnly() ? 'Actif — lecture seule' : 'Inactif — modifications autorisées' }}</strong>
          <p class="muted" style="margin: 4px 0 0">
            @if (readOnly()) {
              Vos données sont figées. Import, modification et suppression sont bloqués ; la consultation, la
              recherche et l'export restent disponibles.
            } @else {
              Activez ce mode si vous cessez d'utiliser le service : vos documents deviennent consultables en lecture
              seule, sans risque de modification accidentelle.
            }
          </p>
        </div>
        <button
          type="button"
          class="btn"
          [class.btn--primary]="!readOnly()"
          [class.btn--ghost]="readOnly()"
          (click)="toggleReadOnly()"
        >
          <app-icon [name]="readOnly() ? 'edit' : 'lock'" />
          {{ readOnly() ? 'Réactiver les modifications' : 'Passer en lecture seule' }}
        </button>
      </div>
    </div>

    <!-- Export / import -->
    <div class="section-head"><h2>Portabilité des données</h2></div>
    <div class="card-grid">
      <div class="card">
        <app-icon class="port__icon" name="export" />
        <h3 style="font-size: 0.94rem; margin-top: 8px">Exporter</h3>
        <p class="muted" style="margin: 4px 0 12px">
          Un fichier JSON contenant l'intégralité de vos documents, contrats, échéances et analyses.
        </p>
        <button type="button" class="btn btn--sm btn--primary btn--block" (click)="exportAll()">
          <app-icon name="download" /> Télécharger l'archive
        </button>
      </div>

      <div class="card">
        <app-icon class="port__icon" name="import" />
        <h3 style="font-size: 0.94rem; margin-top: 8px">Restaurer</h3>
        <p class="muted" style="margin: 4px 0 12px">
          Recharger une archive exportée précédemment. Les données actuelles seront remplacées.
        </p>
        <label class="btn btn--sm btn--ghost btn--block">
          <input type="file" accept=".json,application/json" hidden (change)="importArchive($event)" />
          <app-icon name="upload" /> Choisir un fichier
        </label>
      </div>
    </div>

    <!-- Documents archivés -->
    <div class="section-head">
      <h2>Documents archivés</h2>
      <span class="muted">{{ archived().length }}</span>
    </div>

    @if (archived().length) {
      <div class="list">
        @for (d of archived(); track d.id) {
          <a class="row-card" [routerLink]="['/coffre', d.id]">
            <span class="row-card__icon"><app-icon [cls]="d.category | catIconClass" /></span>
            <span class="row-card__body">
              <span class="row-card__title">{{ d.name }}</span>
              <span class="row-card__meta">{{ d.issuer }} · {{ d.date | frDate }}</span>
            </span>
            <app-icon name="chevronRight" />
          </a>
        }
      </div>
    } @else {
      <app-empty
        icon="archive"
        title="Aucun document archivé"
        hint="Depuis la fiche d'un document, l'archivage le retire des vues courantes sans le supprimer."
      />
    }

    <!-- Confirmation de restauration -->
    <app-sheet [open]="!!pendingImport()" title="Restaurer cette archive ?" (close)="pendingImport.set(null)">
      <p>
        L'intégralité de vos données actuelles — documents, contrats, échéances, chronologie — sera remplacée par le
        contenu de l'archive. Cette action est irréversible.
      </p>
      <p class="muted">Pensez à exporter vos données actuelles au préalable si vous souhaitez les conserver.</p>
      <div class="row" style="margin-top: 16px">
        <button type="button" class="btn btn--ghost grow" (click)="pendingImport.set(null)">Annuler</button>
        <button type="button" class="btn btn--danger grow" (click)="confirmImport()">Remplacer mes données</button>
      </div>
    </app-sheet>
  `,
  styles: [
    `
      .pledge {
        display: flex;
        gap: 16px;
        align-items: flex-start;
      }
      .pledge__icon {
        font-size: 1.5rem;
        color: var(--primary);
        margin-top: 2px;
      }
      .pledge h2 {
        font-size: 1rem;
        margin-bottom: 5px;
      }
      .port__icon {
        font-size: 1.2rem;
        color: var(--primary);
        display: block;
      }
      label.btn {
        cursor: pointer;
      }
    `,
  ],
})
export class ArchiveComponent {
  private readonly store = inject(Store);
  private readonly ui = inject(UiService);

  readonly today = todayIso();
  readonly readOnly = this.store.readOnly;
  readonly allDocs = this.store.documents;

  readonly archived = computed(() =>
    this.allDocs()
      .filter((d) => d.archived)
      .sort((a, b) => b.date.localeCompare(a.date)),
  );

  readonly closedContracts = computed(() => this.store.contracts().filter((c) => c.status !== 'actif'));

  readonly totalSize = computed(() => fileSize(sum(this.allDocs().map((d) => d.sizeKb))));

  readonly oldest = computed(() => {
    const dates = this.allDocs().map((d) => d.date);
    return dates.length ? dates.sort()[0] : '';
  });

  readonly ageYears = computed(() => {
    const o = this.oldest();
    if (!o) return 0;
    return Math.max(1, new Date().getFullYear() - Number(o.slice(0, 4)));
  });

  readonly pendingImport = signal<string | null>(null);

  toggleReadOnly(): void {
    const next = !this.readOnly();
    this.store.setProfile({ readOnlyMode: next });
    next
      ? this.ui.warn('Mode archive activé', 'Vos données sont désormais en lecture seule.')
      : this.ui.success('Modifications réactivées');
  }

  exportAll(): void {
    const json = this.store.exportJson();
    void this.ui.download(`assistant-admin-archive-${this.today}.json`, json);
    this.ui.success('Archive exportée', 'Conservez ce fichier en lieu sûr.');
  }

  async importArchive(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      // On valide avant de proposer le remplacement, pour ne pas détruire des
      // données sur la foi d'un fichier illisible.
      JSON.parse(text);
      this.pendingImport.set(text);
    } catch {
      this.ui.error('Fichier illisible', "Ce fichier n'est pas une archive JSON valide.");
    }
  }

  confirmImport(): void {
    const raw = this.pendingImport();
    if (!raw) return;
    if (!this.store.importJson(raw)) {
      this.ui.error('Restauration impossible', "Le contenu ne correspond pas au format attendu.");
      return;
    }
    this.pendingImport.set(null);
    this.ui.success('Archive restaurée', 'Vos données ont été rechargées.');
  }
}
