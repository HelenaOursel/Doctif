import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from './db.mjs';
import { env } from './env.mjs';

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

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'Adresse e-mail invalide.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caractères.' });
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

authRouter.get('/me', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`SELECT ${PROFILE_COLUMNS} FROM app.app_user WHERE id = $1`, [
    req.userId,
  ]);
  if (!rows.length) return res.status(401).json({ error: 'Compte introuvable.' });
  return res.json({ profile: toProfile(rows[0]), version: rows[0].state_version });
});
