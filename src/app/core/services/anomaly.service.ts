import { Injectable, computed, inject } from '@angular/core';
import { Anomaly, Bill } from '../models';
import { Store } from '../store';
import { average, groupBy, periodLabel, round2, sum } from '../utils';

/** Écart relatif minimal (en %) à partir duquel une facture est signalée. */
const DEVIATION_THRESHOLD = 25;
/**
 * Nombre minimal de relevés historiques nécessaires pour établir une référence.
 * Exporté : le formulaire de saisie annonce le seuil à l'utilisateur, et deux
 * valeurs qui divergent donneraient une promesse fausse.
 */
export const MIN_HISTORY = 4;

export interface ProviderSeries {
  provider: string;
  category: Bill['category'];
  points: { period: string; amount: number; anomalous: boolean }[];
  average: number;
  last: number;
  trendPercent: number;
}

/**
 * Détection d'anomalies de facturation.
 *
 * Pour chaque fournisseur, on compare la dernière facture à la moyenne des
 * relevés antérieurs. Une déviation robuste (écart à la moyenne rapporté à
 * l'écart-type) évite de crier au loup sur des séries naturellement très
 * variables comme l'énergie en hiver.
 */
@Injectable({ providedIn: 'root' })
export class AnomalyService {
  private readonly store = inject(Store);

  /**
   * Montant mensuel de chaque contrat, indexé par identifiant.
   *
   * C'est la référence de repli : un foyer qui n'a qu'un contrat attendrait
   * cinq relevés avant le moindre signalement, alors qu'il détient déjà le
   * montant qu'il est censé payer.
   */
  private readonly contractCosts = computed(() => {
    const costs = new Map<string, number>();
    for (const c of this.store.contracts()) {
      if (c.monthlyCost > 0) costs.set(c.id, c.monthlyCost);
    }
    return costs;
  });

  readonly series = computed<ProviderSeries[]>(() => {
    const groups = groupBy(this.store.bills(), (b) => `${b.provider}|${b.category}`);
    const costs = this.contractCosts();
    const out: ProviderSeries[] = [];

    for (const [key, list] of groups) {
      const sorted = [...list].sort((a, b) => a.period.localeCompare(b.period));
      const [provider, category] = key.split('|');
      const amounts = sorted.map((b) => b.amount);
      const avg = average(amounts);
      const last = amounts[amounts.length - 1] ?? 0;
      const previous = amounts.slice(0, -1);
      const baseline = previous.length ? average(previous) : avg;
      const anomalousPeriods = new Set(this.detect(sorted, costs).map((a) => a.period));

      out.push({
        provider,
        category: category as Bill['category'],
        points: sorted.map((b) => ({
          period: b.period,
          amount: b.amount,
          anomalous: anomalousPeriods.has(b.period),
        })),
        average: round2(avg),
        last: round2(last),
        trendPercent: baseline > 0 ? round2(((last - baseline) / baseline) * 100) : 0,
      });
    }

    return out.sort((a, b) => Math.abs(b.trendPercent) - Math.abs(a.trendPercent));
  });

  readonly anomalies = computed<Anomaly[]>(() => {
    const groups = groupBy(this.store.bills(), (b) => `${b.provider}|${b.category}`);
    const costs = this.contractCosts();
    const out: Anomaly[] = [];
    for (const [, list] of groups) {
      out.push(...this.detect([...list].sort((a, b) => a.period.localeCompare(b.period)), costs));
    }
    return out.sort((a, b) => b.period.localeCompare(a.period) || b.deviationPercent - a.deviationPercent);
  });

  readonly criticalCount = computed(() => this.anomalies().filter((a) => a.severity === 'risque').length);

  /**
   * Analyse une série chronologique d'un même fournisseur.
   *
   * Les relevés dotés d'un historique suffisant sont jugés sur leur propre
   * moyenne ; les premiers, qui n'en ont pas, le sont sur le montant du
   * contrat quand ils y sont rattachés.
   */
  private detect(sorted: Bill[], contractCosts: Map<string, number>): Anomaly[] {
    const out: Anomaly[] = [];

    // Les premiers relevés n'ont pas d'historique à interroger : on les
    // confronte au montant du contrat, qui est une référence tout aussi
    // légitime — et la seule dont dispose un foyer qui commence à saisir.
    for (let i = 0; i < Math.min(MIN_HISTORY, sorted.length); i++) {
      const bill = sorted[i];
      const expected = bill.contractId ? contractCosts.get(bill.contractId) : undefined;
      if (!expected) continue;

      const deviation = ((bill.amount - expected) / expected) * 100;
      if (deviation < DEVIATION_THRESHOLD) continue;

      out.push({
        id: `an_ct_${bill.id}`,
        kind: 'ecart-contrat',
        category: bill.category,
        provider: bill.provider,
        period: bill.period,
        amount: round2(bill.amount),
        reference: round2(expected),
        deviationPercent: round2(deviation),
        message: `Votre facture ${bill.provider} de ${periodLabel(bill.period)} dépasse de ${Math.round(deviation)} % le montant inscrit à votre contrat (${expected.toFixed(2)} €).`,
        severity: deviation >= 50 ? 'risque' : deviation >= 35 ? 'attention' : 'info',
      });
    }

    for (let i = MIN_HISTORY; i < sorted.length; i++) {
      const bill = sorted[i];
      const history = sorted.slice(Math.max(0, i - 12), i).map((b) => b.amount);
      const mean = average(history);
      if (mean <= 0) continue;

      const deviation = ((bill.amount - mean) / mean) * 100;
      if (deviation < DEVIATION_THRESHOLD) continue;

      // Contrôle de robustesse : l'écart doit aussi être significatif au regard
      // de la dispersion habituelle de la série.
      const sd = stdDev(history, mean);
      const zScore = sd > 0 ? (bill.amount - mean) / sd : Infinity;
      if (zScore < 1.5) continue;

      const consecutive = i > 0 && sorted[i - 1].amount > mean * 1.2;

      out.push({
        id: `an_${bill.id}`,
        kind: consecutive ? 'hausse-brutale' : 'facture-elevee',
        category: bill.category,
        provider: bill.provider,
        period: bill.period,
        amount: round2(bill.amount),
        reference: round2(mean),
        deviationPercent: round2(deviation),
        message: consecutive
          ? `Vos factures ${bill.provider} augmentent depuis deux périodes : ${periodLabel(bill.period)} dépasse de ${Math.round(deviation)} % votre moyenne habituelle.`
          : `Votre facture ${labelFor(bill.category)} de ${periodLabel(bill.period)} est ${Math.round(deviation)} % supérieure à la moyenne.`,
        severity: deviation >= 50 ? 'risque' : deviation >= 35 ? 'attention' : 'info',
      });
    }

    // Doublon de prélèvement : deux factures identiques sur la même période.
    const byPeriod = groupBy(sorted, (b) => b.period);
    for (const [p, list] of byPeriod) {
      if (list.length < 2) continue;
      const identical = list.filter((b) => Math.abs(b.amount - list[0].amount) < 0.01);
      if (identical.length < 2) continue;
      out.push({
        id: `an_dup_${identical[0].id}`,
        kind: 'doublon-facture',
        category: identical[0].category,
        provider: identical[0].provider,
        period: p,
        amount: round2(sum(identical.map((b) => b.amount))),
        reference: round2(identical[0].amount),
        deviationPercent: 100,
        message: `Deux prélèvements identiques de ${identical[0].amount.toFixed(2)} € ont été enregistrés pour ${identical[0].provider} en ${periodLabel(p)}.`,
        severity: 'risque',
      });
    }

    return out;
  }
}

function stdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  return Math.sqrt(sum(values.map((v) => (v - mean) ** 2)) / (values.length - 1));
}

function labelFor(category: Bill['category']): string {
  switch (category) {
    case 'energie':
      return "d'électricité";
    case 'internet':
      return 'internet';
    case 'sante':
      return 'de mutuelle';
    case 'assurance':
      return "d'assurance";
    default:
      return '';
  }
}
