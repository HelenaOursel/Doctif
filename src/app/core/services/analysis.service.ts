import { Injectable, computed, inject } from '@angular/core';
import {
  Contract,
  DuplicateInsurance,
  MissingDocument,
  PriceIncrease,
  RiskAssessment,
  SavingsReport,
  UnusedSubscription,
} from '../models';
import { Store } from '../store';
import { clamp, daysUntil, groupBy, round2, sum, todayIso } from '../utils';

/** Seuil à partir duquel une hausse tarifaire est signalée. */
const INCREASE_THRESHOLD = 3;
/** Nombre de mois sans usage au-delà duquel un abonnement est jugé dormant. */
const IDLE_MONTHS = 3;

/**
 * Analyses transverses du portefeuille de contrats :
 * doublons de couverture, abonnements dormants, augmentations tarifaires,
 * score de risque contractuel et pièces manquantes.
 */
@Injectable({ providedIn: 'root' })
export class AnalysisService {
  private readonly store = inject(Store);

  /* --- Doublons ----------------------------------------------------------- */

  /**
   * Deux contrats actifs couvrant le même objet (`coverageOf`) constituent un
   * doublon. Le gaspillage retenu est le coût du contrat le moins cher : c'est
   * celui qu'on peut résilier sans perdre de couverture.
   */
  readonly duplicates = computed<DuplicateInsurance[]>(() => {
    const active = this.store.contracts().filter((c) => c.status === 'actif' && c.coverageOf);
    const groups = groupBy(active, (c) => c.coverageOf!);
    const out: DuplicateInsurance[] = [];

    for (const [coverage, list] of groups) {
      if (list.length < 2) continue;
      const cheapest = [...list].sort((a, b) => a.monthlyCost - b.monthlyCost)[0];
      out.push({
        coverage,
        contracts: [...list].sort((a, b) => b.monthlyCost - a.monthlyCost),
        wastedPerYear: round2(cheapest.monthlyCost * 12),
      });
    }
    return out.sort((a, b) => b.wastedPerYear - a.wastedPerYear);
  });

  /* --- Abonnements inutilisés --------------------------------------------- */

  readonly unused = computed<UnusedSubscription[]>(() => {
    const out: UnusedSubscription[] = [];
    for (const c of this.store.contracts()) {
      if (c.status !== 'actif' || c.monthlyCost <= 0) continue;
      // Les contrats obligatoires ou vitaux ne sont jamais « inutilisés ».
      if (['assurance', 'sante', 'energie', 'logement', 'impots'].includes(c.category)) continue;
      if (!c.lastUsedAt) continue;

      const monthsIdle = Math.floor(-daysUntil(c.lastUsedAt) / 30);
      if (monthsIdle < IDLE_MONTHS) continue;

      out.push({ contract: c, monthsIdle, wastedPerYear: round2(c.monthlyCost * 12) });
    }
    return out.sort((a, b) => b.wastedPerYear - a.wastedPerYear);
  });

  /* --- Augmentations tarifaires ------------------------------------------- */

  readonly increases = computed<PriceIncrease[]>(() => {
    const out: PriceIncrease[] = [];
    for (const c of this.store.contracts()) {
      if (c.status !== 'actif' || !c.previousMonthlyCost || c.previousMonthlyCost <= 0) continue;
      const percent = ((c.monthlyCost - c.previousMonthlyCost) / c.previousMonthlyCost) * 100;
      if (percent < INCREASE_THRESHOLD) continue;

      out.push({
        contract: c,
        previous: c.previousMonthlyCost,
        current: c.monthlyCost,
        percent: round2(percent),
        extraPerYear: round2((c.monthlyCost - c.previousMonthlyCost) * 12),
      });
    }
    return out.sort((a, b) => b.percent - a.percent);
  });

  /** Synthèse chiffrée présentée sur l'écran « Économies ». */
  readonly savings = computed<SavingsReport>(() => {
    const duplicates = this.duplicates();
    const unused = this.unused();
    const increases = this.increases();
    return {
      duplicates,
      unused,
      increases,
      totalPerYear: round2(
        sum(duplicates.map((d) => d.wastedPerYear)) +
          sum(unused.map((u) => u.wastedPerYear)) +
          sum(increases.map((i) => i.extraPerYear)),
      ),
    };
  });

  /* --- Score de risque contractuel ---------------------------------------- */

  /**
   * Note de 0 à 100 : plus le score est élevé, plus le contrat est contraignant.
   * Chaque facteur est explicité pour que l'utilisateur comprenne la note.
   */
  assessRisk(contract: Contract): RiskAssessment {
    const factors: RiskAssessment['factors'] = [];

    for (const clause of contract.clauses) {
      const points = clause.severity === 'risque' ? 22 : clause.severity === 'attention' ? 11 : 3;
      factors.push({
        label: clause.title,
        points,
        detail: clause.reason,
      });
    }

    if (contract.commitmentMonths >= 24) {
      factors.push({
        label: `Engagement de ${contract.commitmentMonths} mois`,
        points: 18,
        detail: 'Un engagement de deux ans limite fortement votre capacité à changer de fournisseur.',
      });
    } else if (contract.commitmentMonths > 12) {
      factors.push({
        label: `Engagement de ${contract.commitmentMonths} mois`,
        points: 9,
        detail: "L'engagement dépasse la durée usuelle de 12 mois.",
      });
    }

    if (contract.noticePeriodDays >= 60) {
      factors.push({
        label: `Préavis de ${contract.noticePeriodDays} jours`,
        points: 10,
        detail: 'Un préavis long impose d’anticiper la résiliation plusieurs mois à l’avance.',
      });
    }

    if (contract.hiddenFees >= 50) {
      factors.push({
        label: `Frais annexes de ${contract.hiddenFees} €`,
        points: 12,
        detail: 'Frais de dossier ou de résiliation nettement supérieurs à la moyenne du marché.',
      });
    } else if (contract.hiddenFees > 0) {
      factors.push({
        label: `Frais annexes de ${contract.hiddenFees} €`,
        points: 5,
        detail: 'Des frais non inclus dans la mensualité affichée s’ajoutent au coût réel.',
      });
    }

    if (contract.previousMonthlyCost && contract.previousMonthlyCost > 0) {
      const pct = ((contract.monthlyCost - contract.previousMonthlyCost) / contract.previousMonthlyCost) * 100;
      if (pct >= 10) {
        factors.push({
          label: `Hausse de ${round2(pct)} % sur un an`,
          points: 14,
          detail: 'Augmentation nettement supérieure à l’inflation constatée.',
        });
      } else if (pct >= INCREASE_THRESHOLD) {
        factors.push({
          label: `Hausse de ${round2(pct)} % sur un an`,
          points: 6,
          detail: 'Augmentation modérée, à surveiller au prochain renouvellement.',
        });
      }
    }

    const score = clamp(Math.round(sum(factors.map((f) => f.points))), 0, 100);
    return {
      contractId: contract.id,
      score,
      level: score < 25 ? 'faible' : score < 55 ? 'modere' : 'eleve',
      factors: factors.sort((a, b) => b.points - a.points),
    };
  }

  readonly riskByContract = computed(() => {
    const map = new Map<string, RiskAssessment>();
    for (const c of this.store.contracts()) map.set(c.id, this.assessRisk(c));
    return map;
  });

  /** Contrats actifs les plus contraignants, pour le tableau de bord. */
  readonly riskiest = computed(() =>
    this.store
      .activeContracts()
      .map((c) => ({ contract: c, risk: this.assessRisk(c) }))
      .sort((a, b) => b.risk.score - a.risk.score),
  );

  /* --- Documents manquants ------------------------------------------------ */

  /**
   * Pièces attendues au vu de la situation de l'utilisateur mais absentes du
   * coffre. Chaque règle décrit sa propre condition de déclenchement.
   */
  readonly missingDocuments = computed<MissingDocument[]>(() => {
    const docs = this.store.documents();
    const contracts = this.store.contracts();
    const out: MissingDocument[] = [];
    const year = Number(todayIso().slice(0, 4));

    const has = (predicate: (text: string, tags: string[]) => boolean) =>
      docs.some((d) => predicate(`${d.name} ${d.text} ${d.issuer}`.toLowerCase(), d.tags));

    // 1. Chaque contrat actif devrait avoir au moins une pièce justificative.
    for (const c of contracts) {
      if (c.status !== 'actif') continue;
      if (c.documentIds.length > 0) continue;
      out.push({
        id: `missing_contract_${c.id}`,
        label: `Contrat ${c.label} — ${c.provider}`,
        reason: "Ce contrat est suivi dans l'application mais aucune pièce n'est archivée.",
        category: c.category,
        severity: 'attention',
      });
    }

    // 2. Attestation d'assurance habitation à jour (exigée annuellement par le bail).
    const attestation = docs.find(
      (d) => d.docType === 'attestation' && d.category === 'assurance' && daysUntil(d.date) > -365,
    );
    if (!attestation) {
      out.push({
        id: 'missing_attestation_hab',
        label: "Attestation d'assurance habitation de moins d'un an",
        reason: 'Le bail impose de la transmettre chaque année au bailleur.',
        category: 'assurance',
        severity: 'risque',
      });
    }

    // 3. Procès-verbal de contrôle technique en cours de validité.
    const hasVehicle = contracts.some((c) => c.category === 'vehicule' && c.status === 'actif');
    if (hasVehicle && !has((t) => t.includes('contrôle technique') || t.includes('controle technique'))) {
      out.push({
        id: 'missing_ct',
        label: 'Procès-verbal de contrôle technique',
        reason: 'Un véhicule est assuré mais aucun procès-verbal de contrôle technique n’est archivé.',
        category: 'vehicule',
        severity: 'attention',
      });
    }

    // 4. Avis d'imposition de l'année en cours.
    if (!docs.some((d) => d.category === 'impots' && d.docType === 'avis' && d.date.startsWith(`${year}`))) {
      out.push({
        id: 'missing_avis',
        label: `Avis d'imposition ${year}`,
        reason: "Aucun avis d'imposition de l'année en cours n'a été déposé dans le coffre.",
        category: 'impots',
        severity: 'attention',
      });
    }

    // 5. Trois derniers bulletins de salaire — pièce réclamée dans presque toutes les démarches.
    const payslips = docs.filter((d) => d.tags.includes('salaire') || d.text.toLowerCase().includes('bulletin de paie'));
    if (payslips.length < 3) {
      out.push({
        id: 'missing_payslips',
        label: `Bulletins de salaire (${payslips.length}/3)`,
        reason: 'Les trois derniers bulletins sont exigés pour une location ou une demande de prêt.',
        category: 'banque',
        severity: payslips.length === 0 ? 'risque' : 'info',
      });
    }

    // 6. Pièce d'identité.
    if (!has((t) => t.includes("carte d'identité") || t.includes('passeport') || t.includes('titre de sejour'))) {
      out.push({
        id: 'missing_id',
        label: "Pièce d'identité",
        reason: 'Document de base réclamé dans toutes les démarches administratives.',
        category: 'autre',
        severity: 'risque',
      });
    }

    return out;
  });
}
