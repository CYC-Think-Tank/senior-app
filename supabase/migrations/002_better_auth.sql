-- 002_better_auth.sql
--
-- Apply after 001_migrate_azure.sql:
--   psql "$DATABASE_URL" -f supabase/migrations/002_better_auth.sql
--
-- Two things 001 could not know about, because both follow from decisions made
-- after it was written (see docs/azure-migration-plan.md, Phase 5):
--
--   1. Better Auth's four tables. 001 deliberately dropped Supabase's `auth`
--      schema and left `profiles.id` and `guests.user_id` as plain uuids with
--      no foreign key, to be pointed at "your own users table once it exists".
--      This is that table.
--
--   2. The partial unique index on `guests.user_id`. It was in
--      001_init.sql but not in 001_migrate_azure.sql — PostgREST cannot report
--      indexes, so the introspection that built that file could not see it.
--      The app relies on it: every read of a signed-in storyteller's own guest
--      row expects at most one (`.limit(1)` on `guests.user_id`), and the
--      profile save creates one only when none is found. Two concurrent saves
--      would otherwise leave a duplicate that nothing would ever reconcile.

BEGIN;

-- ---------------------------------------------------------------------------
-- Better Auth
-- ---------------------------------------------------------------------------
-- Ids are uuids so `profiles.id` and `guests.user_id` keep the type 001 gave
-- them; `advanced.database.generateId: "uuid"` in src/lib/auth/config.ts is
-- what makes Better Auth defer to the default below instead of minting its own
-- string ids. Field names are Better Auth's contract — do not rename them to
-- match the snake_case of the app's own tables.

CREATE TABLE public.auth_users (
  id             uuid        NOT NULL DEFAULT gen_random_uuid(),
  name           text        NOT NULL,
  email          text        NOT NULL,
  email_verified boolean     NOT NULL DEFAULT false,
  image          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_users_pkey PRIMARY KEY (id),
  CONSTRAINT auth_users_email_key UNIQUE (email)
);

-- One row per signed-in browser or device. `token` is the value the session
-- cookie carries, and the bearer token the iOS app sends.
CREATE TABLE public.auth_sessions (
  id         uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL,
  token      text        NOT NULL,
  expires_at timestamptz NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT auth_sessions_token_key UNIQUE (token),
  CONSTRAINT auth_sessions_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.auth_users (id) ON DELETE CASCADE
);

-- Credentials. For email/password sign-in there is one row per user with
-- `provider_id = 'credential'` and the hash in `password`; the OAuth columns
-- stay null unless a social provider is added later.
--
-- The field list here is not guessed: it is what `getAuthTables()` reports for
-- this app's Better Auth config. Re-derive it after upgrading the library
-- rather than adding columns by hand — a missing required field fails at the
-- adapter with a clear message, but only once someone tries to sign up.
CREATE TABLE public.auth_accounts (
  id                       uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id                  uuid        NOT NULL,
  account_id               text        NOT NULL,
  provider_id              text        NOT NULL,
  -- Better Auth 1.7 scopes an account's identity by issuer as well as by
  -- provider. For email/password it repeats provider_id ('credential'); it
  -- only diverges once a social provider is added.
  issuer                   text        NOT NULL,
  access_token             text,
  refresh_token            text,
  access_token_expires_at  timestamptz,
  refresh_token_expires_at timestamptz,
  scope                    text,
  id_token                 text,
  password                 text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_accounts_pkey PRIMARY KEY (id),
  CONSTRAINT auth_accounts_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.auth_users (id) ON DELETE CASCADE
);

-- Short-lived one-time tokens: password-reset links, email verification.
CREATE TABLE public.auth_verifications (
  id         uuid        NOT NULL DEFAULT gen_random_uuid(),
  identifier text        NOT NULL,
  value      text        NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_verifications_pkey PRIMARY KEY (id)
);

CREATE INDEX auth_sessions_user_id_idx      ON public.auth_sessions (user_id);
CREATE INDEX auth_accounts_user_id_idx      ON public.auth_accounts (user_id);
CREATE INDEX auth_verifications_ident_idx   ON public.auth_verifications (identifier);
-- Expired rows are swept by identifier and date; this keeps that cheap.
CREATE INDEX auth_sessions_expires_at_idx   ON public.auth_sessions (expires_at);

-- ---------------------------------------------------------------------------
-- One guest row per account
-- ---------------------------------------------------------------------------
-- Partial, because anonymous /interview walk-ins all have user_id null and
-- must not collide with each other. Restores guests_user_idx from 001_init.
CREATE UNIQUE INDEX guests_user_idx
  ON public.guests (user_id)
  WHERE user_id IS NOT NULL;

COMMIT;

-- ===========================================================================
-- Deliberately NOT added: foreign keys from profiles.id and guests.user_id to
-- auth_users.
-- ===========================================================================
-- They would express the relationship honestly, and 001's header invites them.
-- They are left out because the two rules they would encode are already
-- enforced in app code, where they can be read:
--
--   * `profiles.id` -> auth_users.id ON DELETE CASCADE
--   * `guests.user_id` -> auth_users.id ON DELETE SET NULL
--
-- Both live in `deleteUser` (src/app/admin/actions.ts), in one transaction, in
-- that order. Adding the constraints as well would be safe and is worth doing
-- if account deletion ever grows a second caller — the reason to wait is that
-- Better Auth writes `auth_users` through an adapter that knows nothing about
-- `profiles`, so a cascade firing invisibly from inside a library call is
-- harder to reason about than a delete that says what it removes.
