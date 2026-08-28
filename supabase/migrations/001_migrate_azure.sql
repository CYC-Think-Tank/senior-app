-- 001_migrate_azure.sql
--
-- Recreates the live Supabase schema (project yeflhjspmbsakngmmftm, public
-- schema) on an empty PostgreSQL database — targeted at Azure Database for
-- PostgreSQL Flexible Server.
--
-- Built by introspecting the running database through the PostgREST OpenAPI
-- document and its data, not from supabase/migrations/*.sql. Columns, their
-- order, types, NOT NULL, defaults, primary keys and foreign keys are read
-- from the live schema. Everything the REST layer cannot see is called out
-- inline and, where it could reject writes, left commented at the bottom.
--
-- Deliberately NOT carried over:
--   * Row Level Security and its policies, plus the helper functions they call
--     (is_admin, is_friend, is_connected, is_circle_shared,
--     conversation_owner, rls_auto_enable). They are all written against
--     Supabase's auth.uid(), which does not exist here.
--   * The auth schema. In Supabase, profiles.id and guests.user_id hold
--     auth.users ids; below they are plain uuids with no foreign key. Point
--     them at your own users table once it exists.
--   * Storage buckets. Path columns (raw_audio_path, photo_path,
--     narration_path, video_path) stay as text and should hold Azure Blob
--     Storage paths.
--
-- Requires PostgreSQL 13+ for the built-in gen_random_uuid().
--
-- Updated 2026-08-27: folded in supabase/migrations/022–024, which landed
-- after the introspection this file was built from. They contribute
-- profiles.video_generations_used, conversation_videos.scene_regenerations_used,
-- the CYC-registration columns on support_providers, the
-- support_providers_external_idx unique index, and the three quota functions
-- near the bottom. Those pieces are copied from the migration files (their
-- CHECKs are real, not guessed like the optional block at the end).
--
-- Also 2026-08-27: added profiles.conversation_language_chosen_at, from
-- 021_first_conversation_language.sql. It was missing here even though the
-- app reads and writes it on every dashboard load and every conversation
-- start — the introspection this file was built from did not pick it up.
-- Databases already created from the earlier version of this file need
-- 003_first_conversation_language.sql instead; it is a no-op against this one.

BEGIN;

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
-- pgcrypto supplies gen_random_bytes(), used by the sessions.token default.
-- Supabase installs it into the "extensions" schema; on Azure Flexible Server
-- add pgcrypto to the azure.extensions server parameter first, then this
-- installs it into public.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
-- One row per signed-in account. In Supabase, id mirrors auth.users.id, which
-- is why it has no default: the auth system supplies it.
CREATE TABLE public.profiles (
  id            uuid        NOT NULL,
  email         text        NOT NULL,
  display_name  text,
  role          text        NOT NULL DEFAULT 'family',
  created_at    timestamptz NOT NULL DEFAULT now(),
  locale        text        NOT NULL DEFAULT 'en',
  -- When this storyteller completed the language step for the first time
  -- (021_first_conversation_language.sql). Null means they have not yet, which
  -- is what sends them through the first-run flow at /interview instead of the
  -- one-click start on their dashboard.
  conversation_language_chosen_at timestamptz,
  -- How many complete memoir-film generations this account has claimed
  -- (022_video_generation_quota.sql). Moved only by claim_video_generation /
  -- release_video_generation below.
  video_generations_used integer NOT NULL DEFAULT 0,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_email_key UNIQUE (email)
);

-- ---------------------------------------------------------------------------
-- guests
-- ---------------------------------------------------------------------------
-- The storyteller being interviewed. user_id is null for the throwaway guest
-- the public flow mints per conversation; when set it is an auth.users id.
CREATE TABLE public.guests (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  bio         text,
  photo_path  text,
  topics      text[],
  language    text        NOT NULL DEFAULT 'English',
  created_at  timestamptz NOT NULL DEFAULT now(),
  user_id     uuid,
  origin      text        NOT NULL DEFAULT 'public',
  voice       text,
  CONSTRAINT guests_pkey PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------
-- One interview. Deleting a session cascades to its transcript, circle share,
-- comments and generated video; see src/lib/sessions/trash.ts, which relies on
-- that and deletes only the session row.
CREATE TABLE public.sessions (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
  guest_id              uuid        NOT NULL,
  token                 text        NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  topic                 text,
  status                text        NOT NULL DEFAULT 'pending',
  raw_audio_path        text,
  started_at            timestamptz,
  duration_ms           integer,
  created_at            timestamptz NOT NULL DEFAULT now(),
  share_token           text,
  title                 text,
  recording_consent_at  timestamptz,
  moral                 text,
  last_checkpoint_at    timestamptz,
  CONSTRAINT sessions_pkey PRIMARY KEY (id),
  CONSTRAINT sessions_token_key UNIQUE (token),
  CONSTRAINT sessions_share_token_key UNIQUE (share_token),
  CONSTRAINT sessions_guest_id_fkey FOREIGN KEY (guest_id)
    REFERENCES public.guests (id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- transcript_turns
-- ---------------------------------------------------------------------------
-- text holds ciphertext (AES-256-GCM, AUDIO_ENCRYPTION_KEY), not plaintext.
-- (session_id, idx) is the upsert target in src/lib/transcript/save-turns.ts.
CREATE TABLE public.transcript_turns (
  id          uuid    NOT NULL DEFAULT gen_random_uuid(),
  session_id  uuid    NOT NULL,
  idx         integer NOT NULL,
  speaker     text    NOT NULL,
  text        text    NOT NULL,
  start_ms    integer NOT NULL,
  end_ms      integer NOT NULL,
  excluded    boolean NOT NULL DEFAULT false,
  CONSTRAINT transcript_turns_pkey PRIMARY KEY (id),
  CONSTRAINT transcript_turns_session_id_idx_key UNIQUE (session_id, idx),
  CONSTRAINT transcript_turns_session_id_fkey FOREIGN KEY (session_id)
    REFERENCES public.sessions (id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- circle_shares
-- ---------------------------------------------------------------------------
-- The presence of the row is the whole-circle sharing switch for a session.
-- owner_id is denormalised from guests.user_id.
CREATE TABLE public.circle_shares (
  session_id  uuid        NOT NULL,
  owner_id    uuid        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT circle_shares_pkey PRIMARY KEY (session_id),
  CONSTRAINT circle_shares_session_id_fkey FOREIGN KEY (session_id)
    REFERENCES public.sessions (id) ON DELETE CASCADE,
  CONSTRAINT circle_shares_owner_id_fkey FOREIGN KEY (owner_id)
    REFERENCES public.profiles (id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- conversation_comments
-- ---------------------------------------------------------------------------
-- author_name is a snapshot of the author's name at write time, so the comment
-- still reads correctly if they later rename themselves.
CREATE TABLE public.conversation_comments (
  id           uuid        NOT NULL DEFAULT gen_random_uuid(),
  session_id   uuid        NOT NULL,
  author_id    uuid        NOT NULL,
  author_name  text        NOT NULL,
  body         text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_comments_pkey PRIMARY KEY (id),
  CONSTRAINT conversation_comments_session_id_fkey FOREIGN KEY (session_id)
    REFERENCES public.sessions (id) ON DELETE CASCADE,
  CONSTRAINT conversation_comments_author_id_fkey FOREIGN KEY (author_id)
    REFERENCES public.profiles (id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- conversation_videos
-- ---------------------------------------------------------------------------
-- The generated memoir video for a session. updated_at is written explicitly
-- by the app and used as an optimistic-lock token (src/lib/memoir/workflow.ts
-- claims a stale "rendering" row by matching on it), so do NOT attach a
-- trigger that bumps it automatically — that would break the compare-and-swap.
CREATE TABLE public.conversation_videos (
  id                        uuid        NOT NULL DEFAULT gen_random_uuid(),
  session_id                uuid        NOT NULL,
  status                    text        NOT NULL DEFAULT 'planning',
  title                     text,
  story_ciphertext          text,
  narration_ciphertext      text,
  visual_bible_ciphertext   text,
  narration_path            text,
  video_path                text,
  duration_ms               integer,
  error_message             text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  -- Individual scene replacements claimed for the current rendered film
  -- (023_video_scene_regeneration_limit.sql); moved only by
  -- claim_video_scene_regeneration below.
  scene_regenerations_used  integer     NOT NULL DEFAULT 0
    CHECK (scene_regenerations_used BETWEEN 0 AND 2),
  CONSTRAINT conversation_videos_pkey PRIMARY KEY (id),
  CONSTRAINT conversation_videos_session_id_key UNIQUE (session_id),
  CONSTRAINT conversation_videos_session_id_fkey FOREIGN KEY (session_id)
    REFERENCES public.sessions (id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- conversation_video_scenes
-- ---------------------------------------------------------------------------
-- (video_id, idx) is the upsert target in src/lib/memoir/workflow.ts.
-- Same updated_at caveat as conversation_videos: written by hand, no trigger.
CREATE TABLE public.conversation_video_scenes (
  id                 uuid        NOT NULL DEFAULT gen_random_uuid(),
  video_id           uuid        NOT NULL,
  idx                integer     NOT NULL,
  prompt_ciphertext  text        NOT NULL,
  duration_seconds   integer     NOT NULL,
  provider_task_id   text,
  status             text        NOT NULL DEFAULT 'queued',
  result_url         text,
  error_message      text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_video_scenes_pkey PRIMARY KEY (id),
  CONSTRAINT conversation_video_scenes_video_id_idx_key UNIQUE (video_id, idx),
  CONSTRAINT conversation_video_scenes_video_id_fkey FOREIGN KEY (video_id)
    REFERENCES public.conversation_videos (id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- guest_memories
-- ---------------------------------------------------------------------------
-- What the AI remembers about a storyteller between conversations, one row per
-- guest. summary_ciphertext is sealed with AUDIO_ENCRYPTION_KEY. The memory
-- must outlive the session it was last built from, so last_session_id is
-- nullable and set null on delete rather than cascading. updated_at is the
-- compare-and-swap token in src/lib/memory/summary.ts — again, no trigger.
CREATE TABLE public.guest_memories (
  guest_id                 uuid        NOT NULL,
  summary_ciphertext       text        NOT NULL,
  last_session_id          uuid,
  last_session_created_at  timestamptz NOT NULL,
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_memories_pkey PRIMARY KEY (guest_id),
  CONSTRAINT guest_memories_guest_id_fkey FOREIGN KEY (guest_id)
    REFERENCES public.guests (id) ON DELETE CASCADE,
  CONSTRAINT guest_memories_last_session_id_fkey FOREIGN KEY (last_session_id)
    REFERENCES public.sessions (id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- friendships
-- ---------------------------------------------------------------------------
-- One row per pair of accounts, ids stored in a fixed order: user_low is
-- always the smaller uuid. Normalise through friendshipPair() before querying.
CREATE TABLE public.friendships (
  id            uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_low      uuid        NOT NULL,
  user_high     uuid        NOT NULL,
  requester_id  uuid        NOT NULL,
  status        text        NOT NULL DEFAULT 'pending',
  created_at    timestamptz NOT NULL DEFAULT now(),
  responded_at  timestamptz,
  CONSTRAINT friendships_pkey PRIMARY KEY (id),
  CONSTRAINT friendships_user_low_user_high_key UNIQUE (user_low, user_high),
  CONSTRAINT friendships_user_low_fkey FOREIGN KEY (user_low)
    REFERENCES public.profiles (id) ON DELETE CASCADE,
  CONSTRAINT friendships_user_high_fkey FOREIGN KEY (user_high)
    REFERENCES public.profiles (id) ON DELETE CASCADE,
  CONSTRAINT friendships_requester_id_fkey FOREIGN KEY (requester_id)
    REFERENCES public.profiles (id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- admin_emails
-- ---------------------------------------------------------------------------
-- Allowlist of addresses that get the admin role. Single column, email is the
-- primary key.
CREATE TABLE public.admin_emails (
  email text NOT NULL,
  CONSTRAINT admin_emails_pkey PRIMARY KEY (email)
);

-- ---------------------------------------------------------------------------
-- support_providers
-- ---------------------------------------------------------------------------
-- The WiseShare volunteer pool. Empty in the live database, so the sample of
-- real values that informed the optional CHECKs below covers this table least.
-- Rows arrive two ways: entered by staff ('manual') or imported from the CYC
-- website's Wix registration form by the sync-cyc-registrations cron
-- ('cyc_registration', 024_cyc_registration_providers.sql).
CREATE TABLE public.support_providers (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
  display_name        text        NOT NULL,
  provider_type       text        NOT NULL,
  languages           text[]      NOT NULL,
  skills              text[]      NOT NULL,
  interests           text[]      NOT NULL,
  service_modes       text[]      NOT NULL,
  locations           text[]      NOT NULL,
  availability        text        NOT NULL DEFAULT '',
  successful_matches  integer     NOT NULL DEFAULT 0,
  verified            boolean     NOT NULL DEFAULT false,
  active              boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  source              text        NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'cyc_registration')),
  -- Wix data item id of the CYC registration this provider was imported from.
  external_id         text,
  email               text        NOT NULL DEFAULT '',
  phone               text        NOT NULL DEFAULT '',
  school              text        NOT NULL DEFAULT '',
  grade               text        NOT NULL DEFAULT '',
  synced_at           timestamptz,
  CONSTRAINT support_providers_pkey PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- support_requests
-- ---------------------------------------------------------------------------
-- A help request plus the AI triage attached to it. updated_at is set by hand
-- in the server actions; no trigger.
CREATE TABLE public.support_requests (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid(),
  requester_id         uuid        NOT NULL,
  request_text         text        NOT NULL,
  assistance_type      text        NOT NULL,
  urgency              text        NOT NULL,
  preferred_language   text        NOT NULL,
  location             text        NOT NULL DEFAULT '',
  service_mode         text        NOT NULL,
  availability         text        NOT NULL DEFAULT '',
  required_skills      text[]      NOT NULL,
  provider_preference  text        NOT NULL,
  safety_level         text        NOT NULL,
  recommended_tier     text        NOT NULL,
  assessment_summary   text        NOT NULL,
  safety_reason        text        NOT NULL,
  share_summary        text        NOT NULL,
  match_score          integer,
  matched_provider_id  uuid,
  status               text        NOT NULL DEFAULT 'open',
  feedback             text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_requests_pkey PRIMARY KEY (id),
  CONSTRAINT support_requests_requester_id_fkey FOREIGN KEY (requester_id)
    REFERENCES public.profiles (id) ON DELETE CASCADE,
  CONSTRAINT support_requests_matched_provider_id_fkey FOREIGN KEY (matched_provider_id)
    REFERENCES public.support_providers (id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
-- The unique constraints above already index their columns. These cover the
-- remaining foreign keys and the app's hot lookups. They are not read from the
-- live database — PostgREST does not expose indexes — but they only affect
-- performance, never whether a write succeeds.
CREATE INDEX sessions_guest_id_idx             ON public.sessions (guest_id);
CREATE INDEX sessions_created_at_idx           ON public.sessions (created_at DESC);
CREATE INDEX circle_shares_owner_id_idx        ON public.circle_shares (owner_id);
CREATE INDEX conversation_comments_session_idx ON public.conversation_comments (session_id, created_at);
CREATE INDEX conversation_comments_author_idx  ON public.conversation_comments (author_id);
CREATE INDEX guest_memories_last_session_idx   ON public.guest_memories (last_session_id);
CREATE INDEX friendships_user_high_idx         ON public.friendships (user_high);
CREATE INDEX friendships_requester_id_idx      ON public.friendships (requester_id);
CREATE INDEX guests_user_id_idx                ON public.guests (user_id);
CREATE INDEX support_requests_requester_idx    ON public.support_requests (requester_id);
CREATE INDEX support_requests_provider_idx     ON public.support_requests (matched_provider_id);

-- Unlike the indexes above, this one enforces correctness: Wix data item ids
-- are the CYC sync key, one provider row per registration. Manual rows leave
-- external_id null, and Postgres allows repeated nulls in a unique index, so
-- one index covers both sources (024_cyc_registration_providers.sql).
CREATE UNIQUE INDEX support_providers_external_idx
  ON public.support_providers (external_id);

-- ---------------------------------------------------------------------------
-- Quota functions (from 022_video_generation_quota.sql and
-- 023_video_scene_regeneration_limit.sql)
-- ---------------------------------------------------------------------------
-- The app calls these through .rpc() in src/lib/memoir/workflow.ts. Bodies are
-- verbatim from the migrations; only the Supabase-specific armour is dropped:
-- SECURITY DEFINER and the REVOKE/GRANT on anon/authenticated/service_role.
-- Those roles do not exist here — every connection is the single app role, so
-- "only the server may move the counter" holds by construction.

-- A single statement, so two overlapping requests can never both take the
-- last generation: Postgres re-checks the where clause against the row it
-- locked. Returns how many are left after the claim, or -1 when the account
-- is already at its cap (or has no profile row).
CREATE FUNCTION public.claim_video_generation(
  p_user_id uuid,
  p_limit integer
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
declare
  v_used integer;
begin
  update public.profiles
  set video_generations_used = video_generations_used + 1
  where id = p_user_id
    and video_generations_used < p_limit
  returning video_generations_used into v_used;

  if v_used is null then
    return -1;
  end if;
  return p_limit - v_used;
end;
$$;

-- Hands a claimed generation back when the job could not be started after
-- all, so a server error never costs the storyteller a film.
CREATE FUNCTION public.release_video_generation(p_user_id uuid)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  update public.profiles
  set video_generations_used = greatest(0, video_generations_used - 1)
  where id = p_user_id;
$$;

-- Claims one scene replacement and queues its scene in the same transaction.
-- The return value is the number left, or a negative result the server
-- translates:
--   -1 = the film used both replacements
--   -2 = the film is not ready (including a competing request)
--   -3 = that scene does not exist
CREATE FUNCTION public.claim_video_scene_regeneration(
  p_video_id uuid,
  p_scene_index integer,
  p_limit integer
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
declare
  v_remaining integer;
begin
  if not exists (
    select 1
    from public.conversation_video_scenes
    where video_id = p_video_id and idx = p_scene_index
  ) then
    return -3;
  end if;

  update public.conversation_videos
  set scene_regenerations_used = scene_regenerations_used + 1,
      status = 'generating',
      error_message = null,
      updated_at = now()
  where id = p_video_id
    and status = 'ready'
    and scene_regenerations_used < p_limit
  returning p_limit - scene_regenerations_used into v_remaining;

  if v_remaining is null then
    if exists (
      select 1
      from public.conversation_videos
      where id = p_video_id and scene_regenerations_used >= p_limit
    ) then
      return -1;
    end if;
    return -2;
  end if;

  update public.conversation_video_scenes
  set status = 'queued',
      provider_task_id = null,
      result_url = null,
      error_message = null,
      updated_at = now()
  where video_id = p_video_id and idx = p_scene_index;

  if not found then
    raise exception 'Scene disappeared while claiming its regeneration';
  end if;

  return v_remaining;
end;
$$;

COMMIT;

-- ===========================================================================
-- OPTIONAL: value constraints — read the note before enabling
-- ===========================================================================
-- PostgREST cannot report CHECK constraints, so whether the live database has
-- these is unknown. The value sets below are the union of the TypeScript union
-- types in src/lib/types.ts, src/lib/support/matching.ts and
-- src/app/admin/support/actions.ts with the distinct values actually present
-- in the live tables today.
--
-- Enabling them makes the schema stricter than what was verified: if the real
-- database allows a value not listed here, writes that used to succeed will
-- start failing. Enable only after confirming the lists are complete.
--
-- ALTER TABLE public.profiles
--   ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'family')),
--   ADD CONSTRAINT profiles_locale_check CHECK (locale IN ('en', 'zh-Hans', 'zh-Hant'));
--
-- ALTER TABLE public.guests
--   ADD CONSTRAINT guests_origin_check CHECK (origin IN ('admin_invite', 'self_serve', 'public'));
--
-- ALTER TABLE public.sessions
--   ADD CONSTRAINT sessions_status_check CHECK (status IN ('pending', 'recording', 'ready'));
--
-- ALTER TABLE public.transcript_turns
--   ADD CONSTRAINT transcript_turns_speaker_check CHECK (speaker IN ('ai', 'guest'));
--
-- ALTER TABLE public.friendships
--   ADD CONSTRAINT friendships_status_check CHECK (status IN ('pending', 'accepted')),
--   ADD CONSTRAINT friendships_order_check CHECK (user_low < user_high);
--
-- ALTER TABLE public.conversation_videos
--   ADD CONSTRAINT conversation_videos_status_check
--     CHECK (status IN ('planning', 'preparing', 'generating', 'rendering', 'ready', 'failed'));
--
-- ALTER TABLE public.conversation_video_scenes
--   ADD CONSTRAINT conversation_video_scenes_status_check
--     CHECK (status IN ('queued', 'running', 'succeeded', 'failed'));
--
-- ALTER TABLE public.support_providers
--   ADD CONSTRAINT support_providers_type_check
--     CHECK (provider_type IN ('high_school', 'college', 'staff'));
--
-- ALTER TABLE public.support_requests
--   ADD CONSTRAINT support_requests_assistance_type_check
--     CHECK (assistance_type IN ('technology', 'companionship', 'appointments', 'daily_tasks', 'other')),
--   ADD CONSTRAINT support_requests_urgency_check
--     CHECK (urgency IN ('routine', 'soon', 'urgent', 'emergency')),
--   ADD CONSTRAINT support_requests_service_mode_check
--     CHECK (service_mode IN ('virtual', 'nearby', 'either')),
--   ADD CONSTRAINT support_requests_provider_preference_check
--     CHECK (provider_preference IN ('high_school', 'college', 'staff', 'no_preference')),
--   ADD CONSTRAINT support_requests_safety_level_check
--     CHECK (safety_level IN ('volunteer_eligible', 'staff_required', 'emergency')),
--   ADD CONSTRAINT support_requests_recommended_tier_check
--     CHECK (recommended_tier IN ('high_school', 'college', 'staff', 'emergency')),
--   ADD CONSTRAINT support_requests_status_check
--     CHECK (status IN ('open', 'matched', 'accepted', 'in_progress', 'resolved', 'escalated', 'cancelled'));
