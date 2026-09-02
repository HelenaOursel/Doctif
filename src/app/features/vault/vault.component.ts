import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/i18n.service';
import { CATEGORIES } from '../../core/models';
import { ClassifierService } from '../../core/services/classifier.service';
import { ExtractionService } from '../../core/services/extraction.service';
import { FileService } from '../../core/services/file.service';
import { SearchService } from '../../core/services/search.service';
import { SyncService } from '../../core/services/sync.service';
import { UiService } from '../../core/services/ui.service';
import { Store } from '../../core/store';
import {
  EmptyStateComponent,
  PageHeaderComponent,
  SheetComponent,
} from '../../shared/components';
import { CategoryIconClassPipe, IconComponent } from '../../shared/icon.component';
import { CategoryColorPipe, CategoryLabelPipe, EuroPipe, FrDatePipe, HighlightPipe } from '../../shared/pipes';

@Component({
  selector: 'app-vault',
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
    CategoryColorPipe,
    CategoryLabelPipe,
    EuroPipe,
    FrDatePipe,
    HighlightPipe,
  ],
  template: `
    <app-page-header [title]="'vault.title' | t" [subtitle]="'vault.subtitle' | t: { count: total() }">
      <button type="button" class="btn btn--sm btn--ghost" (click)="filtersOpen.set(true)">
        <app-icon name="filter" /> {{ 'vault.filters' | t }}
        @if (search.hasActiveFilters()) {
          <span class="dot-marker" aria-hidden="true"></span>
        }
      </button>
    </app-page-header>

    <!-- Zone de dépôt -->
    <div
      class="dropzone"
      [class.dropzone--over]="dragOver()"
      (dragover)="onDragOver($event)"
      (dragleave)="dragOver.set(false)"
      (drop)="onDrop($event)"
    >
      <label class="dropzone__label">
        <input
          type="file"
          multiple
          hidden
          (change)="onPick($event)"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.eml,.csv,.md"
        />
        <app-icon class="dropzone__icon" name="upload" />
        <span>
          <strong>{{ 'vault.dropHint' | t }}</strong>
        </span>
        <span class="btn btn--sm btn--primary dropzone__cta">
          <app-icon name="import" /> {{ 'vault.import' | t }}
        </span>
      </label>
      @if (importing()) {
        <p class="dropzone__status"><app-icon name="refresh" /> Analyse en cours…</p>
      }
    </div>

    <!-- Recherche plein texte -->
    <div class="searchbar">
      <app-icon name="search" />
      <input
        class="input"
        type="search"
        [placeholder]="'vault.searchPlaceholder' | t"
        [ngModel]="search.query()"
        (ngModelChange)="search.setQuery($event)"
        [attr.aria-label]="'vault.searchPlaceholder' | t"
      />
      @if (search.query()) {
        <button type="button" class="btn btn--quiet btn--sm" (click)="search.setQuery('')" aria-label="Effacer">
          <app-icon name="close" />
        </button>
      }
    </div>

    <!-- Filtres rapides par catégorie -->
    <div class="scroll-x" style="margin: 12px 0">
      <button
        type="button"
        class="chip"
        [class.chip--active]="search.filters().categories.length === 0"
        (click)="search.patchFilters({ categories: [] })"
      >
        {{ 'common.all' | t }}
      </button>
      @for (cat of categories; track cat) {
        <button
          type="button"
          class="chip"
          [class.chip--active]="search.filters().categories.includes(cat)"
          (click)="search.toggleCategory(cat)"
        >
          <app-icon [cls]="cat | catIconClass" />
          {{ cat | catLabel }}
        </button>
      }
    </div>

    @if (search.query() || search.hasActiveFilters()) {
      <p class="muted">{{ 'vault.results' | t: { count: results().length } }}</p>
    }

    <!-- Résultats -->
    @if (results().length) {
      <div class="list">
        @for (hit of results(); track hit.document.id) {
          <a class="row-card" [routerLink]="['/coffre', hit.document.id]">
            @if (hit.document.thumbnail) {
              <img class="row-card__thumb" [src]="hit.document.thumbnail" alt="" />
            } @else {
              <span class="row-card__icon row-card__icon--cat" [style.--c]="hit.document.category | catColor">
                <app-icon [cls]="hit.document.category | catIconClass" />
              </span>
            }
            <span class="row-card__body">
              <span class="row-card__title">
                @for (seg of hit.document.name | highlight: search.query(); track $index) {
                  @if (seg.hit) {
                    <mark class="hit">{{ seg.text }}</mark>
                  } @else {
                    {{ seg.text }}
                  }
                }
              </span>
              <span class="row-card__meta">
                <span>{{ hit.document.issuer }}</span>
                <span>· {{ hit.document.date | frDate }}</span>
                @if (hit.document.archived) {
                  <span class="badge">Archivé</span>
                }
              </span>
              @if (search.query() && hit.excerpt) {
                <span class="row-card__excerpt">
                  @for (seg of hit.excerpt | highlight: search.query(); track $index) {
                    @if (seg.hit) {
                      <mark class="hit">{{ seg.text }}</mark>
                    } @else {
                      {{ seg.text }}
                    }
                  }
                </span>
              }
            </span>
            <span class="row-card__side">
              @if (hit.document.amount) {
                <span class="row-card__amount">{{ hit.document.amount | euro }}</span>
              }
            </span>
          </a>
        }
      </div>
    } @else {
      <app-empty icon="search" [title]="'vault.empty' | t" hint="Essayez un autre terme, ou élargissez les filtres.">
        @if (search.hasActiveFilters() || search.query()) {
          <button type="button" class="btn btn--sm btn--ghost" style="margin-top: 12px" (click)="search.reset()">
            <app-icon name="refresh" /> {{ 'action.reset' | t }}
          </button>
        }
      </app-empty>
    }

    <!-- Panneau de filtres -->
    <app-sheet [open]="filtersOpen()" [title]="'vault.filters' | t" (close)="filtersOpen.set(false)">
      <div class="field">
        <label for="f-from">Depuis le</label>
        <input
          id="f-from"
          class="input"
          type="date"
          [ngModel]="search.filters().from ?? ''"
          (ngModelChange)="search.patchFilters({ from: $event || undefined })"
        />
      </div>
      <div class="field">
        <label for="f-to">Jusqu'au</label>
        <input
          id="f-to"
          class="input"
          type="date"
          [ngModel]="search.filters().to ?? ''"
          (ngModelChange)="search.patchFilters({ to: $event || undefined })"
        />
      </div>

      <label class="switch">
        <input
          type="checkbox"
          [ngModel]="search.filters().includeArchived"
          (ngModelChange)="search.patchFilters({ includeArchived: $event })"
        />
        <span>{{ 'vault.includeArchived' | t }}</span>
      </label>

      <label class="switch">
        <input
          type="checkbox"
          [ngModel]="search.filters().onlyShared"
          (ngModelChange)="search.patchFilters({ onlyShared: $event })"
        />
        <span>{{ 'vault.onlyShared' | t }}</span>
      </label>

      <div class="row" style="margin-top: 18px">
        <button type="button" class="btn btn--ghost grow" (click)="search.resetFilters()">
          {{ 'action.reset' | t }}
        </button>
        <button type="button" class="btn btn--primary grow" (click)="filtersOpen.set(false)">
          {{ 'action.close' | t }}
        </button>
      </div>
    </app-sheet>
  `,
  styles: [
    `
      @use 'mixins' as *;

      .dropzone {
        margin: 16px 0 12px;
        border: 2px dashed var(--border-strong);
        border-radius: 16px;
        background: var(--surface);
        padding: 18px;
        transition:
          border-color 0.16s ease,
          background-color 0.16s ease;
      }
      .dropzone--over {
        border-color: var(--primary);
        background: var(--primary-soft);
      }
      .dropzone__label {
        display: flex;
        align-items: center;
        gap: 13px;
        cursor: pointer;
        flex-wrap: wrap;
      }
      .dropzone__icon {
        font-size: 1.4rem;
        color: var(--text-muted);
      }
      .dropzone__label > span:nth-child(3) {
        flex: 1;
        min-width: 0;
      }
      .dropzone__label strong {
        display: block;
        font-size: 0.98rem;
      }
      .dropzone__cta {
        margin-left: auto;
      }
      .dropzone__status {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 12px 0 0;
        font-size: 0.86rem;
        color: var(--text-muted);
      }

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

      .dot-marker {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--primary);
      }

      .row-card__thumb {
        flex: 0 0 auto;
        width: 40px;
        height: 40px;
        object-fit: cover;
        border-radius: 8px;
        border: 1px solid var(--border);
      }

      .row-card__excerpt {
        display: block;
        margin-top: 6px;
        font-size: 0.8rem;
        color: var(--text-muted);
        line-height: 1.45;
        @include clamp-lines(2);
      }

      .switch {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 0;
        font-size: 0.88rem;
        cursor: pointer;      }
    `,
  ],
})
export class VaultComponent {
  protected readonly search = inject(SearchService);
  private readonly store = inject(Store);
  private readonly extraction = inject(ExtractionService);
  private readonly classifier = inject(ClassifierService);
  private readonly ui = inject(UiService);
  private readonly files = inject(FileService);
  private readonly sync = inject(SyncService);

  readonly categories = CATEGORIES;
  readonly filtersOpen = signal(false);
  readonly dragOver = signal(false);
  readonly importing = signal(false);

  readonly results = this.search.results;
  readonly total = computed(() => this.store.documents().length);

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(true);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    const files = event.dataTransfer?.files;
    if (files?.length) void this.importFiles(Array.from(files));
  }

  onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) void this.importFiles(Array.from(input.files));
    input.value = '';
  }

  /** Extraction, classement puis dépôt de chaque fichier dans le coffre. */
  private async importFiles(files: File[]): Promise<void> {
    if (this.store.readOnly()) {
      this.ui.readOnlyBlocked();
      return;
    }

    this.importing.set(true);
    let added = 0;
    let simulated = 0;
    const deposited: { id: string; file: File }[] = [];

    for (const file of files) {
      try {
        const extracted = await this.extraction.extract(file);
        if (!extracted.real) simulated += 1;
        const result = this.classifier.classify(extracted.text, file.name);
        const doc = this.classifier.toDocument({
          result,
          fileName: file.name,
          text: extracted.text,
          sizeKb: extracted.sizeKb,
          source: extracted.source,
          thumbnail: extracted.thumbnail,
        });
        if (this.store.addDocument(doc)) {
          added += 1;
          deposited.push({ id: doc.id, file });
        }
      } catch {
        this.ui.error('Import impossible', `Le fichier « ${file.name} » n'a pas pu être lu.`);
      }
    }

    // Les originaux partent en bloc, une fois les documents connus du serveur :
    // un dépôt sur un identifiant inconnu serait refusé.
    const notSent = await this.uploadOriginals(deposited);

    this.importing.set(false);
    if (added) {
      this.ui.success(
        `${added} document${added > 1 ? 's importés' : ' importé'}`,
        simulated
          ? "Classement appliqué. Le texte des images reste simulé, faute d'OCR."
          : 'Classement appliqué à partir du contenu réel des fichiers.',
      );
    }
    if (notSent) {
      this.ui.warn(
        `${notSent} original${notSent > 1 ? 'aux' : ''} non envoyé${notSent > 1 ? 's' : ''}`,
        'Les documents sont enregistrés. Vous pourrez renvoyer les fichiers depuis leur fiche.',
      );
    }
  }

  /** Envoie les fichiers d'origine. Renvoie le nombre d'échecs. */
  private async uploadOriginals(items: { id: string; file: File }[]): Promise<number> {
    if (!items.length) return 0;
    try {
      await this.sync.flush();
    } catch {
      return items.length;
    }

    let failed = 0;
    for (const { id, file } of items) {
      try {
        await this.files.upload(id, file, file.name);
        this.store.updateDocument(id, { hasFile: true, mimeType: file.type || undefined });
      } catch {
        failed += 1;
      }
    }
    return failed;
  }
}
