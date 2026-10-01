-- =====================================================================
--  Mot de passe oublié — jetons de réinitialisation
--
--  À jouer sur une base existante :
--    psql -U postgres -d web_app -f db/migrations/2026-09-02-password-reset.sql
--
--  Le même bloc figure dans db/schema.sql pour les créations à neuf.
-- =====================================================================

BEGIN;
SET search_path TO app, public;

CREATE TABLE IF NOT EXISTS password_reset (
  -- SHA-256 du jeton. Le jeton lui-même n'existe que dans l'e-mail envoyé :
  -- une fuite de cette table ne donnerait aucun lien exploitable.
  token_hash text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Suppression des demandes antérieures d'un même compte.
CREATE INDEX IF NOT EXISTS password_reset_user_idx ON password_reset (user_id);
-- Purge des jetons périmés.
CREATE INDEX IF NOT EXISTS password_reset_expires_idx ON password_reset (expires_at);

COMMIT;
