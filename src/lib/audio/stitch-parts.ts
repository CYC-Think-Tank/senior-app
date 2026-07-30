import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RAW_BUCKET } from "@/lib/constants";
import { decryptAudio, encryptAudio } from "@/lib/audio/encryption";
import { partsPrefix } from "@/lib/audio/parts";

const DOWNLOAD_CONCURRENCY = 8;
const LIST_PAGE = 1000;

type PartFile = { name: string; size: number };

/** Lists every uploaded chunk for a session, oldest first. */
export async function listParts(
  admin: SupabaseClient,
  sessionId: string
): Promise<PartFile[]> {
  const prefix = partsPrefix(sessionId);
  const all: PartFile[] = [];

  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await admin.storage
      .from(RAW_BUCKET)
      .list(prefix, { limit: LIST_PAGE, offset });
    if (error) throw new Error(`Could not list the recording parts: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const file of data) {
      all.push({
        name: file.name,
        size: (file.metadata?.size as number | undefined) ?? 0,
      });
    }
    if (data.length < LIST_PAGE) break;
  }

  return all.sort((a, b) => a.name.localeCompare(b.name));
}

const WEBM_MAGIC = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]); // EBML header

/**
 * True when a chunk opens a new recorder run rather than continuing one.
 *
 * Every sitting of a conversation is its own `MediaRecorder`, and its first
 * chunk carries the container header — EBML for WebM, an `ftyp` box for fMP4.
 * Later chunks in the same run are bare Clusters or `moof`s, which is why they
 * can simply be glued together.
 */
function startsNewRun(buffer: Buffer): boolean {
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(WEBM_MAGIC)) {
    return true;
  }
  return buffer.length >= 8 && buffer.subarray(4, 8).toString("latin1") === "ftyp";
}

/** Groups the chunks into the sittings they were recorded in, in order. */
function splitRuns(buffers: Buffer[]): Buffer[][] {
  const runs: Buffer[][] = [];
  for (const buffer of buffers) {
    if (runs.length === 0 || startsNewRun(buffer)) runs.push([]);
    runs[runs.length - 1].push(buffer);
  }
  return runs;
}

/** Downloads parts in order, a few at a time so a long interview is not serial. */
async function downloadParts(
  admin: SupabaseClient,
  sessionId: string,
  parts: PartFile[]
): Promise<Buffer[]> {
  const prefix = partsPrefix(sessionId);
  const buffers = new Array<Buffer>(parts.length);
  let next = 0;

  const workers = Array.from(
    { length: Math.min(DOWNLOAD_CONCURRENCY, parts.length) },
    async () => {
      for (let i = next++; i < parts.length; i = next++) {
        const { data, error } = await admin.storage
          .from(RAW_BUCKET)
          .download(`${prefix}/${parts[i].name}`);
        if (error || !data) {
          throw new Error(`Could not download part ${parts[i].name}.`);
        }
        // Per-part decryption; a session that straddled the encryption
        // rollout can mix plaintext and encrypted chunks.
        buffers[i] = decryptAudio(Buffer.from(await data.arrayBuffer()));
      }
    }
  );

  await Promise.all(workers);
  return buffers;
}

/** Runs ffmpeg to completion and returns its stderr, which holds the log. */
async function runFfmpeg(args: string[]): Promise<string> {
  if (!ffmpegPath) throw new Error("ffmpeg binary not found (ffmpeg-static).");

  return new Promise<string>((resolve, reject) => {
    const proc = spawn(ffmpegPath as string, args);
    let buf = "";
    proc.stderr.on("data", (d) => {
      buf += d.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(buf);
      else reject(new Error(`ffmpeg exited with ${code}: ${buf.slice(-800)}`));
    });
  });
}

/** How far ffmpeg got, i.e. the duration of what it just wrote. */
function reportedDurationMs(stderr: string): number | null {
  const times = [...stderr.matchAll(/time=(\d+):(\d+):(\d+\.\d+)/g)];
  const last = times[times.length - 1];
  if (!last) return null;
  return Math.round(
    (Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3])) * 1000
  );
}

/**
 * Remuxes one run's chunk stream into a well-formed container and reports the
 * duration ffmpeg saw. The concatenated MediaRecorder output is already a
 * valid stream (WebM clusters, or fMP4 fragments behind their init segment),
 * but it carries no duration in its header, which breaks seeking in the
 * admin player. `-c copy` fixes the header without re-encoding.
 */
async function remux(
  inputPath: string,
  outputPath: string
): Promise<number | null> {
  return reportedDurationMs(
    await runFfmpeg(["-y", "-i", inputPath, "-c", "copy", outputPath])
  );
}

/**
 * Joins the sittings of one conversation into a single recording.
 *
 * Each run has its own container header, so the byte concat that works inside
 * a run would leave a header stranded mid-file and ffmpeg would stop reading
 * at the first one. The concat demuxer joins the remuxed runs properly. Every
 * run came from the same browser at the same bitrate, so the streams should
 * copy straight through; re-encoding is the fallback for when they don't.
 */
async function concatRuns(
  runPaths: string[],
  outputPath: string,
  ext: string
): Promise<number | null> {
  const listPath = `${outputPath}.runs.txt`;
  await writeFile(listPath, runPaths.map((p) => `file '${p}'\n`).join(""));
  const input = ["-y", "-f", "concat", "-safe", "0", "-i", listPath];

  try {
    return reportedDurationMs(
      await runFfmpeg([...input, "-c", "copy", outputPath])
    );
  } catch (err) {
    console.warn("Stream copy could not join the sittings; re-encoding:", err);
    const codec = ext === "m4a" ? "aac" : "libopus";
    return reportedDurationMs(
      await runFfmpeg([...input, "-c:a", codec, outputPath])
    );
  }
}

export type StitchResult = {
  path: string;
  durationMs: number | null;
  partCount: number;
};

/**
 * Assembles the chunks uploaded during the interview into the session's raw
 * recording, then clears the chunks. Returns null when nothing was uploaded.
 *
 * A conversation picked back up from the dashboard was recorded across several
 * sittings; every one of them is part of the story, so they are all joined in
 * the order they were recorded.
 *
 * Parts are only deleted once the stitched file is safely stored, so a failure
 * anywhere in here leaves the session recoverable and can simply be retried.
 */
export async function stitchSessionParts(
  admin: SupabaseClient,
  sessionId: string
): Promise<StitchResult | null> {
  const parts = await listParts(admin, sessionId);
  if (parts.length === 0) return null;

  const ext = parts[0].name.endsWith(".m4a") ? "m4a" : "webm";
  const buffers = await downloadParts(admin, sessionId, parts);
  const runs = splitRuns(buffers);

  const workDir = await mkdtemp(path.join(tmpdir(), "stitch-"));
  try {
    const outputPath = path.join(workDir, `raw.${ext}`);
    let durationMs: number | null;

    if (runs.length === 1) {
      const joinedPath = path.join(workDir, `joined.${ext}`);
      await writeFile(joinedPath, Buffer.concat(runs[0]));
      durationMs = await remux(joinedPath, outputPath);
    } else {
      const runPaths: string[] = [];
      for (const [index, run] of runs.entries()) {
        const joinedPath = path.join(workDir, `run-${index}-joined.${ext}`);
        const runPath = path.join(workDir, `run-${index}.${ext}`);
        await writeFile(joinedPath, Buffer.concat(run));
        await remux(joinedPath, runPath);
        runPaths.push(runPath);
      }
      durationMs = await concatRuns(runPaths, outputPath, ext);
    }

    const storagePath = `${sessionId}/raw-${Date.now()}.${ext}`;
    const { error: uploadError } = await admin.storage
      .from(RAW_BUCKET)
      .upload(storagePath, encryptAudio(await readFile(outputPath)), {
        contentType: "application/octet-stream",
        upsert: true,
      });
    if (uploadError) {
      throw new Error(`Could not store the recording: ${uploadError.message}`);
    }

    await admin.storage
      .from(RAW_BUCKET)
      .remove(parts.map((p) => `${partsPrefix(sessionId)}/${p.name}`));

    return { path: storagePath, durationMs, partCount: parts.length };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
