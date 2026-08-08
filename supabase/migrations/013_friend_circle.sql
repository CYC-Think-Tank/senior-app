-- The friend circle: other family accounts a storyteller has connected with,
-- found by email and joined by mutual consent.
--
-- A friendship is one row per pair, with the two ids stored in a fixed order
-- (smaller uuid first). The unique index on that ordered pair is what makes
-- duplicate and reciprocal requests impossible to represent, rather than
-- something the application has to defend against on every write.

-- ---------------------------------------------------------------------------
-- Email normalisation
--
-- Friend search matches on the address a person types, so the stored copy has
-- to be the lowercase one. Supabase Auth already lowercases, but the trigger
-- below wrote `new.email` verbatim, so backfill first and pin it after.
-- ---------------------------------------------------------------------------

update public.profiles set email = lower(email) where email <> lower(email);

create index if not exists profiles_email_idx on public.profiles (email);

-- The allowlist is compared with lower() inside handle_new_user(), so its rows
-- were never required to be lowercase. Normalise them too, so application code
-- can match this table with a plain `eq` instead of a case-insensitive
-- operator — see the note on `ilike` in src/lib/email.ts.
update public.admin_emails set email = lower(email) where email <> lower(email);

-- Same as 010_admin_no_family, with the email lowercased on the way in.
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
  insert into public.profiles (id, email, role, family_id)
  values (
    new.id,
    lower(new.email),
    case when is_admin_email then 'admin' else 'family' end,
    case when is_admin_email then null else gen_random_uuid() end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Friendships
-- ---------------------------------------------------------------------------

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  -- Ordered pair: user_low is always the smaller uuid.
  user_low uuid not null references public.profiles (id) on delete cascade,
  user_high uuid not null references public.profiles (id) on delete cascade,
  -- Who asked. Decides which side sees an Accept button while the row is
  -- pending; kept afterwards only as history.
  requester_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  -- Also what makes self-friending unrepresentable: a = a fails `<`.
  constraint friendships_ordered check (user_low < user_high),
  constraint friendships_requester_is_participant
    check (requester_id in (user_low, user_high)),
  constraint friendships_pair unique (user_low, user_high)
);

-- A friendship is read from either side, so both columns need their own index;
-- the unique constraint above only covers (user_low, user_high) in that order.
create index friendships_low_idx on public.friendships (user_low, status);
create index friendships_high_idx on public.friendships (user_high, status);

-- ---------------------------------------------------------------------------
-- Membership helpers
--
-- Both mirror public.current_family_id(): security definer, so they read
-- friendships as the table owner and never recurse back through the policies
-- below — or through the profiles policy in 014, which calls is_connected().
-- ---------------------------------------------------------------------------

create or replace function public.is_friend(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and (
        (f.user_low = auth.uid() and f.user_high = other)
        or (f.user_high = auth.uid() and f.user_low = other)
      )
  );
$$;

-- Accepted *or* pending, either direction. This is the one that lets a pending
-- requester's name render on the other person's requests list, before there is
-- a friendship to speak of.
create or replace function public.is_connected(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships f
    where (f.user_low = auth.uid() and f.user_high = other)
       or (f.user_high = auth.uid() and f.user_low = other)
  );
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
--
-- Reads only. Every write goes through the service role once the server action
-- has authorised it, the same way profiles and guests already work.
-- ---------------------------------------------------------------------------

alter table public.friendships enable row level security;

create policy "participants read their friendships" on public.friendships
  for select using (auth.uid() in (user_low, user_high));

create policy "admin manages friendships" on public.friendships
  for all using (public.is_admin()) with check (public.is_admin());
