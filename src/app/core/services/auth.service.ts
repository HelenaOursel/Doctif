import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { UserProfile } from '../models';
import { apiUrl } from './api';
import { StorageService } from './storage.service';

const TOKEN_KEY = 'assistant-admin.token';

interface AuthResponse {
  token: string;
  profile: UserProfile;
  version: number;
}

/**
 * Session utilisateur.
 *
 * Le jeton transite par `StorageService` plutôt que par `localStorage` : sur
 * mobile, le WebView peut être purgé par le système, ce qui déconnecterait
 * l'utilisateur sans raison visible. `@capacitor/preferences` le préserve.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly storage = inject(StorageService);

  readonly token = signal<string | null>(null);
  readonly isAuthenticated = computed(() => this.token() !== null);

  /**
   * Relit le jeton conservé. Appelé au démarrage, après l'hydratation du
   * stockage natif — d'où la lecture synchrone.
   */
  restore(): void {
    this.token.set(this.storage.get(TOKEN_KEY));
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    return this.accept(
      await firstValueFrom(this.http.post<AuthResponse>(apiUrl('/auth/login'), { email, password })),
    );
  }

  async register(fields: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }): Promise<AuthResponse> {
    return this.accept(
      await firstValueFrom(this.http.post<AuthResponse>(apiUrl('/auth/register'), fields)),
    );
  }

  /**
   * Demande d'un lien de réinitialisation.
   *
   * Le serveur répond la même chose que l'adresse existe ou non : l'appelant
   * ne peut donc rien en déduire, et ne doit rien afficher d'autre que « si un
   * compte existe, un e-mail est parti ».
   */
  async forgot(email: string): Promise<void> {
    await firstValueFrom(this.http.post<{ ok: true }>(apiUrl('/auth/forgot'), { email }));
  }

  /**
   * Nouveau mot de passe contre un jeton reçu par e-mail.
   *
   * Le serveur renvoie une session : le lien cliqué depuis sa boîte mail vaut
   * preuve d'identité, redemander de se connecter n'ajouterait rien.
   */
  async reset(token: string, password: string): Promise<AuthResponse> {
    return this.accept(
      await firstValueFrom(this.http.post<AuthResponse>(apiUrl('/auth/reset'), { token, password })),
    );
  }

  logout(): void {
    this.token.set(null);
    this.storage.remove(TOKEN_KEY);
  }

  private accept(response: AuthResponse): AuthResponse {
    this.token.set(response.token);
    this.storage.set(TOKEN_KEY, response.token);
    return response;
  }
}
