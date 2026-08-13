-- Seedance 2.0 accepts clips up to 15 seconds. The original film pipeline
-- capped rows at 10; longer shots reduce the number of joins and leave enough
-- media to overlap adjacent audio without shortening the memoir below 2:00.

alter table public.conversation_video_scenes
  drop constraint if exists conversation_video_scenes_duration_seconds_check;

alter table public.conversation_video_scenes
  add constraint conversation_video_scenes_duration_seconds_check
  check (duration_seconds between 4 and 15);

