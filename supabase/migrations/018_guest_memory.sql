-- Private, encrypted continuity notes for Rosie's future conversations.
--
-- This deliberately lives outside `guests`: storyteller accounts may read
-- their own guest row, while these notes are model context and must never be
-- returned by a dashboard query or `guests(*)` join.

create table public.guest_memories (
  guest_id uuid primary key references public.guests (id) on delete cascade,
  summary_ciphertext text not null,
  last_session_id uuid references public.sessions (id) on delete set null,
  -- Lets concurrent/late finalizers refuse to replace newer continuity notes
  -- with a summary made from an older conversation.
  last_session_created_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.guest_memories enable row level security;

-- Intentionally no anon/authenticated policy. Only trusted server code using
-- the service-role client can read or write the hidden memory.

