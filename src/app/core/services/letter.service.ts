import { Injectable, inject } from '@angular/core';
import { CancellationLetter, Contract, TimelineEvent } from '../models';
import { Store } from '../store';
import { addDays, daysUntil, formatDate, todayIso, uid } from '../utils';

export type SendChannel = 'email' | 'courrier';

export interface SendResult {
  ok: boolean;
  channel: SendChannel;
  message: string;
  /** Numéro de suivi simulé pour l'envoi postal. */
  tracking?: string;
}

/** Adresses de résiliation connues, à défaut d'annuaire officiel. */
const RECIPIENTS: Record<string, string> = {
  MAIF: 'MAIF — Service Résiliations, 200 avenue Salvador Allende, 79038 Niort Cedex 9',
  Matmut: 'Matmut — Service Clients, 66 rue de Sotteville, 76100 Rouen',
  AXA: 'AXA France — Service Résiliations, 313 Terrasses de l’Arche, 92727 Nanterre Cedex',
  GMF: 'GMF Assurances — 148 rue Anatole France, 92300 Levallois-Perret',
  Orange: 'Orange — Service Client, 33734 Bordeaux Cedex 9',
  SFR: 'SFR — Service Résiliation, TSA 73917, 92062 Paris La Défense Cedex',
  Free: 'Free — Service Résiliation, 75371 Paris Cedex 08',
  EDF: 'EDF — Service Clients, TSA 20012, 41975 Blois Cedex',
  Engie: 'Engie — Service Clients, TSA 87494, 76934 Rouen Cedex 9',
  'Harmonie Mutuelle': 'Harmonie Mutuelle — 143 rue Blomet, 75015 Paris',
  FitPark: 'FitPark — Service Adhérents, 12 rue du Stade, 69100 Villeurbanne',
  'Crédit Mutuel': 'Crédit Mutuel — Service Clientèle, 4 rue Frédéric-Guillaume Raiffeisen, 67000 Strasbourg',
};

/**
 * Prépare les courriers de résiliation : calcul de la date d'effet à partir du
 * préavis, rédaction de la lettre pré-remplie et « envoi » par e-mail ou
 * courrier recommandé.
 */
@Injectable({ providedIn: 'root' })
export class LetterService {
  private readonly store = inject(Store);

  /**
   * Date d'effet la plus proche possible : aujourd'hui + préavis, repoussée à
   * la prochaine échéance annuelle si le contrat est à reconduction tacite et
   * que le préavis ne peut plus être respecté avant celle-ci.
   */
  effectiveDate(contract: Contract): string {
    const earliest = addDays(todayIso(), contract.noticePeriodDays);
    if (!contract.renewalDate) return earliest;

    const noticeDeadline = addDays(contract.renewalDate, -contract.noticePeriodDays);
    if (daysUntil(noticeDeadline) >= 0) return contract.renewalDate;

    // Préavis manqué pour cette échéance : la résiliation prendra effet à la suivante.
    return addDays(contract.renewalDate, 365);
  }

  /** `true` si le préavis peut encore être respecté avant la prochaine échéance. */
  canCancelAtRenewal(contract: Contract): boolean {
    if (!contract.renewalDate) return true;
    return daysUntil(addDays(contract.renewalDate, -contract.noticePeriodDays)) >= 0;
  }

  recipient(contract: Contract): string {
    return RECIPIENTS[contract.provider] ?? `${contract.provider} — Service Résiliations`;
  }

  build(contract: Contract): CancellationLetter {
    const p = this.store.profile();
    const effective = this.effectiveDate(contract);
    const reference = this.extractReference(contract);

    const body =
      `${p.firstName} ${p.lastName}\n` +
      `${p.address}\n` +
      `${p.postalCode} ${p.city}\n` +
      `${p.email} — ${p.phone}\n\n` +
      `${this.recipient(contract)}\n\n` +
      `${p.city}, le ${formatDate(todayIso(), 'long')}\n\n` +
      `Objet : résiliation du contrat ${contract.label}${reference ? ` n° ${reference}` : ''}\n` +
      `Lettre recommandée avec accusé de réception\n\n` +
      `Madame, Monsieur,\n\n` +
      `Par la présente, je vous informe de ma décision de résilier le contrat ${contract.label} ` +
      `souscrit auprès de ${contract.provider}${reference ? ` sous le numéro ${reference}` : ''}, ` +
      `à effet du ${formatDate(effective, 'long')}.\n\n` +
      `${this.legalGround(contract)}\n\n` +
      `Je vous remercie de bien vouloir m'adresser une confirmation écrite de cette résiliation ` +
      `ainsi que le décompte des sommes éventuellement dues ou à me rembourser au prorata temporis. ` +
      `Je vous demande également de cesser tout prélèvement automatique à compter de la date d'effet.\n\n` +
      `Vous en souhaitant bonne réception, je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.\n\n` +
      `${p.firstName} ${p.lastName}`;

    return {
      contractId: contract.id,
      subject: `Résiliation du contrat ${contract.label}${reference ? ` n° ${reference}` : ''}`,
      body,
      recipient: this.recipient(contract),
      effectiveDate: effective,
    };
  }

  /** Fondement juridique adapté au type de contrat, cité dans la lettre. */
  private legalGround(contract: Contract): string {
    const ancienneteMois = Math.floor(-daysUntil(contract.startDate) / 30);

    if (contract.category === 'assurance' || contract.category === 'vehicule') {
      if (ancienneteMois >= 12) {
        return (
          "Cette résiliation intervient en application de l'article L.113-15-2 du code des assurances (loi Hamon), " +
          "qui autorise la résiliation à tout moment après la première année d'engagement, sans frais ni pénalité."
        );
      }
      return (
        "Cette résiliation intervient dans le respect du préavis contractuel de " +
        `${contract.noticePeriodDays} jours précédant l'échéance annuelle, conformément à l'article L.113-12 du code des assurances.`
      );
    }

    if (contract.category === 'sante') {
      return (
        "Cette résiliation intervient en application de l'article L.221-10-2 du code de la mutualité, " +
        "qui permet la résiliation à tout moment après un an d'adhésion."
      );
    }

    if (contract.category === 'internet' || contract.category === 'energie') {
      return (
        "Conformément à l'article L.224-33 du code de la consommation, la résiliation prend effet au plus tard " +
        'dix jours après la réception de la présente demande, ou à la date que j’ai indiquée si elle est postérieure.'
      );
    }

    return `Cette résiliation intervient dans le respect du préavis contractuel de ${contract.noticePeriodDays} jours.`;
  }

  /** Récupère un numéro de contrat depuis les documents rattachés. */
  private extractReference(contract: Contract): string {
    for (const id of contract.documentIds) {
      const doc = this.store.documents().find((d) => d.id === id);
      if (!doc) continue;
      const m = doc.text.match(/n°\s*([A-Z]{2,}-?\d[\w-]*)/i) ?? doc.text.match(/[Rr]éférence(?: client)?\s*:?\s*(\d{6,})/);
      if (m) return m[1];
    }
    return '';
  }

  /**
   * « Envoi » de la lettre. Aucun courrier n'est réellement expédié : cette
   * démonstration front-end ouvre le client de messagerie de l'utilisateur
   * pour l'e-mail, et simule le dépôt d'un recommandé pour le courrier.
   */
  send(contract: Contract, letter: CancellationLetter, channel: SendChannel): SendResult {
    if (channel === 'email') {
      const url = `mailto:?subject=${encodeURIComponent(letter.subject)}&body=${encodeURIComponent(letter.body)}`;
      // Un mailto trop long est tronqué par certains clients : on prévient.
      if (url.length > 1900) {
        return {
          ok: false,
          channel,
          message:
            'La lettre est trop longue pour un lien e-mail. Copiez le texte, puis collez-le dans votre messagerie.',
        };
      }
      window.location.href = url;
      return {
        ok: true,
        channel,
        message: 'Votre messagerie s’ouvre avec la lettre pré-remplie. Vérifiez le destinataire avant l’envoi.',
      };
    }

    return {
      ok: true,
      channel,
      message:
        'Simulation d’envoi en recommandé : dans une version connectée, la lettre serait transmise à un prestataire postal.',
      tracking: `1A ${Math.floor(Math.random() * 9e8 + 1e8)} FR`,
    };
  }

  /** Enregistre la résiliation : statut du contrat, échéances et chronologie. */
  markCancelled(contract: Contract, letter: CancellationLetter): boolean {
    const ok = this.store.updateContract(contract.id, {
      status: 'resilie',
      cancelledAt: todayIso(),
      endDate: letter.effectiveDate,
      monthlyCost: 0,
    });
    if (!ok) return false;

    const event: TimelineEvent = {
      id: uid('tl'),
      date: todayIso(),
      title: `Résiliation — ${contract.label}`,
      description: `Contrat ${contract.provider} résilié, effet au ${formatDate(letter.effectiveDate, 'long')}.`,
      kind: 'resiliation',
      category: contract.category,
      contractId: contract.id,
    };
    this.store.addTimelineEvent(event);

    this.store.addDeadline({
      id: uid('dl'),
      title: `Effet de la résiliation — ${contract.label}`,
      date: letter.effectiveDate,
      kind: 'fin-contrat',
      category: contract.category,
      contractId: contract.id,
      detected: true,
      done: false,
      note: 'Vérifier l’arrêt effectif des prélèvements après cette date.',
    });

    return true;
  }

  /** Ouvre la fenêtre d'impression du navigateur sur la lettre seule. */
  print(letter: CancellationLetter): void {
    const w = window.open('', '_blank', 'width=800,height=900');
    if (!w) return;
    w.document.write(
      `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(letter.subject)}</title>` +
        '<style>body{font-family:Georgia,serif;line-height:1.65;padding:48px 56px;max-width:720px;margin:auto;white-space:pre-wrap;font-size:12pt}</style>' +
        `</head><body>${escapeHtml(letter.body)}</body></html>`,
    );
    w.document.close();
    w.focus();
    w.print();
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
