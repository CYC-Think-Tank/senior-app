-- Crash-safe interviews: the browser now checkpoints the transcript and
-- uploads the recording in parts while the conversation is still running, so
-- closing the tab early no longer throws the whole session away.

-- Heartbeat written by every checkpoint. A session still sitting in
-- 'recording' with an old heartbeat was abandoned and can be recovered.
alter table public.sessions
  add column if not exists last_checkpoint_at timestamptz;

create index if not exists sessions_recovery_idx
  on public.sessions (status, last_checkpoint_at);

-- A conversation whose tab closed early still holds real stories: the live
-- checkpoints saved its transcript and most of its audio. Let the family see
-- those alongside their finished recordings instead of losing them silently.
--
-- A stale checkpoint is what separates a conversation that ended early from
-- one still in progress: the interview heartbeats every 30s, so two minutes of
-- silence means the tab is gone. Without this the family would watch a live
-- interview appear mid-sentence — and could cut it short by finishing it.
drop policy if exists "family reads their guest sessions" on public.sessions;
create policy "family reads their guest sessions" on public.sessions
  for select using (
    (
      status = 'ready'
      or (
        status = 'recording'
        and last_checkpoint_at is not null
        and last_checkpoint_at < now() - interval '2 minutes'
      )
    )
    and exists (
      select 1 from public.guests g
      where g.id = sessions.guest_id
        and g.family_id is not null
        and g.family_id = public.current_family_id()
    )
  );
