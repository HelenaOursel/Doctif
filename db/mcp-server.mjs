#!/usr/bin/env node
/**
 * Serveur MCP « web-app-db » — expose la base PostgreSQL `web_app` à Claude Code.
 *
 * Transport stdio : Claude Code lance ce script, dialogue en JSON-RPC sur
 * stdin/stdout. Rien n'écoute sur le réseau.
 *
 * Aucun mot de passe n'est stocké ici ni dans `.mcp.json` : `pg` retombe sur
 * `%APPDATA%\postgresql\pgpass.conf` (via sa dépendance `pgpass`) quand la
 * variable PGPASSWORD est absente.
 *
 * IMPORTANT : ne jamais écrire sur stdout autrement que via le transport —
 * une seule ligne parasite casse le protocole. Les traces vont sur stderr.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import pg from 'pg';
import { z } from 'zod';

/** Racine du dépôt : `run_sql_file` n'accepte que des chemins situés dedans. */
const PROJECT_ROOT = resolve(import.meta.dirname, '..');

/** Au-delà, la réponse noierait le contexte : on tronque et on le signale. */
const MAX_ROWS = 200;

const pool = new pg.Pool({
  host: process.env.PGHOST ?? 'localhost',
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? 'postgres',
  database: process.env.PGDATABASE ?? 'web_app',
  // Pas de `password` : pg lit pgpass.conf. PGPASSWORD reste prioritaire s'il existe.
  max: 4,
  idleTimeoutMillis: 10_000,
  statement_timeout: 30_000,
});

/* --- Rendu ---------------------------------------------------------------- */

const text = (value) => ({ content: [{ type: 'text', text: value }] });
const fail = (error) => ({
  content: [{ type: 'text', text: `Erreur PostgreSQL : ${error.message}` }],
  isError: true,
});

/** Les bigint et les Date ne passent pas JSON.stringify tels quels. */
const replacer = (_key, value) =>
  typeof value === 'bigint' ? value.toString() : value instanceof Date ? value.toISOString() : value;

function renderResult(result) {
  const results = Array.isArray(result) ? result : [result];
  return results
    .map((r) => {
      if (!r.rows?.length) return `${r.command ?? 'OK'} — ${r.rowCount ?? 0} ligne(s)`;
      const shown = r.rows.slice(0, MAX_ROWS);
      const note = r.rows.length > MAX_ROWS ? `\n… ${r.rows.length - MAX_ROWS} ligne(s) tronquée(s)` : '';
      return JSON.stringify(shown, replacer, 1) + note;
    })
    .join('\n\n');
}

/* --- Serveur -------------------------------------------------------------- */

const server = new McpServer({ name: 'web-app-db', version: '1.0.0' });

server.registerTool(
  'sql_query',
  {
    title: 'Lire (SELECT)',
    description:
      'Exécute une requête en LECTURE SEULE dans une transaction READ ONLY annulée ensuite. ' +
      "Aucune écriture n'est possible par ce canal. Renvoie les lignes en JSON.",
    inputSchema: {
      sql: z.string().describe('Requête SQL de lecture. Le schéma applicatif est `app`.'),
      params: z.array(z.string()).optional().describe('Paramètres positionnels $1, $2…'),
    },
  },
  async ({ sql, params }) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN TRANSACTION READ ONLY');
      const result = await client.query(sql, params);
      return text(renderResult(result));
    } catch (error) {
      return fail(error);
    } finally {
      // La transaction est toujours annulée : ce canal ne laisse aucune trace.
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
  },
);

server.registerTool(
  'sql_execute',
  {
    title: 'Écrire (DDL / DML)',
    description:
      'Exécute du SQL en écriture (CREATE, ALTER, INSERT, UPDATE, DELETE…) dans une transaction : ' +
      'tout est validé ensemble, ou rien ne passe si une instruction échoue.',
    inputSchema: {
      sql: z.string().describe('Une ou plusieurs instructions séparées par des points-virgules.'),
    },
  },
  async ({ sql }) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(sql);
      await client.query('COMMIT');
      return text(renderResult(result));
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      return fail(error);
    } finally {
      client.release();
    }
  },
);

server.registerTool(
  'run_sql_file',
  {
    title: 'Exécuter un fichier .sql du dépôt',
    description:
      'Lit un fichier SQL du projet et l\'exécute. Le fichier gère lui-même sa transaction ' +
      '(db/schema.sql contient BEGIN/COMMIT).',
    inputSchema: {
      path: z.string().describe('Chemin relatif à la racine du dépôt, ex. « db/schema.sql ».'),
    },
  },
  async ({ path }) => {
    const full = resolve(PROJECT_ROOT, path);
    if (!full.startsWith(PROJECT_ROOT)) {
      return { content: [{ type: 'text', text: 'Chemin hors du dépôt : refusé.' }], isError: true };
    }
    let sql;
    try {
      sql = readFileSync(full, 'utf8');
    } catch (error) {
      return { content: [{ type: 'text', text: `Lecture impossible : ${error.message}` }], isError: true };
    }
    const client = await pool.connect();
    try {
      const result = await client.query(sql);
      return text(`${path} exécuté.\n${renderResult(result)}`);
    } catch (error) {
      // Le BEGIN/COMMIT du fichier a déjà tout annulé ; ce ROLLBACK couvre les
      // scripts qui n'en contiennent pas.
      await client.query('ROLLBACK').catch(() => {});
      return fail(error);
    } finally {
      client.release();
    }
  },
);

server.registerTool(
  'list_tables',
  {
    title: 'Lister les tables',
    description: 'Tables du schéma, avec leur nombre de colonnes et leur taille sur disque.',
    inputSchema: { schema: z.string().default('app').describe('Nom du schéma (défaut : app).') },
  },
  async ({ schema }) => {
    try {
      const result = await pool.query(
        `SELECT c.relname AS table,
                (SELECT count(*) FROM information_schema.columns
                  WHERE table_schema = $1 AND table_name = c.relname) AS colonnes,
                pg_size_pretty(pg_total_relation_size(c.oid)) AS taille,
                c.reltuples::bigint AS lignes_estimees
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1 AND c.relkind = 'r'
          ORDER BY c.relname`,
        [schema],
      );
      return text(renderResult(result));
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  'describe_table',
  {
    title: 'Décrire une table',
    description: 'Colonnes, types, valeurs par défaut, contraintes et index d\'une table.',
    inputSchema: {
      table: z.string().describe('Nom de la table.'),
      schema: z.string().default('app').describe('Nom du schéma (défaut : app).'),
    },
  },
  async ({ table, schema }) => {
    try {
      const columns = await pool.query(
        `SELECT column_name AS colonne, data_type AS type, is_nullable AS nullable,
                column_default AS defaut
           FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2
          ORDER BY ordinal_position`,
        [schema, table],
      );
      if (!columns.rows.length) return text(`Table ${schema}.${table} introuvable.`);
      const constraints = await pool.query(
        `SELECT conname AS contrainte, pg_get_constraintdef(oid) AS definition
           FROM pg_constraint
          WHERE conrelid = format('%I.%I', $1::text, $2::text)::regclass
          ORDER BY conname`,
        [schema, table],
      );
      const indexes = await pool.query(
        `SELECT indexname AS index, indexdef AS definition
           FROM pg_indexes WHERE schemaname = $1 AND tablename = $2 ORDER BY indexname`,
        [schema, table],
      );
      return text(
        [
          `== ${schema}.${table} — colonnes ==`,
          renderResult(columns),
          '\n== contraintes ==',
          renderResult(constraints),
          '\n== index ==',
          renderResult(indexes),
        ].join('\n'),
      );
    } catch (error) {
      return fail(error);
    }
  },
);

/* --- Démarrage ------------------------------------------------------------ */

const shutdown = async () => {
  await pool.end().catch(() => {});
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await server.connect(new StdioServerTransport());
process.stderr.write('[web-app-db] serveur MCP prêt\n');
