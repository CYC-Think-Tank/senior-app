-- Senior audio-memoir podcast platform — full schema.
-- Run this in the Supabase SQL editor (or `supabase db push`).

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Admin bootstrap: emails listed here become admins when they first sign in.
-- EDIT this list before running.
-- ---------------------------------------------------------------------------
create table public.admin_emails (
  email text primary key
);

insert into public.admin_emails (email) values ('jiabaowu07@gmail.com');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Families are identified by a bare uuid rather than their own table. Every
-- new profile gets its own family by default; to put people in the same
-- family, set their profiles.family_id to the same value.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'family' check (role in ('admin', 'family')),
  family_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  -- Set when the storyteller is a signed-in user recording their own stories.
  user_id uuid references auth.users (id) on delete set null,
  -- Which family may listen. Null for anonymous guests from the public
  -- /interview flow, which nobody's dashboard should surface.
  family_id uuid,
  name text not null,
  bio text,
  photo_path text,
  topics text[],
  language text not null default 'English',
  created_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.guests (id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  -- Set once, on demand, to publish the raw recording at /share/<token>.
  share_token text unique,
  -- What the interview is about; feeds the AI host and episode metadata.
  topic text,
  -- What the family calls this recording. Renameable from their dashboard;
  -- when null the dashboard numbers it instead.
  title text,
  status text not null default 'pending' check (status in ('pending', 'recording', 'ready')),
  raw_audio_path text,
  started_at timestamptz,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create table public.transcript_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  idx integer not null,
  speaker text not null check (speaker in ('ai', 'guest')),
  text text not null,
  start_ms integer not null,
  end_ms integer not null,
  excluded boolean not null default false,
  unique (session_id, idx)
);

create table public.episodes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.sessions (id) on delete cascade,
  guest_id uuid not null references public.guests (id) on delete cascade,
  episode_number integer not null,
  title text not null,
  description text,
  show_notes text,
  audio_path text not null,
  duration_ms integer,
  review_token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  status text not null default 'draft'
    check (status in ('draft', 'pending_approval', 'changes_requested', 'approved', 'published')),
  change_note text,
  publish_at timestamptz,
  created_at timestamptz not null default now()
);

create index sessions_guest_idx on public.sessions (guest_id);
create index turns_session_idx on public.transcript_turns (session_id);
create index episodes_guest_idx on public.episodes (guest_id);
create index profiles_family_idx on public.profiles (family_id);
create index guests_family_idx on public.guests (family_id);

-- At most one self-recorded guest per account.
create unique index guests_user_idx
  on public.guests (user_id)
  where user_id is not null;

-- ---------------------------------------------------------------------------
-- New-user trigger: create a profile (admin if the email is in admin_emails).
-- family_id falls back to the column default, giving each new user their own
-- family until an admin moves them into someone else's.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    case
      when exists (select 1 from public.admin_emails a where lower(a.email) = lower(new.email))
        then 'admin'
      else 'family'
    end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- The caller's family. Security definer so it can see the caller's own row
-- without recursing through the profiles policies.
create or replace function public.current_family_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select family_id from public.profiles where id = auth.uid();
$$;

alter table public.profiles enable row level security;
alter table public.guests enable row level security;
alter table public.sessions enable row level security;
alter table public.transcript_turns enable row level security;
alter table public.episodes enable row level security;
alter table public.admin_emails enable row level security;

create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "admin reads profiles" on public.profiles
  for select using (public.is_admin());

create policy "admin manages guests" on public.guests
  for all using (public.is_admin()) with check (public.is_admin());

create policy "family reads their guests" on public.guests
  for select using (
    family_id is not null and family_id = public.current_family_id()
  );

create policy "admin manages sessions" on public.sessions
  for all using (public.is_admin()) with check (public.is_admin());

-- Raw, unedited conversations stay inside the family (the public sees only
-- finished episodes, or a conversation someone deliberately shared by link).
create policy "family reads their guest sessions" on public.sessions
  for select using (
    status = 'ready'
    and exists (
      select 1 from public.guests g
      where g.id = sessions.guest_id
        and g.family_id is not null
        and g.family_id = public.current_family_id()
    )
  );

create policy "admin manages turns" on public.transcript_turns
  for all using (public.is_admin()) with check (public.is_admin());

create policy "admin manages episodes" on public.episodes
  for all using (public.is_admin()) with check (public.is_admin());

create policy "family reads published episodes" on public.episodes
  for select using (
    status in ('approved', 'published')
    and publish_at is not null
    and publish_at <= now()
    and exists (
      select 1 from public.guests g
      where g.id = episodes.guest_id
        and g.family_id is not null
        and g.family_id = public.current_family_id()
    )
  );

-- ---------------------------------------------------------------------------
-- Storage buckets (private; access via signed URLs from the server)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('raw-audio', 'raw-audio', false), ('episodes', 'episodes', false)
on conflict (id) do nothing;
