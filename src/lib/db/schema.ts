/**
 * Drizzle mirror of supabase/migrations/001_migrate_azure.sql.
 *
 * Column *keys* are snake_case on purpose: they match the database column
 * names, which is also what the app already reads (`session.raw_audio_path`,
 * `profile.display_name`). Supabase's REST layer returned rows in that shape,
 * so keeping it means the port changes how rows are *fetched* without
 * changing how they are *read*.
 *
 * Anything changed here needs a matching SQL file applied with psql — see
 * Phase 1 of docs/azure-migration-plan.md. There is no automatic sync.
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { timestamptz } from "@/lib/db/columns";

/**
 * One row per signed-in account. `id` mirrors the auth user's id — Better Auth
 * supplies it (see src/lib/auth/config.ts, which pins ids to uuids), which is
 * why there is no default here.
 */
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  display_name: text("display_name"),
  role: text("role").$type<"admin" | "family">().notNull().default("family"),
  created_at: timestamptz("created_at").notNull().default(sql`now()`),
  locale: text("locale").$type<"en" | "zh-Hans" | "zh-Hant">().notNull().default("en"),
});

/**
 * The storyteller being interviewed. `user_id` is null for the throwaway guest
 * the public flow mints per conversation; when set it is an auth user id.
 */
export const guests = pgTable(
  "guests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    bio: text("bio"),
    photo_path: text("photo_path"),
    topics: text("topics").array(),
    language: text("language").notNull().default("English"),
    created_at: timestamptz("created_at").notNull().default(sql`now()`),
    user_id: uuid("user_id"),
    origin: text("origin")
      .$type<"admin_invite" | "self_serve" | "public">()
      .notNull()
      .default("public"),
    voice: text("voice"),
  },
  (table) => [index("guests_user_id_idx").on(table.user_id)]
);

/**
 * One interview. Deleting a session cascades to its transcript, circle share,
 * comments and generated video; src/lib/sessions/trash.ts relies on that and
 * deletes only the session row.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guest_id: uuid("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    // Postgres mints the interview token, so it never has to be supplied on
    // insert — matching the default in 001_migrate_azure.sql. gen_random_bytes
    // comes from pgcrypto, which the migration installs.
    token: text("token")
      .notNull()
      .unique()
      .default(sql`encode(gen_random_bytes(24), 'hex')`),
    topic: text("topic"),
    status: text("status")
      .$type<"pending" | "recording" | "ready">()
      .notNull()
      .default("pending"),
    raw_audio_path: text("raw_audio_path"),
    started_at: timestamptz("started_at"),
    duration_ms: integer("duration_ms"),
    created_at: timestamptz("created_at").notNull().default(sql`now()`),
    share_token: text("share_token").unique(),
    title: text("title"),
    recording_consent_at: timestamptz("recording_consent_at"),
    moral: text("moral"),
    last_checkpoint_at: timestamptz("last_checkpoint_at"),
  },
  (table) => [
    index("sessions_guest_id_idx").on(table.guest_id),
    index("sessions_created_at_idx").on(table.created_at.desc()),
  ]
);

/**
 * `text` holds ciphertext (AES-256-GCM, AUDIO_ENCRYPTION_KEY), not plaintext.
 * (session_id, idx) is the upsert target in src/lib/transcript/save-turns.ts.
 */
export const transcriptTurns = pgTable(
  "transcript_turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    session_id: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    speaker: text("speaker").$type<"ai" | "guest">().notNull(),
    text: text("text").notNull(),
    start_ms: integer("start_ms").notNull(),
    end_ms: integer("end_ms").notNull(),
    excluded: boolean("excluded").notNull().default(false),
  },
  (table) => [
    unique("transcript_turns_session_id_idx_key").on(table.session_id, table.idx),
  ]
);

/**
 * The presence of the row is the whole-circle sharing switch for a session.
 * `owner_id` is denormalised from guests.user_id.
 */
export const circleShares = pgTable(
  "circle_shares",
  {
    session_id: uuid("session_id")
      .primaryKey()
      .references(() => sessions.id, { onDelete: "cascade" }),
    owner_id: uuid("owner_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    created_at: timestamptz("created_at").notNull().default(sql`now()`),
  },
  (table) => [index("circle_shares_owner_id_idx").on(table.owner_id)]
);

/**
 * `author_name` is a snapshot of the author's name at write time, so the
 * comment still reads correctly if they later rename themselves.
 */
export const conversationComments = pgTable(
  "conversation_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    session_id: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    author_id: uuid("author_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    author_name: text("author_name").notNull(),
    body: text("body").notNull(),
    created_at: timestamptz("created_at").notNull().default(sql`now()`),
  },
  (table) => [
    index("conversation_comments_session_idx").on(table.session_id, table.created_at),
    index("conversation_comments_author_idx").on(table.author_id),
  ]
);

/**
 * The generated memoir video for a session. `updated_at` is written explicitly
 * by the app and used as an optimistic-lock token (src/lib/memoir/workflow.ts
 * claims a stale "rendering" row by matching on it), so do NOT attach a
 * trigger that bumps it automatically — that would break the compare-and-swap.
 */
export const conversationVideos = pgTable("conversation_videos", {
  id: uuid("id").primaryKey().defaultRandom(),
  session_id: uuid("session_id")
    .notNull()
    .unique()
    .references(() => sessions.id, { onDelete: "cascade" }),
  status: text("status")
    .$type<"planning" | "preparing" | "generating" | "rendering" | "ready" | "failed">()
    .notNull()
    .default("planning"),
  title: text("title"),
  story_ciphertext: text("story_ciphertext"),
  narration_ciphertext: text("narration_ciphertext"),
  visual_bible_ciphertext: text("visual_bible_ciphertext"),
  narration_path: text("narration_path"),
  video_path: text("video_path"),
  duration_ms: integer("duration_ms"),
  error_message: text("error_message"),
  created_at: timestamptz("created_at").notNull().default(sql`now()`),
  updated_at: timestamptz("updated_at").notNull().default(sql`now()`),
});

/**
 * (video_id, idx) is the upsert target in src/lib/memoir/workflow.ts.
 * Same `updated_at` caveat as conversation_videos: written by hand, no trigger.
 */
export const conversationVideoScenes = pgTable(
  "conversation_video_scenes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    video_id: uuid("video_id")
      .notNull()
      .references(() => conversationVideos.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    prompt_ciphertext: text("prompt_ciphertext").notNull(),
    duration_seconds: integer("duration_seconds").notNull(),
    provider_task_id: text("provider_task_id"),
    status: text("status")
      .$type<"queued" | "running" | "succeeded" | "failed">()
      .notNull()
      .default("queued"),
    result_url: text("result_url"),
    error_message: text("error_message"),
    created_at: timestamptz("created_at").notNull().default(sql`now()`),
    updated_at: timestamptz("updated_at").notNull().default(sql`now()`),
  },
  (table) => [
    unique("conversation_video_scenes_video_id_idx_key").on(table.video_id, table.idx),
  ]
);

/**
 * What the AI remembers about a storyteller between conversations, one row per
 * guest. The memory must outlive the session it was last built from, so
 * `last_session_id` is set null on delete rather than cascading. `updated_at`
 * is the compare-and-swap token in src/lib/memory/summary.ts — again, no
 * trigger.
 */
export const guestMemories = pgTable(
  "guest_memories",
  {
    guest_id: uuid("guest_id")
      .primaryKey()
      .references(() => guests.id, { onDelete: "cascade" }),
    summary_ciphertext: text("summary_ciphertext").notNull(),
    last_session_id: uuid("last_session_id").references(() => sessions.id, {
      onDelete: "set null",
    }),
    last_session_created_at: timestamptz("last_session_created_at").notNull(),
    updated_at: timestamptz("updated_at").notNull().default(sql`now()`),
  },
  (table) => [index("guest_memories_last_session_idx").on(table.last_session_id)]
);

/**
 * One row per pair of accounts, ids stored in a fixed order: `user_low` is
 * always the smaller uuid. Normalise through `friendshipPair()` before
 * querying.
 */
export const friendships = pgTable(
  "friendships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_low: uuid("user_low")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    user_high: uuid("user_high")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    requester_id: uuid("requester_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    status: text("status").$type<"pending" | "accepted">().notNull().default("pending"),
    created_at: timestamptz("created_at").notNull().default(sql`now()`),
    responded_at: timestamptz("responded_at"),
  },
  (table) => [
    unique("friendships_user_low_user_high_key").on(table.user_low, table.user_high),
    index("friendships_user_high_idx").on(table.user_high),
    index("friendships_requester_id_idx").on(table.requester_id),
  ]
);

/** Allowlist of addresses that get the admin role on signup. */
export const adminEmails = pgTable("admin_emails", {
  email: text("email").primaryKey(),
});

/** The WiseShare volunteer pool. */
export const supportProviders = pgTable("support_providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  display_name: text("display_name").notNull(),
  provider_type: text("provider_type")
    .$type<"high_school" | "college" | "staff">()
    .notNull(),
  languages: text("languages").array().notNull(),
  skills: text("skills").array().notNull(),
  interests: text("interests").array().notNull(),
  service_modes: text("service_modes").array().notNull(),
  locations: text("locations").array().notNull(),
  availability: text("availability").notNull().default(""),
  successful_matches: integer("successful_matches").notNull().default(0),
  verified: boolean("verified").notNull().default(false),
  active: boolean("active").notNull().default(true),
  created_at: timestamptz("created_at").notNull().default(sql`now()`),
});

/**
 * A help request plus the AI triage attached to it. `updated_at` is set by hand
 * in the server actions; no trigger.
 */
export const supportRequests = pgTable(
  "support_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requester_id: uuid("requester_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    request_text: text("request_text").notNull(),
    assistance_type: text("assistance_type").notNull(),
    urgency: text("urgency").notNull(),
    preferred_language: text("preferred_language").notNull(),
    location: text("location").notNull().default(""),
    service_mode: text("service_mode").notNull(),
    availability: text("availability").notNull().default(""),
    required_skills: text("required_skills").array().notNull(),
    provider_preference: text("provider_preference").notNull(),
    safety_level: text("safety_level").notNull(),
    recommended_tier: text("recommended_tier").notNull(),
    assessment_summary: text("assessment_summary").notNull(),
    safety_reason: text("safety_reason").notNull(),
    share_summary: text("share_summary").notNull(),
    match_score: integer("match_score"),
    matched_provider_id: uuid("matched_provider_id").references(
      () => supportProviders.id,
      { onDelete: "set null" }
    ),
    status: text("status").notNull().default("open"),
    feedback: text("feedback"),
    created_at: timestamptz("created_at").notNull().default(sql`now()`),
    updated_at: timestamptz("updated_at").notNull().default(sql`now()`),
  },
  (table) => [
    index("support_requests_requester_idx").on(table.requester_id),
    index("support_requests_provider_idx").on(table.matched_provider_id),
  ]
);

// ---------------------------------------------------------------------------
// Better Auth
// ---------------------------------------------------------------------------
// Better Auth owns these four tables. They are prefixed `auth_` so nothing
// collides with the app's own `sessions`, and their ids are uuids so
// `profiles.id` and `guests.user_id` keep the uuid type the schema already
// assumes. Field names are Better Auth's own camelCase contract — do not
// rename them to match the snake_case tables above.

export const authUsers = pgTable("auth_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamptz("created_at").notNull().default(sql`now()`),
  updatedAt: timestamptz("updated_at").notNull().default(sql`now()`),
});

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    // Postgres mints the interview token, so it never has to be supplied on
    // insert — matching the default in 001_migrate_azure.sql. gen_random_bytes
    // comes from pgcrypto, which the migration installs.
    token: text("token")
      .notNull()
      .unique()
      .default(sql`encode(gen_random_bytes(24), 'hex')`),
    expiresAt: timestamptz("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamptz("created_at").notNull().default(sql`now()`),
    updatedAt: timestamptz("updated_at").notNull().default(sql`now()`),
  },
  (table) => [index("auth_sessions_user_id_idx").on(table.userId)]
);

export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamptz("access_token_expires_at"),
    refreshTokenExpiresAt: timestamptz("refresh_token_expires_at"),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    createdAt: timestamptz("created_at").notNull().default(sql`now()`),
    updatedAt: timestamptz("updated_at").notNull().default(sql`now()`),
  },
  (table) => [index("auth_accounts_user_id_idx").on(table.userId)]
);

export const authVerifications = pgTable(
  "auth_verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    createdAt: timestamptz("created_at").notNull().default(sql`now()`),
    updatedAt: timestamptz("updated_at").notNull().default(sql`now()`),
  },
  (table) => [index("auth_verifications_identifier_idx").on(table.identifier)]
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------
// Declared for the joins the app actually performs: sessions↔guests is the one
// supabase-js expressed as `guests!inner(user_id)` and it appears in almost
// every ownership check.

export const guestsRelations = relations(guests, ({ many, one }) => ({
  sessions: many(sessions),
  memory: one(guestMemories, {
    fields: [guests.id],
    references: [guestMemories.guest_id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  guest: one(guests, {
    fields: [sessions.guest_id],
    references: [guests.id],
  }),
  turns: many(transcriptTurns),
  comments: many(conversationComments),
  circleShare: one(circleShares, {
    fields: [sessions.id],
    references: [circleShares.session_id],
  }),
  video: one(conversationVideos, {
    fields: [sessions.id],
    references: [conversationVideos.session_id],
  }),
}));

export const transcriptTurnsRelations = relations(transcriptTurns, ({ one }) => ({
  session: one(sessions, {
    fields: [transcriptTurns.session_id],
    references: [sessions.id],
  }),
}));

export const conversationVideosRelations = relations(
  conversationVideos,
  ({ one, many }) => ({
    session: one(sessions, {
      fields: [conversationVideos.session_id],
      references: [sessions.id],
    }),
    scenes: many(conversationVideoScenes),
  })
);

export const conversationVideoScenesRelations = relations(
  conversationVideoScenes,
  ({ one }) => ({
    video: one(conversationVideos, {
      fields: [conversationVideoScenes.video_id],
      references: [conversationVideos.id],
    }),
  })
);

export const conversationCommentsRelations = relations(
  conversationComments,
  ({ one }) => ({
    session: one(sessions, {
      fields: [conversationComments.session_id],
      references: [sessions.id],
    }),
    author: one(profiles, {
      fields: [conversationComments.author_id],
      references: [profiles.id],
    }),
  })
);

export const circleSharesRelations = relations(circleShares, ({ one }) => ({
  session: one(sessions, {
    fields: [circleShares.session_id],
    references: [sessions.id],
  }),
  owner: one(profiles, {
    fields: [circleShares.owner_id],
    references: [profiles.id],
  }),
}));

export const supportRequestsRelations = relations(supportRequests, ({ one }) => ({
  requester: one(profiles, {
    fields: [supportRequests.requester_id],
    references: [profiles.id],
  }),
  matchedProvider: one(supportProviders, {
    fields: [supportRequests.matched_provider_id],
    references: [supportProviders.id],
  }),
}));
