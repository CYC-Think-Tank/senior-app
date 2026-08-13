// Branding is a placeholder — swap APP_NAME/TAGLINE when a real name is chosen.
export const APP_NAME = "WiseShare";
// Both Chinese locales share one wordmark; only the surrounding copy differs.
export const APP_NAME_ZH = "慧仁享";
export const TAGLINE = "Every life is worth the telling.";

// Use the faster, lower-cost distilled realtime model for interview sessions.
export const REALTIME_MODEL = "gpt-realtime-2.1-mini";
export const REALTIME_VOICE = "marin";
export const CHAT_MODEL = "gpt-5-mini";

// Distilling a finished transcript into one sentence is a small, offline job
// that nobody waits on mid-conversation, so it runs on a cheap text model
// rather than the realtime one.
export const MORAL_MODEL = "gpt-4.1-mini";
// Continuity notes are another small structured extraction job. Keeping this
// separate makes the model independently replaceable if memory evals call for
// a different cost/quality tradeoff later.
export const MEMORY_MODEL = "gpt-4.1-mini";

/**
 * The built-in voices the Realtime model accepts, in the order they are offered
 * to storytellers. OpenAI recommends `marin` and `cedar` for quality, so those
 * lead and the rest follow in the SDK's own order. Kept in step with the `voice`
 * union in node_modules/openai/resources/realtime/realtime.d.ts.
 */
export const REALTIME_VOICES = [
  "marin",
  "cedar",
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
] as const;

export type RealtimeVoice = (typeof REALTIME_VOICES)[number];

/** Guards a stored or submitted voice before it reaches the Realtime API. */
export function isRealtimeVoice(value: unknown): value is RealtimeVoice {
  return REALTIME_VOICES.includes(value as RealtimeVoice);
}

export const RAW_BUCKET = "raw-audio";
export const STORY_VIDEOS_BUCKET = "story-videos";

export const SEEGEN_MODEL = "sd2-mini";
// Pin memoir narration so one saved film never changes voice between retries.
// OpenAI recommends cedar (along with marin) for its highest-quality built-in
// speech, and the instruction-following TTS model lets us set a documentary
// cadence without imitating the storyteller's real voice.
export const MEMOIR_TTS_MODEL = "gpt-4o-mini-tts-2025-12-15";
export const MEMOIR_TTS_VOICE = "cedar";
// Nine 14-second scenes, overlapped by 0.75 seconds at each of eight joins,
// produce exactly 120 seconds. Each shot still has a stable 12.5-second area
// for its full narration sentence, within Seedance Mini's 15-second limit.
export const MEMOIR_MAX_OUTPUT_SECONDS = 120;
export const MEMOIR_SCENE_DURATION_SECONDS = 14;
export const MEMOIR_TRANSITION_SECONDS = 0.75;
export const MEMOIR_MIN_SCENES = 9;
export const MEMOIR_MAX_SCENES = 9;
export const MEMOIR_OUTPUT_WIDTH = 854;
export const MEMOIR_OUTPUT_HEIGHT = 480;

// A live interview heartbeats every 15s, so a session still marked
// 'recording' after this long lost its tab. Kept in step with the family
// sessions RLS policy in migration 005 — change both together.
export const ABANDONED_AFTER_MS = 1 * 60 * 1000;

// How long an unfinished conversation from the public /interview flow is kept
// before it is trashed. Its guest belongs to no family and no account, so
// nothing will ever surface it — but a day's grace means someone who walks
// away mid-conversation can still reopen their link and pick it back up.
export const ANON_RETENTION_MS = 24 * 60 * 60 * 1000;
