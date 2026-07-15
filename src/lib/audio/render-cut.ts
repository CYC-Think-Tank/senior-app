import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { CUT_PADDING_MS, MERGE_GAP_MS } from "@/lib/constants";

export type Range = { startMs: number; endMs: number };

/**
 * Turns the kept transcript turns into padded, merged, clamped audio ranges.
 * Padding absorbs the ± imprecision of live-event timestamps; merging avoids
 * choppy micro-cuts between adjacent turns.
 */
export function mergeKeptRanges(
  turns: { start_ms: number; end_ms: number }[],
  totalDurationMs: number | null
): Range[] {
  const max = totalDurationMs ?? Number.MAX_SAFE_INTEGER;
  const padded = turns
    .map((t) => ({
      startMs: Math.max(0, t.start_ms - CUT_PADDING_MS),
      endMs: Math.min(max, t.end_ms + CUT_PADDING_MS),
    }))
    .filter((r) => r.endMs > r.startMs)
    .sort((a, b) => a.startMs - b.startMs);

  const merged: Range[] = [];
  for (const r of padded) {
    const last = merged[merged.length - 1];
    if (last && r.startMs <= last.endMs + MERGE_GAP_MS) {
      last.endMs = Math.max(last.endMs, r.endMs);
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}

/**
 * Renders the edited cut: concatenates the given ranges of the raw recording
 * into a mono 128kbps mp3.
 */
export async function renderCut(
  inputPath: string,
  ranges: Range[],
  outputPath: string
): Promise<void> {
  if (!ffmpegPath) throw new Error("ffmpeg binary not found (ffmpeg-static).");
  if (ranges.length === 0) throw new Error("Nothing to render — all turns are cut.");

  const trims = ranges
    .map(
      (r, i) =>
        `[0:a]atrim=start=${(r.startMs / 1000).toFixed(3)}:end=${(
          r.endMs / 1000
        ).toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`
    )
    .join(";");
  const inputs = ranges.map((_, i) => `[a${i}]`).join("");
  const filter = `${trims};${inputs}concat=n=${ranges.length}:v=0:a=1[out]`;

  const args = [
    "-y",
    "-i",
    inputPath,
    "-filter_complex",
    filter,
    "-map",
    "[out]",
    "-ac",
    "1",
    "-ar",
    "44100",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "128k",
    outputPath,
  ];

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegPath as string, args);
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with ${code}: ${stderr.slice(-800)}`));
    });
  });
}
