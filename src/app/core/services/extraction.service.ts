import { Injectable } from '@angular/core';
import { DocSource } from '../models';
import { normalize, todayIso } from '../utils';

export interface ExtractionResult {
  text: string;
  source: DocSource;
  sizeKb: number;
  thumbnail?: string;
  /** `true` si le texte provient réellement du fichier, `false` s'il est simulé. */
  real: boolean;
  engine: string;
}

/** Types dont le contenu peut être lu tel quel dans le navigateur. */
const TEXT_LIKE = ['text/plain', 'text/csv', 'text/markdown', 'message/rfc822', 'application/json'];
const TEXT_EXT = ['txt', 'csv', 'md', 'eml', 'json', 'log'];

/**
 * Extraction du contenu d'un fichier déposé.
 *
 * - Fichiers texte / e-mails (.txt, .eml, .csv, .md, .json) : le contenu est
 *   réellement lu et indexé.
 * - Images et PDF : cette application est une démonstration front-end sans
 *   moteur OCR embarqué. Le texte est alors **simulé** à partir d'un jeu de
 *   modèles, choisi selon les indices disponibles (nom de fichier, type MIME).
 *   `real: false` permet à l'interface de le signaler sans ambiguïté.
 */
@Injectable({ providedIn: 'root' })
export class ExtractionService {
  async extract(file: File): Promise<ExtractionResult> {
    const ext = (file.name.split('.').pop() ?? '').toLowerCase();
    const sizeKb = Math.max(1, Math.round(file.size / 1024));

    if (TEXT_LIKE.includes(file.type) || TEXT_EXT.includes(ext)) {
      const text = await file.text();
      return {
        text: text.slice(0, 20000),
        source: ext === 'eml' || file.type === 'message/rfc822' ? 'email' : 'pdf',
        sizeKb,
        real: true,
        engine: 'Lecture directe du fichier',
      };
    }

    if (file.type.startsWith('image/')) {
      const thumbnail = await this.makeThumbnail(file);
      return {
        text: this.simulateOcr(file.name),
        source: 'photo',
        sizeKb,
        thumbnail,
        real: false,
        engine: 'OCR de démonstration',
      };
    }

    return {
      text: this.simulateOcr(file.name),
      source: 'pdf',
      sizeKb,
      real: false,
      engine: 'Extraction PDF de démonstration',
    };
  }

  /** Capture depuis la caméra : même traitement qu'une photo importée. */
  async extractFromCapture(blob: Blob, label: string): Promise<ExtractionResult> {
    const file = new File([blob], label, { type: blob.type || 'image/jpeg' });
    const result = await this.extract(file);
    return { ...result, source: 'scan' };
  }

  /**
   * Réduit l'image à une vignette encodée en data-URL, stockable dans
   * localStorage sans faire exploser le quota.
   */
  private async makeThumbnail(file: File, maxSize = 320): Promise<string | undefined> {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return undefined;
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close();
      return canvas.toDataURL('image/jpeg', 0.6);
    } catch {
      return undefined;
    }
  }

  /**
   * Choisit le modèle de texte le plus vraisemblable d'après le nom du
   * fichier ; à défaut, alterne de façon déterministe pour que la démonstration
   * reste variée sans être aléatoire.
   */
  private simulateOcr(fileName: string): string {
    const hint = normalize(fileName);
    const match = TEMPLATES.find((t) => t.match.some((m) => hint.includes(m)));
    if (match) return match.text();

    const index = [...hint].reduce((acc, c) => acc + c.charCodeAt(0), 0) % TEMPLATES.length;
    return TEMPLATES[index].text();
  }
}

interface Template {
  match: string[];
  text: () => string;
}

const TEMPLATES: Template[] = [
  {
    match: ['edf', 'electricite', 'elec', 'energie'],
    text: () =>
      "EDF — Facture d'électricité\n" +
      'Référence client : 4820193746\n' +
      `Date d'émission : ${fr(todayIso())}\n` +
      'Point de livraison : 14 avenue Gambetta, 69003 Lyon\n' +
      'Consommation relevée : 588 kWh — Tarif Bleu, option base, 9 kVA\n' +
      'Montant total TTC : 142,60 €\n' +
      'Prélèvement automatique le 15 du mois.',
  },
  {
    match: ['assurance', 'maif', 'matmut', 'axa', 'habitation', 'attestation'],
    text: () =>
      "MAIF — Attestation d'assurance habitation\n" +
      'Contrat multirisque habitation n° HAB-77410932\n' +
      'Assuré : Hélène Moreau — 14 avenue Gambetta, 69003 Lyon\n' +
      'Cotisation annuelle : 389,88 €\n' +
      "Échéance principale au 01/11/2026. Reconduction tacite sauf dénonciation deux mois avant l'échéance.\n" +
      'Garanties : incendie, dégâts des eaux, vol, responsabilité civile vie privée.\n' +
      "Attestation valable jusqu'au 31/10/2026.",
  },
  {
    match: ['impot', 'fisc', 'taxe', 'dgfip', 'avis'],
    text: () =>
      "Direction générale des finances publiques — Avis d'impôt\n" +
      'Numéro fiscal : 1938274650192\n' +
      'Foyer fiscal : Hélène Moreau — 2,5 parts\n' +
      'Revenu fiscal de référence : 58 420 €\n' +
      "Montant de l'impôt net : 3 612,00 €\n" +
      'Date limite de paiement : 15/09/2026.',
  },
  {
    match: ['orange', 'sfr', 'free', 'bouygues', 'fibre', 'box', 'internet'],
    text: () =>
      'Orange — Facture mensuelle\n' +
      'Référence client : 0478291043\n' +
      'Offre Livebox Fibre + forfait mobile 5G\n' +
      'Engagement de 24 mois — frais de résiliation 59 €\n' +
      'Montant total TTC : 49,99 €\n' +
      "Échéance au 05/09/2026.",
  },
  {
    match: ['carte grise', 'immatriculation', 'controle', 'technique', 'auto', 'vehicule', 'voiture'],
    text: () =>
      'Procès-verbal de contrôle technique périodique\n' +
      'Véhicule : Peugeot 308 1.5 BlueHDi — immatriculation AB-742-CD\n' +
      'Kilométrage relevé : 78 420 km\n' +
      'Résultat : favorable\n' +
      'Prochain contrôle obligatoire avant le 12/09/2026\n' +
      'Montant réglé : 89,00 €.',
  },
  {
    match: ['bail', 'loyer', 'quittance', 'location', 'logement'],
    text: () =>
      'Quittance de loyer\n' +
      'Bailleur : SCI Gambetta Invest — Agence Rhône Habitat\n' +
      'Locataires : Hélène et Julien Moreau\n' +
      'Logement : 14 avenue Gambetta, 69003 Lyon\n' +
      'Loyer 1 080,00 € — charges 145,00 € — total réglé 1 225,00 €\n' +
      'Le bailleur donne quittance du paiement intégral.',
  },
  {
    match: ['banque', 'releve', 'compte', 'mutuel', 'bnp', 'salaire', 'paie'],
    text: () =>
      'Crédit Mutuel — Relevé de compte courant\n' +
      'Compte n° 10278 07300 00021847301\n' +
      'Solde créditeur en fin de période : 4 218,53 €\n' +
      'Prélèvements du mois : EDF 142,60 €, Orange 49,99 €, MAIF 32,49 €\n' +
      'Cotisation carte Visa Premier : 8,50 €.',
  },
  {
    match: ['ordonnance', 'sante', 'mutuelle', 'medecin', 'pharmacie'],
    text: () =>
      'Dr Nadia Berger — médecin généraliste\n' +
      '8 rue Villeroy, 69003 Lyon\n' +
      'Ordonnance pour Hélène Moreau\n' +
      'Renouvellement du traitement pour 3 mois\n' +
      'Bilan sanguin à réaliser sous 15 jours.',
  },
];

function fr(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
