-- 003_schema_repair.sql
--
-- Apply to any Azure database created from 001/002 before 2026-08-27:
--   psql "$DATABASE_URL" -f supabase/migrations/003_schema_repair.sql
--
-- Two columns the app needs that the original files did not create. Both are
-- `if not exists`, so this is a no-op against a database built from the
-- corrected 001 and 002 — run it either way rather than working out which
-- version a given database came from.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. profiles.conversation_language_chosen_at
-- ---------------------------------------------------------------------------
-- 021_first_conversation_language.sql added this to the live Supabase
-- database, but the PostgREST introspection that built 001_migrate_azure.sql
-- did not carry it over. The app is not tolerant of its absence: every
-- dashboard load reads it to decide whether to offer the one-click start or
-- the first-run language step (src/app/dashboard/family-data.ts,
-- src/app/interview/page.tsx), and starting a conversation writes it
-- (src/app/dashboard/actions.ts). Without it, signing up fails outright.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS conversation_language_chosen_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. auth_accounts.issuer
-- ---------------------------------------------------------------------------
-- Better Auth 1.7 scopes an account's identity by issuer as well as by
-- provider, so `issuer` is a required field on its `account` model and the
-- adapter refuses to write without it. 002_better_auth.sql was written from
-- the older field set and predates that.
--
-- Any row that predates this column was written by the 1.6 field set, where
-- the concept did not exist. Better Auth composes the value itself — an
-- email/password account comes out as `local:credential`, not `credential` —
-- so existing rows are backfilled with that literal rather than copied from
-- provider_id, which would produce a value the library never writes.
--
-- In practice there are no such rows: this is a fresh-start migration and the
-- first account is created after cutover. The backfill exists so the NOT NULL
-- below cannot fail on a database somebody has already signed up against.

ALTER TABLE public.auth_accounts
  ADD COLUMN IF NOT EXISTS issuer text;

UPDATE public.auth_accounts
SET issuer = 'local:' || provider_id
WHERE issuer IS NULL;

ALTER TABLE public.auth_accounts
  ALTER COLUMN issuer SET NOT NULL;

COMMIT;
