-- Reconcile the database with the shipped model: checkpointing and guest voice
-- in, family grouping and the last of the podcast era out.
--
-- This migration is a catch-up as much as a change. Comparing the live schema
-- against this folder shows 004_interview_checkpoints, 005_shorten_abandonment
-- _window and 007_guest_voice were never applied here, while everything from
-- 008 onward was — so sessions has no last_checkpoint_at and guests has no
-- voice, even though src/ writes both on every heartbeat and every profile
-- save. Rather than ask anyone to replay three older files in the right order,
-- this one states the wanted end state and gets there from either starting
-- point: every step is `if exists` / `if not exists`, so it is a no-op against
-- a database that already had them and a repair against this one.
--
-- Three things the spec asks for, in dependency order:
--
--   1. Checkpointing — the column first, because the session policy rebuilt in
--      step 3 reads it. Adding it after would fail exactly the way the first
--      attempt at this migration did.
--   2. Guest voice — an independent column.
--   3. The family model out. family_access is the pre-friend-circle invite
--      table (guest_id, invite_email, status) and holds no rows; family_id is
--      a household id that nothing ever shared, so every family has one member
--      and the friend circle in 013/015 long since replaced it.
--
-- Episodes and podcasts are already gone (011_remove_podcast), so step 4 is a
-- guard, not a change.

-- ---------------------------------------------------------------------------
-- 1. Conversation checkpointing  (from 004_interview_checkpoints)
--
-- Heartbeat written by every checkpoint, so a session still sitting in
-- 'recording' with an old one can be told from a live conversation and
-- recovered instead of silently lost.
-- ---------------------------------------------------------------------------

alter table public.sessions
  add column if not exists last_checkpoint_at timestamptz;

create index if not exists sessions_recovery_idx
  on public.sessions (status, last_checkpoint_at);

-- ---------------------------------------------------------------------------
-- 2. Guest voice  (from 007_guest_voice)
--
-- Null means "whatever the app currently ships as its default" (REALTIME_VOICE
-- in src/lib/constants.ts) rather than a frozen copy of it, so changing that
-- default moves everyone who never expressed a preference.
-- ---------------------------------------------------------------------------

alter table public.guests
  add column if not exists voice text;

-- ---------------------------------------------------------------------------
-- 3a. family_access
--
-- Verified empty before this was written. Unqualified drop (no `cascade`) so
-- it fails loudly rather than quietly taking a dependent along with it.
-- ---------------------------------------------------------------------------

drop table if exists public.family_access;

-- ---------------------------------------------------------------------------
-- 3b. Re-key the read policies from family to account
--
-- These two policies are the only reason a signed-in account can read its own
-- guest and session rows through the anon key, and both spell that as a family
-- match. Dropping family_id under them would leave the dashboard reading an
-- empty table, so they are replaced first, and only then does the column go.
--
-- "your family's guests" becomes "your own guest row" — the same set today,
-- since guests.family_id was only ever written as a copy of the owner's
-- profiles.family_id, right beside the user_id this now matches on. Anonymous
-- /interview guests stay unreadable here: user_id null, as their family_id was.
--
-- Dropped by every name the sessions policy has gone under (001, 004, 005), so
-- this lands whichever of those this database actually received.
-- ---------------------------------------------------------------------------

drop policy if exists "family reads their guests" on public.guests;
create policy "users read their own guest" on public.guests
  for select using (user_id = auth.uid());

-- The abandonment branch comes from 005: a conversation reaches its owner once
-- it is ready, or once it has been recording without a checkpoint for a
-- minute, which is how a closed tab's session is recovered. That branch is
-- live for the first time here — step 1 is what makes it expressible. Keep the
-- interval in step with ABANDONED_AFTER_MS in src/lib/constants.ts.
drop policy if exists "family reads their guest sessions" on public.sessions;
create policy "users read their own sessions" on public.sessions
  for select using (
    (
      status = 'ready'
      or (
        status = 'recording'
        and last_checkpoint_at is not null
        and last_checkpoint_at < now() - interval '1 minute'
      )
    )
    and exists (
      select 1 from public.guests g
      where g.id = sessions.guest_id
        and g.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 3c. The trigger that fills the column
--
-- As 013_friend_circle left it, minus family_id. The role branch stays: it is
-- still what reads the admin allowlist, and the lower() still normalises the
-- address that friend search matches on.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin_email boolean := exists (
    select 1 from public.admin_emails a where lower(a.email) = lower(new.email)
  );
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    lower(new.email),
    case when is_admin_email then 'admin' else 'family' end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3d. The columns
--
-- profiles_family_matches_role (010_admin_no_family) ties nullness to role, so
-- it goes first. profiles_family_idx and guests_family_idx are dropped with
-- their columns. current_family_id() has no callers left once 3b is applied —
-- dropped plainly rather than with `cascade`, so anything still depending on
-- it stops this migration instead of vanishing quietly.
-- ---------------------------------------------------------------------------

alter table public.profiles
  drop constraint if exists profiles_family_matches_role;

alter table public.profiles drop column if exists family_id;
alter table public.guests drop column if exists family_id;

drop function if exists public.current_family_id();

-- ---------------------------------------------------------------------------
-- 4. Episodes and podcasts
--
-- Already dropped by 011_remove_podcast and confirmed absent from this
-- database; these are guards so the spec holds against any project that
-- somehow still carries them.
-- ---------------------------------------------------------------------------

drop table if exists public.episodes;
drop table if exists public.podcast_participation;
