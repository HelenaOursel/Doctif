import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { apiUrl } from './api';

export interface StorageUsage {
  count: number;
  totalBytes: number;
}

/**
 * Fichiers d'origine des documents.
 *
 * Les octets ne transitent jamais par l'état applicatif : ils sont déposés et
 * relus à la demande, document par document.
 *
 * La lecture passe par `HttpClient` en `blob`, puis par une URL d'objet. Un
 * `<img src>` ou un `<iframe>` ne peut pas porter d'en-tête `Authorization`, et
 * glisser le jeton dans l'URL le laisserait dans l'historique du navigateur et
 * les journaux du serveur.
 */
@Injectable({ providedIn: 'root' })
export class FileService {
  private readonly http = inject(HttpClient);

  /** URL d'objet par document, pour ne pas retélécharger à chaque affichage. */
  private readonly urls = new Map<string, string>();

  readonly uploading = signal<string | null>(null);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.releaseAll());
  }

  /**
   * Dépose le fichier d'un document.
   *
   * Le nom est encodé : un en-tête HTTP ne transporte que de l'ASCII, et un
   * document nommé « facture août.pdf » ferait échouer la requête.
   */
  async upload(documentId: string, file: Blob, fileName: string): Promise<void> {
    this.uploading.set(documentId);
    try {
      await firstValueFrom(
        this.http.post(apiUrl(`/documents/${encodeURIComponent(documentId)}/file`), file, {
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'X-File-Name': encodeURIComponent(fileName),
          },
        }),
      );
      this.release(documentId);
    } finally {
      this.uploading.set(null);
    }
  }

  /** URL d'objet affichable, ou `null` si aucun fichier n'est stocké. */
  async objectUrl(documentId: string): Promise<string | null> {
    const cached = this.urls.get(documentId);
    if (cached) return cached;

    try {
      const blob = await this.blob(documentId);
      const url = URL.createObjectURL(blob);
      this.urls.set(documentId, url);
      return url;
    } catch (error) {
      // 404 : document sans fichier, cas normal. Le reste vaut aussi « rien à
      // afficher » — l'appelant retombe sur la vignette ou un espace réservé.
      if (!(error instanceof HttpErrorResponse)) throw error;
      return null;
    }
  }

  async blob(documentId: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(apiUrl(`/documents/${encodeURIComponent(documentId)}/file`), {
        responseType: 'blob',
      }),
    );
  }

  async remove(documentId: string): Promise<void> {
    await firstValueFrom(
      this.http.delete(apiUrl(`/documents/${encodeURIComponent(documentId)}/file`)),
    );
    this.release(documentId);
  }

  async usage(): Promise<StorageUsage> {
    return firstValueFrom(this.http.get<StorageUsage>(apiUrl('/storage/usage')));
  }

  /** Oublie l'URL d'objet d'un document : le prochain affichage la recréera. */
  release(documentId: string): void {
    const url = this.urls.get(documentId);
    if (!url) return;
    URL.revokeObjectURL(url);
    this.urls.delete(documentId);
  }

  releaseAll(): void {
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
  }
}
