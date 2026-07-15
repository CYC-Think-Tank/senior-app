// Branding is a placeholder — swap APP_NAME/TAGLINE when a real name is chosen.
export const APP_NAME = "Fireside";
export const TAGLINE = "Every life is worth the telling.";

// gpt-realtime-2.1 is the newest full-size realtime model; the plain
// "gpt-realtime" alias stays pinned to the older 2025-08-28 snapshot.
export const REALTIME_MODEL = "gpt-realtime-2.1";
export const REALTIME_VOICE = "marin";
export const CHAT_MODEL = "gpt-5-mini";

export const RAW_BUCKET = "raw-audio";
export const EPISODES_BUCKET = "episodes";

// Padding applied around kept transcript turns when rendering the edited cut,
// to absorb timestamp imprecision from the live event stream.
export const CUT_PADDING_MS = 250;
// Kept ranges closer together than this are merged into one segment.
export const MERGE_GAP_MS = 400;
