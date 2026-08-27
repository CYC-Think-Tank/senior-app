-- Every rendered film gets two individual scene replacements. Keep the count
-- on the film itself so it survives refreshes and is shared by web and mobile.

alter table public.conversation_videos
  add column if not exists scene_regenerations_used integer not null default 0
    check (scene_regenerations_used between 0 and 2);

-- Claims one replacement and queues its scene in the same transaction. The
-- return value is the number left, or a negative result the server translates:
--   -1 = the film used both replacements
--   -2 = the film is not ready (including a competing request)
--   -3 = that scene does not exist
create or replace function public.claim_video_scene_regeneration(
  p_video_id uuid,
  p_scene_index integer,
  p_limit integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer;
begin
  if not exists (
    select 1
    from public.conversation_video_scenes
    where video_id = p_video_id and idx = p_scene_index
  ) then
    return -3;
  end if;

  update public.conversation_videos
  set scene_regenerations_used = scene_regenerations_used + 1,
      status = 'generating',
      error_message = null,
      updated_at = now()
  where id = p_video_id
    and status = 'ready'
    and scene_regenerations_used < p_limit
  returning p_limit - scene_regenerations_used into v_remaining;

  if v_remaining is null then
    if exists (
      select 1
      from public.conversation_videos
      where id = p_video_id and scene_regenerations_used >= p_limit
    ) then
      return -1;
    end if;
    return -2;
  end if;

  update public.conversation_video_scenes
  set status = 'queued',
      provider_task_id = null,
      result_url = null,
      error_message = null,
      updated_at = now()
  where video_id = p_video_id and idx = p_scene_index;

  if not found then
    raise exception 'Scene disappeared while claiming its regeneration';
  end if;

  return v_remaining;
end;
$$;

comment on column public.conversation_videos.scene_regenerations_used is
  'Number of individual scene replacements claimed for the current rendered film; maximum 2.';

revoke all on function public.claim_video_scene_regeneration(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_video_scene_regeneration(uuid, integer, integer)
  to service_role;
