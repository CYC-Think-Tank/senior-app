export type Role = "admin" | "family";

export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  locale: "en" | "zh-Hans" | "zh-Hant";
  role: Role;
  created_at: string;
};

/** How a storyteller got here; only `admin_invite` shows on the admin side. */
export type GuestOrigin = "admin_invite" | "self_serve" | "public";

export type Guest = {
  id: string;
  user_id: string | null;
  name: string;
  bio: string | null;
  photo_path: string | null;
  topics: string[] | null;
  language: string;
  /** Null falls back to REALTIME_VOICE rather than pinning today's default. */
  voice: string | null;
  origin: GuestOrigin;
  created_at: string;
};

export type SessionStatus = "pending" | "recording" | "ready";

export type InterviewSession = {
  id: string;
  guest_id: string;
  token: string;
  topic: string | null;
  title: string | null;
  status: SessionStatus;
  /** Sealed JSON: the share page's takeaway, per locale. Null until asked for. */
  moral: string | null;
  raw_audio_path: string | null;
  share_token: string | null;
  started_at: string | null;
  /** Last time the live interview saved its progress; null before it starts. */
  last_checkpoint_at: string | null;
  duration_ms: number | null;
  created_at: string;
};

export type FriendshipStatus = "pending" | "accepted";

/**
 * One row per pair of accounts, with the ids in a fixed order — `user_low` is
 * always the smaller uuid. Normalise through `friendshipPair()` before
 * querying; see supabase/migrations/013_friend_circle.sql.
 */
export type Friendship = {
  id: string;
  user_low: string;
  user_high: string;
  /** Who sent the request. Decides who may accept while status is pending. */
  requester_id: string;
  status: FriendshipStatus;
  created_at: string;
  responded_at: string | null;
};

/** Presence of the row *is* the whole-circle sharing switch for a session. */
export type CircleShare = {
  session_id: string;
  /** Denormalised from guests.user_id so the friend policy stays one compare. */
  owner_id: string;
  created_at: string;
};

export type ConversationComment = {
  id: string;
  session_id: string;
  author_id: string;
  /** The author's name when they wrote it; see migration 016 for why. */
  author_name: string;
  body: string;
  created_at: string;
};

export type Speaker = "ai" | "guest";

export type TranscriptTurn = {
  id: string;
  session_id: string;
  idx: number;
  speaker: Speaker;
  text: string;
  start_ms: number;
  end_ms: number;
  excluded: boolean;
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

export type ConversationVideo = {
  id: string;
  session_id: string;
  status: ConversationVideoStatus;
  title: string | null;
  story_ciphertext: string | null;
  narration_ciphertext: string | null;
  visual_bible_ciphertext: string | null;
  narration_path: string | null;
  video_path: string | null;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};
