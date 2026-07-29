import { Component, Pipe, PipeTransform, booleanAttribute, computed, input } from '@angular/core';
import { CATEGORY_ICON, DEADLINE_ICON, DOC_TYPE_ICON, ICONS, IconName } from '../core/icons';

/**
 * Rendu d'une icône Font Awesome.
 *
 * Deux façons de l'utiliser :
 * - `<app-icon name="vault" />` pour une clé du registre (recommandé) ;
 * - `<app-icon cls="fa-solid fa-anchor" />` pour une classe brute.
 *
 * L'icône est purement décorative par défaut (`aria-hidden`). Lorsqu'elle
 * porte du sens à elle seule, passer `label` pour l'exposer aux lecteurs
 * d'écran.
 */
@Component({
  selector: 'app-icon',
  standalone: true,
  template: `
    @if (label()) {
      <i [class]="classes()" role="img" [attr.aria-label]="label()"></i>
    } @else {
      <i [class]="classes()" aria-hidden="true"></i>
    }
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
      }
      i {
        font-size: inherit;
      }
      :host([fw]) i {
        width: 1.28em;
        text-align: center;
      }
    `,
  ],
})
export class IconComponent {
  /** Clé du registre `ICONS`. */
  readonly name = input<IconName | null>(null);
  /** Classes Font Awesome brutes, si l'icône n'est pas au registre. */
  readonly cls = input<string>('');
  /** Libellé accessible : rend l'icône signifiante au lieu de décorative. */
  readonly label = input<string>('');
  /** Largeur fixe, pour aligner des icônes en colonne. */
  readonly fw = input(false, { transform: booleanAttribute });

  readonly classes = computed(() => {
    const key = this.name();
    const base = key ? ICONS[key] : this.cls();
    return base || ICONS.docOther;
  });
}

/** `{{ 'assurance' | catIconClass }}` → classes Font Awesome de la catégorie. */
@Pipe({ name: 'catIconClass', standalone: true })
export class CategoryIconClassPipe implements PipeTransform {
  transform(category: string): string {
    return CATEGORY_ICON[category] ?? ICONS.catAutre;
  }
}

@Pipe({ name: 'deadlineIconClass', standalone: true })
export class DeadlineIconClassPipe implements PipeTransform {
  transform(kind: string): string {
    return DEADLINE_ICON[kind] ?? ICONS.deadlineOther;
  }
}

@Pipe({ name: 'docIconClass', standalone: true })
export class DocTypeIconClassPipe implements PipeTransform {
  transform(docType: string): string {
    return DOC_TYPE_ICON[docType] ?? ICONS.docOther;
  }
}
