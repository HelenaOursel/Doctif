-- =====================================================================
--  web_app — schéma PostgreSQL 18
--  Dérivé de src/app/core/models.ts (AppState).
--
--  Deux partis pris structurants :
--
--  1. Les identifiants sont en `text`, pas en `uuid` : c'est le client qui les
--     génère (uid() dans src/app/core/utils.ts produit « dl_m8x2a3 », et le jeu
--     de démonstration utilise « m_conjoint », « c_hab_maif »).
--
--  2. Les clés primaires sont COMPOSITES : (user_id, id). Ces identifiants ne
--     sont uniques que pour un utilisateur donné — deux comptes partant du même
--     jeu de démonstration possèdent tous deux un membre « m_conjoint ». Une
--     clé primaire globale rendrait la sauvegarde du second compte impossible.
--     Les clés étrangères sont composites pour la même raison.
--
--  Exécution : pgAdmin > base web_app > Query Tool > coller > F5
--          ou : psql -U postgres -d web_app -f db/schema.sql
--  Pour repartir de zéro : jouer db/reset.sql avant.
-- =====================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS app;
SET search_path TO app, public;

-- ---------------------------------------------------------------------
-- 1. Types énumérés (miroirs des unions TypeScript)
-- ---------------------------------------------------------------------
CREATE TYPE category AS ENUM
  ('assurance','energie','internet','banque','logement','impots','sante','vehicule','autre');

CREATE TYPE doc_source AS ENUM ('pdf','photo','email','scan');
CREATE TYPE doc_type AS ENUM
  ('facture','contrat','attestation','avis','releve','courrier','justificatif','ordonnance','autre');
CREATE TYPE severity_level AS ENUM ('info','attention','risque');
CREATE TYPE contract_status AS ENUM ('actif','resilie','expire');
CREATE TYPE deadline_kind AS ENUM
  ('fin-contrat','anniversaire','controle-technique','renouvellement-assurance','impots','autre');
CREATE TYPE alert_level AS ENUM ('J-30','J-7','J-1','depassee');
CREATE TYPE share_scope AS ENUM ('logement','vehicule','assurance','sante','finances');
CREATE TYPE member_status AS ENUM ('actif','invite');
CREATE TYPE tax_kind AS ENUM
  ('declaration','avis-imposition','taxe-fonciere','taxe-habitation','revenus');
CREATE TYPE tax_status AS ENUM ('a-faire','en-cours','depose','paye');
CREATE TYPE timeline_kind AS ENUM
  ('contrat','resiliation','achat','demenagement','document','fiscal','sante','vehicule');
CREATE TYPE moving_group AS ENUM ('administratif','contrats','logistique','apres');
CREATE TYPE estate_kind AS ENUM
  ('immobilier','assurance-vie','compte','vehicule','objet','document');
CREATE TYPE chat_role AS ENUM ('user','assistant');

-- ---------------------------------------------------------------------
-- 2. Utilitaire : horodatage de mise à jour
-- ---------------------------------------------------------------------
CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $fn$;

-- ---------------------------------------------------------------------
-- 3. Compte utilisateur (UserProfile) — racine de toutes les données
-- ---------------------------------------------------------------------
CREATE TABLE app_user (
  id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email          text NOT NULL UNIQUE,
  password_hash  text NOT NULL,          -- scrypt (node:crypto), jamais le mot de passe
  first_name     text NOT NULL DEFAULT '',
  last_name      text NOT NULL DEFAULT '',
  address        text NOT NULL DEFAULT '',
  postal_code    text NOT NULL DEFAULT '',
  city           text NOT NULL DEFAULT '',
  phone          text NOT NULL DEFAULT '',
  birth_date     date,
  -- Service résilié : accès en lecture seule (archivage à vie).
  read_only_mode boolean NOT NULL DEFAULT false,
  locale         text NOT NULL DEFAULT 'fr',
  theme          text NOT NULL DEFAULT 'light',
  -- Incrémenté à chaque PUT /api/state : détecte les écritures concurrentes.
  state_version  integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER app_user_touch BEFORE UPDATE ON app_user
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------------------------------------------------------------------
-- 4. Membres de la famille (FamilyMember)
-- ---------------------------------------------------------------------
CREATE TABLE family_member (
  user_id    text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  id         text NOT NULL,
  name       text NOT NULL,
  relation   text NOT NULL DEFAULT '',
  email      text NOT NULL DEFAULT '',
  color      text NOT NULL DEFAULT '#888888',
  scopes     share_scope[] NOT NULL DEFAULT '{}',
  read_only  boolean NOT NULL DEFAULT false,   -- ex. enfant, notaire
  status     member_status NOT NULL DEFAULT 'invite',
  -- `date` et non `timestamptz` : le client produit `todayIso()`, une chaîne
  -- yyyy-MM-dd affichée telle quelle. Un horodatage complet reviendrait
  -- déformé de l'aller-retour.
  invited_at date NOT NULL DEFAULT CURRENT_DATE,
  PRIMARY KEY (user_id, id)
);

-- ---------------------------------------------------------------------
-- 5. Contrats (Contract) + clauses
-- ---------------------------------------------------------------------
CREATE TABLE contract (
  user_id               text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  id                    text NOT NULL,
  label                 text NOT NULL,
  provider              text NOT NULL DEFAULT '',
  category              category NOT NULL DEFAULT 'autre',
  monthly_cost          numeric(12,2) NOT NULL DEFAULT 0,
  previous_monthly_cost numeric(12,2),          -- base du calcul de hausse
  start_date            date NOT NULL,
  end_date              date,                   -- fin d'engagement
  renewal_date          date,                   -- tacite reconduction
  notice_period_days    integer NOT NULL DEFAULT 0,
  commitment_months     integer NOT NULL DEFAULT 0,
  status                contract_status NOT NULL DEFAULT 'actif',
  hidden_fees           numeric(12,2) NOT NULL DEFAULT 0,
  last_used_at          date,                   -- détecte les abonnements dormants
  usage_per_month       integer,
  coverage_of           text,                   -- regroupe les doublons d'assurance
  cancelled_at          date,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  CONSTRAINT contract_dates_ok CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX ON contract (user_id, status);
CREATE INDEX ON contract (user_id, category);
CREATE INDEX ON contract (renewal_date);
CREATE TRIGGER contract_touch BEFORE UPDATE ON contract
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE clause (
  user_id     text NOT NULL,
  id          text NOT NULL,
  contract_id text NOT NULL,
  title       text NOT NULL,
  excerpt     text NOT NULL DEFAULT '',
  severity    severity_level NOT NULL DEFAULT 'info',
  reason      text NOT NULL DEFAULT '',
  position    integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, contract_id) REFERENCES contract(user_id, id) ON DELETE CASCADE
);
CREATE INDEX ON clause (user_id, contract_id);

-- ---------------------------------------------------------------------
-- 6. Coffre-fort documentaire (DocumentItem)
-- ---------------------------------------------------------------------
CREATE TABLE document (
  user_id         text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  id              text NOT NULL,
  contract_id     text,
  name            text NOT NULL,             -- nom normalisé généré au dépôt
  original_name   text NOT NULL,
  category        category NOT NULL DEFAULT 'autre',
  doc_type        doc_type NOT NULL DEFAULT 'autre',
  source          doc_source NOT NULL DEFAULT 'pdf',
  issuer          text NOT NULL DEFAULT '',   -- EDF, MAIF, DGFiP…
  doc_date        date NOT NULL,
  added_at        date NOT NULL DEFAULT CURRENT_DATE,   -- yyyy-MM-dd, cf. family_member.invited_at
  size_kb         integer NOT NULL DEFAULT 0,
  content_text    text NOT NULL DEFAULT '',   -- texte extrait (OCR / PDF)
  amount          numeric(12,2),
  tags            text[] NOT NULL DEFAULT '{}',
  archived        boolean NOT NULL DEFAULT false,
  confidence      real NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  -- Vignette d'aperçu (data-URL). Le fichier d'origine, lui, vit dans
  -- `document_file` : voir plus bas pourquoi il ne peut pas être ici.
  thumbnail       text,
  search_vector   tsvector GENERATED ALWAYS AS (
    to_tsvector('french',
      coalesce(name,'') || ' ' || coalesce(issuer,'') || ' ' || coalesce(content_text,''))
  ) STORED,
  PRIMARY KEY (user_id, id),
  -- Une composante NULL désactive le contrôle (MATCH SIMPLE) : un document sans
  -- contrat reste donc accepté.
  FOREIGN KEY (user_id, contract_id) REFERENCES contract(user_id, id) ON DELETE SET NULL (contract_id)
);
CREATE INDEX ON document (user_id, archived);
CREATE INDEX ON document (user_id, category);
CREATE INDEX ON document (user_id, contract_id);
CREATE INDEX document_tags_idx   ON document USING gin (tags);
CREATE INDEX document_search_idx ON document USING gin (search_vector);

-- ---------------------------------------------------------------------
-- 6 bis. Fichiers d'origine
-- ---------------------------------------------------------------------
-- Table séparée de `document`, et non une colonne de plus, pour deux raisons :
--
--  * `loadState` fait `SELECT * FROM document` à chaque synchronisation. Des
--    octets dans cette table feraient transiter tous les fichiers du compte à
--    chaque chargement d'état.
--  * AUCUNE clé étrangère vers `document` : `saveState` supprime puis réinsère
--    toutes les lignes `document` à chaque sauvegarde, et une contrainte en
--    cascade effacerait les fichiers dès la première. Les orphelins sont donc
--    nettoyés explicitement par le serveur (voir server/src/files.mjs).
CREATE TABLE document_file (
  user_id         text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  document_id     text NOT NULL,
  bytes           bytea NOT NULL,
  mime_type       text NOT NULL DEFAULT 'application/octet-stream',
  file_name       text NOT NULL,
  size_bytes      integer NOT NULL,
  checksum_sha256 text NOT NULL,
  uploaded_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, document_id)
);
-- PDF et JPEG sont déjà compressés : laisser TOAST tenter de les compresser
-- coûterait du temps processeur à chaque écriture sans rien faire gagner.
ALTER TABLE document_file ALTER COLUMN bytes SET STORAGE EXTERNAL;

-- Pièces jointes d'un contrat (Contract.documentIds)
CREATE TABLE contract_document (
  user_id     text NOT NULL,
  contract_id text NOT NULL,
  document_id text NOT NULL,
  PRIMARY KEY (user_id, contract_id, document_id),
  FOREIGN KEY (user_id, contract_id) REFERENCES contract(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, document_id) REFERENCES document(user_id, id) ON DELETE CASCADE
);
CREATE INDEX ON contract_document (user_id, document_id);

-- Partages (DocumentItem.sharedWith / Contract.sharedWith)
CREATE TABLE document_share (
  user_id     text NOT NULL,
  document_id text NOT NULL,
  member_id   text NOT NULL,
  PRIMARY KEY (user_id, document_id, member_id),
  FOREIGN KEY (user_id, document_id) REFERENCES document(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, member_id) REFERENCES family_member(user_id, id) ON DELETE CASCADE
);

CREATE TABLE contract_share (
  user_id     text NOT NULL,
  contract_id text NOT NULL,
  member_id   text NOT NULL,
  PRIMARY KEY (user_id, contract_id, member_id),
  FOREIGN KEY (user_id, contract_id) REFERENCES contract(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, member_id) REFERENCES family_member(user_id, id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- 7. Échéances (Deadline) et alertes lues
-- ---------------------------------------------------------------------
CREATE TABLE deadline (
  user_id     text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  id          text NOT NULL,
  contract_id text,
  document_id text,
  title       text NOT NULL,
  due_date    date NOT NULL,
  kind        deadline_kind NOT NULL DEFAULT 'autre',
  category    category NOT NULL DEFAULT 'autre',
  detected    boolean NOT NULL DEFAULT false,   -- déduite d'un contrat/document
  done        boolean NOT NULL DEFAULT false,
  note        text,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, contract_id) REFERENCES contract(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, document_id) REFERENCES document(user_id, id) ON DELETE SET NULL (document_id)
);
CREATE INDEX ON deadline (user_id, due_date);
CREATE INDEX ON deadline (user_id, contract_id);

-- Les AlertItem sont recalculées à la volée côté client ; leur identifiant vaut
-- `${deadlineId}:${level}`. On ne persiste donc que le fait qu'elles soient lues.
CREATE TABLE alert_read (
  user_id     text NOT NULL,
  deadline_id text NOT NULL,
  level       alert_level NOT NULL,
  read_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, deadline_id, level),
  FOREIGN KEY (user_id, deadline_id) REFERENCES deadline(user_id, id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- 8. Factures (Bill) — base de la détection d'anomalies
-- ---------------------------------------------------------------------
CREATE TABLE bill (
  user_id     text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  id          text NOT NULL,
  contract_id text,
  document_id text,
  category    category NOT NULL DEFAULT 'autre',
  provider    text NOT NULL DEFAULT '',
  period      char(7) NOT NULL,             -- yyyy-MM
  amount      numeric(12,2) NOT NULL,
  PRIMARY KEY (user_id, id),
  CONSTRAINT bill_period_format CHECK (period ~ '^[0-9]{4}-[0-9]{2}$'),
  FOREIGN KEY (user_id, contract_id) REFERENCES contract(user_id, id) ON DELETE SET NULL (contract_id),
  FOREIGN KEY (user_id, document_id) REFERENCES document(user_id, id) ON DELETE SET NULL (document_id)
);
CREATE INDEX ON bill (user_id, category, period);
CREATE INDEX ON bill (user_id, contract_id);

-- ---------------------------------------------------------------------
-- 9. Fiscalité (TaxRecord)
-- ---------------------------------------------------------------------
-- Pas de contrainte d'unicité sur (year, kind) : le client est la source de
-- vérité et n'en impose aucune — deux justificatifs de revenus la même année
-- sont légitimes, et une contrainte ici ferait échouer la sauvegarde.
CREATE TABLE tax_record (
  user_id     text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  id          text NOT NULL,
  document_id text,
  year        integer NOT NULL CHECK (year BETWEEN 1990 AND 2200),
  kind        tax_kind NOT NULL,
  amount      numeric(12,2),
  status      tax_status NOT NULL DEFAULT 'a-faire',
  due_date    date,
  note        text,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, document_id) REFERENCES document(user_id, id) ON DELETE SET NULL (document_id)
);
CREATE INDEX ON tax_record (user_id, year);

-- ---------------------------------------------------------------------
-- 10. Patrimoine / succession (EstateAsset)
-- ---------------------------------------------------------------------
CREATE TABLE estate_asset (
  user_id     text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  id          text NOT NULL,
  label       text NOT NULL,
  kind        estate_kind NOT NULL,
  value       numeric(14,2),
  institution text,
  notes       text,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE estate_beneficiary (
  user_id   text NOT NULL,
  asset_id  text NOT NULL,
  member_id text NOT NULL,
  PRIMARY KEY (user_id, asset_id, member_id),
  FOREIGN KEY (user_id, asset_id) REFERENCES estate_asset(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, member_id) REFERENCES family_member(user_id, id) ON DELETE CASCADE
);

CREATE TABLE estate_document (
  user_id     text NOT NULL,
  asset_id    text NOT NULL,
  document_id text NOT NULL,
  PRIMARY KEY (user_id, asset_id, document_id),
  FOREIGN KEY (user_id, asset_id) REFERENCES estate_asset(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, document_id) REFERENCES document(user_id, id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- 11. Déménagement (MovingProject / MovingTask)
-- ---------------------------------------------------------------------
CREATE TABLE moving_project (
  user_id      text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  id           text NOT NULL,
  from_address text NOT NULL DEFAULT '',
  to_address   text NOT NULL DEFAULT '',
  moving_date  date NOT NULL,
  active       boolean NOT NULL DEFAULT true,
  PRIMARY KEY (user_id, id)
);
-- Le modèle client ne porte qu'un projet (`moving: MovingProject | null`).
CREATE UNIQUE INDEX moving_project_active_idx
  ON moving_project (user_id) WHERE active;

CREATE TABLE moving_task (
  user_id     text NOT NULL,
  id          text NOT NULL,
  project_id  text NOT NULL,
  contract_id text,
  label       text NOT NULL,
  task_group  moving_group NOT NULL,
  offset_days integer NOT NULL DEFAULT 0,   -- négatif = avant le déménagement
  done        boolean NOT NULL DEFAULT false,
  hint        text,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, project_id) REFERENCES moving_project(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, contract_id) REFERENCES contract(user_id, id) ON DELETE SET NULL (contract_id)
);
CREATE INDEX ON moving_task (user_id, project_id);

-- ---------------------------------------------------------------------
-- 12. Frise chronologique (TimelineEvent ajoutés à la main)
-- ---------------------------------------------------------------------
CREATE TABLE timeline_event (
  user_id     text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  id          text NOT NULL,
  contract_id text,
  document_id text,
  event_date  date NOT NULL,
  title       text NOT NULL,
  description text NOT NULL DEFAULT '',
  kind        timeline_kind NOT NULL,
  category    category NOT NULL DEFAULT 'autre',
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, contract_id) REFERENCES contract(user_id, id) ON DELETE SET NULL (contract_id),
  FOREIGN KEY (user_id, document_id) REFERENCES document(user_id, id) ON DELETE SET NULL (document_id)
);
CREATE INDEX ON timeline_event (user_id, event_date DESC);

-- ---------------------------------------------------------------------
-- 13. Assistant conversationnel (ChatMessage)
-- ---------------------------------------------------------------------
CREATE TABLE chat_message (
  user_id     text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  id          text NOT NULL,
  role        chat_role NOT NULL,
  text        text NOT NULL,
  sent_at     timestamptz NOT NULL DEFAULT now(),
  -- Structures d'affichage libres : jsonb plutôt que trois tables filles.
  suggestions jsonb,   -- string[]
  links       jsonb,   -- [{label, route}]
  checklist   jsonb,   -- [{label, ok, hint}]
  PRIMARY KEY (user_id, id)
);
CREATE INDEX ON chat_message (user_id, sent_at);

-- ---------------------------------------------------------------------
-- 14. Catalogues partagés (non rattachés à un utilisateur)
-- ---------------------------------------------------------------------
CREATE TABLE offer (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  provider     text NOT NULL,
  label        text NOT NULL,
  category     category NOT NULL,
  monthly_cost numeric(12,2) NOT NULL,
  highlights   text[] NOT NULL DEFAULT '{}',
  rating       real NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
  affiliate    boolean NOT NULL DEFAULT false
);
CREATE INDEX ON offer (category);

CREATE TABLE procedure (
  id       text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  slug     text NOT NULL UNIQUE,
  title    text NOT NULL,
  intro    text NOT NULL DEFAULT '',
  keywords text[] NOT NULL DEFAULT '{}'   -- utilisés par l'assistant
);
CREATE INDEX procedure_keywords_idx ON procedure USING gin (keywords);

CREATE TABLE procedure_item (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  procedure_id text NOT NULL REFERENCES procedure(id) ON DELETE CASCADE,
  label        text NOT NULL,
  required     boolean NOT NULL DEFAULT true,
  category     category NOT NULL DEFAULT 'autre',
  match        text[] NOT NULL DEFAULT '{}',  -- termes cherchés dans le coffre
  hint         text,
  position     integer NOT NULL DEFAULT 0
);
CREATE INDEX ON procedure_item (procedure_id);

COMMIT;
