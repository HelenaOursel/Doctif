import express, { Router } from 'express';
import { MAX_FILE_BYTES } from './files.mjs';
import { requireAuth } from './auth.mjs';

/**
 * Extraction du texte réel des PDF.
 *
 * `pdfjs-dist` est du JavaScript pur : aucune compilation native, donc rien à
 * installer sur le poste. On charge la construction « legacy », la seule qui
 * fonctionne hors navigateur, et on l'importe paresseusement — inutile de payer
 * son chargement au démarrage d'un serveur qui ne verra peut-être aucun PDF.
 */
let pdfjs = null;
async function loadPdfjs() {
  if (!pdfjs) pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjs;
}

/**
 * Polices standard embarquées par pdfjs.
 *
 * Sans ce chemin, la bibliothèque avertit à chaque document et se rabat sur des
 * métriques approximatives : les documents utilisant Helvetica ou Times sans
 * les embarquer peuvent alors rendre un texte mal découpé.
 */
const STANDARD_FONTS = new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url).href;
const CMAPS = new URL('../node_modules/pdfjs-dist/cmaps/', import.meta.url).href;

/** Limite de garde : au-delà, l'extraction coûterait plus qu'elle ne rapporte. */
const MAX_PAGES = 40;
const MAX_CHARS = 20_000;

export async function extractPdfText(buffer) {
  const { getDocument } = await loadPdfjs();

  const task = getDocument({
    data: new Uint8Array(buffer),
    standardFontDataUrl: STANDARD_FONTS,
    // Les CMaps servent aux PDF en encodage CJK ou en polices composites, très
    // courants dans les documents produits par des scanners.
    cMapUrl: CMAPS,
    cMapPacked: true,
    // Hors navigateur il n'y a pas de polices système, et `eval` n'a aucune
    // raison d'être autorisé sur un fichier reçu de l'extérieur.
    useSystemFonts: false,
    disableFontFace: true,
    isEvalSupported: false,
  });

  const pdf = await task.promise;
  try {
    const pages = Math.min(pdf.numPages, MAX_PAGES);
    const parts = [];

    for (let n = 1; n <= pages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      // Chaque `item` est un fragment positionné ; les recoller par des espaces
      // suffit à une recherche plein texte, sans reconstituer la mise en page.
      parts.push(content.items.map((item) => item.str ?? '').join(' '));
      page.cleanup();
      if (parts.join(' ').length > MAX_CHARS) break;
    }

    const text = parts.join('\n').replace(/[ \t]+/g, ' ').trim().slice(0, MAX_CHARS);
    return { text, pages: pdf.numPages, truncated: pdf.numPages > pages };
  } finally {
    // C'est la tâche de chargement qui libère les ressources, pas le document.
    await task.destroy();
  }
}

export const extractRouter = Router();

/**
 * Extrait le texte sans rien conserver.
 *
 * Le client appelle cette route pendant l'analyse, avant même que le document
 * n'existe : le classement doit porter sur le vrai contenu. Le fichier n'est
 * envoyé pour de bon qu'à l'enregistrement.
 */
extractRouter.post(
  '/',
  requireAuth,
  express.raw({ type: () => true, limit: MAX_FILE_BYTES }),
  async (req, res) => {
    const bytes = req.body;
    if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
      return res.status(400).json({ error: 'Corps de requête vide.' });
    }

    const mime = req.get('content-type')?.split(';')[0] || '';
    // Signature %PDF- : le type déclaré par le navigateur n'est pas fiable.
    const looksLikePdf = bytes.subarray(0, 5).toString('latin1') === '%PDF-';

    if (mime !== 'application/pdf' && !looksLikePdf) {
      // Images : il faudrait un moteur d'OCR, hors périmètre. Le client garde
      // alors sa propre extraction.
      return res.json({ text: '', real: false, engine: 'Type non pris en charge côté serveur' });
    }

    try {
      const { text, pages, truncated } = await extractPdfText(bytes);
      if (!text) {
        // PDF composé d'images scannées : il y a des pages, mais aucun texte.
        return res.json({
          text: '',
          real: false,
          pages,
          engine: 'PDF sans couche texte (document scanné)',
        });
      }
      return res.json({
        text,
        real: true,
        pages,
        truncated,
        engine: `Extraction PDF (${pages} page${pages > 1 ? 's' : ''})`,
      });
    } catch (error) {
      console.warn('[api] extraction PDF impossible :', error.message);
      return res.json({ text: '', real: false, engine: 'PDF illisible' });
    }
  },
);
