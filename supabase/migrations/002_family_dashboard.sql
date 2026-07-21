-- Upgrade databases that already ran 001_init.sql before the family dashboard
-- schema was added. Editing an applied migration does not alter those projects.

begin;

alter table public.profiles
  add column if not exists family_id uuid;

update public.profiles
set family_id = extensions.gen_random_uuid()
where family_id is null;

alter table public.profiles
  alter column family_id set default extensions.gen_random_uuid(),
  alter column family_id set not null;

alter table public.guests
  add column if not exists user_id uuid references auth.users (id) on delete set null,
  add column if not exists family_id uuid;

alter table public.sessions
  add column if not exists share_token text,
  add column if not exists title text;

create index if not exists profiles_family_idx
  on public.profiles (family_id);

create index if not exists guests_family_idx
  on public.guests (family_id);

create unique index if not exists guests_user_idx
  on public.guests (user_id)
  where user_id is not null;

create unique index if not exists sessions_share_token_key
  on public.sessions (share_token);

-- Existing signup triggers call this function by name, so replacing it also
-- updates projects whose trigger was installed by the original migration.
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
      when exists (
        select 1
        from public.admin_emails a
        where lower(a.email) = lower(new.email)
      ) then 'admin'
      else 'family'
    end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.current_family_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select family_id from public.profiles where id = auth.uid();
$$;

drop policy if exists "admin reads profiles" on public.profiles;
create policy "admin reads profiles" on public.profiles
  for select using (public.is_admin());

drop policy if exists "family reads their guests" on public.guests;
create policy "family reads their guests" on public.guests
  for select using (
    family_id is not null and family_id = public.current_family_id()
  );

drop policy if exists "family reads their guest sessions" on public.sessions;
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

drop policy if exists "family reads published episodes" on public.episodes;
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

commit;
