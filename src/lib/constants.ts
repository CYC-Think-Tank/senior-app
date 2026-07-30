// Branding is a placeholder — swap APP_NAME/TAGLINE when a real name is chosen.
export const APP_NAME = "WiseShare";
export const TAGLINE = "Every life is worth the telling.";

// Use the faster, lower-cost distilled realtime model for interview sessions.
export const REALTIME_MODEL = "gpt-realtime-2.1-mini";
export const REALTIME_VOICE = "marin";
export const CHAT_MODEL = "gpt-5-mini";

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
export const EPISODES_BUCKET = "episodes";

// A live interview heartbeats every 15s, so a session still marked
// 'recording' after this long lost its tab. Kept in step with the family
// sessions RLS policy in migration 005 — change both together.
export const ABANDONED_AFTER_MS = 1 * 60 * 1000;

// How long an unfinished conversation from the public /interview flow is kept
// before it is trashed. Its guest belongs to no family and no account, so
// nothing will ever surface it — but a day's grace means someone who walks
// away mid-conversation can still reopen their link and pick it back up.
export const ANON_RETENTION_MS = 24 * 60 * 60 * 1000;

// Padding applied around kept transcript turns when rendering the edited cut,
// to absorb timestamp imprecision from the live event stream.
export const CUT_PADDING_MS = 250;
// Kept ranges closer together than this are merged into one segment.
export const MERGE_GAP_MS = 400;
