-- Storytellers can choose the voice Rosie speaks in, from the built-in voices
-- the OpenAI Realtime model offers.
--
-- Null means "whatever the app currently ships as its default" (REALTIME_VOICE
-- in src/lib/constants.ts) rather than a frozen copy of it, so changing that
-- default moves everyone who never expressed a preference.
alter table public.guests
  add column if not exists voice text;
