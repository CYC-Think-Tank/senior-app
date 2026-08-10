export type AudioCut = {
  startMs: number;
  endMs: number;
};

/**
 * Cleans, clamps, sorts, and merges transcript ranges that should not play.
 * Keeping this logic shared means the player and every duration label describe
 * the same edited conversation.
 */
export function mergeAudioCuts(
  cuts: AudioCut[],
  totalDurationMs?: number | null,
): AudioCut[] {
  const limit =
    typeof totalDurationMs === "number" &&
    Number.isFinite(totalDurationMs) &&
    totalDurationMs >= 0
      ? totalDurationMs
      : Number.POSITIVE_INFINITY;

  const sorted = cuts
    .map((cut) => ({
      startMs: Math.max(0, cut.startMs),
      endMs: Math.min(limit, cut.endMs),
    }))
    .filter(
      (cut) =>
        Number.isFinite(cut.startMs) &&
        Number.isFinite(cut.endMs) &&
        cut.endMs > cut.startMs,
    )
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const merged: AudioCut[] = [];
  for (const cut of sorted) {
    const previous = merged.at(-1);
    if (previous && cut.startMs <= previous.endMs) {
      previous.endMs = Math.max(previous.endMs, cut.endMs);
    } else {
      merged.push({ ...cut });
    }
  }
  return merged;
}

export function editedAudioDurationMs(
  totalDurationMs: number | null | undefined,
  cuts: AudioCut[],
): number | null {
  if (
    typeof totalDurationMs !== "number" ||
    !Number.isFinite(totalDurationMs) ||
    totalDurationMs < 0
  ) {
    return null;
  }

  const removed = mergeAudioCuts(cuts, totalDurationMs).reduce(
    (sum, cut) => sum + cut.endMs - cut.startMs,
    0,
  );
  return Math.max(0, totalDurationMs - removed);
}

/** Maps a position in the original recording onto the shortened player. */
export function originalToEditedTimeMs(
  originalMs: number,
  cuts: AudioCut[],
): number {
  const position = Math.max(0, originalMs);
  let removed = 0;

  for (const cut of cuts) {
    if (position < cut.startMs) break;
    if (position < cut.endMs) return Math.max(0, cut.startMs - removed);
    removed += cut.endMs - cut.startMs;
  }

  return Math.max(0, position - removed);
}

/** Maps the shortened scrubber back to a seek point in the original file. */
export function editedToOriginalTimeMs(
  editedMs: number,
  totalDurationMs: number,
  cuts: AudioCut[],
): number {
  const target = Math.max(0, editedMs);
  let originalCursor = 0;
  let editedCursor = 0;

  for (const cut of cuts) {
    const keptLength = cut.startMs - originalCursor;
    // At a cut boundary, seek to the first audio after the cut rather than
    // landing on its first deleted sample and relying on playback to correct.
    if (target < editedCursor + keptLength) {
      return originalCursor + target - editedCursor;
    }
    editedCursor += keptLength;
    originalCursor = cut.endMs;
  }

  return Math.min(
    Math.max(0, totalDurationMs),
    originalCursor + target - editedCursor,
  );
}

/** Returns the first playable point when `originalMs` sits inside a cut. */
export function skipDeletedTimeMs(
  originalMs: number,
  cuts: AudioCut[],
): number {
  for (const cut of cuts) {
    if (originalMs < cut.startMs) break;
    if (originalMs < cut.endMs) return cut.endMs;
  }
  return originalMs;
}
