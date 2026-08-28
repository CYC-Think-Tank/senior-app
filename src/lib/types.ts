import type {
  conversationComments,
  conversationVideos,
  friendships,
  guests,
  profiles,
  sessions,
  transcriptTurns,
} from "@/lib/db/schema";

/**
 * The domain vocabulary, plus the row shapes inferred from the schema.
 *
 * The shapes used to be written out by hand, one field at a time, and had to
 * be kept in step with the database by remembering to. They are derived now,
 * so a column that changes shows up as a type error at every place that reads
 * it. What stays hand-written is the part the database does not know: the
 * unions behind the `text` columns, and the drafts that never touch a table.
 *
 * Field names are camelCase because that is what Drizzle returns. The JSON the
 * iOS app receives is mapped explicitly in each route and is unaffected.
 */

export type Role = "admin" | "family";

export type Profile = typeof profiles.$inferSelect & {
  role: Role;
  locale: "en" | "zh-Hans" | "zh-Hant";
};

/** How a storyteller got here; only `admin_invite` shows on the admin side. */
export type GuestOrigin = "admin_invite" | "self_serve" | "public";

export type Guest = typeof guests.$inferSelect & { origin: GuestOrigin };

export type SessionStatus = "pending" | "recording" | "ready";

export type InterviewSession = typeof sessions.$inferSelect & {
  status: SessionStatus;
};

export type FriendshipStatus = "pending" | "accepted";

/**
 * One row per pair of accounts, with the ids in a fixed order — `userLow` is
 * always the smaller uuid. Normalise through `friendshipPair()` before
 * querying; see supabase/migrations/013_friend_circle.sql.
 */
export type Friendship = typeof friendships.$inferSelect & {
  status: FriendshipStatus;
};

export type ConversationComment = typeof conversationComments.$inferSelect;

export type Speaker = "ai" | "guest";

export type TranscriptTurn = typeof transcriptTurns.$inferSelect & {
  speaker: Speaker;
};

/** A finished turn assembled client-side during the live interview. */
export type TurnDraft = {
  speaker: Speaker;
  text: string;
  startMs: number;
  endMs: number;
};

export type ConversationVideoStatus =
  | "planning"
  | "preparing"
  | "generating"
  | "rendering"
  | "ready"
  | "failed";

export type ConversationVideo = typeof conversationVideos.$inferSelect & {
  status: ConversationVideoStatus;
};
