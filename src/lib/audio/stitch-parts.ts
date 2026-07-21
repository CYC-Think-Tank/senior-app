import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RAW_BUCKET } from "@/lib/constants";
import { parseAttemptId, partsPrefix } from "@/lib/audio/parts";

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

/**
 * Chunks from the guest's most recent attempt, in order. If they closed the
 * tab and started the interview over, earlier attempts are superseded — only
 * the newest one is the recording they meant to leave behind.
 */
function latestAttempt(parts: PartFile[]): PartFile[] {
  let newest = -1;
  for (const part of parts) {
    const attempt = parseAttemptId(part.name);
    if (attempt !== null && attempt > newest) newest = attempt;
  }
  if (newest < 0) return [];
  return parts.filter((p) => parseAttemptId(p.name) === newest);
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
        buffers[i] = Buffer.from(await data.arrayBuffer());
      }
    }
  );

  await Promise.all(workers);
  return buffers;
}

/**
 * Remuxes the raw chunk stream into a well-formed container and reports the
 * duration ffmpeg saw. The concatenated MediaRecorder output is already a
 * valid stream (WebM clusters, or fMP4 fragments behind their init segment),
 * but it carries no duration in its header, which breaks seeking in the
 * admin player. `-c copy` fixes the header without re-encoding.
 */
async function remux(
  inputPath: string,
  outputPath: string
): Promise<number | null> {
  if (!ffmpegPath) throw new Error("ffmpeg binary not found (ffmpeg-static).");

  const stderr = await new Promise<string>((resolve, reject) => {
    const proc = spawn(ffmpegPath as string, [
      "-y",
      "-i",
      inputPath,
      "-c",
      "copy",
      outputPath,
    ]);
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

  // The last progress line ffmpeg printed is how far it got, i.e. the duration.
  const times = [...stderr.matchAll(/time=(\d+):(\d+):(\d+\.\d+)/g)];
  const last = times[times.length - 1];
  if (!last) return null;
  return Math.round(
    (Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3])) * 1000
  );
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
 * Parts are only deleted once the stitched file is safely stored, so a failure
 * anywhere in here leaves the session recoverable and can simply be retried.
 */
export async function stitchSessionParts(
  admin: SupabaseClient,
  sessionId: string
): Promise<StitchResult | null> {
  const all = await listParts(admin, sessionId);
  const parts = latestAttempt(all);
  if (parts.length === 0) return null;

  const ext = parts[0].name.endsWith(".m4a") ? "m4a" : "webm";
  const buffers = await downloadParts(admin, sessionId, parts);

  const workDir = await mkdtemp(path.join(tmpdir(), "stitch-"));
  try {
    const joinedPath = path.join(workDir, `joined.${ext}`);
    const outputPath = path.join(workDir, `raw.${ext}`);
    await writeFile(joinedPath, Buffer.concat(buffers));

    const durationMs = await remux(joinedPath, outputPath);

    const storagePath = `${sessionId}/raw-${Date.now()}.${ext}`;
    const { error: uploadError } = await admin.storage
      .from(RAW_BUCKET)
      .upload(storagePath, await readFile(outputPath), {
        contentType: ext === "m4a" ? "audio/mp4" : "audio/webm",
        upsert: true,
      });
    if (uploadError) {
      throw new Error(`Could not store the recording: ${uploadError.message}`);
    }

    // Clears superseded attempts too, so restarts do not accumulate.
    await admin.storage
      .from(RAW_BUCKET)
      .remove(all.map((p) => `${partsPrefix(sessionId)}/${p.name}`));

    return { path: storagePath, durationMs, partCount: parts.length };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
