import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/i18n.service';
import { DOC_TYPE_LABEL, DocumentItem } from '../../core/models';
import { CaptureService } from '../../core/services/capture.service';
import { ClassificationResult, ClassifierService } from '../../core/services/classifier.service';
import { ExtractionService } from '../../core/services/extraction.service';
import { FileService } from '../../core/services/file.service';
import { SyncService } from '../../core/services/sync.service';
import { UiService } from '../../core/services/ui.service';
import { Store } from '../../core/store';
import { uid } from '../../core/utils';
import { CategoryBadgeComponent, PageHeaderComponent, ProgressBarComponent } from '../../shared/components';
import { IconComponent } from '../../shared/icon.component';
import { CategoryLabelPipe, EuroPipe, FrDatePipe } from '../../shared/pipes';

/** Étapes affichées pendant l'analyse, pour rendre le traitement lisible. */
const STEPS = [
  { key: 'read', label: 'Lecture du fichier' },
  { key: 'ocr', label: 'Extraction du texte' },
  { key: 'type', label: 'Détection du type de document' },
  { key: 'classify', label: 'Classement automatique' },
  { key: 'rename', label: 'Renommage' },
  { key: 'deadlines', label: 'Recherche d’échéances' },
] as const;

@Component({
  selector: 'app-scanner',
  standalone: true,
  imports: [
    TranslatePipe,
    PageHeaderComponent,
    CategoryBadgeComponent,
    ProgressBarComponent,
    IconComponent,
    CategoryLabelPipe,
    EuroPipe,
    FrDatePipe,
  ],
  template: `
    <app-page-header [title]="'scanner.title' | t" [subtitle]="'scanner.subtitle' | t" backTo="/coffre" />

    @if (!result() && !busy()) {
      <!-- Point d'entrée : caméra ou fichier -->
      <div class="capture">
        @if (capture.isAvailable) {
          <!-- Application native : appareil photo et galerie du système. -->
          <button type="button" class="capture__card capture__card--primary" (click)="shootNative()">
            <app-icon name="camera" />
            <strong>Prendre une photo</strong>
            <small>Ouvre l'appareil photo</small>
          </button>

          <button type="button" class="capture__card" (click)="pickNative()">
            <app-icon name="import" />
            <strong>Choisir dans mes photos</strong>
            <small>Galerie de l'appareil</small>
          </button>
        } @else {
          <label class="capture__card capture__card--primary">
            <input type="file" accept="image/*" capture="environment" hidden (change)="onFile($event, 'scan')" />
            <app-icon name="camera" />
            <strong>Prendre une photo</strong>
            <small>Ouvre l'appareil photo sur mobile</small>
          </label>

          <label class="capture__card">
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.eml,.csv,.md"
              hidden
              (change)="onFile($event, 'file')"
            />
            <app-icon name="import" />
            <strong>Choisir un fichier</strong>
            <small>PDF, image, e-mail exporté</small>
          </label>
        }
      </div>

      <div class="callout callout--info" style="margin-top: 16px">
        <app-icon class="callout__icon" name="info" />
        <div>
          <strong>Comment fonctionne l'analyse</strong>
          <p>
            Le contenu des <strong>PDF</strong> est réellement extrait par le serveur, tout comme celui des fichiers
            <code>.txt</code>, <code>.eml</code>, <code>.csv</code> et <code>.md</code>, lus directement. Les
            <strong>images</strong> — et les PDF scannés, qui n'en sont qu'un assemblage — n'ont pas de couche
            texte : faute de moteur OCR, leur contenu est reconstitué à partir de modèles, ce qui est signalé sur le
            résultat.
          </p>
        </div>
      </div>

      <div class="section-head"><h2>Ce que le scanner détecte</h2></div>
      <div class="card-grid">
        @for (f of features; track f.title) {
          <div class="card">
            <app-icon class="feature__icon" [name]="f.icon" />
            <h3 class="feature__title">{{ f.title }}</h3>
            <p class="muted" style="margin: 4px 0 0">{{ f.body }}</p>
          </div>
        }
      </div>
    }

    <!-- Analyse en cours -->
    @if (busy()) {
      <div class="card" style="margin-top: 18px">
        <div class="row row--between" style="margin-bottom: 12px">
          <strong>Analyse en cours…</strong>
          <span class="muted">{{ progress() }} %</span>
        </div>
        <app-progress [value]="progress()" label="Progression de l'analyse" />
        <ul class="steps">
          @for (s of steps; track s.key; let i = $index) {
            <li class="steps__item" [class.steps__item--done]="stepIndex() > i" [class.steps__item--current]="stepIndex() === i">
              <app-icon [name]="stepIndex() > i ? 'success' : stepIndex() === i ? 'pending' : 'emptyCircle'" />
              <span>{{ s.label }}</span>
            </li>
          }
        </ul>
      </div>
    }

    <!-- Résultat -->
    @if (result(); as r) {
      <div class="card" style="margin-top: 18px">
        <div class="row row--between wrap" style="gap: 12px">
          <div class="row">
            @if (thumbnail()) {
              <img class="result__thumb" [src]="thumbnail()!" alt="Aperçu du document scanné" />
            } @else {
              <span class="row-card__icon"><app-icon name="docOther" /></span>
            }
            <div>
              <strong>{{ DOC_TYPE_LABEL[r.docType] }}</strong>
              <div class="muted">{{ r.issuer }}</div>
            </div>
          </div>
          <app-cat-badge [category]="r.category" />
        </div>

        <!-- Renommage -->
        <div class="rename">
          <div class="rename__row">
            <span class="rename__label">Nom d'origine</span>
            <code class="rename__old">{{ originalName() }}</code>
          </div>
          <app-icon class="rename__arrow" name="chevronDown" />
          <div class="rename__row">
            <span class="rename__label">Nom proposé</span>
            <code class="rename__new">{{ proposedName() }}</code>
          </div>
        </div>

        <dl class="kv-list" style="margin-top: 14px">
          <div class="kv"><dt>Catégorie</dt><dd>{{ r.category | catLabel }}</dd></div>
          <div class="kv"><dt>Type</dt><dd>{{ DOC_TYPE_LABEL[r.docType] }}</dd></div>
          <div class="kv"><dt>Émetteur</dt><dd>{{ r.issuer }}</dd></div>
          <div class="kv"><dt>Date</dt><dd>{{ r.date | frDate: 'long' }}</dd></div>
          @if (r.amount) {
            <div class="kv"><dt>Montant</dt><dd>{{ r.amount | euro }}</dd></div>
          }
          <div class="kv"><dt>Confiance</dt><dd>{{ (r.confidence * 100).toFixed(0) }} %</dd></div>
        </dl>

        <!-- Justification -->
        <div class="reasons">
          <p class="reasons__title">Pourquoi ce classement</p>
          <ul>
            @for (reason of r.reasons; track reason) {
              <li><app-icon name="check" /> {{ reason }}</li>
            }
          </ul>
        </div>

        @if (extractionReal()) {
          <div class="callout callout--success" style="margin-top: 14px">
            <app-icon class="callout__icon" name="success" />
            <div>
              <strong>Texte réellement extrait du fichier</strong>
              <p>{{ extractionEngine() }} — le classement ci-dessus repose sur ce contenu.</p>
            </div>
          </div>
        } @else {
          <div class="callout callout--warning" style="margin-top: 14px">
            <app-icon class="callout__icon" name="warning" />
            <div>
              <strong>Texte reconstitué</strong>
              <p>
                {{ extractionEngine() }}. Le contenu ci-dessous provient d'un modèle choisi d'après le nom du
                fichier, et non du document lui-même : vérifiez le classement.
              </p>
            </div>
          </div>
        }

        <!-- Échéances détectées -->
        @if (detectedDeadlines().length) {
          <div class="section-head" style="margin-bottom: 8px"><h2>Échéances détectées</h2></div>
          <div class="list">
            @for (dl of detectedDeadlines(); track dl.date) {
              <label class="row-card deadline-pick">
                <input type="checkbox" [checked]="selectedDeadlines().includes(dl.date)" (change)="toggleDeadline(dl.date)" />
                <span class="row-card__body">
                  <span class="row-card__title">{{ dl.label }}</span>
                  <span class="row-card__meta">{{ dl.date | frDate: 'long' }}</span>
                </span>
              </label>
            }
          </div>
        }

        <details class="raw">
          <summary>Voir le texte extrait</summary>
          <pre>{{ extractedText() }}</pre>
        </details>

        <div class="row wrap" style="margin-top: 18px">
          <button type="button" class="btn btn--primary grow" (click)="save()">
            <app-icon name="check" /> Ajouter au coffre-fort
          </button>
          <button type="button" class="btn btn--ghost" (click)="reset()">
            <app-icon name="refresh" /> Recommencer
          </button>
        </div>
      </div>
    }
  `,
  styles: [
    `
      @use 'mixins' as *;

      .capture {
        display: grid;
        gap: 12px;
        margin-top: 18px;
        grid-template-columns: minmax(0, 1fr);

        @include up(600px) {
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        }
      }
      /* Un bouton en natif, un label sur le web : les deux partagent l'aspect. */
      .capture__card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        width: 100%;
        padding: 30px 18px;
        border-radius: 16px;
        border: 2px dashed var(--border-strong);
        background: var(--surface);
        color: inherit;
        font: inherit;
        cursor: pointer;
        text-align: center;
        transition:
          border-color 0.15s ease,
          background-color 0.15s ease;

        &:hover {
          border-color: var(--primary);
        }

        app-icon {
          font-size: 1.8rem;
          color: var(--text-muted);
        }

        strong {
          font-size: 0.95rem;
        }

        small {
          color: var(--text-muted);
          font-size: 0.79rem;
        }
      }
      .capture__card--primary {
        border-style: solid;
        border-color: var(--primary);
        background: var(--primary-soft);

        app-icon {
          color: var(--primary);
        }
      }

      .feature__icon {
        font-size: 1.2rem;
        color: var(--primary);
        margin-bottom: 8px;
        display: block;
      }
      .feature__title {
        font-size: 0.92rem;
      }

      .steps {
        list-style: none;
        margin: 16px 0 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 9px;
      }
      .steps__item {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 0.86rem;
        color: var(--text-muted);
      }
      .steps__item--current {
        color: var(--text);
        font-weight: 600;
      }
      .steps__item--done {
        color: var(--success);
      }

      .result__thumb {
        width: 52px;
        height: 52px;
        object-fit: cover;
        border-radius: 10px;
        border: 1px solid var(--border);
      }

      .rename {
        margin-top: 16px;
        padding: 12px;
        border-radius: 12px;
        background: var(--surface-2);
      }
      .rename__row {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .rename__label {
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--text-muted);
        font-weight: 650;
      }
      .rename__old,
      .rename__new {
        font-size: 0.8rem;
        word-break: break-all;
      }
      .rename__old {
        color: var(--text-muted);
        text-decoration: line-through;
      }
      .rename__new {
        color: var(--success);
        font-weight: 650;
      }
      .rename__arrow {
        display: block;
        margin: 6px 0;
        color: var(--text-muted);
        font-size: 0.7rem;
      }

      .reasons {
        margin-top: 14px;
        padding-top: 12px;
        border-top: 1px solid var(--border);
      }
      .reasons__title {
        margin: 0 0 6px;
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--text-muted);
        font-weight: 650;
      }
      .reasons ul {
        margin: 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .reasons li {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        font-size: 0.83rem;
        color: var(--text-soft);
      }
      .reasons app-icon {
        color: var(--success);
        font-size: 0.72rem;
        margin-top: 4px;
      }

      .deadline-pick {
        cursor: pointer;
      }

      .raw {
        margin-top: 16px;
        font-size: 0.83rem;
      }
      .raw summary {
        cursor: pointer;
        color: var(--text-muted);
        font-weight: 600;
      }
      .raw pre {
        margin: 10px 0 0;
        padding: 12px;
        background: var(--surface-2);
        border-radius: 10px;
        font-size: 0.78rem;
        line-height: 1.6;
        white-space: pre-wrap;
        word-break: break-word;
        max-height: 260px;
        overflow: auto;
      }
    `,
  ],
})
export class ScannerComponent {
  private readonly extraction = inject(ExtractionService);
  private readonly classifier = inject(ClassifierService);
  private readonly store = inject(Store);
  private readonly ui = inject(UiService);
  private readonly router = inject(Router);
  private readonly files = inject(FileService);
  private readonly sync = inject(SyncService);
  protected readonly capture = inject(CaptureService);

  protected readonly DOC_TYPE_LABEL = DOC_TYPE_LABEL;
  readonly steps = STEPS;

  readonly features = [
    { icon: 'docContract' as const, title: 'Type de document', body: 'Facture, contrat, attestation, avis, ordonnance…' },
    { icon: 'search' as const, title: 'Texte intégral', body: 'Le contenu devient cherchable dans tout le coffre.' },
    { icon: 'edit' as const, title: 'Renommage', body: 'Nom normalisé, triable chronologiquement.' },
    { icon: 'calendar' as const, title: 'Échéances', body: 'Les dates limites sont proposées au calendrier.' },
  ];

  readonly busy = signal(false);
  readonly stepIndex = signal(0);
  readonly result = signal<ClassificationResult | null>(null);
  readonly extractedText = signal('');
  readonly extractionReal = signal(true);
  /** Origine du texte affiché — « Extraction PDF (3 pages) », « OCR de démonstration »… */
  readonly extractionEngine = signal('');
  readonly thumbnail = signal<string | undefined>(undefined);
  readonly originalName = signal('');
  readonly sizeKb = signal(0);
  /**
   * Fichier analysé, conservé jusqu'à l'enregistrement.
   *
   * L'analyse et l'enregistrement sont deux gestes distincts : sans cette
   * référence, le fichier serait perdu entre les deux et seul son texte
   * subsisterait.
   */
  private readonly pendingFile = signal<File | null>(null);
  readonly source = signal<DocumentItem['source']>('scan');
  readonly selectedDeadlines = signal<string[]>([]);

  readonly progress = computed(() => Math.round((this.stepIndex() / STEPS.length) * 100));

  readonly proposedName = computed(() => {
    const r = this.result();
    if (!r) return '';
    const ext = this.originalName().includes('.') ? this.originalName().split('.').pop()!.toLowerCase() : 'pdf';
    return this.classifier.buildName({ ...r, ext });
  });

  readonly detectedDeadlines = computed(() => this.classifier.detectDeadlines(this.extractedText()));

  /** Appareil photo natif (application mobile uniquement). */
  async shootNative(): Promise<void> {
    const shot = await this.capture.takePhoto();
    if (shot) await this.analyse(new File([shot.blob], shot.fileName, { type: shot.blob.type }), 'scan');
  }

  /** Galerie native (application mobile uniquement). */
  async pickNative(): Promise<void> {
    const shot = await this.capture.pickFromGallery();
    if (shot) await this.analyse(new File([shot.blob], shot.fileName, { type: shot.blob.type }), 'file');
  }

  async onFile(event: Event, mode: 'scan' | 'file'): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) await this.analyse(file, mode);
  }

  private async analyse(file: File, mode: 'scan' | 'file'): Promise<void> {
    if (this.store.readOnly()) {
      this.ui.readOnlyBlocked();
      return;
    }

    this.busy.set(true);
    this.stepIndex.set(0);
    this.result.set(null);
    this.originalName.set(file.name);
    this.pendingFile.set(file);

    // L'analyse est instantanée ; la progression est cadencée pour rendre
    // visibles les étapes réellement effectuées.
    const advance = () => new Promise<void>((r) => setTimeout(r, 260));

    await advance();
    this.stepIndex.set(1);

    const extracted = await this.extraction.extract(file);
    this.extractedText.set(extracted.text);
    this.extractionReal.set(extracted.real);
    this.extractionEngine.set(extracted.engine);
    this.thumbnail.set(extracted.thumbnail);
    this.sizeKb.set(extracted.sizeKb);
    this.source.set(mode === 'scan' ? 'scan' : extracted.source);

    await advance();
    this.stepIndex.set(2);
    await advance();
    this.stepIndex.set(3);

    const classification = this.classifier.classify(extracted.text, file.name);

    await advance();
    this.stepIndex.set(4);
    await advance();
    this.stepIndex.set(5);
    await advance();
    this.stepIndex.set(6);

    this.result.set(classification);
    this.selectedDeadlines.set(this.classifier.detectDeadlines(extracted.text).map((d) => d.date));
    this.busy.set(false);
  }

  toggleDeadline(date: string): void {
    this.selectedDeadlines.update((list) =>
      list.includes(date) ? list.filter((d) => d !== date) : [...list, date],
    );
  }

  async save(): Promise<void> {
    const r = this.result();
    if (!r) return;

    const doc = this.classifier.toDocument({
      result: r,
      fileName: this.originalName(),
      text: this.extractedText(),
      sizeKb: this.sizeKb(),
      source: this.source(),
      thumbnail: this.thumbnail(),
    });

    if (!this.store.addDocument(doc)) {
      this.ui.readOnlyBlocked();
      return;
    }

    // Report des échéances retenues dans le calendrier.
    let added = 0;
    for (const dl of this.detectedDeadlines()) {
      if (!this.selectedDeadlines().includes(dl.date)) continue;
      this.store.addDeadline({
        id: uid('dl'),
        title: `${dl.label} — ${r.issuer}`,
        date: dl.date,
        kind: r.category === 'impots' ? 'impots' : r.category === 'vehicule' ? 'controle-technique' : 'autre',
        category: r.category,
        documentId: doc.id,
        detected: true,
        done: false,
      });
      added += 1;
    }

    // Le fichier part après la création du document : le serveur refuse un
    // dépôt sur un identifiant qu'il ne connaît pas. La synchronisation de
    // l'état est donc forcée avant l'envoi.
    const sent = await this.uploadOriginal(doc.id);

    this.ui.success(
      'Document ajouté au coffre',
      added ? `${added} échéance(s) ajoutée(s) au calendrier.` : 'Classement et renommage appliqués.',
    );
    if (!sent) {
      this.ui.warn(
        'Fichier non envoyé',
        "Le document est enregistré, mais l'original n'a pas pu être transmis. Vous pourrez le renvoyer depuis sa fiche.",
      );
    }
    void this.router.navigate(['/coffre', doc.id]);
  }

  /** Envoie le fichier d'origine. `false` si le serveur n'a pas pu le prendre. */
  private async uploadOriginal(documentId: string): Promise<boolean> {
    const file = this.pendingFile();
    if (!file) return false;
    try {
      await this.sync.flush();
      await this.files.upload(documentId, file, file.name);
      this.store.updateDocument(documentId, { hasFile: true, mimeType: file.type || undefined });
      return true;
    } catch {
      return false;
    }
  }

  reset(): void {
    this.result.set(null);
    this.extractedText.set('');
    this.thumbnail.set(undefined);
    this.pendingFile.set(null);
    this.stepIndex.set(0);
    this.selectedDeadlines.set([]);
  }
}
