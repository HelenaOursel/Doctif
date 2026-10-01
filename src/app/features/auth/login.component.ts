import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { SyncService } from '../../core/services/sync.service';
import { Store } from '../../core/store';
import { IconComponent } from '../../shared/icon.component';

type Mode = 'connexion' | 'inscription' | 'oubli';

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
            <h1>Paprasse</h1>
            <p class="muted">Vos documents et contrats, sauvegardés sur votre serveur.</p>
          </div>
        </div>

        <div class="auth__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="mode() !== 'inscription'"
            [class.is-active]="mode() !== 'inscription'"
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

          @if (mode() !== 'oubli') {
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
          }

          @if (sent()) {
            <p class="auth__sent" role="status">
              <app-icon name="success" />
              Si un compte existe pour cette adresse, un lien de réinitialisation vient d'y être envoyé. Il est
              valable une heure.
            </p>
          }

          @if (error()) {
            <p class="auth__error" role="alert"><app-icon name="warning" /> {{ error() }}</p>
          }

          <button type="submit" class="btn btn--primary btn--block" [disabled]="busy()">
            @if (busy()) {
              <app-icon name="refresh" /> {{ mode() === 'oubli' ? 'Envoi en cours…' : 'Connexion en cours…' }}
            } @else {
              <app-icon [name]="mode() === 'oubli' ? 'mail' : 'lock'" /> {{ submitLabel() }}
            }
          </button>
        </form>

        @if (mode() === 'connexion') {
          <button type="button" class="auth__link" (click)="setMode('oubli')">Mot de passe oublié ?</button>
        } @else if (mode() === 'oubli') {
          <button type="button" class="auth__link" (click)="setMode('connexion')">
            Revenir à la connexion
          </button>
        }

        @if (mode() === 'inscription') {
          <p class="auth__note">
            <app-icon name="info" />
            Votre coffre démarre vide. Vous pourrez charger un jeu de démonstration depuis les paramètres.
          </p>
        }
      </div>
    </div>
  `,
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
  /** Confirmation d'envoi, affichée jusqu'au prochain changement de mode. */
  protected readonly sent = signal(false);

  protected readonly submitLabel = computed(() => {
    switch (this.mode()) {
      case 'inscription':
        return 'Créer mon compte';
      case 'oubli':
        return 'Recevoir un lien';
      default:
        return 'Se connecter';
    }
  });

  protected email = '';
  protected password = '';
  protected firstName = '';
  protected lastName = '';

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
    this.error.set('');
    this.sent.set(false);
  }

  /**
   * Demande d'un lien de réinitialisation.
   *
   * La confirmation est volontairement vague : le serveur ne dit pas si
   * l'adresse existe, et l'écran ne doit pas prétendre en savoir plus.
   */
  private async requestReset(): Promise<void> {
    if (!this.email.trim()) {
      this.error.set('Renseignez votre adresse e-mail.');
      return;
    }

    this.busy.set(true);
    this.error.set('');

    try {
      await this.auth.forgot(this.email.trim());
      this.sent.set(true);
    } catch (error) {
      this.error.set(messageFor(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async submit(): Promise<void> {
    if (this.busy()) return;
    if (this.mode() === 'oubli') {
      await this.requestReset();
      return;
    }

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

/* --- Mot de passe oublié ----------------------------------------------- */

function messageFor(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) return 'Une erreur inattendue est survenue.';
  // Statut 0 : la requête n'a pas abouti — serveur arrêté, mauvaise URL d'API,
  // ou origine refusée par CORS.
  if (error.status === 0) {
    return "Serveur injoignable. Vérifiez qu'il est démarré et que l'adresse de l'API est correcte.";
  }
  return (error.error?.error as string | undefined) ?? `Erreur ${error.status}.`;
}
