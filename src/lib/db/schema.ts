import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * The Azure schema, mirroring supabase/migrations/001_migrate_azure.sql and
 * 002_better_auth.sql. Those files remain the source of truth for the database
 * itself; this is the typed view the app queries through.
 *
 * Every timestamptz column is `mode: "string"`. The app has always treated
 * these as ISO strings (see src/lib/types.ts), two of them are optimistic-lock
 * tokens that must survive a round trip unchanged, and src/lib/db/index.ts
 * installs the type parser that keeps them strings. Changing any one of those
 * three without the others breaks the locks silently.
 */
const timestamptz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "string" });

// ---------------------------------------------------------------------------
// Application tables
// ---------------------------------------------------------------------------

/** One row per signed-in account. `id` is the Better Auth user id. */
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  role: text("role").notNull().default("family"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  locale: text("locale").notNull().default("en"),
  conversationLanguageChosenAt: timestamptz("conversation_language_chosen_at"),
  videoGenerationsUsed: integer("video_generations_used").notNull().default(0),
});

/**
 * The storyteller being interviewed. `userId` is null for the throwaway guest
 * the public /interview flow mints per conversation; the partial unique index
 * in 002_better_auth.sql is what holds "at most one guest row per account".
 */
export const guests = pgTable("guests", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  bio: text("bio"),
  photoPath: text("photo_path"),
  topics: text("topics").array(),
  language: text("language").notNull().default("English"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  userId: uuid("user_id"),
  origin: text("origin").notNull().default("public"),
  voice: text("voice"),
});

/**
 * One interview. Deleting a session cascades to its transcript, circle share,
 * comments and generated video — src/lib/sessions/trash.ts relies on that and
 * deletes only the session row.
 */
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  guestId: uuid("guest_id").notNull(),
  // The capability that opens /interview/<token>. Minted by the database so
  // it is never chosen by a caller; declared here so Drizzle knows an insert
  // may leave it out.
  token: text("token")
    .notNull()
    .unique()
    .default(sql`encode(gen_random_bytes(24), 'hex')`),
  topic: text("topic"),
  status: text("status").notNull().default("pending"),
  rawAudioPath: text("raw_audio_path"),
  startedAt: timestamptz("started_at"),
  durationMs: integer("duration_ms"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  shareToken: text("share_token").unique(),
  title: text("title"),
  recordingConsentAt: timestamptz("recording_consent_at"),
  moral: text("moral"),
  lastCheckpointAt: timestamptz("last_checkpoint_at"),
});

/** `text` holds ciphertext (AES-256-GCM), not plaintext. */
export const transcriptTurns = pgTable(
  "transcript_turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").notNull(),
    idx: integer("idx").notNull(),
    speaker: text("speaker").notNull(),
    text: text("text").notNull(),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    excluded: boolean("excluded").notNull().default(false),
  },
  (table) => [
    uniqueIndex("transcript_turns_session_id_idx_key").on(
      table.sessionId,
      table.idx,
    ),
  ],
);

/** Presence of the row *is* the whole-circle sharing switch for a session. */
export const circleShares = pgTable("circle_shares", {
  sessionId: uuid("session_id").primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

export const conversationComments = pgTable("conversation_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull(),
  authorId: uuid("author_id").notNull(),
  authorName: text("author_name").notNull(),
  body: text("body").notNull(),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

/**
 * `updatedAt` is written explicitly by the app and used as an optimistic-lock
 * token, which is why no trigger bumps it — see the note in the migration.
 */
export const conversationVideos = pgTable("conversation_videos", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().unique(),
  status: text("status").notNull().default("planning"),
  title: text("title"),
  storyCiphertext: text("story_ciphertext"),
  narrationCiphertext: text("narration_ciphertext"),
  visualBibleCiphertext: text("visual_bible_ciphertext"),
  narrationPath: text("narration_path"),
  videoPath: text("video_path"),
  durationMs: integer("duration_ms"),
  errorMessage: text("error_message"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  sceneRegenerationsUsed: integer("scene_regenerations_used")
    .notNull()
    .default(0),
});

export const conversationVideoScenes = pgTable(
  "conversation_video_scenes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    videoId: uuid("video_id").notNull(),
    idx: integer("idx").notNull(),
    promptCiphertext: text("prompt_ciphertext").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    providerTaskId: text("provider_task_id"),
    status: text("status").notNull().default("queued"),
    resultUrl: text("result_url"),
    errorMessage: text("error_message"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("conversation_video_scenes_video_id_idx_key").on(
      table.videoId,
      table.idx,
    ),
  ],
);

/** Private continuity notes. `updatedAt` is a compare-and-swap token here too. */
export const guestMemories = pgTable("guest_memories", {
  guestId: uuid("guest_id").primaryKey(),
  summaryCiphertext: text("summary_ciphertext").notNull(),
  lastSessionId: uuid("last_session_id"),
  lastSessionCreatedAt: timestamptz("last_session_created_at").notNull(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

/** One row per pair of accounts; `userLow` is always the smaller uuid. */
export const friendships = pgTable(
  "friendships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userLow: uuid("user_low").notNull(),
    userHigh: uuid("user_high").notNull(),
    requesterId: uuid("requester_id").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    respondedAt: timestamptz("responded_at"),
  },
  (table) => [
    uniqueIndex("friendships_user_low_user_high_key").on(
      table.userLow,
      table.userHigh,
    ),
  ],
);

/** Allowlist of addresses that get the admin role. Lowercase, see seed.sql. */
export const adminEmails = pgTable("admin_emails", {
  email: text("email").primaryKey(),
});

export const supportProviders = pgTable("support_providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayName: text("display_name").notNull(),
  providerType: text("provider_type").notNull(),
  languages: text("languages").array().notNull(),
  skills: text("skills").array().notNull(),
  interests: text("interests").array().notNull(),
  serviceModes: text("service_modes").array().notNull(),
  locations: text("locations").array().notNull(),
  availability: text("availability").notNull().default(""),
  successfulMatches: integer("successful_matches").notNull().default(0),
  verified: boolean("verified").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  source: text("source").notNull().default("manual"),
  /** Wix data item id of the CYC registration this provider was imported from. */
  externalId: text("external_id"),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  school: text("school").notNull().default(""),
  grade: text("grade").notNull().default(""),
  syncedAt: timestamptz("synced_at"),
});

export const supportRequests = pgTable("support_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  requesterId: uuid("requester_id").notNull(),
  requestText: text("request_text").notNull(),
  assistanceType: text("assistance_type").notNull(),
  urgency: text("urgency").notNull(),
  preferredLanguage: text("preferred_language").notNull(),
  location: text("location").notNull().default(""),
  serviceMode: text("service_mode").notNull(),
  availability: text("availability").notNull().default(""),
  requiredSkills: text("required_skills").array().notNull(),
  providerPreference: text("provider_preference").notNull(),
  safetyLevel: text("safety_level").notNull(),
  recommendedTier: text("recommended_tier").notNull(),
  assessmentSummary: text("assessment_summary").notNull(),
  safetyReason: text("safety_reason").notNull(),
  shareSummary: text("share_summary").notNull(),
  matchScore: integer("match_score"),
  matchedProviderId: uuid("matched_provider_id"),
  status: text("status").notNull().default("open"),
  feedback: text("feedback"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Better Auth
// ---------------------------------------------------------------------------
// Property names here are Better Auth's field contract (camelCase) and the
// adapter looks them up by name, so they must not be renamed to match the
// snake_case of the tables above. The column names are the snake_case ones.

export const authUsers = pgTable("auth_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

/** One row per signed-in browser or device; `token` is the session cookie. */
export const authSessions = pgTable("auth_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamptz("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

/** Email/password sign-in stores one row per user with the hash in `password`. */
export const authAccounts = pgTable("auth_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  issuer: text("issuer").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamptz("access_token_expires_at"),
  refreshTokenExpiresAt: timestamptz("refresh_token_expires_at"),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

/** Short-lived one-time tokens: password-reset links, email verification. */
export const authVerifications = pgTable("auth_verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamptz("expires_at").notNull(),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});
