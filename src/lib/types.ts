export type Role = "admin" | "family";

export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  role: Role;
  created_at: string;
};

export type Guest = {
  id: string;
  name: string;
  bio: string | null;
  photo_path: string | null;
  topics: string[] | null;
  language: string;
  created_at: string;
};

export type SessionStatus = "pending" | "recording" | "ready";

export type InterviewSession = {
  id: string;
  guest_id: string;
  token: string;
  topic: string | null;
  status: SessionStatus;
  raw_audio_path: string | null;
  started_at: string | null;
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

export type FamilyAccess = {
  id: string;
  guest_id: string;
  user_id: string | null;
  invite_email: string | null;
  status: "pending" | "active";
  created_at: string;
};

/** A finished turn assembled client-side during the live interview. */
export type TurnDraft = {
  speaker: Speaker;
  text: string;
  startMs: number;
  endMs: number;
};
