-- Until now a family account could read exactly one profile row: its own.
-- The friend circle needs names — for the friends list, for the requests list,
-- and for the storyteller behind a shared conversation — so open the row up to
-- the people you are already connected to, and nobody else.
--
-- Permissive policies are OR-ed, so this widens "read own profile" without
-- touching it. is_connected() is security definer, so this does not recurse
-- back into profiles.
--
-- Note this does show a friend their friend's email address. They typed it to
-- find each other, so it is accepted rather than accidental.
--
-- Search is deliberately NOT covered here: at search time there is no
-- relationship yet, so no predicate could authorise it without making profiles
-- readable by email to every signed-in user. searchFriendByEmail() uses the
-- service role and returns a minimal shape instead.

create policy "read connected profiles" on public.profiles
  for select using (public.is_connected(id));
