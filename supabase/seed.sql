-- seed.sql
--
-- The entire seed for a fresh database:
--   psql "$DATABASE_URL" -f supabase/seed.sql
--
-- Everything else in this app starts empty by design — there are no rows to
-- carry over from Supabase (see docs/azure-migration-plan.md). The one thing
-- that cannot start empty is the admin allowlist: signing up reads this table
-- to decide whether the new account gets the admin role, so without a row here
-- the first account created is an ordinary family account and nobody can reach
-- /admin.
--
-- Addresses must be lowercase. The signup hook compares with a plain equality
-- against the normalised address, deliberately not a case-insensitive match —
-- see the note about LIKE wildcards in src/lib/email.ts.

INSERT INTO public.admin_emails (email)
VALUES
  ('jiabaowu07@gmail.com')
ON CONFLICT (email) DO NOTHING;
