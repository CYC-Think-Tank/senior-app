/**
 * Grouping the uploaded chunks of a conversation into the sittings they were
 * recorded in.
 *
 * Kept free of imports — like `parts.ts` next door — so it stays cheap for
 * route handlers and directly testable.
 */

export type PartExtension = "webm" | "m4a" | "pcm";
export type Run = { ext: PartExtension; buffers: Buffer[] };

const WEBM_MAGIC = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]); // EBML header

/**
 * The format a chunk was uploaded in, read back off its filename.
 *
 * Browsers send whatever `MediaRecorder` produced — WebM/Opus, or fMP4 on
 * Safari. The iOS app has no `MediaRecorder`: it mixes both sides of the call
 * itself and sends bare 24 kHz mono PCM16.
 */
export function extensionOf(name: string): PartExtension {
  if (name.endsWith(".pcm")) return "pcm";
  if (name.endsWith(".m4a")) return "m4a";
  return "webm";
}

/**
 * True when a chunk opens a new recorder run rather than continuing one.
 *
 * Every browser sitting is its own `MediaRecorder`, and its first chunk
 * carries the container header — EBML for WebM, an `ftyp` box for fMP4. Later
 * chunks in the same run are bare Clusters or `moof`s, which is why they can
 * simply be glued together.
 */
export function startsNewRun(buffer: Buffer): boolean {
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(WEBM_MAGIC)) {
    return true;
  }
  return buffer.length >= 8 && buffer.subarray(4, 8).toString("latin1") === "ftyp";
}

/**
 * Groups the chunks into the sittings they were recorded in, in order.
 *
 * A run ends for either of two reasons. A container chunk carrying its own
 * header opens a new one. So does a change of format: one conversation can be
 * started in a browser and picked back up in the iOS app, and WebM clusters
 * cannot be glued onto raw PCM.
 *
 * Raw PCM has no header at all, which is exactly why it needs the second rule
 * — every one of its chunks looks like a continuation, including the first.
 * That is also what lets several PCM sittings share one run: byte order is the
 * only thing that joins them, and `listParts` already sorted by it.
 */
export function splitRuns(names: string[], buffers: Buffer[]): Run[] {
  const runs: Run[] = [];

  buffers.forEach((buffer, index) => {
    const ext = extensionOf(names[index] ?? "");
    const current = runs[runs.length - 1];
    const opensRun = ext === "pcm" ? false : startsNewRun(buffer);

    if (!current || current.ext !== ext || opensRun) {
      runs.push({ ext, buffers: [buffer] });
    } else {
      current.buffers.push(buffer);
    }
  });

  return runs;
}
