import { Injectable, computed, inject } from '@angular/core';
import { Contract, Offer } from '../models';
import { Store } from '../store';
import { daysUntil, round2 } from '../utils';

export interface RenewalOpportunity {
  contract: Contract;
  daysLeft: number;
  offers: OfferComparison[];
  bestSavingPerYear: number;
}

export interface OfferComparison extends Offer {
  savingPerYear: number;
  savingPercent: number;
}

/** Horizon à partir duquel on propose des offres concurrentes. */
const RENEWAL_HORIZON_DAYS = 60;

/**
 * Comparateur d'offres.
 *
 * Le catalogue est statique : dans une version connectée il proviendrait d'un
 * agrégateur partenaire. Les offres marquées `affiliate` donneraient lieu à une
 * commission — l'interface le mentionne explicitement à l'utilisateur.
 */
@Injectable({ providedIn: 'root' })
export class OffersService {
  private readonly store = inject(Store);

  /** Contrats arrivant à échéance, avec les alternatives correspondantes. */
  readonly opportunities = computed<RenewalOpportunity[]>(() => {
    const out: RenewalOpportunity[] = [];

    for (const c of this.store.activeContracts()) {
      const target = c.endDate ?? c.renewalDate;
      if (!target) continue;
      const left = daysUntil(target);
      if (left < 0 || left > RENEWAL_HORIZON_DAYS) continue;

      const offers = this.compare(c);
      out.push({
        contract: c,
        daysLeft: left,
        offers,
        bestSavingPerYear: offers.length ? Math.max(...offers.map((o) => o.savingPerYear)) : 0,
      });
    }

    return out.sort((a, b) => a.daysLeft - b.daysLeft);
  });

  /** Trois meilleures alternatives pour un contrat donné. */
  compare(contract: Contract, limit = 3): OfferComparison[] {
    return CATALOG.filter((o) => o.category === contract.category && o.provider !== contract.provider)
      .map((o) => ({
        ...o,
        savingPerYear: round2((contract.monthlyCost - o.monthlyCost) * 12),
        savingPercent: contract.monthlyCost > 0 ? round2(((contract.monthlyCost - o.monthlyCost) / contract.monthlyCost) * 100) : 0,
      }))
      .sort((a, b) => b.savingPerYear - a.savingPerYear || b.rating - a.rating)
      .slice(0, limit);
  }

  /** Économie annuelle maximale atteignable sur l'ensemble du portefeuille. */
  readonly potentialSavings = computed(() =>
    round2(
      this.store
        .activeContracts()
        .map((c) => Math.max(0, this.compare(c, 1)[0]?.savingPerYear ?? 0))
        .reduce((a, b) => a + b, 0),
    ),
  );
}

const CATALOG: Offer[] = [
  // Assurance habitation
  {
    id: 'of_hab_1',
    provider: 'Luko',
    label: 'Habitation Essentielle',
    category: 'assurance',
    monthlyCost: 21.9,
    highlights: ['Sans engagement', 'Résiliation en ligne', 'Franchise 120 €'],
    rating: 4.3,
    affiliate: true,
  },
  {
    id: 'of_hab_2',
    provider: 'Macif',
    label: 'Multirisque Habitation Confort',
    category: 'assurance',
    monthlyCost: 26.4,
    highlights: ['Protection juridique incluse', 'Franchise 150 €', 'Agence physique'],
    rating: 4.1,
    affiliate: false,
  },
  {
    id: 'of_hab_3',
    provider: 'Allianz',
    label: 'Habitation Sérénité',
    category: 'assurance',
    monthlyCost: 29.8,
    highlights: ['Valeur à neuf 5 ans', 'Assistance 24/7'],
    rating: 4.0,
    affiliate: true,
  },
  // Assurance auto
  {
    id: 'of_auto_1',
    provider: 'Direct Assurance',
    label: 'Tous risques Auto',
    category: 'vehicule',
    monthlyCost: 46.5,
    highlights: ['Souscription 100 % en ligne', 'Franchise 300 €', 'Conducteur secondaire gratuit'],
    rating: 4.2,
    affiliate: true,
  },
  {
    id: 'of_auto_2',
    provider: 'Macif',
    label: 'Auto Formule Tous Risques',
    category: 'vehicule',
    monthlyCost: 52.9,
    highlights: ['Véhicule de remplacement 30 j', 'Bonus à vie après 3 ans'],
    rating: 4.4,
    affiliate: false,
  },
  {
    id: 'of_auto_3',
    provider: 'MAIF',
    label: 'VAM Tous Risques',
    category: 'vehicule',
    monthlyCost: 55.2,
    highlights: ['Aucun frais de dossier', 'Assistance 0 km'],
    rating: 4.5,
    affiliate: false,
  },
  // Internet
  {
    id: 'of_net_1',
    provider: 'Free',
    label: 'Freebox Pop fibre',
    category: 'internet',
    monthlyCost: 29.99,
    highlights: ['Sans engagement', 'Jusqu’à 5 Gbit/s', 'TV incluse'],
    rating: 4.0,
    affiliate: true,
  },
  {
    id: 'of_net_2',
    provider: 'Bouygues Telecom',
    label: 'Bbox Must fibre',
    category: 'internet',
    monthlyCost: 33.99,
    highlights: ['Engagement 12 mois', 'Répéteur Wi-Fi inclus'],
    rating: 3.9,
    affiliate: true,
  },
  {
    id: 'of_net_3',
    provider: 'SFR',
    label: 'SFR Fibre Power',
    category: 'internet',
    monthlyCost: 36.99,
    highlights: ['Débit 2 Gbit/s', 'Forfait mobile 100 Go offert 1 an'],
    rating: 3.6,
    affiliate: true,
  },
  // Énergie
  {
    id: 'of_ener_1',
    provider: 'Enercoop',
    label: 'Électricité 100 % renouvelable',
    category: 'energie',
    monthlyCost: 112.0,
    highlights: ['Origine française et renouvelable', 'Sans engagement'],
    rating: 4.4,
    affiliate: false,
  },
  {
    id: 'of_ener_2',
    provider: 'TotalEnergies',
    label: 'Offre Verte Fixe 2 ans',
    category: 'energie',
    monthlyCost: 104.5,
    highlights: ['Prix du kWh bloqué 24 mois', 'Service client 7j/7'],
    rating: 3.7,
    affiliate: true,
  },
  {
    id: 'of_ener_3',
    provider: 'Octopus Energy',
    label: 'Éco-Conso',
    category: 'energie',
    monthlyCost: 99.9,
    highlights: ['Indexé sur le tarif réglementé -8 %', 'Sans frais de résiliation'],
    rating: 4.2,
    affiliate: true,
  },
  // Santé
  {
    id: 'of_sante_1',
    provider: 'Alan',
    label: 'Alan Green Famille',
    category: 'sante',
    monthlyCost: 121.0,
    highlights: ['Remboursement en 48 h', 'Téléconsultation incluse'],
    rating: 4.5,
    affiliate: true,
  },
  {
    id: 'of_sante_2',
    provider: 'Macif Santé',
    label: 'Garantie Santé Équilibre',
    category: 'sante',
    monthlyCost: 129.9,
    highlights: ['Optique renforcée', 'Sans délai de carence'],
    rating: 4.0,
    affiliate: false,
  },
];
