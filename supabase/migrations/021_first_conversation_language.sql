-- Records that a signed-in storyteller has completed the language step once.
-- Unlike a browser cookie, this follows their account to another device and
-- survives deletion of their conversation history.
alter table public.profiles
  add column if not exists conversation_language_chosen_at timestamptz;

-- Existing storytellers should keep the one-click start flow. Use the oldest
-- self-recorded session as the time they effectively made this choice.
update public.profiles as profile
set conversation_language_chosen_at = history.first_conversation_at
from (
  select guest.user_id, min(session.created_at) as first_conversation_at
  from public.guests as guest
  join public.sessions as session on session.guest_id = guest.id
  where guest.user_id is not null
  group by guest.user_id
) as history
where profile.id = history.user_id
  and profile.conversation_language_chosen_at is null;
