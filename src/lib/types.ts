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
