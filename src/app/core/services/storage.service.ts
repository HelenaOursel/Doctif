import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

/** Clés persistées. Elles sont hydratées en bloc au démarrage sur mobile. */
export const STORAGE_KEYS = [
  'assistant-admin.state.v1',
  'assistant-admin.theme',
  'assistant-admin.locale',
] as const;

export type StorageKey = (typeof STORAGE_KEYS)[number];

/**
 * Persistance unifiée web / mobile.
 *
 * Sur mobile, `localStorage` appartient au WebView : le système peut le purger
 * pour récupérer de l'espace, ce qui effacerait le coffre-fort. Les données
 * passent donc par `@capacitor/preferences`, adossé à SharedPreferences sur
 * Android et à UserDefaults sur iOS, que le système préserve.
 *
 * L'API de Preferences est asynchrone alors que l'application lit son état de
 * façon synchrone à la construction de ses services. Le pont est un cache
 * mémoire : `hydrate()` le remplit une fois avant le démarrage (voir
 * `provideAppInitializer` dans app.config.ts), les lectures ultérieures y
 * puisent sans attente et les écritures y sont appliquées immédiatement, puis
 * propagées au stockage natif sans bloquer l'appelant.
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly native = Capacitor.isNativePlatform();
  private readonly cache = new Map<string, string>();

  /** Renseigne le cache depuis le stockage natif. Sans effet sur le web. */
  async hydrate(): Promise<void> {
    if (!this.native) return;
    await Promise.all(
      STORAGE_KEYS.map(async (key) => {
        try {
          const { value } = await Preferences.get({ key });
          if (value !== null) this.cache.set(key, value);
        } catch {
          // Clé illisible : l'application repartira de son état par défaut.
        }
      }),
    );
  }

  get(key: StorageKey): string | null {
    if (this.native) return this.cache.get(key) ?? null;
    try {
      return localStorage.getItem(key);
    } catch {
      // Navigation privée ou stockage refusé.
      return null;
    }
  }

  set(key: StorageKey, value: string): void {
    if (this.native) {
      this.cache.set(key, value);
      // Volontairement non attendu : l'appelant est synchrone. Un échec
      // d'écriture ne doit pas interrompre l'interaction en cours.
      void Preferences.set({ key, value }).catch(() => undefined);
      return;
    }
    try {
      localStorage.setItem(key, value);
    } catch {
      // Quota dépassé : l'état reste valable pour la session en cours.
    }
  }

  remove(key: StorageKey): void {
    if (this.native) {
      this.cache.delete(key);
      void Preferences.remove({ key }).catch(() => undefined);
      return;
    }
    try {
      localStorage.removeItem(key);
    } catch {
      // ignoré
    }
  }
}
