// Branding is a placeholder — swap APP_NAME/TAGLINE when a real name is chosen.
export const APP_NAME = "Fireside";
export const TAGLINE = "Every life is worth the telling.";

// Use the faster, lower-cost distilled realtime model for interview sessions.
export const REALTIME_MODEL = "gpt-realtime-2.1-mini";
export const REALTIME_VOICE = "marin";
export const CHAT_MODEL = "gpt-5-mini";

export const RAW_BUCKET = "raw-audio";
export const EPISODES_BUCKET = "episodes";

// A live interview checkpoints every 30s, so a session still marked
// 'recording' after this long lost its tab. Kept in step with the family
// sessions RLS policy in migration 004 — change both together.
export const ABANDONED_AFTER_MS = 2 * 60 * 1000;

// Padding applied around kept transcript turns when rendering the edited cut,
// to absorb timestamp imprecision from the live event stream.
export const CUT_PADDING_MS = 250;
// Kept ranges closer together than this are merged into one segment.
export const MERGE_GAP_MS = 400;
