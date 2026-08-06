-- Removes the podcast product surface: the public feed, rendered episodes, the
-- guest review/approval loop, and the participation pipeline that invited
-- family accounts to record for it. What remains is the conversation product —
-- interviews, transcripts, and private share links.
--
-- This is destructive: every rendered episode row and its audio object go away.
-- Raw recordings in `raw-audio` are untouched.

begin;

-- Approval was the publication event; nothing publishes any more.
drop trigger if exists set_episode_publish_time_on_approval on public.episodes;
drop function if exists public.set_episode_publish_time_on_approval();

-- Policies drop with the table; these are here so re-running against a
-- half-migrated database is still clean.
drop policy if exists "admin manages episodes" on public.episodes;
drop policy if exists "family reads published episodes" on public.episodes;
drop table if exists public.episodes;

drop table if exists public.podcast_participation;

-- The rendered-cut `episodes` bucket is NOT dropped here. Supabase's
-- storage.protect_delete() trigger rejects direct DML on storage.objects and
-- storage.buckets, so it has to go through the Storage API — empty then delete
-- the bucket in the dashboard (Storage -> episodes -> Empty bucket, Delete
-- bucket) or via supabase.storage.emptyBucket/deleteBucket.

commit;
