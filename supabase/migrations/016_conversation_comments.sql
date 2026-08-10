-- Comments a friend leaves on a conversation shared with their circle.
--
-- Stored in plaintext, unlike transcripts and morals. A comment is written to
-- be read by other people, so sealing it would buy nothing the circle policies
-- below do not already do — but it does mean RLS is the only thing between a
-- comment and a stranger, so the policies here are the whole story.

create table public.conversation_comments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  -- The author's name as it was when they wrote it.
  --
  -- Snapshotting keeps the profiles policy narrow. Two friends of the same
  -- storyteller are not necessarily friends with each other, so reading the
  -- name off profiles would mean B could see C's comment but not C's name —
  -- or, if widened to fix that, that sharing a conversation quietly
  -- introduced everyone in the circle to everyone else.
  author_name text not null,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index comments_session_idx
  on public.conversation_comments (session_id, created_at);
create index comments_author_idx
  on public.conversation_comments (author_id);

alter table public.conversation_comments enable row level security;

-- The storyteller always sees the comments on their own conversation, even
-- after switching circle sharing back off — that first branch is what keeps
-- them from vanishing rather than merely being hidden from the circle. Their
-- friends see them only while the switch is on and the friendship stands.
--
-- Every function called here is security definer, so this does not recurse
-- through the sessions, guests, circle_shares, or friendships policies.
create policy "circle reads comments" on public.conversation_comments
  for select using (
    public.conversation_owner(session_id) = auth.uid()
    or (
      public.is_circle_shared(session_id)
      and public.is_friend(public.conversation_owner(session_id))
    )
  );

create policy "author reads own comments" on public.conversation_comments
  for select using (author_id = auth.uid());

create policy "admin manages comments" on public.conversation_comments
  for all using (public.is_admin()) with check (public.is_admin());
