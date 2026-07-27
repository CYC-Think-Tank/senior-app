-- Record that a storyteller actively agreed to recording and AI processing
-- before an interview began. Publication remains a separate later approval.
begin;

alter table public.sessions
  add column if not exists recording_consent_at timestamptz;

commit;
