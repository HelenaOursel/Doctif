import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { pool, transaction } from './db.mjs';
import { env } from './env.mjs';
import { resetPasswordEmail, sendMail } from './mail.mjs';

const scryptAsync = promisify(scrypt);

/**
 * Paramètres scrypt. `node:crypto` évite ici toute dépendance native : `argon2`
 * comme `bcrypt` exigent une compilation qui échoue régulièrement sous Windows.
 * N = 2^15 coûte ~100 ms par vérification, ce qui rend une attaque par force
 * brute coûteuse sans pénaliser la connexion. Ce réglage demande 128·N·r, soit
 * 32 Mio — très exactement la limite par défaut de `node:crypto`, qu'il faut
 * donc relever explicitement sous peine d'un ERR_CRYPTO_INVALID_SCRYPT_PARAMS.
 */
const MAXMEM = 64 * 1024 * 1024;
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64, maxmem: MAXMEM };

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, SCRYPT.keylen, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('hex'), derived.toString('hex')].join('$');
}

export async function verifyPassword(password, stored) {
  const [scheme, n, r, p, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(hashHex, 'hex');
  const derived = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAXMEM,
  });
  // Comparaison à temps constant : une comparaison ordinaire laisserait fuir,
  // par sa durée, le nombre d'octets corrects en tête.
  return timingSafeEqual(derived, expected);
}

const PROFILE_COLUMNS = `id, email, first_name, last_name, address, postal_code, city, phone,
  birth_date, read_only_mode, locale, theme, state_version`;

/** Ligne `app_user` -> `UserProfile` du modèle client. */
export function toProfile(row) {
  return {
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    address: row.address,
    postalCode: row.postal_code,
    city: row.city,
    phone: row.phone,
    birthDate: row.birth_date ?? '',
    readOnlyMode: row.read_only_mode,
  };
}

function signToken(userId) {
  return jwt.sign({ sub: userId }, env.jwtSecret, { expiresIn: env.tokenTtl });
}

/**
 * Exige un jeton valide et pose `req.userId`.
 *
 * Le jeton voyage dans l'en-tête `Authorization` et jamais dans un cookie :
 * depuis `capacitor://localhost`, une application native n'a pas de domaine
 * auquel rattacher un cookie, et les cookies tiers y sont inexploitables.
 */
export function requireAuth(req, res, next) {
  const header = req.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Jeton absent.' });
  try {
    req.userId = jwt.verify(token, env.jwtSecret).sub;
    return next();
  } catch {
    return res.status(401).json({ error: 'Jeton invalide ou expiré.' });
  }
}

/** Règle unique, appliquée à l'inscription comme à la réinitialisation. */
const MIN_PASSWORD_LENGTH = 8;

/**
 * Le jeton n'est jamais conservé : seule son empreinte l'est.
 *
 * Une fuite de la table ne donnerait donc aucun lien utilisable. SHA-256 sans
 * sel suffit ici, contrairement à un mot de passe : le jeton fait 256 bits
 * d'aléa, il n'existe pas de dictionnaire à lui opposer.
 */
const hashToken = (token) => createHash('sha256').update(token).digest('hex');

/**
 * Dernière demande par adresse, en mémoire.
 *
 * Empêche qu'un formulaire soumis en boucle inonde une boîte de réception —
 * et fasse payer les envois au titulaire du compte Resend. Le stockage en
 * mémoire disparaît au redémarrage : c'est un garde-fou de confort, pas une
 * mesure de sécurité, celle-ci reposant sur l'expiration des jetons.
 */
const lastRequestByEmail = new Map();
const REQUEST_INTERVAL_MS = 60_000;

function throttled(email) {
  const now = Date.now();
  const previous = lastRequestByEmail.get(email);
  if (previous && now - previous < REQUEST_INTERVAL_MS) return true;

  lastRequestByEmail.set(email, now);
  // Purge opportuniste : sans elle, la table grandirait indéfiniment.
  if (lastRequestByEmail.size > 1000) {
    for (const [key, at] of lastRequestByEmail) {
      if (now - at > REQUEST_INTERVAL_MS) lastRequestByEmail.delete(key);
    }
  }
  return false;
}

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'Adresse e-mail invalide.' });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res
      .status(400)
      .json({ error: `Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.` });
  }

  const existing = await pool.query('SELECT 1 FROM app.app_user WHERE email = $1', [email]);
  if (existing.rowCount) {
    return res.status(409).json({ error: 'Un compte existe déjà avec cette adresse.' });
  }

  const { rows } = await pool.query(
    `INSERT INTO app.app_user (email, password_hash, first_name, last_name)
     VALUES ($1, $2, $3, $4) RETURNING ${PROFILE_COLUMNS}`,
    [
      email,
      await hashPassword(password),
      String(req.body?.firstName ?? '').trim(),
      String(req.body?.lastName ?? '').trim(),
    ],
  );

  const row = rows[0];
  return res.status(201).json({ token: signToken(row.id), profile: toProfile(row), version: row.state_version });
});

authRouter.post('/login', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');

  const { rows } = await pool.query(
    `SELECT ${PROFILE_COLUMNS}, password_hash FROM app.app_user WHERE email = $1`,
    [email],
  );
  const row = rows[0];

  // Même réponse que le mot de passe soit faux ou le compte inexistant : sinon
  // l'API dirait à qui la demande quelles adresses sont enregistrées.
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    return res.status(401).json({ error: 'Adresse e-mail ou mot de passe incorrect.' });
  }

  return res.json({ token: signToken(row.id), profile: toProfile(row), version: row.state_version });
});

/**
 * Demande de réinitialisation.
 *
 * La réponse est identique que l'adresse existe ou non, et quel que soit le
 * sort de l'e-mail : toute différence — code, message, durée — reviendrait à
 * publier la liste des comptes. L'incident éventuel est journalisé côté
 * serveur, où il a sa place.
 */
authRouter.post('/forgot', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const accepted = { ok: true };

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.json(accepted);
  if (throttled(email)) return res.json(accepted);

  const { rows } = await pool.query('SELECT id, first_name FROM app.app_user WHERE email = $1', [email]);
  const user = rows[0];
  if (!user) return res.json(accepted);

  // Les demandes précédentes tombent : un seul lien vaut à la fois, celui que
  // l'utilisateur vient de réclamer.
  await pool.query('DELETE FROM app.password_reset WHERE user_id = $1', [user.id]);

  const token = randomBytes(32).toString('base64url');
  await pool.query(
    `INSERT INTO app.password_reset (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + ($3 || ' minutes')::interval)`,
    [hashToken(token), user.id, String(env.resetTtlMinutes)],
  );

  const link = `${env.appBaseUrl}/reinitialisation?token=${encodeURIComponent(token)}`;
  const message = resetPasswordEmail({
    link,
    firstName: user.first_name,
    ttlMinutes: env.resetTtlMinutes,
  });
  await sendMail({ to: email, ...message });

  return res.json(accepted);
});

/**
 * Nouveau mot de passe.
 *
 * Le jeton est consommé dans la même transaction que l'écriture : deux
 * requêtes simultanées ne peuvent pas le réutiliser toutes les deux.
 */
authRouter.post('/reset', async (req, res) => {
  const token = String(req.body?.token ?? '');
  const password = String(req.body?.password ?? '');

  if (!token) return res.status(400).json({ error: 'Lien de réinitialisation incomplet.' });
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res
      .status(400)
      .json({ error: `Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.` });
  }

  // Le hachage est calculé avant la transaction : il coûte quelques
  // microsecondes, mais le hachage du mot de passe, lui, prend ~100 ms et n'a
  // rien à faire dans une transaction qui verrouille une ligne.
  const passwordHash = await hashPassword(password);

  const result = await transaction(async (client) => {
    const { rows } = await client.query(
      `DELETE FROM app.password_reset
       WHERE token_hash = $1 AND expires_at > now()
       RETURNING user_id`,
      [hashToken(token)],
    );
    if (!rows.length) return null;

    const { rows: users } = await client.query(
      `UPDATE app.app_user SET password_hash = $1 WHERE id = $2 RETURNING ${PROFILE_COLUMNS}`,
      [passwordHash, rows[0].user_id],
    );
    return users[0] ?? null;
  });

  if (!result) {
    return res.status(400).json({ error: 'Ce lien est expiré ou a déjà été utilisé. Demandez-en un nouveau.' });
  }

  // Connexion immédiate : réclamer le mot de passe qu'on vient de choisir
  // n'apporte rien, et l'utilisateur est déjà authentifié par sa boîte mail.
  return res.json({
    token: signToken(result.id),
    profile: toProfile(result),
    version: result.state_version,
  });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`SELECT ${PROFILE_COLUMNS} FROM app.app_user WHERE id = $1`, [
    req.userId,
  ]);
  if (!rows.length) return res.status(401).json({ error: 'Compte introuvable.' });
  return res.json({ profile: toProfile(rows[0]), version: rows[0].state_version });
});
