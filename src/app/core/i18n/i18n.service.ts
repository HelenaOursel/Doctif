import { Injectable, Pipe, PipeTransform, computed, inject, signal } from '@angular/core';
import {
  DEFAULT_LOCALE,
  Dictionary,
  FR,
  LOCALES,
  LocaleCode,
  LocaleMeta,
  TranslationKey,
} from './translations';
import { StorageService } from '../services/storage.service';

const STORAGE_KEY = 'assistant-admin.locale';

/**
 * Traduction à l'exécution.
 *
 * Le choix d'un service à base de signaux plutôt que du i18n natif d'Angular
 * est délibéré : ce dernier compile un bundle par langue et impose un
 * rechargement complet pour en changer. Ici la bascule est instantanée et
 * l'ajout d'une langue ne demande qu'un dictionnaire supplémentaire.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  // Déclaré en premier : les initialiseurs de champs s'exécutent dans l'ordre
  // d'écriture et `readStoredLocale` a besoin du service.
  private readonly storage = inject(StorageService);

  private readonly current = signal<LocaleCode>(readStoredLocale(this.storage));

  readonly locale = this.current.asReadonly();
  readonly available: LocaleMeta[] = Object.values(LOCALES).map((l) => l.meta);
  readonly meta = computed(() => LOCALES[this.current()].meta);

  /** Dictionnaire actif, complété par le français pour les clés absentes. */
  private readonly dictionary = computed<Dictionary>(() => ({
    ...FR,
    ...LOCALES[this.current()].dictionary,
  }));

  constructor() {
    this.applyDocumentLang(this.current());
  }

  /**
   * Traduit une clé. Les paramètres nommés remplacent les jetons `{nom}`.
   *
   * Cette méthode dépend du signal `dictionary` : toute lecture faite dans un
   * template ou un `computed` se recalcule automatiquement au changement de
   * langue.
   */
  t(key: TranslationKey, params?: Record<string, string | number>): string {
    const template = this.dictionary()[key] ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match,
    );
  }

  setLocale(code: LocaleCode): void {
    if (!LOCALES[code]) return;
    this.current.set(code);
    this.applyDocumentLang(code);
    this.storage.set(STORAGE_KEY, code);
  }

  /** Étiquette BCP 47 à passer aux API `Intl` pour dates et nombres. */
  get intlTag(): string {
    return LOCALES[this.current()].meta.tag;
  }

  private applyDocumentLang(code: LocaleCode): void {
    document.documentElement.setAttribute('lang', LOCALES[code].meta.tag);
  }
}

/**
 * Pipe de traduction : `{{ 'nav.vault' | t }}`.
 * Impure afin de se recalculer lorsque la langue change.
 */
@Pipe({ name: 't', standalone: true, pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(key: TranslationKey, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }
}

function readStoredLocale(storage: StorageService): LocaleCode {
  const stored = storage.get(STORAGE_KEY);
  if (stored && stored in LOCALES) return stored as LocaleCode;
  const browser = navigator.language.slice(0, 2);
  return browser in LOCALES ? (browser as LocaleCode) : DEFAULT_LOCALE;
}
