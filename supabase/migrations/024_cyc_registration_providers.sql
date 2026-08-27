-- Support workers imported from the CYC website (thecyc.org). Students who pick
-- "Senior Care" as their project option on the Wix registration form become
-- WiseShare support providers, pending staff verification.

alter table public.support_providers
  add column source text not null default 'manual'
    check (source in ('manual', 'cyc_registration')),
  add column external_id text,
  add column email text not null default '',
  add column phone text not null default '',
  add column school text not null default '',
  add column grade text not null default '',
  add column synced_at timestamptz;

-- Wix data item ids are the sync key. Manual rows leave it null, and Postgres
-- allows repeated nulls in a unique index, so one index covers both sources.
create unique index support_providers_external_idx
  on public.support_providers (external_id);

comment on column public.support_providers.external_id is
  'Wix data item id of the CYC registration this provider was imported from.';
