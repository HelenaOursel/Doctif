import { createHash } from 'node:crypto';
import express, { Router } from 'express';
import { pool } from './db.mjs';
import { requireAuth } from './auth.mjs';

/** Plafond par fichier. Un `bytea` transite intégralement en mémoire. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/**
 * Corps brut, tous types confondus.
 *
 * Pas de `multer` ni de multipart : une requête ne porte qu'un fichier, dont le
 * nom voyage dans l'en-tête `X-File-Name`. Le format multipart n'apporterait
 * ici qu'une dépendance et un analyseur de plus.
 */
const rawBody = express.raw({ type: () => true, limit: MAX_FILE_BYTES });

export const filesRouter = Router();

/**
 * Supprime les fichiers dont le document n'existe plus.
 *
 * `document_file` n'a volontairement pas de clé étrangère vers `document` — une
 * cascade la viderait à chaque sauvegarde d'état, qui procède par suppression
 * puis réinsertion. Le ménage est donc fait ici, à partir des documents
 * réellement présents après écriture.
 */
export async function cleanupOrphans(client, userId) {
  const { rowCount } = await client.query(
    `DELETE FROM app.document_file f
      WHERE f.user_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM app.document d WHERE d.user_id = f.user_id AND d.id = f.document_id
        )`,
    [userId],
  );
  return rowCount ?? 0;
}

/** Dépôt ou remplacement du fichier d'un document. */
filesRouter.post('/:id/file', requireAuth, rawBody, async (req, res) => {
  const bytes = req.body;
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    return res.status(400).json({ error: 'Corps de requête vide.' });
  }

  // Le document doit exister et appartenir au demandeur : sans ce contrôle,
  // n'importe quel identifiant deviendrait un espace de stockage libre.
  const owner = await pool.query('SELECT 1 FROM app.document WHERE user_id = $1 AND id = $2', [
    req.userId,
    req.params.id,
  ]);
  if (!owner.rowCount) {
    return res.status(404).json({ error: 'Document introuvable.' });
  }

  const checksum = createHash('sha256').update(bytes).digest('hex');
  const mime = req.get('content-type')?.split(';')[0] || 'application/octet-stream';
  const fileName = req.get('x-file-name') || `${req.params.id}.bin`;

  await pool.query(
    `INSERT INTO app.document_file
       (user_id, document_id, bytes, mime_type, file_name, size_bytes, checksum_sha256, uploaded_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (user_id, document_id) DO UPDATE
       SET bytes = EXCLUDED.bytes, mime_type = EXCLUDED.mime_type, file_name = EXCLUDED.file_name,
           size_bytes = EXCLUDED.size_bytes, checksum_sha256 = EXCLUDED.checksum_sha256,
           uploaded_at = now()`,
    [req.userId, req.params.id, bytes, mime, decodeURIComponent(fileName), bytes.length, checksum],
  );

  return res.status(201).json({
    documentId: req.params.id,
    sizeBytes: bytes.length,
    mimeType: mime,
    checksum,
  });
});

/** Relecture du fichier d'origine. */
filesRouter.get('/:id/file', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT bytes, mime_type, file_name FROM app.document_file WHERE user_id = $1 AND document_id = $2',
    [req.userId, req.params.id],
  );
  // 404 et non 403 : distinguer « pas à vous » de « n'existe pas » révélerait
  // l'existence des documents d'autrui.
  if (!rows.length) return res.status(404).json({ error: 'Aucun fichier pour ce document.' });

  const file = rows[0];
  res.setHeader('Content-Type', file.mime_type);
  res.setHeader('Content-Length', file.bytes.length);
  res.setHeader(
    'Content-Disposition',
    `inline; filename*=UTF-8''${encodeURIComponent(file.file_name)}`,
  );
  return res.send(file.bytes);
});

filesRouter.delete('/:id/file', requireAuth, async (req, res) => {
  const { rowCount } = await pool.query(
    'DELETE FROM app.document_file WHERE user_id = $1 AND document_id = $2',
    [req.userId, req.params.id],
  );
  if (!rowCount) return res.status(404).json({ error: 'Aucun fichier pour ce document.' });
  return res.status(204).end();
});

/**
 * Volume total stocké par le compte — le `bytea` pèse directement sur la base.
 * Routeur distinct : sous `/api/documents`, ce chemin se confondrait à la
 * lecture avec `/:id/file`.
 */
export const storageRouter = Router();

storageRouter.get('/usage', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS count, coalesce(sum(size_bytes), 0)::bigint AS total
       FROM app.document_file WHERE user_id = $1`,
    [req.userId],
  );
  return res.json({ count: rows[0].count, totalBytes: Number(rows[0].total) });
});
