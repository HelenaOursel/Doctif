import pg from 'pg';
import { env } from './env.mjs';

/**
 * Adaptations de types avant toute connexion.
 *
 * Le client manipule des chaînes ISO `yyyy-MM-dd` (voir `toIso` dans
 * src/app/core/utils.ts) précisément pour éviter les décalages de fuseau. Or
 * `pg` convertit par défaut les colonnes `date` en `Date` JavaScript, qui
 * repasserait par le fuseau local au moment de la sérialisation et pourrait
 * reculer d'un jour. On garde donc la chaîne brute renvoyée par PostgreSQL.
 */
pg.types.setTypeParser(1082, (value) => value); // date
/** `numeric` arrive en chaîne par défaut ; le modèle attend des nombres. */
pg.types.setTypeParser(1700, (value) => (value === null ? null : Number(value)));

export const pool = new pg.Pool({
  ...env.pg,
  // Pas de `password` : pg lit pgpass.conf quand PGPASSWORD est absent.
  max: 10,
  idleTimeoutMillis: 30_000,
  statement_timeout: 30_000,
});

pool.on('error', (error) => {
  // Une connexion inactive coupée par le serveur ne doit pas tuer le process.
  console.error('[api] connexion PostgreSQL perdue :', error.message);
});

/** Exécute `fn` dans une transaction, avec ROLLBACK garanti en cas d'échec. */
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Insertion groupée. Les valeurs partent en paramètres numérotés — jamais
 * concaténées — et sont découpées en lots pour rester sous la limite de
 * 65535 paramètres d'un message PostgreSQL.
 *
 * `jsonColumns` liste les colonnes `jsonb` : leurs valeurs doivent être
 * sérialisées à la main, sinon `pg` transformerait un tableau JavaScript en
 * tableau PostgreSQL (`{a,b}`), qui n'est pas du JSON valide.
 */
export async function insertRows(client, table, columns, rows, jsonColumns = []) {
  if (!rows.length) return 0;

  const jsonIndexes = new Set(jsonColumns.map((name) => columns.indexOf(name)));
  const prepared = rows.map((row) =>
    row.map((value, i) => (jsonIndexes.has(i) && value != null ? JSON.stringify(value) : value)),
  );

  const perChunk = Math.max(1, Math.floor(60_000 / columns.length));
  const quoted = columns.map((c) => `"${c}"`).join(', ');
  let inserted = 0;

  for (let start = 0; start < prepared.length; start += perChunk) {
    const chunk = prepared.slice(start, start + perChunk);
    const params = [];
    const tuples = chunk.map((row) => {
      const placeholders = row.map((value) => {
        params.push(value);
        return `$${params.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });
    const result = await client.query(
      `INSERT INTO app.${table} (${quoted}) VALUES ${tuples.join(', ')}`,
      params,
    );
    inserted += result.rowCount ?? 0;
  }

  return inserted;
}
