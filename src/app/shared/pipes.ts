import { Pipe, PipeTransform } from '@angular/core';
import { CATEGORY_META, Category } from '../core/models';
import { euro, fileSize, formatDate, highlight, percent, relativeDays } from '../core/utils';

@Pipe({ name: 'euro', standalone: true })
export class EuroPipe implements PipeTransform {
  transform(value: number | undefined, decimals = 2): string {
    return euro(value, decimals);
  }
}

@Pipe({ name: 'pct', standalone: true })
export class PercentPipe implements PipeTransform {
  transform(value: number, decimals = 0): string {
    return percent(value, decimals);
  }
}

@Pipe({ name: 'frDate', standalone: true })
export class FrDatePipe implements PipeTransform {
  transform(value: string | undefined, style: 'long' | 'short' | 'numeric' = 'short'): string {
    return formatDate(value, style);
  }
}

@Pipe({ name: 'relDays', standalone: true })
export class RelativeDaysPipe implements PipeTransform {
  transform(days: number): string {
    return relativeDays(days);
  }
}

@Pipe({ name: 'fileSize', standalone: true })
export class FileSizePipe implements PipeTransform {
  transform(kb: number): string {
    return fileSize(kb);
  }
}

@Pipe({ name: 'catLabel', standalone: true })
export class CategoryLabelPipe implements PipeTransform {
  transform(category: Category): string {
    return CATEGORY_META[category]?.label ?? category;
  }
}

@Pipe({ name: 'catIcon', standalone: true })
export class CategoryIconPipe implements PipeTransform {
  transform(category: Category): string {
    return CATEGORY_META[category]?.icon ?? '📁';
  }
}

@Pipe({ name: 'catColor', standalone: true })
export class CategoryColorPipe implements PipeTransform {
  transform(category: Category): string {
    return `var(${CATEGORY_META[category]?.cssVar ?? '--cat-autre'})`;
  }
}

/** Découpe un texte en segments surlignés pour l'affichage des résultats. */
@Pipe({ name: 'highlight', standalone: true })
export class HighlightPipe implements PipeTransform {
  transform(text: string, query: string): { text: string; hit: boolean }[] {
    return highlight(text ?? '', query ?? '');
  }
}

/**
 * Rendu minimal du gras `**texte**` utilisé dans les réponses de l'assistant.
 * Volontairement limité : aucun HTML arbitraire n'est interprété.
 */
@Pipe({ name: 'chatSegments', standalone: true })
export class ChatSegmentsPipe implements PipeTransform {
  transform(text: string): { text: string; bold: boolean }[] {
    const out: { text: string; bold: boolean }[] = [];
    const re = /\*\*(.+?)\*\*/g;
    let cursor = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > cursor) out.push({ text: text.slice(cursor, m.index), bold: false });
      out.push({ text: m[1], bold: true });
      cursor = m.index + m[0].length;
    }
    if (cursor < text.length) out.push({ text: text.slice(cursor), bold: false });
    return out;
  }
}
