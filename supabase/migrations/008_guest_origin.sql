-- How a storyteller got here, so the admin dashboard can show only the people
-- an admin invited.
--
-- Until now the four ways a guest row is created were not all distinguishable:
-- an admin adding a guest and a walk-in from the public /interview flow both
-- leave user_id and family_id null, so nothing told them apart.
--
--   admin_invite  an admin added them, or invited an account holder to record
--   self_serve    an account holder set themselves up from /family
--   public        a walk-in from the public /interview flow
begin;

alter table public.guests
  add column if not exists origin text;

-- Account holders invited by an admin are the ones with an admin_invite
-- participation row; any other account holder set themselves up.
update public.guests g
set origin = case
  when exists (
    select 1 from public.podcast_participation p
    where p.user_id = g.user_id and p.source = 'admin_invite'
  ) then 'admin_invite'
  else 'self_serve'
end
where origin is null and g.user_id is not null;

-- The rest are the ambiguous case: admin-added guests and public walk-ins look
-- identical in the old schema. They are classed as admin_invite so that no
-- guest an admin created disappears from the dashboard. Any leftover walk-in
-- that comes along for the ride will read as a guest with no account and no
-- conversations, and can be deleted by hand.
update public.guests
set origin = 'admin_invite'
where origin is null;

alter table public.guests
  alter column origin set default 'public',
  alter column origin set not null;

alter table public.guests
  drop constraint if exists guests_origin_check;

alter table public.guests
  add constraint guests_origin_check
  check (origin in ('admin_invite', 'self_serve', 'public'));

create index if not exists guests_origin_idx on public.guests (origin);

commit;
