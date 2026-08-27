-- Animated memoir films are the one thing an account can buy over and over:
-- every complete generation purchases a fresh set of SeeGen clips. Cap how
-- many an account gets, and keep the tally on the profile so it follows the
-- account rather than any single conversation — deleting a conversation must
-- not hand its generation back.

alter table public.profiles
  add column if not exists video_generations_used integer not null default 0;

-- Films that already exist were paid for, so they count against the new cap.
update public.profiles as profile
set video_generations_used = history.films
from (
  select guest.user_id, count(*)::integer as films
  from public.conversation_videos as video
  join public.sessions as session on session.id = video.session_id
  join public.guests as guest on guest.id = session.guest_id
  where guest.user_id is not null
  group by guest.user_id
) as history
where profile.id = history.user_id;

-- A single statement, so two overlapping requests can never both take the
-- last generation: Postgres re-checks the where clause against the row it
-- locked. Returns how many are left after the claim, or -1 when the account
-- is already at its cap (or has no profile row).
create or replace function public.claim_video_generation(
  p_user_id uuid,
  p_limit integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
begin
  update public.profiles
  set video_generations_used = video_generations_used + 1
  where id = p_user_id
    and video_generations_used < p_limit
  returning video_generations_used into v_used;

  if v_used is null then
    return -1;
  end if;
  return p_limit - v_used;
end;
$$;

-- Hands a claimed generation back when the job could not be started after
-- all, so a server error never costs the storyteller a film.
create or replace function public.release_video_generation(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set video_generations_used = greatest(0, video_generations_used - 1)
  where id = p_user_id;
$$;

-- Only the server may move the counter. The browser reads
-- profiles.video_generations_used through the existing "read own profile"
-- policy, but can never change it.
revoke all on function public.claim_video_generation(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.release_video_generation(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_video_generation(uuid, integer) to service_role;
grant execute on function public.release_video_generation(uuid) to service_role;
