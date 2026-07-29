import { Injectable } from '@angular/core';
import { Category, DocType, DocumentItem } from '../models';
import { addDays, normalize, slugify, todayIso, uid } from '../utils';

export interface ClassificationResult {
  category: Category;
  docType: DocType;
  issuer: string;
  date: string;
  amount?: number;
  tags: string[];
  confidence: number;
  /** Nom de fichier normalisé proposé. */
  suggestedName: string;
  /** Détail des signaux qui ont conduit à la décision — affiché à l'utilisateur. */
  reasons: string[];
}

/** Poids d'un mot-clé dans le score d'une catégorie. */
interface Lexicon {
  category: Category;
  strong: string[];
  weak: string[];
}

const LEXICONS: Lexicon[] = [
  {
    category: 'assurance',
    strong: ['multirisque', 'assurance habitation', 'cotisation', 'sinistre', 'franchise', 'garantie', 'assureur'],
    weak: ['maif', 'matmut', 'gmf', 'axa', 'allianz', 'macif', 'groupama', 'attestation', 'responsabilite civile'],
  },
  {
    category: 'energie',
    strong: ['kwh', 'electricite', 'gaz naturel', 'releve de compteur', 'point de livraison', 'tarif bleu'],
    weak: ['edf', 'engie', 'total energies', 'enercoop', 'consommation', 'compteur', 'puissance souscrite'],
  },
  {
    category: 'internet',
    strong: ['fibre', 'livebox', 'freebox', 'forfait mobile', 'debit descendant', 'ligne fixe', 'adsl'],
    weak: ['orange', 'sfr', 'bouygues', 'free', 'box', 'internet', '5g', 'telephonie'],
  },
  {
    category: 'banque',
    strong: ['releve de compte', 'iban', 'solde crediteur', 'decouvert', 'carte visa', 'assurance vie', 'bulletin de paie'],
    weak: ['banque', 'credit mutuel', 'bnp', 'societe generale', 'caisse d epargne', 'virement', 'prelevement', 'salaire', 'net a payer'],
  },
  {
    category: 'logement',
    strong: ['bail', 'etat des lieux', 'quittance de loyer', 'depot de garantie', 'bailleur', 'locataire', 'syndic'],
    weak: ['loyer', 'charges', 'logement', 'appartement', 'copropriete', 'agence immobiliere'],
  },
  {
    category: 'impots',
    strong: ['avis d imposition', 'taxe fonciere', 'taxe d habitation', 'declaration des revenus', 'dgfip', 'numero fiscal'],
    weak: ['impot', 'impots', 'revenu fiscal de reference', 'prelevement a la source', 'tresor public', 'foyer fiscal'],
  },
  {
    category: 'sante',
    strong: ['ordonnance', 'tiers payant', 'mutuelle', 'feuille de soins', 'assurance maladie', 'medecin'],
    weak: ['sante', 'pharmacie', 'hospitalisation', 'optique', 'dentaire', 'cpam', 'harmonie mutuelle'],
  },
  {
    category: 'vehicule',
    strong: ['carte grise', 'certificat d immatriculation', 'controle technique', 'immatriculation', 'assurance auto'],
    weak: ['vehicule', 'voiture', 'peugeot', 'renault', 'citroen', 'kilometrage', 'permis', 'garage'],
  },
];

const DOC_TYPE_RULES: { type: DocType; patterns: string[] }[] = [
  { type: 'facture', patterns: ['facture', 'montant total ttc', 'a payer', 'echeancier'] },
  { type: 'contrat', patterns: ['contrat', 'conditions particulieres', 'souscription', 'engagement de'] },
  { type: 'attestation', patterns: ['attestation', 'nous attestons', 'certificat d assurance'] },
  { type: 'avis', patterns: ['avis d imposition', 'avis de taxe', 'declaration des revenus'] },
  { type: 'releve', patterns: ['releve de compte', 'releve annuel', 'solde crediteur'] },
  { type: 'ordonnance', patterns: ['ordonnance', 'prescription', 'renouvellement du traitement'] },
  {
    type: 'justificatif',
    patterns: ['bulletin de paie', 'etat des lieux', 'quittance', 'carte grise', 'certificat d immatriculation', 'proces verbal'],
  },
  { type: 'courrier', patterns: ['madame, monsieur', 'lettre recommandee', 'objet :'] },
];

/** Émetteurs connus : nom canonique ↔ variantes rencontrées dans les textes. */
const ISSUERS: { name: string; aliases: string[] }[] = [
  { name: 'EDF', aliases: ['edf'] },
  { name: 'Engie', aliases: ['engie', 'gdf'] },
  { name: 'TotalEnergies', aliases: ['total energies', 'totalenergies'] },
  { name: 'Orange', aliases: ['orange', 'livebox'] },
  { name: 'SFR', aliases: ['sfr'] },
  { name: 'Free', aliases: ['free', 'freebox'] },
  { name: 'Bouygues Telecom', aliases: ['bouygues'] },
  { name: 'MAIF', aliases: ['maif'] },
  { name: 'Matmut', aliases: ['matmut'] },
  { name: 'AXA', aliases: ['axa'] },
  { name: 'GMF', aliases: ['gmf'] },
  { name: 'Macif', aliases: ['macif'] },
  { name: 'Allianz', aliases: ['allianz'] },
  { name: 'Groupama', aliases: ['groupama'] },
  { name: 'Harmonie Mutuelle', aliases: ['harmonie mutuelle', 'harmonie'] },
  { name: 'DGFiP', aliases: ['dgfip', 'finances publiques', 'impots.gouv'] },
  { name: 'Crédit Mutuel', aliases: ['credit mutuel'] },
  { name: 'BNP Paribas', aliases: ['bnp'] },
  { name: 'Société Générale', aliases: ['societe generale'] },
  { name: 'CPAM', aliases: ['cpam', 'assurance maladie', 'ameli'] },
  { name: 'Autosur', aliases: ['autosur', 'dekra', 'securitest'] },
  { name: 'ANTS', aliases: ['ants', 'certificat d immatriculation'] },
];

/**
 * Classement automatique d'un document à partir de son texte et de son nom
 * de fichier. Approche lexicale pondérée : chaque catégorie accumule un score,
 * la meilleure l'emporte et l'écart avec la suivante donne la confiance.
 */
@Injectable({ providedIn: 'root' })
export class ClassifierService {
  classify(text: string, fileName: string, hintDate?: string): ClassificationResult {
    const haystack = normalize(`${fileName} ${text}`);
    const reasons: string[] = [];

    /* --- Catégorie --- */
    const scores = LEXICONS.map((lex) => {
      const hits: string[] = [];
      let score = 0;
      for (const term of lex.strong) {
        if (haystack.includes(term)) {
          score += 3;
          hits.push(term);
        }
      }
      for (const term of lex.weak) {
        if (haystack.includes(term)) {
          score += 1;
          hits.push(term);
        }
      }
      return { category: lex.category, score, hits };
    }).sort((a, b) => b.score - a.score);

    const best = scores[0];
    const runnerUp = scores[1];
    let category: Category = 'autre';
    let confidence = 0.35;

    if (best && best.score > 0) {
      category = best.category;
      // La confiance croît avec le score absolu et avec l'écart au second.
      const margin = best.score - (runnerUp?.score ?? 0);
      confidence = Math.min(0.98, 0.5 + best.score * 0.04 + margin * 0.06);
      reasons.push(`Termes détectés : ${best.hits.slice(0, 4).join(', ')}`);
    } else {
      reasons.push('Aucun terme discriminant trouvé — classé dans « Autre »');
    }

    /* --- Type de document --- */
    let docType: DocType = 'autre';
    for (const rule of DOC_TYPE_RULES) {
      if (rule.patterns.some((p) => haystack.includes(p))) {
        docType = rule.type;
        reasons.push(`Type reconnu : ${rule.type}`);
        break;
      }
    }

    /* --- Émetteur --- */
    let issuer = '';
    for (const candidate of ISSUERS) {
      if (candidate.aliases.some((a) => haystack.includes(a))) {
        issuer = candidate.name;
        reasons.push(`Émetteur identifié : ${issuer}`);
        break;
      }
    }
    if (!issuer) {
      issuer = 'Émetteur inconnu';
      confidence = Math.max(0.3, confidence - 0.12);
    }

    /* --- Date --- */
    const date = this.extractDate(text) ?? hintDate ?? todayIso();
    if (this.extractDate(text)) reasons.push(`Date extraite du document : ${date}`);

    /* --- Montant --- */
    const amount = this.extractAmount(text);
    if (amount !== undefined) reasons.push(`Montant détecté : ${amount} €`);

    /* --- Mots-clés --- */
    const tags = this.extractTags(haystack, category);

    return {
      category,
      docType,
      issuer,
      date,
      amount,
      tags,
      confidence: Math.round(confidence * 100) / 100,
      suggestedName: this.buildName({ category, docType, issuer, date }),
      reasons,
    };
  }

  /**
   * Renommage automatique : `AAAA-MM-type-emetteur-categorie.ext`.
   * Format stable, triable chronologiquement et lisible dans une liste.
   */
  buildName(input: { category: Category; docType: DocType; issuer: string; date: string; ext?: string }): string {
    const parts = [
      input.date.slice(0, 7),
      input.docType === 'autre' ? 'document' : input.docType,
      slugify(input.issuer === 'Émetteur inconnu' ? '' : input.issuer),
      input.category,
    ].filter(Boolean);
    return `${parts.join('-')}.${input.ext ?? 'pdf'}`;
  }

  /** Reconnaît les formats jj/mm/aaaa, jj-mm-aaaa, aaaa-mm-jj et « 15 octobre 2026 ». */
  extractDate(text: string): string | undefined {
    const slash = text.match(/\b(\d{2})[/.-](\d{2})[/.-](\d{4})\b/);
    if (slash) return `${slash[3]}-${slash[2]}-${slash[1]}`;

    const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

    const months = [
      'janvier',
      'fevrier',
      'mars',
      'avril',
      'mai',
      'juin',
      'juillet',
      'aout',
      'septembre',
      'octobre',
      'novembre',
      'decembre',
    ];
    const norm = normalize(text);
    const literal = norm.match(new RegExp(`\\b(\\d{1,2})\\s+(${months.join('|')})\\s+(\\d{4})\\b`));
    if (literal) {
      const m = months.indexOf(literal[2]) + 1;
      return `${literal[3]}-${`${m}`.padStart(2, '0')}-${literal[1].padStart(2, '0')}`;
    }
    return undefined;
  }

  /** Retient le plus grand montant en euros du document (souvent le total TTC). */
  extractAmount(text: string): number | undefined {
    const matches = [...text.matchAll(/(\d{1,3}(?:[  ]\d{3})*|\d+)[.,](\d{2})\s*€/g)];
    if (!matches.length) return undefined;
    const values = matches.map((m) => Number(`${m[1].replace(/[  ]/g, '')}.${m[2]}`)).filter((n) => !Number.isNaN(n));
    return values.length ? Math.max(...values) : undefined;
  }

  private extractTags(haystack: string, category: Category): string[] {
    const tags = new Set<string>([category]);
    const notable = [
      'facture',
      'contrat',
      'attestation',
      'resiliation',
      'echeance',
      'loyer',
      'salaire',
      'ordonnance',
      'controle technique',
      'carte grise',
      'assurance vie',
      'taxe fonciere',
    ];
    for (const t of notable) if (haystack.includes(t)) tags.add(t);
    return [...tags].slice(0, 6);
  }

  /**
   * Construit le document final à partir d'un résultat de classement.
   * Le nom conserve l'extension d'origine.
   */
  toDocument(input: {
    result: ClassificationResult;
    fileName: string;
    text: string;
    sizeKb: number;
    source: DocumentItem['source'];
    thumbnail?: string;
  }): DocumentItem {
    const ext = input.fileName.includes('.') ? input.fileName.split('.').pop()!.toLowerCase() : 'pdf';
    const r = input.result;
    return {
      id: uid('doc'),
      name: this.buildName({ category: r.category, docType: r.docType, issuer: r.issuer, date: r.date, ext }),
      originalName: input.fileName,
      category: r.category,
      docType: r.docType,
      source: input.source,
      issuer: r.issuer,
      date: r.date,
      addedAt: todayIso(),
      sizeKb: input.sizeKb,
      text: input.text,
      amount: r.amount,
      tags: r.tags,
      sharedWith: [],
      archived: false,
      confidence: r.confidence,
      thumbnail: input.thumbnail,
    };
  }

  /**
   * Détecte les échéances contenues dans un texte (« avant le 12/09/2026 »,
   * « échéance au … »). Utilisé pour alimenter le calendrier automatiquement.
   */
  detectDeadlines(text: string): { label: string; date: string }[] {
    const found: { label: string; date: string }[] = [];
    const triggers = [
      { re: /avant le\s+(\d{2}[/.-]\d{2}[/.-]\d{4})/gi, label: 'Échéance détectée' },
      { re: /(?:échéance|echeance)\s+(?:annuelle\s+)?(?:au|le)?\s*:?\s*(\d{2}[/.-]\d{2}[/.-]\d{4})/gi, label: 'Échéance du contrat' },
      { re: /date limite de paiement\s*:?\s*(\d{2}[/.-]\d{2}[/.-]\d{4})/gi, label: 'Date limite de paiement' },
      { re: /valable jusqu[’']au\s+(\d{2}[/.-]\d{2}[/.-]\d{4})/gi, label: 'Fin de validité' },
    ];
    for (const t of triggers) {
      for (const m of text.matchAll(t.re)) {
        const parts = m[1].split(/[/.-]/);
        found.push({ label: t.label, date: `${parts[2]}-${parts[1]}-${parts[0]}` });
      }
    }
    // Déduplique sur la date
    const seen = new Set<string>();
    return found.filter((f) => (seen.has(f.date) ? false : (seen.add(f.date), true)));
  }

  /** Date par défaut proposée pour un rappel lié à un document sans échéance explicite. */
  defaultReminder(): string {
    return addDays(todayIso(), 30);
  }
}
