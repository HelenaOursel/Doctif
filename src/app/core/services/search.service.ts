import { Injectable, computed, inject, signal } from '@angular/core';
import { Category, DocumentItem } from '../models';
import { Store } from '../store';
import { normalize, snippet, tokenize } from '../utils';

export interface SearchHit {
  document: DocumentItem;
  score: number;
  /** Extrait du texte autour de la première occurrence. */
  excerpt: string;
  /** Champs ayant contribué au score, pour expliquer le résultat. */
  matchedIn: string[];
}

export interface SearchFilters {
  categories: Category[];
  from?: string;
  to?: string;
  includeArchived: boolean;
  onlyShared: boolean;
}

export const EMPTY_FILTERS: SearchFilters = {
  categories: [],
  includeArchived: false,
  onlyShared: false,
};

/** Champs indexés et leur poids relatif dans le score. */
const FIELDS: { key: keyof DocumentItem | 'tagsJoined'; weight: number; label: string }[] = [
  { key: 'name', weight: 6, label: 'nom' },
  { key: 'originalName', weight: 2, label: "nom d'origine" },
  { key: 'issuer', weight: 5, label: 'émetteur' },
  { key: 'tagsJoined', weight: 4, label: 'mots-clés' },
  { key: 'text', weight: 1, label: 'contenu' },
];

/**
 * Recherche plein texte sur le coffre.
 *
 * Index inversé reconstruit à la volée depuis le store (le volume de documents
 * d'un particulier reste très en deçà du seuil où un index persistant se
 * justifierait). Le score combine la pondération du champ et le nombre
 * d'occurrences ; tous les termes de la requête doivent être présents.
 */
@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly store = inject(Store);

  readonly query = signal('');
  readonly filters = signal<SearchFilters>(EMPTY_FILTERS);

  /** Documents concaténés et normalisés, mémorisés tant que le coffre ne change pas. */
  private readonly index = computed(() =>
    this.store.documents().map((doc) => ({
      doc,
      fields: {
        name: normalize(doc.name),
        originalName: normalize(doc.originalName),
        issuer: normalize(doc.issuer),
        tagsJoined: normalize(doc.tags.join(' ')),
        text: normalize(doc.text),
      } as Record<string, string>,
    })),
  );

  readonly results = computed<SearchHit[]>(() => this.run(this.query(), this.filters()));

  readonly hasActiveFilters = computed(() => {
    const f = this.filters();
    return f.categories.length > 0 || !!f.from || !!f.to || f.includeArchived || f.onlyShared;
  });

  setQuery(q: string): void {
    this.query.set(q);
  }

  patchFilters(patch: Partial<SearchFilters>): void {
    this.filters.update((f) => ({ ...f, ...patch }));
  }

  toggleCategory(category: Category): void {
    this.filters.update((f) => ({
      ...f,
      categories: f.categories.includes(category)
        ? f.categories.filter((c) => c !== category)
        : [...f.categories, category],
    }));
  }

  resetFilters(): void {
    this.filters.set(EMPTY_FILTERS);
  }

  reset(): void {
    this.query.set('');
    this.filters.set(EMPTY_FILTERS);
  }

  /** Exécution directe, réutilisable hors du signal (assistant conversationnel). */
  run(rawQuery: string, filters: SearchFilters = EMPTY_FILTERS): SearchHit[] {
    const terms = tokenize(rawQuery);
    const entries = this.index().filter(({ doc }) => this.passesFilters(doc, filters));

    if (!terms.length) {
      return entries
        .map(({ doc }) => ({ document: doc, score: 0, excerpt: firstLine(doc.text), matchedIn: [] }))
        .sort((a, b) => b.document.date.localeCompare(a.document.date));
    }

    const hits: SearchHit[] = [];
    for (const entry of entries) {
      let score = 0;
      const matchedIn = new Set<string>();
      let allTermsFound = true;

      for (const term of terms) {
        let termScore = 0;
        for (const field of FIELDS) {
          const value = entry.fields[field.key as string] ?? '';
          const occurrences = countOccurrences(value, term);
          if (occurrences > 0) {
            // Rendement décroissant : la 10e occurrence pèse moins que la 1re.
            termScore += field.weight * (1 + Math.log(occurrences));
            matchedIn.add(field.label);
          }
        }
        if (termScore === 0) {
          allTermsFound = false;
          break;
        }
        score += termScore;
      }

      if (!allTermsFound) continue;
      hits.push({
        document: entry.doc,
        score: Math.round(score * 10) / 10,
        excerpt: snippet(entry.doc.text, terms[0]),
        matchedIn: [...matchedIn],
      });
    }

    return hits.sort((a, b) => b.score - a.score || b.document.date.localeCompare(a.document.date));
  }

  /** Recherche simple renvoyant les documents, pour les autres services. */
  find(query: string, limit = 5): DocumentItem[] {
    return this.run(query, { ...EMPTY_FILTERS, includeArchived: true })
      .slice(0, limit)
      .map((h) => h.document);
  }

  private passesFilters(doc: DocumentItem, f: SearchFilters): boolean {
    if (!f.includeArchived && doc.archived) return false;
    if (f.categories.length && !f.categories.includes(doc.category)) return false;
    if (f.from && doc.date < f.from) return false;
    if (f.to && doc.date > f.to) return false;
    if (f.onlyShared && doc.sharedWith.length === 0) return false;
    return true;
  }
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let i = haystack.indexOf(needle);
  while (i >= 0) {
    count += 1;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return count;
}

function firstLine(text: string): string {
  const line = text.split('\n')[0] ?? '';
  return line.length > 140 ? `${line.slice(0, 140)}…` : line;
}
