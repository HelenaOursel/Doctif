import { randomBytes } from 'node:crypto';

/**
 * Configuration du serveur, lue dans l'environnement.
 *
 * Aucun mot de passe n'est écrit en dur : si PGPASSWORD est absent, le pilote
 * `pg` retombe sur `%APPDATA%\postgresql\pgpass.conf`, comme le serveur MCP.
 */

/**
 * Origines autorisées par CORS.
 *
 * Les trois dernières ne sont pas décoratives : une application Capacitor n'est
 * pas servie depuis un domaine mais depuis un schéma local, propre à chaque
 * plateforme. iOS utilise `capacitor://localhost`, Android `https://localhost`
 * (ou `http://localhost` si `androidScheme` est repassé en http). Les omettre
 * ferait échouer toutes les requêtes une fois l'app portée sur mobile.
 */
const DEFAULT_ORIGINS = [
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'capacitor://localhost',
  'https://localhost',
  'http://localhost',
];

function jwtSecret() {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv) return fromEnv;
  // En développement on préfère un secret éphémère à un secret en dur : les
  // jetons ne survivent pas à un redémarrage, ce qui est sans conséquence ici
  // et évite qu'une valeur d'exemple se retrouve un jour en production.
  console.warn('[api] JWT_SECRET absent : secret aléatoire généré, les jetons expireront au redémarrage.');
  return randomBytes(32).toString('hex');
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  jwtSecret: jwtSecret(),
  tokenTtl: process.env.JWT_TTL ?? '30d',

  /**
   * Adresse publique de l'application, celle que l'utilisateur ouvre dans son
   * navigateur. Elle sert à composer le lien de réinitialisation : le serveur
   * d'API et l'application ne sont pas au même endroit, et « localhost:3000 »
   * n'afficherait rien.
   */
  appBaseUrl: (process.env.APP_BASE_URL ?? 'http://localhost:4200').replace(/\/$/, ''),

  /** Durée de validité d'un lien de réinitialisation, en minutes. */
  resetTtlMinutes: Number(process.env.RESET_TTL_MINUTES ?? 60),

  mail: {
    apiKey: process.env.RESEND_API_KEY ?? '',
    /**
     * Expéditeur. Resend n'accepte un domaine qu'une fois vérifié ; en
     * attendant, « onboarding@resend.dev » fonctionne mais n'écrit qu'à
     * l'adresse du titulaire du compte Resend.
     */
    from: process.env.MAIL_FROM ?? 'Assistant administratif <onboarding@resend.dev>',
  },
  corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : DEFAULT_ORIGINS,
  pg: {
    host: process.env.PGHOST ?? 'localhost',
    port: Number(process.env.PGPORT ?? 5432),
    user: process.env.PGUSER ?? 'postgres',
    database: process.env.PGDATABASE ?? 'web_app',
  },
};
