-- Senior audio-memoir podcast platform — initial schema.
-- Run this in the Supabase SQL editor (or `supabase db push`).

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Admin bootstrap: emails listed here become admins when they first sign in.
-- EDIT this list before running.
-- ---------------------------------------------------------------------------
create table public.admin_emails (
  email text primary key
);

insert into public.admin_emails (email) values ('wzishine@gmail.com');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'family' check (role in ('admin', 'family')),
  created_at timestamptz not null default now()
);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
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
  topic text,
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

create table public.family_access (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.guests (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  invite_email text,
  status text not null default 'pending' check (status in ('pending', 'active')),
  created_at timestamptz not null default now(),
  unique (guest_id, invite_email)
);

create index sessions_guest_idx on public.sessions (guest_id);
create index turns_session_idx on public.transcript_turns (session_id);
create index episodes_guest_idx on public.episodes (guest_id);
create index family_access_user_idx on public.family_access (user_id);

-- ---------------------------------------------------------------------------
-- New-user trigger: create profile (admin if email is in admin_emails) and
-- claim any pending family invites for that email.
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

  update public.family_access
     set user_id = new.id, status = 'active'
   where user_id is null
     and lower(invite_email) = lower(new.email);

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

alter table public.profiles enable row level security;
alter table public.guests enable row level security;
alter table public.sessions enable row level security;
alter table public.transcript_turns enable row level security;
alter table public.episodes enable row level security;
alter table public.family_access enable row level security;
alter table public.admin_emails enable row level security;

create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "admin manages guests" on public.guests
  for all using (public.is_admin()) with check (public.is_admin());

create policy "family reads their guests" on public.guests
  for select using (
    exists (
      select 1 from public.family_access fa
      where fa.guest_id = guests.id and fa.user_id = auth.uid() and fa.status = 'active'
    )
  );

create policy "admin manages sessions" on public.sessions
  for all using (public.is_admin()) with check (public.is_admin());

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
      select 1 from public.family_access fa
      where fa.guest_id = episodes.guest_id and fa.user_id = auth.uid() and fa.status = 'active'
    )
  );

create policy "admin manages family access" on public.family_access
  for all using (public.is_admin()) with check (public.is_admin());

create policy "family reads own access" on public.family_access
  for select using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage buckets (private; access via signed URLs from the server)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('raw-audio', 'raw-audio', false), ('episodes', 'episodes', false)
on conflict (id) do nothing;
