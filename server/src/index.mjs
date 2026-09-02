import cors from 'cors';
import express from 'express';
import { authRouter, requireAuth } from './auth.mjs';
import { pool, transaction } from './db.mjs';
import { env } from './env.mjs';
import { extractRouter } from './extract.mjs';
import { filesRouter, storageRouter } from './files.mjs';
import { loadState, STATE_SCHEMA_VERSION } from './state-load.mjs';
import { saveState } from './state-save.mjs';
import { StateError } from './validate.mjs';

const app = express();

app.use(
  cors({
    origin(origin, callback) {
      // Sans origine : appel serveur à serveur, ou WebView native selon la
      // plateforme. Rien à refuser, l'autorisation repose sur le jeton.
      if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
      // Refuser en levant une exception donnerait un 500 trompeur. On répond
      // normalement sans l'en-tête d'autorisation : c'est le navigateur qui
      // bloque. La trace, elle, est précieuse pour diagnostiquer un appareil
      // qui n'arrive pas à joindre l'API.
      console.warn(`[api] origine non autorisée : ${origin}`);
      return callback(null, false);
    },
  }),
);

// L'état complet transite en un seul corps de requête, vignettes comprises :
// la limite par défaut d'Express (100 Ko) serait atteinte dès quelques scans.
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', async (_req, res) => {
  const { rows } = await pool.query('SELECT now() AS at');
  res.json({ ok: true, at: rows[0].at, stateSchemaVersion: STATE_SCHEMA_VERSION });
});

app.use('/api/auth', authRouter);
app.use('/api/documents', filesRouter);
app.use('/api/storage', storageRouter);
app.use('/api/extract', extractRouter);

/** État complet de l'utilisateur courant. */
app.get('/api/state', requireAuth, async (req, res) => {
  const result = await transaction(async (client) => {
    await client.query('SET TRANSACTION READ ONLY');
    const state = await loadState(client, req.userId);
    if (!state) return null;
    const { rows } = await client.query('SELECT state_version FROM app.app_user WHERE id = $1', [req.userId]);
    return { state, version: rows[0].state_version };
  });

  if (!result) return res.status(401).json({ error: 'Compte introuvable.' });
  return res.json(result);
});

/**
 * Remplace l'état complet.
 *
 * Le client renvoie la `version` qu'il détient. Si elle ne correspond plus,
 * c'est qu'un autre appareil a écrit entre-temps : on répond 409 avec l'état
 * serveur, au lieu de l'écraser en silence. Une `version` absente vaut
 * acceptation forcée — c'est le cas de la toute première synchronisation.
 */
app.put('/api/state', requireAuth, async (req, res) => {
  const { state, version } = req.body ?? {};

  const result = await transaction(async (client) => {
    // Verrou de ligne : deux PUT simultanés ne peuvent pas lire la même version
    // et l'incrémenter chacun de leur côté.
    const { rows } = await client.query(
      'SELECT state_version FROM app.app_user WHERE id = $1 FOR UPDATE',
      [req.userId],
    );
    if (!rows.length) return { status: 401, body: { error: 'Compte introuvable.' } };

    const current = rows[0].state_version;
    if (typeof version === 'number' && version !== current) {
      return {
        status: 409,
        body: {
          error: 'Version obsolète : le serveur a été modifié depuis votre dernier chargement.',
          version: current,
          state: await loadState(client, req.userId),
        },
      };
    }

    const saved = await saveState(client, req.userId, state);
    return { status: 200, body: saved };
  });

  return res.status(result.status).json(result.body);
});

app.use((error, _req, res, _next) => {
  if (error instanceof StateError) {
    return res.status(400).json({ error: error.message, problems: error.problems });
  }
  // Levée par les analyseurs de corps au-delà de leur limite. Sans ce cas, un
  // fichier trop lourd remonterait en 500, illisible pour l'utilisateur.
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Fichier trop volumineux (25 Mo maximum).' });
  }
  console.error('[api]', error);
  return res.status(500).json({ error: "Erreur interne du serveur." });
});

const server = app.listen(env.port, () => {
  console.log(`[api] à l'écoute sur http://localhost:${env.port}`);
  console.log(`[api] base ${env.pg.database} sur ${env.pg.host}:${env.pg.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => pool.end().then(() => process.exit(0)));
  });
}
