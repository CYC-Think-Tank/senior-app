export type Role = "admin" | "family";

export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  locale: "en" | "zh-Hans" | "zh-Hant";
  role: Role;
  /** Null for admins: they read every family through `is_admin()`. */
  family_id: string | null;
  created_at: string;
};

/** How a storyteller got here; only `admin_invite` shows on the admin side. */
export type GuestOrigin = "admin_invite" | "self_serve" | "public";

export type Guest = {
  id: string;
  user_id: string | null;
  family_id: string | null;
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
  raw_audio_path: string | null;
  share_token: string | null;
  started_at: string | null;
  /** Last time the live interview saved its progress; null before it starts. */
  last_checkpoint_at: string | null;
  duration_ms: number | null;
  created_at: string;
};

export type PodcastParticipationStatus =
  | "requested"
  | "invited"
  | "accepted"
  | "interview_done";

export type PodcastParticipation = {
  id: string;
  user_id: string;
  session_id: string | null;
  source: "request" | "admin_invite";
  request_kind: "existing_conversation" | "new_interview";
  status: PodcastParticipationStatus;
  created_at: string;
  updated_at: string;
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

export type EpisodeStatus =
  | "draft"
  | "pending_approval"
  | "changes_requested"
  | "approved"
  | "published";

export type Episode = {
  id: string;
  session_id: string;
  guest_id: string;
  episode_number: number;
  title: string;
  description: string | null;
  show_notes: string | null;
  audio_path: string;
  duration_ms: number | null;
  review_token: string;
  status: EpisodeStatus;
  change_note: string | null;
  publish_at: string | null;
  created_at: string;
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
