-- Admins are not part of a family: they see every guest through is_admin(),
-- so a family_id on their profile only invites confusion (they would show up
-- in the "who can listen" list for whichever family they were seeded into).
-- Family accounts still always have one.

alter table public.profiles alter column family_id drop not null;

update public.profiles set family_id = null where role = 'admin';

alter table public.profiles
  add constraint profiles_family_matches_role check (
    case role
      when 'admin' then family_id is null
      else family_id is not null
    end
  );

-- The column default would hand a new admin their own family, so set family_id
-- explicitly here rather than falling back to it.
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
    new.email,
    case when is_admin_email then 'admin' else 'family' end,
    case when is_admin_email then null else gen_random_uuid() end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
