-- A one-line "moral of the story" distilled from the transcript and shown to
-- whoever opens the share link, so a visitor who has not pressed play yet
-- still gets the thing the storyteller would want a young person to keep.
--
-- Written once, on the first view that needs it, and sealed at rest with the
-- transcript's own cipher (src/lib/moral/encryption.ts). Null until then, and
-- null forever for conversations too short to have a point.
alter table public.sessions add column moral text;
