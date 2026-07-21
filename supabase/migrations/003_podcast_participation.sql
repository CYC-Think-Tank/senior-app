-- Public podcast invitations and join requests.
create table public.podcast_participation (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  session_id uuid unique references public.sessions (id) on delete set null,
  source text not null check (source in ('request', 'admin_invite')),
  status text not null check (status in ('requested', 'invited', 'accepted', 'interview_done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index podcast_participation_status_idx
  on public.podcast_participation (status, updated_at desc);

alter table public.podcast_participation enable row level security;

create policy "admin manages podcast participation"
  on public.podcast_participation
  for all using (public.is_admin()) with check (public.is_admin());

create policy "users read own podcast participation"
  on public.podcast_participation
  for select using (user_id = auth.uid());

create policy "users request podcast participation"
  on public.podcast_participation
  for insert with check (
    user_id = auth.uid()
    and source = 'request'
    and status = 'requested'
    and session_id is null
  );
