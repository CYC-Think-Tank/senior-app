-- A signed-in person's UI language follows their account across devices.
alter table public.profiles
  add column if not exists locale text;

update public.profiles
set locale = 'en'
where locale is null or locale not in ('en', 'zh-Hans', 'zh-Hant');

alter table public.profiles
  alter column locale set default 'en',
  alter column locale set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_locale_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_locale_check
      check (locale in ('en', 'zh-Hans', 'zh-Hant'));
  end if;
end $$;
