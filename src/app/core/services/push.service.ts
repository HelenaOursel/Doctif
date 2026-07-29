import { Injectable, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { Router } from '@angular/router';
import { UiService } from './ui.service';

export type PushStatus = 'indisponible' | 'inactif' | 'refuse' | 'actif' | 'erreur';

/**
 * Notifications poussées.
 *
 * IMPORTANT — le plugin s'appuie sur les services du système : Firebase Cloud
 * Messaging sur Android, APNs sur iOS. Tant que `android/app/google-services.json`
 * est absent (et, côté iOS, tant que la capacité Push n'est pas activée dans
 * Xcode), `register()` échouera à l'exécution. Le service est écrit pour
 * échouer proprement plutôt que d'interrompre l'application : `status` passe à
 * « erreur » et l'application reste utilisable.
 *
 * L'enregistrement n'est volontairement pas déclenché au démarrage : demander
 * l'autorisation dès la première seconde est le meilleur moyen de se la voir
 * refuser définitivement. Il est appelé depuis les Paramètres, quand
 * l'utilisateur décide d'activer les rappels d'échéance.
 */
@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly ui = inject(UiService);
  private readonly router = inject(Router);

  readonly status = signal<PushStatus>(
    Capacitor.isNativePlatform() ? 'inactif' : 'indisponible',
  );

  /** Jeton d'appareil, à transmettre au serveur d'envoi le jour venu. */
  readonly token = signal<string | null>(null);

  readonly isAvailable = Capacitor.isNativePlatform();

  async register(): Promise<PushStatus> {
    if (!this.isAvailable) {
      this.status.set('indisponible');
      return 'indisponible';
    }

    try {
      let perm = await PushNotifications.checkPermissions();
      if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
        perm = await PushNotifications.requestPermissions();
      }
      if (perm.receive !== 'granted') {
        this.status.set('refuse');
        return 'refuse';
      }

      await this.attachListeners();
      await PushNotifications.register();
      this.status.set('actif');
      return 'actif';
    } catch {
      // Cas le plus courant : configuration Firebase / APNs absente.
      this.status.set('erreur');
      return 'erreur';
    }
  }

  private async attachListeners(): Promise<void> {
    // `removeAllListeners` évite les doublons si l'utilisateur relance
    // l'activation depuis les Paramètres.
    await PushNotifications.removeAllListeners();

    await PushNotifications.addListener('registration', (t) => this.token.set(t.value));

    await PushNotifications.addListener('registrationError', () => this.status.set('erreur'));

    // Notification reçue alors que l'application est au premier plan : le
    // système ne l'affiche pas, on la relaie dans l'interface.
    await PushNotifications.addListener('pushNotificationReceived', (n) => {
      this.ui.info(n.title ?? 'Rappel', n.body ?? '');
    });

    // Notification ouverte depuis le centre de notifications.
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const route = action.notification.data?.['route'];
      void this.router.navigateByUrl(typeof route === 'string' && route ? route : '/alertes');
    });
  }
}
