import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { SyncService } from '../../core/services/sync.service';
import { Store } from '../../core/store';
import { IconComponent } from '../../shared/icon.component';

type Mode = 'connexion' | 'inscription';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, IconComponent],
  template: `
    <div class="auth">
      <div class="auth__card card">
        <div class="auth__brand">
          <app-icon name="brand" />
          <div>
            <h1>Assistant d'administration</h1>
            <p class="muted">Vos documents et contrats, sauvegardés sur votre serveur.</p>
          </div>
        </div>

        <div class="auth__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="mode() === 'connexion'"
            [class.is-active]="mode() === 'connexion'"
            (click)="setMode('connexion')"
          >
            Connexion
          </button>
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="mode() === 'inscription'"
            [class.is-active]="mode() === 'inscription'"
            (click)="setMode('inscription')"
          >
            Créer un compte
          </button>
        </div>

        <form (ngSubmit)="submit()">
          @if (mode() === 'inscription') {
            <div class="grid2">
              <div class="field">
                <label for="a-first">Prénom</label>
                <input id="a-first" class="input" [(ngModel)]="firstName" name="firstName" autocomplete="given-name" />
              </div>
              <div class="field">
                <label for="a-last">Nom</label>
                <input id="a-last" class="input" [(ngModel)]="lastName" name="lastName" autocomplete="family-name" />
              </div>
            </div>
          }

          <div class="field">
            <label for="a-mail">Adresse e-mail</label>
            <input
              id="a-mail"
              class="input"
              type="email"
              required
              [(ngModel)]="email"
              name="email"
              autocomplete="email"
            />
          </div>

          <div class="field">
            <label for="a-pwd">Mot de passe</label>
            <input
              id="a-pwd"
              class="input"
              type="password"
              required
              [(ngModel)]="password"
              name="password"
              [attr.autocomplete]="mode() === 'inscription' ? 'new-password' : 'current-password'"
            />
            @if (mode() === 'inscription') {
              <p class="hint">8 caractères minimum.</p>
            }
          </div>

          @if (error()) {
            <p class="auth__error" role="alert"><app-icon name="warning" /> {{ error() }}</p>
          }

          <button type="submit" class="btn btn--primary btn--block" [disabled]="busy()">
            @if (busy()) {
              <app-icon name="refresh" /> Connexion en cours…
            } @else {
              <app-icon name="lock" /> {{ mode() === 'connexion' ? 'Se connecter' : 'Créer mon compte' }}
            }
          </button>
        </form>

        @if (mode() === 'inscription') {
          <p class="auth__note">
            <app-icon name="info" />
            Votre coffre démarre vide. Vous pourrez charger un jeu de démonstration depuis les paramètres.
          </p>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .auth {
        display: flex;
        justify-content: center;
        align-items: flex-start;
        padding: 24px 0 60px;
      }

      .auth__card {
        width: 100%;
        max-width: 420px;
      }

      .auth__brand {
        display: flex;
        gap: 14px;
        align-items: flex-start;
        margin-bottom: 22px;
      }
      .auth__brand h1 {
        font-size: 1.15rem;
        margin: 0 0 4px;
      }
      .auth__brand p {
        margin: 0;
        font-size: 0.84rem;
      }

      .auth__tabs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        margin-bottom: 20px;
        padding: 4px;
        border-radius: 10px;
        background: var(--surface-2, rgba(128, 128, 128, 0.12));
      }
      .auth__tabs button {
        padding: 9px 10px;
        border: 0;
        border-radius: 7px;
        background: transparent;
        color: var(--text-muted);
        font: inherit;
        font-size: 0.88rem;
        cursor: pointer;
      }
      .auth__tabs button.is-active {
        background: var(--surface);
        color: var(--text);
        font-weight: 600;
        box-shadow: 0 1px 3px rgb(0 0 0 / 12%);
      }

      .hint {
        margin: 6px 0 0;
        font-size: 0.76rem;
        color: var(--text-muted);
      }

      .auth__error {
        display: flex;
        gap: 8px;
        align-items: center;
        margin: 0 0 14px;
        padding: 10px 12px;
        border-radius: 8px;
        background: rgb(220 38 38 / 10%);
        color: var(--danger, #dc2626);
        font-size: 0.84rem;
      }

      .btn--block {
        width: 100%;
        justify-content: center;
      }

      .auth__note {
        display: flex;
        gap: 8px;
        align-items: flex-start;
        margin: 18px 0 0;
        font-size: 0.78rem;
        color: var(--text-muted);
        line-height: 1.5;
      }
    `,
  ],
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly sync = inject(SyncService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly store = inject(Store);

  protected readonly mode = signal<Mode>('connexion');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected email = '';
  protected password = '';
  protected firstName = '';
  protected lastName = '';

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
    this.error.set('');
  }

  protected async submit(): Promise<void> {
    if (this.busy()) return;
    if (!this.email.trim() || !this.password) {
      this.error.set('Renseignez votre adresse e-mail et votre mot de passe.');
      return;
    }

    this.busy.set(true);
    this.error.set('');

    try {
      if (this.mode() === 'inscription') {
        const created = await this.auth.register({
          email: this.email.trim(),
          password: this.password,
          firstName: this.firstName.trim(),
          lastName: this.lastName.trim(),
        });

        // Compte neuf : on repart d'un coffre vide. Reprendre ce que contient
        // l'appareil ferait hériter le compte du cache de la session
        // précédente, jeu de démonstration compris.
        this.sync.reset();
        this.store.clear(created.profile);
        this.sync.resume();
        await this.sync.push();
      } else {
        await this.auth.login(this.email.trim(), this.password);
        // Le serveur fait autorité : on jette la version locale avant de lire.
        this.sync.reset();
        this.sync.resume();
        await this.sync.pull();
      }

      const returnTo = this.route.snapshot.queryParamMap.get('returnTo');
      await this.router.navigateByUrl(returnTo || '/tableau-de-bord');
    } catch (error) {
      this.error.set(messageFor(error));
    } finally {
      this.busy.set(false);
    }
  }
}

function messageFor(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) return 'Une erreur inattendue est survenue.';
  // Statut 0 : la requête n'a pas abouti — serveur arrêté, mauvaise URL d'API,
  // ou origine refusée par CORS.
  if (error.status === 0) {
    return "Serveur injoignable. Vérifiez qu'il est démarré et que l'adresse de l'API est correcte.";
  }
  return (error.error?.error as string | undefined) ?? `Erreur ${error.status}.`;
}
