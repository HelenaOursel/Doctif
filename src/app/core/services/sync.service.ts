import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AppState } from '../models';
import { Store } from '../store';
import { apiUrl } from './api';
import { AuthService } from './auth.service';
import { StorageService } from './storage.service';
import { UiService } from './ui.service';

export type SyncStatus = 'hors-ligne' | 'synchronise' | 'en-cours' | 'conflit' | 'deconnecte';

const VERSION_KEY = 'assistant-admin.state-version';

/** Laisse retomber une rafale de modifications avant d'envoyer l'état complet. */
const DEBOUNCE_MS = 1500;
/** Nouvelle tentative après un échec réseau. */
const RETRY_MS = 15_000;

interface StateResponse {
  state: AppState;
  version: number;
}

/**
 * Synchronisation de l'état complet avec l'API.
 *
 * Le Store reste la source de vérité en mémoire et conserve son écriture dans
 * le stockage local : celui-ci devient le cache hors ligne. Ce service ne fait
 * que deux choses — charger l'état du serveur au démarrage, et y renvoyer
 * l'état après chaque modification, une fois la rafale retombée.
 *
 * Aucun composant n'est concerné : ils continuent de lire et d'écrire dans le
 * Store de façon synchrone.
 */
@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(Store);
  private readonly auth = inject(AuthService);
  private readonly storage = inject(StorageService);
  private readonly ui = inject(UiService);
  private readonly router = inject(Router);

  readonly status = signal<SyncStatus>('deconnecte');
  readonly lastSyncedAt = signal<Date | null>(null);
  readonly pending = computed(() => this.status() === 'en-cours');

  /** Version détenue par le client ; sert au serveur à détecter un conflit. */
  private version: number | null = null;
  /**
   * Tant que la synchronisation est suspendue, les modifications du Store ne
   * déclenchent aucun envoi. Indispensable pendant l'hydratation, sinon l'état
   * qu'on vient de recevoir repartirait aussitôt vers le serveur.
   */
  private suspended = true;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  /**
   * Dernier état connu du serveur, par référence. Le Store remplace son état de
   * façon immuable : une égalité de référence signifie donc « rien n'a changé ».
   * Sans ce garde-fou, l'état tout juste reçu repartirait aussitôt en écriture,
   * l'effet se déclenchant après la fin de `pull()`.
   */
  private lastSynced: AppState | null = null;

  constructor() {
    const stored = this.storage.get(VERSION_KEY);
    this.version = stored === null ? null : Number(stored);

    effect(() => {
      // Dépendance explicite : toute mutation du Store réveille cet effet.
      const snapshot = this.store.snapshot();
      if (this.suspended || !this.auth.isAuthenticated()) return;
      if (snapshot === this.lastSynced) return;
      this.schedulePush();
    });

    inject(DestroyRef).onDestroy(() => this.clearTimer());
  }

  /**
   * Charge l'état du serveur au démarrage ou après connexion.
   *
   * Le serveur fait autorité, sans exception : un compte vide donne une
   * application vide. Reprendre le contenu local quand le serveur n'a rien
   * ferait hériter chaque nouveau compte du cache présent sur l'appareil —
   * c'est-à-dire du jeu de démonstration.
   */
  async pull(): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      this.status.set('deconnecte');
      return;
    }

    this.suspended = true;
    this.status.set('en-cours');

    try {
      const response = await firstValueFrom(this.http.get<StateResponse>(apiUrl('/state')));
      this.setVersion(response.version);
      this.store.hydrate(response.state);
      this.lastSynced = this.store.snapshot();
      this.markSynced();
    } catch (error) {
      await this.handleError(error, 'chargement');
    } finally {
      this.suspended = false;
    }
  }

  /** Envoie l'état courant. Les appels concurrents s'attendent. */
  async push(): Promise<void> {
    if (!this.auth.isAuthenticated() || this.suspended) return;
    if (this.inFlight) return this.inFlight;

    this.clearTimer();
    this.status.set('en-cours');

    this.inFlight = (async () => {
      // L'instantané est figé ici : une modification survenant pendant l'envoi
      // ne doit pas être marquée comme synchronisée à tort.
      const snapshot = this.store.snapshot();
      try {
        const response = await firstValueFrom(
          this.http.put<{ version: number }>(apiUrl('/state'), {
            state: snapshot,
            version: this.version ?? undefined,
          }),
        );
        this.setVersion(response.version);
        this.lastSynced = snapshot;
        this.markSynced();
      } catch (error) {
        await this.handleError(error, 'sauvegarde');
      } finally {
        this.inFlight = null;
      }
    })();

    return this.inFlight;
  }

  /**
   * Garantit que l'état COURANT est arrivé sur le serveur.
   *
   * `push()` se contente de rejoindre un envoi déjà en cours, dont l'instantané
   * peut avoir été figé avant la dernière modification. C'est sans conséquence
   * pour une sauvegarde de fond, mais pas avant de déposer un fichier : le
   * serveur refuse un dépôt sur un document qu'il ne connaît pas encore.
   */
  async flush(): Promise<void> {
    if (this.inFlight) await this.inFlight;
    if (this.store.snapshot() === this.lastSynced) return;
    await this.push();
  }

  /**
   * Met fin à une session que le serveur ne reconnaît plus — jeton expiré, ou
   * compte supprimé côté base.
   *
   * Public car le rejet en 401 ne se produit pas qu'à la synchronisation :
   * l'extraction d'un PDF le rencontre aussi, et doit conduire au même endroit
   * plutôt que de laisser l'utilisateur travailler avec une session morte.
   */
  async expireSession(): Promise<void> {
    if (!this.auth.isAuthenticated()) return;
    this.auth.logout();
    this.reset();
    // Le garde de route ne se réévalue pas tout seul : sans cette redirection,
    // l'utilisateur resterait sur un écran alimenté par le cache d'une session
    // qui n'existe plus.
    this.store.clear();
    await this.router.navigateByUrl('/connexion');
    this.ui.warn('Session expirée', 'Reconnectez-vous pour retrouver vos données.');
  }

  /** Oublie la session : jeton, version et statut. */
  reset(): void {
    this.clearTimer();
    this.suspended = true;
    this.version = null;
    this.lastSynced = null;
    this.storage.remove(VERSION_KEY);
    this.status.set('deconnecte');
    this.lastSyncedAt.set(null);
  }

  /** Autorise les envois — après une connexion réussie. */
  resume(): void {
    this.suspended = false;
  }

  /* --- Interne ------------------------------------------------------------ */

  private schedulePush(): void {
    this.clearTimer();
    this.timer = setTimeout(() => void this.push(), DEBOUNCE_MS);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private setVersion(version: number): void {
    this.version = version;
    this.storage.set(VERSION_KEY, String(version));
  }

  private markSynced(): void {
    this.status.set('synchronise');
    this.lastSyncedAt.set(new Date());
  }

  private async handleError(error: unknown, phase: 'chargement' | 'sauvegarde'): Promise<void> {
    if (!(error instanceof HttpErrorResponse)) {
      this.status.set('hors-ligne');
      return;
    }

    // Un autre appareil a écrit entre-temps : le serveur renvoie son état.
    if (error.status === 409) {
      const body = error.error as StateResponse | undefined;
      if (body?.state) {
        this.suspended = true;
        this.store.hydrate(body.state);
        this.lastSynced = this.store.snapshot();
        this.setVersion(body.version);
        this.suspended = false;
      }
      this.status.set('conflit');
      this.ui.warn(
        'Données rechargées',
        'Vos données avaient été modifiées ailleurs : la version du serveur a été reprise.',
      );
      return;
    }

    if (error.status === 401) {
      await this.expireSession();
      return;
    }

    if (error.status === 400) {
      // Un état que le serveur refuse ne passera jamais : réessayer en boucle
      // n'apporterait rien, on le signale pour qu'il soit corrigeable.
      const problems = (error.error?.problems as string[] | undefined) ?? [];
      this.status.set('hors-ligne');
      this.ui.error('Sauvegarde refusée', problems[0] ?? 'Données non conformes.');
      console.error('[sync] état refusé par le serveur :', problems);
      return;
    }

    // Statut 0 : serveur injoignable. L'application reste utilisable sur son
    // cache local, et l'envoi est retenté.
    this.status.set('hors-ligne');
    if (phase === 'sauvegarde') {
      this.clearTimer();
      this.timer = setTimeout(() => void this.push(), RETRY_MS);
    }
  }
}
