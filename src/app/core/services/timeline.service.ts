import { Injectable, computed, inject } from '@angular/core';
import { TimelineEvent } from '../models';
import { Store } from '../store';
import { formatDate, groupBy, normalize, tokenize } from '../utils';

export interface TimelineYear {
  year: number;
  events: TimelineEvent[];
}

/**
 * Reconstruit automatiquement la chronologie administrative de l'utilisateur
 * à partir des contrats, des documents structurants et des événements ajoutés
 * manuellement. Rien n'est stocké en double : la chronologie est dérivée.
 */
@Injectable({ providedIn: 'root' })
export class TimelineService {
  private readonly store = inject(Store);

  readonly events = computed<TimelineEvent[]>(() => {
    const out: TimelineEvent[] = [...this.store.timelineExtra()];

    for (const c of this.store.contracts()) {
      out.push({
        id: `tl_start_${c.id}`,
        date: c.startDate,
        title: `Souscription — ${c.label}`,
        description: `Contrat souscrit auprès de ${c.provider}.`,
        kind: 'contrat',
        category: c.category,
        contractId: c.id,
      });

      if (c.status === 'resilie' && c.cancelledAt) {
        out.push({
          id: `tl_end_${c.id}`,
          date: c.cancelledAt,
          title: `Résiliation — ${c.label}`,
          description: `Contrat ${c.provider} résilié.`,
          kind: 'resiliation',
          category: c.category,
          contractId: c.id,
        });
      }
    }

    // Seuls les documents structurants entrent dans la chronologie : une
    // facture mensuelle n'a pas sa place dans un récit de vie.
    for (const d of this.store.documents()) {
      if (!['contrat', 'avis', 'attestation'].includes(d.docType)) continue;
      out.push({
        id: `tl_doc_${d.id}`,
        date: d.date,
        title: `${docTitle(d.docType)} — ${d.issuer}`,
        description: d.name,
        kind: d.category === 'impots' ? 'fiscal' : d.category === 'sante' ? 'sante' : 'document',
        category: d.category,
        documentId: d.id,
      });
    }

    // Déduplique : un contrat et son document de souscription racontent le même
    // événement le même jour.
    const seen = new Set<string>();
    const deduped = out.filter((e) => {
      const key = `${e.date}|${normalize(e.title).slice(0, 40)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return deduped.sort((a, b) => b.date.localeCompare(a.date));
  });

  /** Regroupé par année, la plus récente en premier. */
  readonly byYear = computed<TimelineYear[]>(() => {
    const groups = groupBy(this.events(), (e) => Number(e.date.slice(0, 4)));
    return [...groups.entries()]
      .map(([year, events]) => ({ year, events: events.sort((a, b) => b.date.localeCompare(a.date)) }))
      .sort((a, b) => b.year - a.year);
  });

  readonly years = computed(() => this.byYear().map((y) => y.year));

  /** Recherche en langage naturel dans la chronologie. */
  search(query: string): TimelineEvent[] {
    const terms = tokenize(query);
    if (!terms.length) return [];
    return this.events().filter((e) => {
      const haystack = normalize(`${e.title} ${e.description} ${e.category} ${e.kind}`);
      return terms.every((t) => haystack.includes(t));
    });
  }

  /**
   * Répond à une question du type « Quand ai-je changé d'assurance auto ? » en
   * renvoyant l'événement le plus pertinent et une phrase toute faite.
   */
  answerWhen(query: string): { event: TimelineEvent; sentence: string } | undefined {
    const matches = this.search(query);
    if (!matches.length) return undefined;
    const event = matches[0];
    return {
      event,
      sentence: `${event.title} — ${formatDate(event.date, 'long')}.`,
    };
  }
}

function docTitle(type: string): string {
  switch (type) {
    case 'contrat':
      return 'Contrat signé';
    case 'avis':
      return 'Avis reçu';
    case 'attestation':
      return 'Attestation délivrée';
    default:
      return 'Document';
  }
}
