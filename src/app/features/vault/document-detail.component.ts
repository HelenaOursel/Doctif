import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CATEGORIES, Contract, DOC_TYPE_LABEL, DocType } from '../../core/models';
import { FileService } from '../../core/services/file.service';
import { SyncService } from '../../core/services/sync.service';
import { UiService } from '../../core/services/ui.service';
import { Store } from '../../core/store';
import { CategoryBadgeComponent, CollapseComponent, EmptyStateComponent, PageHeaderComponent, SheetComponent } from '../../shared/components';
import { DocTypeIconClassPipe, IconComponent } from '../../shared/icon.component';
import { CategoryLabelPipe, EuroPipe, FileSizePipe, FrDatePipe } from '../../shared/pipes';
import { ContractFormComponent } from '../contracts/contract-form.component';
import { BillFormComponent } from '../anomalies/bill-form.component';
import { TaxFormComponent } from '../tax/tax-form.component';

@Component({
  selector: 'app-document-detail',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    PageHeaderComponent,
    CategoryBadgeComponent,
    CollapseComponent,
    EmptyStateComponent,
    SheetComponent,
    IconComponent,
    DocTypeIconClassPipe,
    CategoryLabelPipe,
    EuroPipe,
    FileSizePipe,
    FrDatePipe,
    ContractFormComponent,
    BillFormComponent,
    TaxFormComponent,
  ],
  template: `
    @if (doc(); as d) {
      <app-page-header [title]="d.name" [subtitle]="d.issuer + ' · ' + docTypeLabel(d.docType)" backTo="/coffre">
        <button type="button" class="btn btn--sm btn--ghost" (click)="editOpen.set(true)">
          <app-icon name="edit" /> Modifier
        </button>
      </app-page-header>

      <!-- Aperçu -->
      <div class="preview">
        @if (previewUrl(); as url) {
          @if (isPdf()) {
            <iframe class="preview__pdf" [src]="previewResource()" [title]="'Aperçu de ' + d.name"></iframe>
          } @else {
            <img [src]="url" [alt]="'Aperçu de ' + d.name" />
          }
        } @else if (d.thumbnail) {
          <img [src]="d.thumbnail" [alt]="'Aperçu de ' + d.name" />
        } @else {
          <div class="preview__placeholder">
            <app-icon [cls]="d.docType | docIconClass" />
            <span>{{ d.originalName }}</span>
          </div>
        }
      </div>

      <!-- Fichier d'origine -->
      @if (d.hasFile) {
        <div class="row wrap" style="margin-top: 12px">
          <button type="button" class="btn btn--sm btn--ghost" [disabled]="downloading()" (click)="downloadOriginal()">
            <app-icon name="download" /> Télécharger l'original
          </button>
        </div>
      } @else {
        <div class="callout callout--warning" style="margin-top: 12px">
          <app-icon class="callout__icon" name="warning" />
          <div>
            <strong>Fichier d'origine non envoyé</strong>
            <p>
              Seuls le texte et le classement sont enregistrés. Choisissez le fichier pour l'ajouter au coffre.
            </p>
            <label class="btn btn--sm btn--ghost" style="margin-top: 8px">
              <app-icon name="upload" /> Envoyer le fichier
              <input type="file" hidden (change)="onFilePicked($event)" />
            </label>
          </div>
        </div>
      }

      <!-- Rattachement à un contrat -->
      @if (linkedContract(); as c) {
        <a class="row-card" [routerLink]="['/contrats', c.id]" style="margin-top: 12px">
          <span class="row-card__icon"><app-icon name="contracts" /></span>
          <span class="row-card__body">
            <span class="row-card__title">{{ c.label }}</span>
            <span class="row-card__meta">Ce document est rattaché à ce contrat</span>
          </span>
          <app-icon name="chevronRight" />
        </a>
      }

      @if (canTrackContract() || canTrackBill() || canTrackTax()) {
        <div class="callout callout--info" style="margin-top: 12px">
          <app-icon class="callout__icon" name="sparkles" />
          <div>
            <strong>Suivre ce document</strong>
            <p>
              Un document classé reste un fichier inerte. Le suivre lui donne des montants, des échéances et des
              alertes.
            </p>
            <div class="row wrap" style="margin-top: 8px">
              @if (canTrackContract()) {
                <button type="button" class="btn btn--sm btn--primary" (click)="contractFormOpen.set(true)">
                  <app-icon name="contracts" /> Créer un contrat
                </button>
              }
              @if (canTrackBill()) {
                <button type="button" class="btn btn--sm btn--ghost" (click)="billFormOpen.set(true)">
                  <app-icon name="money" /> Enregistrer comme facture
                </button>
              }
              @if (canTrackTax()) {
                <button type="button" class="btn btn--sm btn--ghost" (click)="taxFormOpen.set(true)">
                  <app-icon name="tax" /> Ajouter au suivi fiscal
                </button>
              }
            </div>
          </div>
        </div>
      }

      <app-contract-form
        [open]="contractFormOpen()"
        [document]="doc() ?? null"
        (close)="contractFormOpen.set(false)"
        (created)="onContractCreated($event)"
      />
      <app-bill-form
        [open]="billFormOpen()"
        [document]="doc() ?? null"
        (close)="billFormOpen.set(false)"
        (created)="onBillCreated()"
      />
      <app-tax-form
        [open]="taxFormOpen()"
        [document]="doc() ?? null"
        (close)="taxFormOpen.set(false)"
        (created)="onTaxCreated()"
      />

      <!-- Bandeau de confiance du classement -->
      <div
        class="callout"
        [class.callout--success]="d.confidence >= 0.85"
        [class.callout--warning]="d.confidence < 0.85"
        style="margin-top: 14px"
      >
        <app-icon class="callout__icon" [name]="d.confidence >= 0.85 ? 'success' : 'warning'" />
        <div>
          <strong>
            Classé automatiquement dans « {{ d.category | catLabel }} » — confiance {{ (d.confidence * 100).toFixed(0) }} %
          </strong>
          <p>
            @if (d.confidence >= 0.85) {
              Le contenu du document correspond nettement à cette catégorie.
            } @else {
              Le classement est incertain : vérifiez-le et corrigez-le si nécessaire.
            }
          </p>
        </div>
      </div>

      <!-- Métadonnées -->
      <dl class="kv-list card" style="margin-top: 14px">
        <div class="kv"><dt>Catégorie</dt><dd><app-cat-badge [category]="d.category" /></dd></div>
        <div class="kv"><dt>Type</dt><dd>{{ docTypeLabel(d.docType) }}</dd></div>
        <div class="kv"><dt>Émetteur</dt><dd>{{ d.issuer }}</dd></div>
        <div class="kv"><dt>Date du document</dt><dd>{{ d.date | frDate: 'long' }}</dd></div>
        <div class="kv"><dt>Ajouté le</dt><dd>{{ d.addedAt | frDate }}</dd></div>
        @if (d.amount) {
          <div class="kv"><dt>Montant</dt><dd>{{ d.amount | euro }}</dd></div>
        }
        <div class="kv"><dt>Taille</dt><dd>{{ d.sizeKb | fileSize }}</dd></div>
        <div class="kv"><dt>Nom d'origine</dt><dd class="truncate">{{ d.originalName }}</dd></div>
        <div class="kv"><dt>Source</dt><dd>{{ sourceLabel(d.source) }}</dd></div>
      </dl>

      <!-- Mots-clés -->
      @if (d.tags.length) {
        <div class="row wrap" style="margin-top: 12px">
          @for (tag of d.tags; track tag) {
            <span class="badge">{{ tag }}</span>
          }
        </div>
      }

      <!-- Partage -->
      <div class="section-head">
        <h2>Partage</h2>
        <a routerLink="/partage">Gérer la famille</a>
      </div>
      @if (sharedMembers().length) {
        <div class="list">
          @for (m of sharedMembers(); track m.id) {
            <div class="row-card">
              <span class="row-card__icon" [style.background]="m.color + '22'" [style.color]="m.color">
                <app-icon name="user" />
              </span>
              <span class="row-card__body">
                <span class="row-card__title">{{ m.name }}</span>
                <span class="row-card__meta">{{ m.relation }} · {{ m.readOnly ? 'Lecture seule' : 'Lecture et écriture' }}</span>
              </span>
              <button type="button" class="btn btn--sm btn--quiet" (click)="unshare(m.id)" aria-label="Retirer l'accès">
                <app-icon name="close" />
              </button>
            </div>
          }
        </div>
      } @else {
        <app-empty icon="users" title="Ce document n'est partagé avec personne" />
      }

      @if (unsharedMembers().length) {
        <div class="row wrap" style="margin-top: 10px">
          @for (m of unsharedMembers(); track m.id) {
            <button type="button" class="chip" (click)="share(m.id)">
              <app-icon name="userPlus" /> Partager avec {{ m.name }}
            </button>
          }
        </div>
      }

      <!-- Contenu extrait -->
      <div class="section-head"><h2>Contenu extrait</h2></div>
      <app-collapse title="Texte indexé pour la recherche" [badge]="d.text.length + ' caractères'">
        <pre class="doctext">{{ d.text }}</pre>
        <button type="button" class="btn btn--sm btn--ghost" (click)="copyText(d.text)">
          <app-icon name="copy" /> Copier le texte
        </button>
      </app-collapse>

      <!-- Actions -->
      <div class="row wrap" style="margin-top: 20px">
        <!-- Toujours atteignable, y compris pour les documents que la mise en
             avant ci-dessus ne juge pas assez évidents. -->
        @if (canTrackContract() === false && !linkedContract()) {
          <button type="button" class="btn btn--ghost" (click)="contractFormOpen.set(true)">
            <app-icon name="contracts" /> Créer un contrat
          </button>
        }
        <button type="button" class="btn btn--ghost" (click)="toggleArchive()">
          <app-icon name="archive" />
          {{ d.archived ? 'Sortir des archives' : 'Archiver' }}
        </button>
        <button type="button" class="btn btn--ghost" (click)="download()">
          <app-icon name="download" /> Exporter les métadonnées
        </button>
        <button type="button" class="btn btn--danger" (click)="confirmDelete.set(true)">
          <app-icon name="trash" /> Supprimer
        </button>
      </div>

      <!-- Édition -->
      <app-sheet [open]="editOpen()" title="Corriger le classement" (close)="editOpen.set(false)">
        <div class="field">
          <label for="e-name">Nom du document</label>
          <input id="e-name" class="input" [(ngModel)]="draftName" />
        </div>
        <div class="field">
          <label for="e-cat">Catégorie</label>
          <select id="e-cat" class="select" [(ngModel)]="draftCategory">
            @for (c of categories; track c) {
              <option [value]="c">{{ c | catLabel }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label for="e-type">Type de document</label>
          <select id="e-type" class="select" [(ngModel)]="draftType">
            @for (tKey of docTypes; track tKey) {
              <option [value]="tKey">{{ docTypeLabel(tKey) }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label for="e-issuer">Émetteur</label>
          <input id="e-issuer" class="input" [(ngModel)]="draftIssuer" />
        </div>
        <div class="field">
          <label for="e-date">Date du document</label>
          <input id="e-date" class="input" type="date" [(ngModel)]="draftDate" />
        </div>

        <div class="row" style="margin-top: 8px">
          <button type="button" class="btn btn--ghost grow" (click)="editOpen.set(false)">Annuler</button>
          <button type="button" class="btn btn--primary grow" (click)="saveEdit()">Enregistrer</button>
        </div>
      </app-sheet>

      <!-- Confirmation de suppression -->
      <app-sheet [open]="confirmDelete()" title="Supprimer ce document ?" (close)="confirmDelete.set(false)">
        <p>
          « {{ d.name }} » sera définitivement retiré de votre coffre. Cette action est irréversible.
          Si vous souhaitez seulement le sortir de la vue courante, préférez l'archivage.
        </p>
        <div class="row" style="margin-top: 16px">
          <button type="button" class="btn btn--ghost grow" (click)="confirmDelete.set(false)">Annuler</button>
          <button type="button" class="btn btn--danger grow" (click)="remove()">
            <app-icon name="trash" /> Supprimer définitivement
          </button>
        </div>
      </app-sheet>
    } @else {
      <app-empty icon="search" title="Document introuvable" hint="Il a peut-être été supprimé.">
        <a class="btn btn--sm btn--primary" style="margin-top: 12px" routerLink="/coffre">Retour au coffre</a>
      </app-empty>
    }
  `,
  styles: [
    `
      .preview {
        margin-top: 16px;
        border-radius: 16px;
        overflow: hidden;
        border: 1px solid var(--border);
        background: var(--surface);
      }
      .preview img {
        width: 100%;
        max-height: 320px;
        object-fit: contain;
        background: var(--surface-2);
      }
      .preview__pdf {
        display: block;
        width: 100%;
        height: 460px;
        border: 0;
        background: var(--surface-2);
      }
      .preview__placeholder {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        padding: 38px 18px;
        color: var(--text-muted);
        background: var(--surface-2);
      }
      .preview__placeholder app-icon {
        font-size: 2.2rem;
      }
      .preview__placeholder span {
        font-size: 0.8rem;
        word-break: break-all;
        text-align: center;
      }

      .doctext {
        margin: 0 0 12px;
        padding: 12px;
        max-height: 320px;
        overflow: auto;
        background: var(--surface-2);
        border-radius: 10px;
        font-family: var(--mono, ui-monospace, monospace);
        font-size: 0.78rem;
        line-height: 1.6;
        white-space: pre-wrap;
        word-break: break-word;
      }
    `,
  ],
})
export class DocumentDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly store = inject(Store);
  private readonly ui = inject(UiService);
  private readonly files = inject(FileService);
  private readonly sync = inject(SyncService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly categories = CATEGORIES;
  readonly docTypes = Object.keys(DOC_TYPE_LABEL) as DocType[];

  readonly editOpen = signal(false);
  readonly confirmDelete = signal(false);

  private readonly id = signal(this.route.snapshot.paramMap.get('id') ?? '');
  readonly doc = computed(() => this.store.documents().find((d) => d.id === this.id()));

  /* --- Contrat rattaché ----------------------------------------------------- */

  readonly contractFormOpen = signal(false);

  readonly linkedContract = computed(() => {
    const d = this.doc();
    if (!d?.contractId) return null;
    return this.store.contracts().find((c) => c.id === d.contractId) ?? null;
  });

  /**
   * Mise en avant de la proposition.
   *
   * Le type seul ne suffit pas : un contrat EDF déposé en PDF est très souvent
   * classé « facture », puisqu'il en porte le vocabulaire. La catégorie est le
   * meilleur indice — énergie, internet ou assurance désignent des engagements
   * récurrents, contrairement à une ordonnance ou un avis d'imposition.
   *
   * Ce n'est qu'une mise en avant : l'action reste accessible pour tout
   * document, plus bas dans la page.
   */
  readonly looksLikeContract = computed(() => {
    const d = this.doc();
    if (!d) return false;
    const typeParlant = d.docType === 'contrat' || d.docType === 'attestation' || d.docType === 'avis';
    const categorieRecurrente = (['assurance', 'energie', 'internet', 'banque', 'logement', 'vehicule'] as const).some(
      (c) => c === d.category,
    );
    return typeParlant || categorieRecurrente;
  });

  /** Une facture ponctuelle alimente la détection d'écarts de montant. */
  readonly canTrackBill = computed(() => this.doc()?.docType === 'facture');

  /** Avis d'imposition, taxe foncière : tout ce qui relève du suivi fiscal. */
  readonly canTrackTax = computed(() => {
    const d = this.doc();
    return d?.category === 'impots' || d?.docType === 'avis';
  });

  readonly canTrackContract = computed(() => !this.linkedContract() && this.looksLikeContract());

  readonly billFormOpen = signal(false);
  readonly taxFormOpen = signal(false);

  onContractCreated(contract: Contract): void {
    this.contractFormOpen.set(false);
    void this.router.navigate(['/contrats', contract.id]);
  }

  onBillCreated(): void {
    this.billFormOpen.set(false);
    void this.router.navigate(['/anomalies'], { fragment: 'factures' });
  }

  onTaxCreated(): void {
    this.taxFormOpen.set(false);
    void this.router.navigate(['/fiscal'], { fragment: 'historique' });
  }

  /* --- Fichier d'origine --------------------------------------------------- */

  readonly previewUrl = signal<string | null>(null);
  readonly downloading = signal(false);

  readonly isPdf = computed(() => {
    const d = this.doc();
    return d?.mimeType === 'application/pdf' || /\.pdf$/i.test(d?.originalName ?? '');
  });

  /**
   * Une URL `blob:` reste bloquée dans un `<iframe [src]>` sans marquage
   * explicite : Angular traite ce contexte comme une ressource exécutable.
   * Le contenu vient de notre propre API, l'autoriser est légitime.
   */
  readonly previewResource = computed<SafeResourceUrl | null>(() => {
    const url = this.previewUrl();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  async downloadOriginal(): Promise<void> {
    const d = this.doc();
    if (!d) return;
    this.downloading.set(true);
    try {
      await this.ui.downloadBlob(d.originalName, await this.files.blob(d.id));
    } catch {
      this.ui.error('Téléchargement impossible', "Le fichier n'a pas pu être récupéré du serveur.");
    } finally {
      this.downloading.set(false);
    }
  }

  /** Renvoi manuel : le dépôt initial a échoué, ou le document est ancien. */
  async onFilePicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Le champ est remis à zéro tout de suite : sans cela, resélectionner le
    // même fichier après un échec ne déclencherait aucun événement.
    input.value = '';
    const d = this.doc();
    if (!file || !d) return;

    try {
      await this.sync.flush();
      await this.files.upload(d.id, file, file.name);
      this.store.updateDocument(d.id, { hasFile: true, mimeType: file.type || undefined });
      this.ui.success('Fichier envoyé', "L'original est désormais conservé sur le serveur.");
    } catch {
      this.ui.error('Envoi impossible', 'Vérifiez que le serveur est accessible, puis réessayez.');
    }
  }

  readonly sharedMembers = computed(() => {
    const d = this.doc();
    if (!d) return [];
    return this.store.members().filter((m) => d.sharedWith.includes(m.id));
  });

  readonly unsharedMembers = computed(() => {
    const d = this.doc();
    if (!d) return [];
    return this.store.members().filter((m) => !d.sharedWith.includes(m.id));
  });

  /* Brouillon d'édition */
  draftName = '';
  draftCategory = 'autre';
  draftType: DocType = 'autre';
  draftIssuer = '';
  draftDate = '';

  constructor() {
    const d = this.doc();
    if (d) {
      this.draftName = d.name;
      this.draftCategory = d.category;
      this.draftType = d.docType;
      this.draftIssuer = d.issuer;
      this.draftDate = d.date;
    }

    // L'aperçu suit le document : il se recharge si le fichier arrive plus tard,
    // par exemple après un renvoi manuel.
    effect(async () => {
      const current = this.doc();
      // Sans fichier stocké, la vignette existante suffit à l'aperçu.
      if (!current?.hasFile) {
        this.previewUrl.set(null);
        return;
      }
      this.previewUrl.set(await this.files.objectUrl(current.id));
    });
  }

  docTypeLabel(type: DocType): string {
    return DOC_TYPE_LABEL[type] ?? 'Document';
  }

  sourceLabel(source: string): string {
    const map: Record<string, string> = {
      pdf: 'Fichier PDF',
      photo: 'Photo importée',
      email: 'Pièce jointe e-mail',
      scan: 'Scan depuis l’appareil photo',
    };
    return map[source] ?? source;
  }

  saveEdit(): void {
    const d = this.doc();
    if (!d) return;
    const ok = this.store.updateDocument(d.id, {
      name: this.draftName.trim() || d.name,
      category: this.draftCategory as never,
      docType: this.draftType,
      issuer: this.draftIssuer.trim() || d.issuer,
      date: this.draftDate || d.date,
      // Une correction manuelle vaut certitude.
      confidence: 1,
    });
    if (!ok) {
      this.ui.readOnlyBlocked();
      return;
    }
    this.editOpen.set(false);
    this.ui.success('Document mis à jour', 'Le classement a été corrigé.');
  }

  share(memberId: string): void {
    const d = this.doc();
    if (!d) return;
    if (!this.store.updateDocument(d.id, { sharedWith: [...d.sharedWith, memberId] })) {
      this.ui.readOnlyBlocked();
      return;
    }
    this.ui.success('Document partagé');
  }

  unshare(memberId: string): void {
    const d = this.doc();
    if (!d) return;
    if (!this.store.updateDocument(d.id, { sharedWith: d.sharedWith.filter((x) => x !== memberId) })) {
      this.ui.readOnlyBlocked();
    }
  }

  toggleArchive(): void {
    const d = this.doc();
    if (!d) return;
    if (!this.store.updateDocument(d.id, { archived: !d.archived })) {
      this.ui.readOnlyBlocked();
      return;
    }
    this.ui.info(d.archived ? 'Document réactivé' : 'Document archivé');
  }

  async copyText(text: string): Promise<void> {
    const ok = await this.ui.copy(text);
    ok ? this.ui.success('Texte copié') : this.ui.error('Copie impossible');
  }

  download(): void {
    const d = this.doc();
    if (!d) return;
    void this.ui.download(`${d.name}.json`, JSON.stringify(d, null, 2));
  }

  remove(): void {
    const d = this.doc();
    if (!d) return;
    if (!this.store.removeDocument(d.id)) {
      this.ui.readOnlyBlocked();
      return;
    }
    this.confirmDelete.set(false);
    this.ui.info('Document supprimé');
    void this.router.navigate(['/coffre']);
  }
}
