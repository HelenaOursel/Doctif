import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { SyncService } from '../../core/services/sync.service';
import { IconComponent } from '../../shared/icon.component';

/**
 * Choix d'un nouveau mot de passe, depuis le lien reçu par e-mail.
 *
 * Le jeton vient de l'URL et n'est jamais affiché : il tient lieu de preuve
 * d'identité le temps d'un formulaire. Le serveur renvoie une session en même
 * temps que la confirmation — redemander le mot de passe qu'on vient de
 * choisir n'apprendrait rien à personne.
 */
@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [FormsModule, RouterLink, IconComponent],
  template: `
    <div class="auth">
      <div class="auth__card card">
        <div class="auth__brand">
          <app-icon name="brand" />
          <div>
            <h1>Nouveau mot de passe</h1>
            <p class="muted">Choisissez-en un que vous n'utilisez nulle part ailleurs.</p>
          </div>
        </div>

        @if (!token) {
          <p class="auth__error" role="alert">
            <app-icon name="warning" />
            Ce lien est incomplet. Redemandez-en un depuis l'écran de connexion.
          </p>
          <a class="btn btn--primary btn--block" routerLink="/connexion">
            <app-icon name="back" /> Retour à la connexion
          </a>
        } @else {
          <form (ngSubmit)="submit()">
            <div class="field">
              <label for="r-pwd">Mot de passe</label>
              <input
                id="r-pwd"
                class="input"
                type="password"
                required
                autocomplete="new-password"
                [(ngModel)]="password"
                name="password"
              />
              <p class="hint">8 caractères minimum.</p>
            </div>

            <div class="field">
              <label for="r-confirm">Confirmation</label>
              <input
                id="r-confirm"
                class="input"
                type="password"
                required
                autocomplete="new-password"
                [(ngModel)]="confirmation"
                name="confirmation"
              />
            </div>

            @if (error()) {
              <p class="auth__error" role="alert"><app-icon name="warning" /> {{ error() }}</p>
            }

            <button type="submit" class="btn btn--primary btn--block" [disabled]="busy()">
              @if (busy()) {
                <app-icon name="refresh" /> Enregistrement…
              } @else {
                <app-icon name="lock" /> Enregistrer et me connecter
              }
            </button>
          </form>
        }
      </div>
    </div>
  `,
})
export class ResetPasswordComponent {
  private readonly auth = inject(AuthService);
  private readonly sync = inject(SyncService);
  private readonly router = inject(Router);

  /** Lu une seule fois : le lien n'est ouvert qu'une fois, par définition. */
  protected readonly token = inject(ActivatedRoute).snapshot.queryParamMap.get('token') ?? '';

  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected password = '';
  protected confirmation = '';

  protected async submit(): Promise<void> {
    if (this.busy()) return;

    if (this.password.length < 8) {
      this.error.set('Le mot de passe doit faire au moins 8 caractères.');
      return;
    }
    if (this.password !== this.confirmation) {
      this.error.set('Les deux mots de passe ne correspondent pas.');
      return;
    }

    this.busy.set(true);
    this.error.set('');

    try {
      await this.auth.reset(this.token, this.password);

      // Même précaution qu'à la connexion : le serveur fait autorité, on jette
      // ce que l'appareil avait en cache avant de relire.
      this.sync.reset();
      this.sync.resume();
      await this.sync.pull();

      await this.router.navigateByUrl('/tableau-de-bord');
    } catch (error) {
      this.error.set(messageFor(error));
    } finally {
      this.busy.set(false);
    }
  }
}

function messageFor(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) return 'Une erreur inattendue est survenue.';
  if (error.status === 0) {
    return "Serveur injoignable. Vérifiez qu'il est démarré et que l'adresse de l'API est correcte.";
  }
  return (error.error?.error as string | undefined) ?? `Erreur ${error.status}.`;
}
