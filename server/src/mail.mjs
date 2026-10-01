import { env } from './env.mjs';

/**
 * Envoi d'e-mails transactionnels via Resend.
 *
 * L'API REST est appelée directement plutôt que par le paquet `resend` : elle
 * tient en une requête, et une dépendance de plus dans le serveur se paie à
 * chaque installation comme à chaque audit.
 *
 * Aucune erreur n'est propagée à l'appelant. Un envoi qui échoue est un
 * incident du serveur, pas une information à donner au visiteur : la route de
 * mot de passe oublié répond la même chose dans tous les cas, sans quoi la
 * différence de réponse dirait quelles adresses possèdent un compte.
 */
export async function sendMail({ to, subject, html, text }) {
  if (!env.mail.apiKey) {
    // En développement, sans clé, le lien est imprimé plutôt que perdu : le
    // parcours reste testable de bout en bout.
    console.warn(`[mail] RESEND_API_KEY absente — e-mail non envoyé à ${to}.`);
    console.warn(`[mail] ${subject}\n${text}`);
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.mail.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: env.mail.from, to: [to], subject, html, text }),
    });

    if (!response.ok) {
      // Le corps porte le motif exact (domaine non vérifié, clé révoquée…).
      console.error(`[mail] Resend a refusé l'envoi (${response.status}) :`, await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error('[mail] envoi impossible :', error.message);
    return false;
  }
}

/**
 * Courriel de réinitialisation.
 *
 * Le lien est répété en clair sous le bouton : beaucoup de clients de
 * messagerie n'affichent pas les styles, et certains réécrivent les liens au
 * point de les rendre inutilisables au clic.
 */
export function resetPasswordEmail({ link, firstName, ttlMinutes }) {
  const bonjour = firstName ? `Bonjour ${firstName},` : 'Bonjour,';
  const validite = ttlMinutes >= 60 ? `${Math.round(ttlMinutes / 60)} heure(s)` : `${ttlMinutes} minutes`;

  const text = [
    bonjour,
    '',
    'Vous avez demandé à réinitialiser le mot de passe de votre assistant administratif.',
    `Ouvrez ce lien pour en choisir un nouveau (valable ${validite}) :`,
    link,
    '',
    "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.",
  ].join('\n');

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #0a1c31; max-width: 520px;">
      <p>${bonjour}</p>
      <p>Vous avez demandé à réinitialiser le mot de passe de votre assistant administratif.</p>
      <p style="margin: 26px 0;">
        <a href="${link}" style="display: inline-block; padding: 12px 22px; border-radius: 10px; background: #0a1c31; color: #f0e0c4; text-decoration: none; font-weight: 600;">
          Choisir un nouveau mot de passe
        </a>
      </p>
      <p style="color: #525d6c; font-size: 13px;">
        Ce lien est valable ${validite}. Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :<br />
        <span style="word-break: break-all;">${link}</span>
      </p>
      <p style="color: #525d6c; font-size: 13px;">
        Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.
      </p>
    </div>
  `;

  return { subject: 'Réinitialiser votre mot de passe', html, text };
}
