-- Distinguish requests that submit a finished family conversation from
-- requests for a brand-new public podcast interview.
begin;

alter table public.podcast_participation
  add column if not exists request_kind text;

update public.podcast_participation
set request_kind = case
  when source = 'request' and session_id is not null then 'existing_conversation'
  else 'new_interview'
end
where request_kind is null;

alter table public.podcast_participation
  alter column request_kind set default 'new_interview',
  alter column request_kind set not null;

alter table public.podcast_participation
  drop constraint if exists podcast_participation_request_kind_check;

alter table public.podcast_participation
  add constraint podcast_participation_request_kind_check
  check (request_kind in ('existing_conversation', 'new_interview'));

drop policy if exists "users request podcast participation"
  on public.podcast_participation;

create policy "users request podcast participation"
  on public.podcast_participation
  for insert with check (
    user_id = auth.uid()
    and source = 'request'
    and status = 'requested'
    and (
      (request_kind = 'new_interview' and session_id is null)
      or
      (request_kind = 'existing_conversation' and session_id is not null)
    )
  );

commit;
