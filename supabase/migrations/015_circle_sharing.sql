-- Whole-circle sharing: one switch per conversation, no per-friend picking.
-- Presence of the row *is* the switch, which is what lets someone added to the
-- circle next year hear what was shared last year with no backfill.
--
-- Note what is deliberately NOT here: a "friends read shared sessions" policy
-- on public.sessions. RLS filters rows, not columns, and no migration revokes
-- the default select grant to `authenticated`, so such a policy would also
-- hand every friend `sessions.token` — the credential that opens
-- /interview/<token> on a live conversation — and `sessions.share_token`.
--
-- So this table is the whole authorisation surface instead. It holds no
-- secrets, its policies are exactly the friend predicate, and the server reads
-- the session itself with the service role afterwards. That is the same
-- authorise-then-admin shape generateShareLink() already uses.

create table public.circle_shares (
  session_id uuid primary key references public.sessions (id) on delete cascade,
  -- Denormalised from guests.user_id so the friend policy below stays a single
  -- indexed comparison instead of a two-table join on every row.
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index circle_shares_owner_idx
  on public.circle_shares (owner_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Helpers
--
-- Security definer, like is_friend() and current_family_id(): they read
-- sessions, guests, and circle_shares as the table owner, so a policy can call
-- them without recursing back through those tables' own policies.
-- ---------------------------------------------------------------------------

-- The account behind a conversation. Null for an anonymous /interview walk-in,
-- whose guest row has no user_id — which is what keeps those conversations out
-- of circle sharing entirely.
create or replace function public.conversation_owner(target_session uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select g.user_id
  from public.sessions s
  join public.guests g on g.id = s.guest_id
  where s.id = target_session;
$$;

create or replace function public.is_circle_shared(target_session uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.circle_shares cs where cs.session_id = target_session
  );
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.circle_shares enable row level security;

-- Two permissive policies, OR-ed: the storyteller sees their own switches, and
-- a friend sees the ones pointed at them.
create policy "owner reads own circle shares" on public.circle_shares
  for select using (owner_id = auth.uid());

create policy "friends read circle shares" on public.circle_shares
  for select using (public.is_friend(owner_id));

create policy "admin manages circle shares" on public.circle_shares
  for all using (public.is_admin()) with check (public.is_admin());
