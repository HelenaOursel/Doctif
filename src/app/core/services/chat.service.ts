import { Injectable, inject } from '@angular/core';
import { ChatMessage } from '../models';
import { Store } from '../store';
import { euro, formatDate, normalize, percent, relativeDays, todayIso, uid } from '../utils';
import { AnalysisService } from './analysis.service';
import { AnomalyService } from './anomaly.service';
import { DeadlineService } from './deadline.service';
import { FEATURES } from '../features';
import { ProceduresService } from './procedures.service';
import { SearchService } from './search.service';
import { TimelineService } from './timeline.service';

/** Suggestions affichées à l'ouverture du chat. */
export const STARTER_QUESTIONS = [
  'Quels documents me manquent pour louer un appartement ?',
  'Quels justificatifs sont demandés pour une demande de prêt ?',
  'Quelles sont mes prochaines échéances ?',
  "Quand ai-je changé d'assurance auto ?",
  'Où puis-je faire des économies ?',
  'Retrouve le contrat de mon ancien appartement',
];

type Intent =
  | 'procedure'
  | 'echeances'
  | 'economies'
  | 'anomalies'
  | 'recherche'
  | 'chronologie'
  | 'contrat'
  | 'resiliation'
  | 'manquants'
  | 'aide'
  | 'salutation'
  | 'inconnu';

/**
 * Assistant administratif conversationnel.
 *
 * Moteur déterministe à base de règles : l'intention est déduite de la
 * question, puis la réponse est construite à partir des données réelles de
 * l'utilisateur. Aucun appel réseau, aucune donnée ne quitte l'appareil.
 */
@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly store = inject(Store);
  private readonly procedures = inject(ProceduresService);
  private readonly deadlines = inject(DeadlineService);
  private readonly analysis = inject(AnalysisService);
  private readonly anomalies = inject(AnomalyService);
  private readonly search = inject(SearchService);
  private readonly timeline = inject(TimelineService);

  /** Envoie une question et pousse la réponse dans l'historique. */
  ask(question: string): ChatMessage {
    const trimmed = question.trim();
    if (!trimmed) {
      return this.blank();
    }

    this.store.pushChat({
      id: uid('msg'),
      role: 'user',
      text: trimmed,
      at: new Date().toISOString(),
    });

    const answer = this.answer(trimmed);
    this.store.pushChat(answer);
    return answer;
  }

  /** Construit la réponse sans l'ajouter à l'historique (utile pour les tests). */
  answer(question: string): ChatMessage {
    const q = normalize(question);
    const intent = this.detectIntent(q);

    switch (intent) {
      case 'salutation':
        return this.msg(
          `Bonjour ${this.store.profile().firstName}. Je peux vous aider à retrouver un document, préparer une démarche ou faire le point sur vos échéances.`,
          { suggestions: STARTER_QUESTIONS.slice(0, 3) },
        );

      case 'aide':
        return this.msg(
          "Je m'appuie uniquement sur les documents et contrats présents dans votre coffre. Je peux :\n" +
            '• lister les pièces nécessaires à une démarche (location, prêt, succession, CAF, sinistre, vente de véhicule) ;\n' +
            '• retrouver un document par son contenu ;\n' +
            '• faire le point sur vos échéances, vos économies possibles et vos anomalies de facturation ;\n' +
            '• vous dire quand un événement s’est produit.',
          { suggestions: STARTER_QUESTIONS },
        );

      case 'procedure':
        return this.answerProcedure(question);

      case 'manquants':
        return this.answerMissing();

      case 'echeances':
        return this.answerDeadlines();

      case 'economies':
        return this.answerSavings();

      case 'anomalies':
        return this.answerAnomalies();

      case 'chronologie':
        return this.answerTimeline(question);

      case 'contrat':
        return this.answerContract(q);

      case 'resiliation':
        return this.answerCancellation(q);

      case 'recherche':
        return this.answerSearch(question);

      default:
        return this.answerFallback(question);
    }
  }

  reset(): void {
    this.store.clearChat();
  }

  /* --- Détection d'intention ---------------------------------------------- */

  private detectIntent(q: string): Intent {
    const has = (...words: string[]) => words.some((w) => q.includes(w));

    if (q.length < 24 && has('bonjour', 'bonsoir', 'salut', 'coucou', 'hello')) return 'salutation';
    if (has('que peux tu', 'que sais tu', 'aide moi', 'comment ca marche', 'a quoi tu sers')) return 'aide';

    if (has('resilier', 'resiliation', 'annuler mon contrat', 'mettre fin au contrat')) return 'resiliation';

    if (has('il me manque', 'documents manquants', 'ce qui me manque', 'pieces manquantes')) return 'manquants';

    // Une question de démarche cite une procédure connue ET une formulation de besoin.
    if (this.procedures.match(q) && has('quels', 'quel', 'documents', 'justificatifs', 'pieces', 'dossier', 'manque', 'besoin', 'faut', 'necessaire', 'demandes')) {
      return 'procedure';
    }

    if (has('echeance', 'echeances', 'prochaine', 'prochaines', 'calendrier', 'a venir', 'expire', 'expiration')) {
      return 'echeances';
    }

    if (has('economie', 'economies', 'economiser', 'doublon', 'doublons', 'trop cher', 'reduire mes depenses', 'gaspill')) {
      return 'economies';
    }

    if (has('anomalie', 'anormal', 'inhabituel', 'ma facture', 'mes factures', 'trop elevee', 'augmente')) {
      return 'anomalies';
    }

    if (has('quand ai je', 'quand est ce que', 'a quelle date', 'depuis quand', 'quand j ai')) return 'chronologie';

    if (has('combien je paie', 'combien coute', 'combien me coute', 'mon contrat', 'mes contrats')) return 'contrat';

    if (has('retrouve', 'retrouver', 'cherche', 'chercher', 'trouve', 'ou est', 'ou sont', 'montre moi')) {
      return 'recherche';
    }

    if (this.procedures.match(q)) return 'procedure';

    return 'inconnu';
  }

  /* --- Réponses ------------------------------------------------------------ */

  private answerProcedure(question: string): ChatMessage {
    const procedure = this.procedures.match(question);
    if (!procedure) return this.answerFallback(question);

    const check = this.procedures.check(procedure);
    const lines = [`**${procedure.title}** — ${procedure.intro}`, ''];

    if (check.missing.length === 0) {
      lines.push(`Bonne nouvelle : les ${check.present.length} pièces attendues sont déjà dans votre coffre.`);
    } else {
      const requiredMissing = check.missing.filter((m) => m.required);
      lines.push(
        requiredMissing.length
          ? `Il vous manque ${requiredMissing.length} pièce${requiredMissing.length > 1 ? 's' : ''} obligatoire${requiredMissing.length > 1 ? 's' : ''} sur ${procedure.items.filter((i) => i.required).length}.`
          : 'Toutes les pièces obligatoires sont présentes ; seules des pièces facultatives manquent.',
      );
    }

    return this.msg(lines.join('\n'), {
      checklist: procedure.items.map((item) => {
        const found = check.present.find((p) => p.item.label === item.label);
        return {
          label: item.required ? item.label : `${item.label} (facultatif)`,
          ok: !!found,
          hint: found ? `Trouvé : ${found.document.name}` : item.hint,
        };
      }),
      links: [
        { label: 'Ouvrir le coffre-fort', route: '/coffre' },
        { label: 'Scanner un document', route: '/scanner' },
      ],
      suggestions: ['Quelles sont mes prochaines échéances ?', 'Où puis-je faire des économies ?'],
    });
  }

  private answerMissing(): ChatMessage {
    const missing = this.analysis.missingDocuments();
    if (!missing.length) {
      return this.msg('Votre coffre est complet : je ne détecte aucune pièce manquante.');
    }
    return this.msg(
      `Je repère ${missing.length} pièce${missing.length > 1 ? 's' : ''} manquante${missing.length > 1 ? 's' : ''} dans votre coffre :`,
      {
        checklist: missing.map((m) => ({ label: m.label, ok: false, hint: m.reason })),
        links: [{ label: 'Voir le tableau de bord', route: '/tableau-de-bord' }],
      },
    );
  }

  private answerDeadlines(): ChatMessage {
    const next = this.deadlines.next90Days().slice(0, 6);
    const overdue = this.deadlines.overdue();

    if (!next.length && !overdue.length) {
      return this.msg('Aucune échéance dans les trois prochains mois. Vous pouvez souffler.');
    }

    const lines: string[] = [];
    if (overdue.length) {
      lines.push(`⚠️ ${overdue.length} échéance${overdue.length > 1 ? 's sont dépassées' : ' est dépassée'} :`);
      for (const d of overdue.slice(0, 3)) {
        lines.push(`• ${d.title} — était due le ${formatDate(d.date, 'long')}`);
      }
      lines.push('');
    }
    if (next.length) {
      lines.push(`Vos ${next.length} prochaines échéances :`);
      for (const d of next) {
        lines.push(`• ${d.title} — ${formatDate(d.date, 'long')} (${relativeDays(daysLeft(d.date))})`);
      }
    }

    return this.msg(lines.join('\n'), {
      links: [
        { label: 'Ouvrir le calendrier', route: '/calendrier' },
        { label: 'Voir les alertes', route: '/alertes' },
      ],
    });
  }

  private answerSavings(): ChatMessage {
    const report = this.analysis.savings();
    if (report.totalPerYear <= 0) {
      return this.msg('Je ne détecte ni doublon, ni abonnement dormant, ni hausse tarifaire notable sur vos contrats.');
    }

    const lines = [`J'identifie **${euro(report.totalPerYear)} par an** d'économies potentielles.`, ''];

    for (const d of report.duplicates) {
      lines.push(
        `• Doublon « ${d.coverage} » : ${d.contracts.map((c) => c.provider).join(' et ')} couvrent le même objet — ${euro(d.wastedPerYear)}/an.`,
      );
    }
    for (const u of report.unused) {
      lines.push(
        `• ${u.contract.label} (${u.contract.provider}) : aucune utilisation depuis ${u.monthsIdle} mois — ${euro(u.wastedPerYear)}/an.`,
      );
    }
    for (const i of report.increases) {
      lines.push(
        `• ${i.contract.label} (${i.contract.provider}) : ${percent(i.percent)} cette année, soit ${euro(i.extraPerYear)} de plus par an.`,
      );
    }

    return this.msg(lines.join('\n'), {
      links: [
        { label: 'Voir le détail des économies', route: '/economies' },
        // Proposer une comparaison d'offres mènerait à une route démontée.
        ...(FEATURES.offers ? [{ label: 'Comparer des offres', route: '/renouvellement' }] : []),
      ],
    });
  }

  private answerAnomalies(): ChatMessage {
    const list = this.anomalies.anomalies();
    if (!list.length) {
      return this.msg('Vos factures suivent leur trajectoire habituelle : aucune anomalie détectée.');
    }
    const lines = [`Je détecte ${list.length} anomalie${list.length > 1 ? 's' : ''} de facturation :`, ''];
    for (const a of list.slice(0, 5)) lines.push(`• ${a.message}`);

    return this.msg(lines.join('\n'), {
      links: [{ label: 'Analyser mes factures', route: '/anomalies' }],
    });
  }

  private answerTimeline(question: string): ChatMessage {
    const found = this.timeline.answerWhen(question);
    if (!found) {
      return this.msg(
        "Je ne retrouve pas cet événement dans votre chronologie. Essayez avec le nom du fournisseur ou le type de contrat.",
        { links: [{ label: 'Ouvrir la chronologie', route: '/chronologie' }] },
      );
    }
    const related = this.timeline.search(question).slice(0, 4);
    const lines = [found.sentence];
    if (related.length > 1) {
      lines.push('', 'Événements liés :');
      for (const e of related.slice(1)) lines.push(`• ${e.title} — ${formatDate(e.date, 'long')}`);
    }
    return this.msg(lines.join('\n'), {
      links: [{ label: 'Ouvrir la chronologie', route: '/chronologie' }],
    });
  }

  private answerContract(q: string): ChatMessage {
    const contracts = this.store.activeContracts();
    const target = contracts.find(
      (c) => q.includes(normalize(c.provider)) || q.includes(normalize(c.label)) || q.includes(normalize(c.category)),
    );

    if (target) {
      const risk = this.analysis.assessRisk(target);
      return this.msg(
        `**${target.label}** — ${target.provider}\n` +
          `• ${euro(target.monthlyCost)} par mois, soit ${euro(target.monthlyCost * 12)} par an.\n` +
          (target.renewalDate ? `• Prochaine échéance le ${formatDate(target.renewalDate, 'long')}.\n` : '') +
          `• Préavis de ${target.noticePeriodDays} jours.\n` +
          `• Score de risque contractuel : ${risk.score}/100 (${risk.level}).`,
        { links: [{ label: 'Ouvrir le contrat', route: `/contrats/${target.id}` }] },
      );
    }

    const total = contracts.reduce((a, c) => a + c.monthlyCost, 0);
    return this.msg(
      `Vous avez ${contracts.length} contrats actifs pour un total de ${euro(total)} par mois, soit ${euro(total * 12)} par an.`,
      { links: [{ label: 'Voir tous mes contrats', route: '/contrats' }] },
    );
  }

  private answerCancellation(q: string): ChatMessage {
    const target = this.store
      .activeContracts()
      .find((c) => q.includes(normalize(c.provider)) || q.includes(normalize(c.label)));

    if (!target) {
      return this.msg(
        'Indiquez le contrat concerné et je prépare la lettre de résiliation pré-remplie. Vous pouvez aussi la lancer depuis la fiche du contrat.',
        { links: [{ label: 'Voir mes contrats', route: '/contrats' }] },
      );
    }

    return this.msg(
      `Pour résilier **${target.label}** (${target.provider}), le préavis est de ${target.noticePeriodDays} jours` +
        (target.renewalDate ? `, avant l'échéance du ${formatDate(target.renewalDate, 'long')}` : '') +
        `. Je peux générer la lettre pré-remplie avec vos coordonnées et le fondement juridique applicable.`,
      { links: [{ label: 'Préparer la lettre', route: `/contrats/${target.id}` }] },
    );
  }

  private answerSearch(question: string): ChatMessage {
    const cleaned = question
      .replace(/\b(retrouve|retrouver|cherche|chercher|trouve|montre moi|le|la|les|mon|ma|mes|de|du|des|un|une)\b/gi, ' ')
      .trim();
    const hits = this.search.run(cleaned || question, {
      categories: [],
      includeArchived: true,
      onlyShared: false,
    });

    if (!hits.length) {
      return this.msg(
        "Aucun document ne correspond à cette recherche. Essayez avec le nom de l'émetteur (MAIF, EDF, Orange…) ou le type de document.",
        { links: [{ label: 'Ouvrir le coffre-fort', route: '/coffre' }] },
      );
    }

    const top = hits.slice(0, 4);
    const lines = [`${hits.length} document${hits.length > 1 ? 's' : ''} correspond${hits.length > 1 ? 'ent' : ''} :`, ''];
    for (const h of top) {
      lines.push(`• **${h.document.name}** — ${h.document.issuer}, ${formatDate(h.document.date, 'long')}`);
      if (h.excerpt) lines.push(`  ${h.excerpt}`);
    }

    return this.msg(lines.join('\n'), {
      links: top.map((h) => ({ label: h.document.name, route: `/coffre/${h.document.id}` })),
    });
  }

  private answerFallback(question: string): ChatMessage {
    // Dernier recours : on tente quand même une recherche documentaire.
    const hits = this.search.run(question, { categories: [], includeArchived: true, onlyShared: false });
    if (hits.length) {
      return this.msg(
        `Je ne suis pas certain d'avoir compris la question, mais ${hits.length} document${hits.length > 1 ? 's' : ''} de votre coffre s'en rapproche${hits.length > 1 ? 'nt' : ''} :`,
        {
          links: hits.slice(0, 3).map((h) => ({ label: h.document.name, route: `/coffre/${h.document.id}` })),
          suggestions: STARTER_QUESTIONS.slice(0, 3),
        },
      );
    }

    return this.msg(
      "Je n'ai pas de réponse à cette question. Je sais traiter les démarches administratives courantes, retrouver vos documents, et faire le point sur vos échéances, vos contrats et vos factures.",
      { suggestions: STARTER_QUESTIONS },
    );
  }

  /* --- Fabriques ----------------------------------------------------------- */

  private msg(text: string, extra: Partial<ChatMessage> = {}): ChatMessage {
    return {
      id: uid('msg'),
      role: 'assistant',
      text,
      at: new Date().toISOString(),
      ...extra,
    };
  }

  private blank(): ChatMessage {
    return this.msg('Posez-moi une question sur vos documents, vos contrats ou vos démarches.');
  }
}

function daysLeft(iso: string): number {
  const a = new Date(todayIso()).getTime();
  const b = new Date(iso).getTime();
  return Math.round((b - a) / 86400000);
}
