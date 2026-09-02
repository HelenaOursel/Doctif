import { Injectable, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import $ from 'jquery';
import { ICONS } from '../icons';
import { StorageService } from './storage.service';

export type ToastKind = 'success' | 'warning' | 'danger' | 'info';

/** Classes Font Awesome par type de notification. */
const TOAST_ICONS: Record<ToastKind, string> = {
  success: ICONS.success,
  warning: ICONS.warning,
  danger: ICONS.danger,
  info: ICONS.info,
};

const THEME_KEY = 'assistant-admin.theme';

/**
 * Couche d'interface pilotée par jQuery.
 *
 * jQuery gère ici ce qui vit **hors** de l'arbre Angular ou relève d'animations
 * impératives : notifications éphémères, tiroir de navigation mobile, sections
 * repliables et défilement fluide. Le reste de l'interface reste déclaratif.
 */
@Injectable({ providedIn: 'root' })
export class UiService {
  // Déclaré en premier : les initialiseurs de champs s'exécutent dans l'ordre
  // d'écriture et `readStoredTheme` a besoin du service.
  private readonly storage = inject(StorageService);

  /** Ouverture du tiroir de navigation (mobile / tablette). */
  readonly drawerOpen = signal(false);
  readonly theme = signal<'light' | 'dark'>(readStoredTheme(this.storage));

  private toastHost: JQuery<HTMLElement> | null = null;

  constructor() {
    this.applyTheme(this.theme());
  }

  /* --- Notifications ------------------------------------------------------ */

  toast(title: string, message = '', kind: ToastKind = 'info', duration = 4200): void {
    const host = this.ensureToastHost();

    const $body = $('<div>', { class: 'jq-toast__body' }).append(
      $('<div>', { class: 'jq-toast__title', text: title }),
    );
    if (message) $body.append($('<div>', { class: 'jq-toast__msg', text: message }));

    const $toast = $('<div>', { class: `jq-toast jq-toast--${kind}`, role: 'status', 'aria-live': 'polite' }).append(
      $('<span>', { class: 'jq-toast__icon' }).append(
        $('<i>', { class: TOAST_ICONS[kind], 'aria-hidden': 'true' }),
      ),
      $body,
    );

    $toast.css({ opacity: 0, transform: 'translateY(12px)' }).appendTo(host);
    $toast.animate({ opacity: 1 }, 180);
    // La translation n'est pas animable par .animate() : on la relâche via CSS.
    requestAnimationFrame(() => $toast.css({ transition: 'transform .18s ease', transform: 'translateY(0)' }));

    const dismiss = () => {
      $toast.stop(true).animate({ opacity: 0, height: 0, marginTop: 0, paddingTop: 0, paddingBottom: 0 }, 200, () =>
        $toast.remove(),
      );
    };

    const timer = window.setTimeout(dismiss, duration);
    $toast.on('click', () => {
      window.clearTimeout(timer);
      dismiss();
    });
  }

  success(title: string, message = ''): void {
    this.toast(title, message, 'success');
  }

  warn(title: string, message = ''): void {
    this.toast(title, message, 'warning');
  }

  error(title: string, message = ''): void {
    this.toast(title, message, 'danger');
  }

  info(title: string, message = ''): void {
    this.toast(title, message, 'info');
  }

  /** Message standard lorsqu'une action est bloquée par le mode archive. */
  readOnlyBlocked(): void {
    this.warn('Mode archive', 'Vos données sont en lecture seule. Réactivez le service pour les modifier.');
  }

  private ensureToastHost(): JQuery<HTMLElement> {
    if (this.toastHost && this.toastHost.parent().length) return this.toastHost;
    let host = $('#jq-toast-host');
    if (!host.length) host = $('<div>', { id: 'jq-toast-host' }).appendTo('body');
    this.toastHost = host;
    return host;
  }

  /* --- Tiroir de navigation ----------------------------------------------- */

  openDrawer(): void {
    this.drawerOpen.set(true);
    $('body').css('overflow', 'hidden');
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
    $('body').css('overflow', '');
  }

  toggleDrawer(): void {
    this.drawerOpen() ? this.closeDrawer() : this.openDrawer();
  }

  /* --- Animations utilitaires --------------------------------------------- */

  /** Replie/déplie un bloc et renvoie son nouvel état. */
  toggleCollapse(element: HTMLElement, expanded: boolean, duration = 200): void {
    const $el = $(element);
    if (prefersReducedMotion()) {
      $el.toggle(!expanded);
      return;
    }
    expanded ? $el.stop(true, true).slideUp(duration) : $el.stop(true, true).slideDown(duration);
  }

  /** Défilement fluide vers un élément, en compensant l'en-tête fixe. */
  scrollTo(selector: string | HTMLElement, offset = 76): void {
    const $target = typeof selector === 'string' ? $(selector) : $(selector);
    if (!$target.length) return;
    const top = ($target.offset()?.top ?? 0) - offset;

    if (prefersReducedMotion()) {
      window.scrollTo(0, Math.max(0, top));
      return;
    }
    $('html, body').stop(true).animate({ scrollTop: Math.max(0, top) }, 380);
  }

  /** Attire l'attention sur un élément après une navigation ou une création. */
  flash(element: HTMLElement): void {
    const $el = $(element);
    if (prefersReducedMotion()) return;
    $el
      .stop(true, true)
      .css({ transition: 'none', boxShadow: '0 0 0 3px var(--primary-soft)' })
      .delay(650)
      .queue((next) => {
        $el.css({ transition: 'box-shadow .5s ease', boxShadow: 'none' });
        next();
      });
  }

  /** Compteur animé, utilisé sur les tuiles chiffrées du tableau de bord. */
  countUp(element: HTMLElement, to: number, format: (n: number) => string, duration = 700): void {
    if (prefersReducedMotion()) {
      element.textContent = format(to);
      return;
    }
    const state = { value: 0 };
    $(state).stop(true).animate(
      { value: to },
      {
        duration,
        easing: 'swing',
        step: (now: number) => {
          element.textContent = format(now);
        },
        complete: () => {
          element.textContent = format(to);
        },
      },
    );
  }

  /* --- Thème -------------------------------------------------------------- */

  toggleTheme(): void {
    const next = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    this.applyTheme(next);
    this.storage.set(THEME_KEY, next);
  }

  private applyTheme(theme: 'light' | 'dark'): void {
    document.documentElement.setAttribute('data-theme', theme);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#0e1017' : '#f5f6fa');
  }

  /* --- Divers -------------------------------------------------------------- */

  async copy(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Repli pour les contextes non sécurisés où l'API Clipboard est absente.
      const $ta = $('<textarea>').val(text).css({ position: 'fixed', top: '-1000px' }).appendTo('body');
      ($ta[0] as HTMLTextAreaElement).select();
      const ok = document.execCommand('copy');
      $ta.remove();
      return ok;
    }
  }

  /**
   * Enregistre un fichier.
   *
   * Sur mobile il n'existe pas de « dossier de téléchargements » atteignable
   * par un lien `download` : le WebView ignore l'attribut. Le contenu est donc
   * écrit dans le dossier Documents de l'application via `@capacitor/filesystem`,
   * et l'utilisateur est informé de l'emplacement.
   */
  async download(filename: string, content: string, mime = 'application/json'): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        await Filesystem.writeFile({
          path: filename,
          data: content,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
          recursive: true,
        });
        this.success('Fichier enregistré', `${filename} — dossier Documents`);
      } catch {
        this.error('Enregistrement impossible', "L'accès au stockage a été refusé.");
      }
      return;
    }

    const blob = new Blob([content], { type: mime });
    this.saveBlobOnWeb(filename, blob);
  }

  /**
   * Enregistre un contenu binaire — un PDF ou une image d'origine.
   *
   * `download()` ne convient pas : il écrit en UTF-8 et corromprait tout ce qui
   * n'est pas du texte. Sur mobile, `Filesystem` accepte du base64 dès lors
   * qu'aucun `encoding` n'est précisé.
   */
  async downloadBlob(filename: string, blob: Blob): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        await Filesystem.writeFile({
          path: filename,
          data: await blobToBase64(blob),
          directory: Directory.Documents,
          recursive: true,
        });
        this.success('Fichier enregistré', `${filename} — dossier Documents`);
      } catch {
        this.error('Enregistrement impossible', "L'accès au stockage a été refusé.");
      }
      return;
    }

    this.saveBlobOnWeb(filename, blob);
  }

  private saveBlobOnWeb(filename: string, blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

/** `FileReader` renvoie une data-URL ; Filesystem attend le base64 seul. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(blob);
  });
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function readStoredTheme(storage: StorageService): 'light' | 'dark' {
  const stored = storage.get(THEME_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
