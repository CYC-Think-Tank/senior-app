-- Shorten the wait before an early-ended conversation reaches the family.
--
-- The heartbeat now fires every 15s (was 10s at the time of 004), and a tab
-- that closes stops heartbeating. One minute of silence — four missed
-- heartbeats — is enough to tell an abandoned session from a live one while
-- still absorbing a brief network blip, so the family sees a recovered
-- conversation sooner. Kept in step with ABANDONED_AFTER_MS in constants.ts.
drop policy if exists "family reads their guest sessions" on public.sessions;
create policy "family reads their guest sessions" on public.sessions
  for select using (
    (
      status = 'ready'
      or (
        status = 'recording'
        and last_checkpoint_at is not null
        and last_checkpoint_at < now() - interval '1 minute'
      )
    )
    and exists (
      select 1 from public.guests g
      where g.id = sessions.guest_id
        and g.family_id is not null
        and g.family_id = public.current_family_id()
    )
  );
