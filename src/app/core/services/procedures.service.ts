import { Injectable, computed, inject } from '@angular/core';
import { Procedure, ProcedureCheck, ProcedureItem } from '../models';
import { Store } from '../store';
import { normalize } from '../utils';

/**
 * Base de connaissances des démarches administratives courantes et
 * confrontation de leurs exigences au contenu réel du coffre.
 */
@Injectable({ providedIn: 'root' })
export class ProceduresService {
  private readonly store = inject(Store);

  readonly all = PROCEDURES;

  /** Toutes les démarches évaluées, les moins complètes d'abord. */
  readonly checks = computed<ProcedureCheck[]>(() =>
    PROCEDURES.map((p) => this.check(p)).sort((a, b) => a.completion - b.completion),
  );

  /** Confronte une démarche au contenu du coffre. */
  check(procedure: Procedure): ProcedureCheck {
    const docs = this.store.documents();
    const present: ProcedureCheck['present'] = [];
    const missing: ProcedureItem[] = [];

    for (const item of procedure.items) {
      const found = docs.find((d) => {
        const haystack = normalize(`${d.name} ${d.originalName} ${d.issuer} ${d.tags.join(' ')} ${d.text}`);
        return item.match.some((m) => haystack.includes(normalize(m)));
      });
      if (found) present.push({ item, document: found });
      else missing.push(item);
    }

    const required = procedure.items.filter((i) => i.required).length || procedure.items.length;
    const requiredPresent = present.filter((p) => p.item.required).length;

    return {
      procedure,
      present,
      missing,
      completion: Math.round((requiredPresent / required) * 100),
    };
  }

  /** Trouve la démarche la plus proche d'une question en langage naturel. */
  match(question: string): Procedure | undefined {
    const q = normalize(question);
    let best: { procedure: Procedure; score: number } | undefined;

    for (const p of PROCEDURES) {
      let score = 0;
      for (const kw of p.keywords) {
        if (q.includes(normalize(kw))) score += kw.split(' ').length * 2;
      }
      if (score > 0 && (!best || score > best.score)) best = { procedure: p, score };
    }
    return best?.procedure;
  }

  byId(id: string): Procedure | undefined {
    return PROCEDURES.find((p) => p.id === id);
  }
}

/* -------------------------------------------------------------------------
   Base de connaissances
   ------------------------------------------------------------------------- */

const PROCEDURES: Procedure[] = [
  {
    id: 'location',
    title: 'Louer un appartement',
    keywords: ['louer', 'location', 'appartement', 'bail', 'dossier locatif', 'bailleur', 'logement'],
    intro:
      "Un dossier de location doit permettre au bailleur de vérifier votre identité et votre capacité à payer le loyer. La liste des pièces exigibles est limitativement fixée par le décret n° 2015-1437.",
    items: [
      {
        label: "Pièce d'identité en cours de validité",
        required: true,
        category: 'autre',
        match: ["carte d'identite", 'passeport', 'titre de sejour'],
        hint: 'Carte nationale d’identité, passeport ou titre de séjour.',
      },
      {
        label: 'Trois derniers bulletins de salaire',
        required: true,
        category: 'banque',
        match: ['bulletin de paie', 'bulletin de salaire', 'net a payer'],
        hint: 'Ou vos deux derniers bilans si vous êtes indépendante.',
      },
      {
        label: "Dernier avis d'imposition",
        required: true,
        category: 'impots',
        match: ["avis d'imposition", 'avis d impot', 'revenu fiscal de reference'],
      },
      {
        label: 'Justificatif de domicile actuel',
        required: true,
        category: 'logement',
        match: ['quittance de loyer', 'quittance', 'facture d electricite', 'facture edf'],
        hint: 'Trois dernières quittances de loyer ou une facture d’énergie récente.',
      },
      {
        label: 'Contrat de travail ou attestation employeur',
        required: true,
        category: 'banque',
        match: ['contrat de travail', 'attestation employeur', 'duree indeterminee'],
      },
      {
        label: "Attestation d'assurance habitation",
        required: false,
        category: 'assurance',
        match: ["attestation d'assurance", 'attestation assurance', 'multirisque habitation'],
        hint: 'Exigible à la remise des clés, pas à la constitution du dossier.',
      },
    ],
  },
  {
    id: 'pret',
    title: 'Demander un prêt immobilier',
    keywords: ['pret', 'emprunt', 'credit immobilier', 'banque', 'financement', 'acheter', 'achat immobilier'],
    intro:
      "La banque évalue votre solvabilité et votre apport. Un dossier complet accélère nettement l'obtention de l'accord de principe.",
    items: [
      {
        label: "Pièce d'identité",
        required: true,
        category: 'autre',
        match: ["carte d'identite", 'passeport'],
      },
      {
        label: 'Justificatif de domicile',
        required: true,
        category: 'logement',
        match: ['quittance de loyer', 'facture edf', "facture d'electricite"],
      },
      {
        label: 'Trois derniers bulletins de salaire',
        required: true,
        category: 'banque',
        match: ['bulletin de paie', 'net a payer'],
      },
      {
        label: 'Deux derniers avis d’imposition',
        required: true,
        category: 'impots',
        match: ["avis d'imposition", 'revenu fiscal de reference'],
      },
      {
        label: 'Trois derniers relevés de compte',
        required: true,
        category: 'banque',
        match: ['releve de compte', 'solde crediteur'],
      },
      {
        label: 'Justificatif d’apport personnel',
        required: true,
        category: 'banque',
        match: ['assurance vie', 'livret', 'epargne', 'releve annuel'],
      },
      {
        label: 'Compromis de vente',
        required: false,
        category: 'logement',
        match: ['compromis de vente', 'promesse de vente'],
      },
      {
        label: 'Tableau d’amortissement des crédits en cours',
        required: false,
        category: 'banque',
        match: ['amortissement', 'credit en cours', 'pret personnel'],
      },
    ],
  },
  {
    id: 'demenagement',
    title: 'Déménager',
    keywords: ['demenagement', 'demenager', 'changement d adresse', 'nouveau logement', 'emmenager'],
    intro:
      'Le déménagement déclenche une cascade de démarches : préavis, transferts de contrats et changements d’adresse.',
    items: [
      {
        label: 'Bail du logement actuel',
        required: true,
        category: 'logement',
        match: ['bail', 'contrat de location'],
      },
      {
        label: "État des lieux d'entrée",
        required: true,
        category: 'logement',
        match: ['etat des lieux'],
      },
      {
        label: 'Lettre de préavis au bailleur',
        required: true,
        category: 'logement',
        match: ['preavis', 'conge au bailleur', 'resiliation du bail'],
        hint: 'Préavis d’un mois en zone tendue, trois mois sinon.',
      },
      {
        label: "Contrat d'assurance habitation à transférer",
        required: true,
        category: 'assurance',
        match: ['multirisque habitation', 'assurance habitation'],
      },
      {
        label: 'Dernières factures d’énergie',
        required: false,
        category: 'energie',
        match: ['facture edf', "facture d'electricite", 'facture de gaz'],
        hint: 'Utiles pour le relevé de compteur de sortie.',
      },
    ],
  },
  {
    id: 'succession',
    title: 'Régler une succession',
    keywords: ['succession', 'heritage', 'deces', 'notaire', 'heritier', 'assurance vie beneficiaire'],
    intro:
      'Le notaire réunit les pièces d’état civil, l’inventaire du patrimoine et les contrats d’assurance vie.',
    items: [
      { label: 'Livret de famille', required: true, category: 'autre', match: ['livret de famille', 'etat civil'] },
      {
        label: 'Acte de décès',
        required: true,
        category: 'autre',
        match: ['acte de deces', 'certificat de deces'],
      },
      {
        label: 'Titres de propriété des biens immobiliers',
        required: true,
        category: 'logement',
        match: ['acte de propriete', 'titre de propriete', 'acte notarie'],
      },
      {
        label: 'Contrats d’assurance vie',
        required: true,
        category: 'banque',
        match: ['assurance vie', 'clause beneficiaire'],
      },
      {
        label: 'Relevés de comptes bancaires',
        required: true,
        category: 'banque',
        match: ['releve de compte', 'solde crediteur'],
      },
      {
        label: 'Derniers avis d’imposition',
        required: false,
        category: 'impots',
        match: ["avis d'imposition", 'taxe fonciere'],
      },
      {
        label: 'Testament ou donation entre époux',
        required: false,
        category: 'autre',
        match: ['testament', 'donation'],
      },
    ],
  },
  {
    id: 'caf',
    title: 'Demander une aide au logement (CAF)',
    keywords: ['caf', 'apl', 'aide au logement', 'allocation logement'],
    intro: 'La CAF vérifie vos ressources, votre situation familiale et votre logement.',
    items: [
      { label: "Pièce d'identité", required: true, category: 'autre', match: ["carte d'identite", 'passeport'] },
      { label: 'Bail signé', required: true, category: 'logement', match: ['bail', 'contrat de location'] },
      {
        label: "Dernier avis d'imposition",
        required: true,
        category: 'impots',
        match: ["avis d'imposition", 'revenu fiscal'],
      },
      {
        label: 'Relevé d’identité bancaire',
        required: true,
        category: 'banque',
        match: ['iban', 'rib', 'releve d identite bancaire'],
      },
      { label: 'Quittances de loyer', required: false, category: 'logement', match: ['quittance'] },
    ],
  },
  {
    id: 'sinistre',
    title: 'Déclarer un sinistre habitation',
    keywords: ['sinistre', 'degat des eaux', 'declarer un sinistre', 'incendie', 'cambriolage', 'vol'],
    intro:
      'La déclaration doit intervenir sous cinq jours ouvrés (deux jours en cas de vol). Rassemblez les preuves avant tout.',
    items: [
      {
        label: 'Contrat d’assurance habitation',
        required: true,
        category: 'assurance',
        match: ['multirisque habitation', 'contrat', 'assurance habitation'],
      },
      {
        label: 'Attestation d’assurance en cours',
        required: true,
        category: 'assurance',
        match: ["attestation d'assurance", 'attestation'],
      },
      {
        label: 'Factures des biens endommagés',
        required: true,
        category: 'autre',
        match: ['facture', 'ticket de caisse', 'bon de garantie'],
      },
      {
        label: 'Constat amiable ou dépôt de plainte',
        required: false,
        category: 'autre',
        match: ['constat', 'depot de plainte', 'main courante'],
      },
      {
        label: "État des lieux d'entrée",
        required: false,
        category: 'logement',
        match: ['etat des lieux'],
        hint: 'Sert à prouver l’état antérieur du logement.',
      },
    ],
  },
  {
    id: 'vente-vehicule',
    title: 'Vendre un véhicule',
    keywords: ['vendre voiture', 'vente vehicule', 'ceder un vehicule', 'carte grise vente'],
    intro: 'La cession se déclare en ligne sur le site de l’ANTS dans les quinze jours.',
    items: [
      {
        label: 'Certificat d’immatriculation (carte grise)',
        required: true,
        category: 'vehicule',
        match: ['carte grise', "certificat d'immatriculation"],
      },
      {
        label: 'Contrôle technique de moins de six mois',
        required: true,
        category: 'vehicule',
        match: ['controle technique', 'proces verbal de controle'],
      },
      {
        label: 'Certificat de situation administrative (non-gage)',
        required: true,
        category: 'vehicule',
        match: ['certificat de situation', 'non gage'],
      },
      {
        label: 'Certificat de cession',
        required: true,
        category: 'vehicule',
        match: ['certificat de cession', 'declaration de cession'],
      },
    ],
  },
];
