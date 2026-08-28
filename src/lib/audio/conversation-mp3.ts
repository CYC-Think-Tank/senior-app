import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { decryptAudio } from "@/lib/audio/encryption";
import { RAW_BUCKET } from "@/lib/constants";
import { audioExtension } from "@/lib/conversation-export";
import { download } from "@/lib/storage";

/** Matches the bitrate the app records at, so the copy adds no more loss. */
const MP3_BITRATE = "128k";

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

/**
 * Fetches a stored recording as plain, playable bytes.
 *
 * Objects in the raw container are encrypted at rest, so the stored bytes are
 * ciphertext and have to be decrypted here rather than handed out as-is.
 */
export async function conversationAudio(storagePath: string): Promise<Buffer> {
  const stored = await download(RAW_BUCKET, storagePath);
  if (!stored) {
    throw new Error(`Could not download the recording: ${storagePath} is missing`);
  }
  return decryptAudio(stored);
}

/**
 * Converts a stored recording to MP3 for download.
 *
 * Recordings are stitched into WebM/Opus or M4A/AAC, neither of which every
 * player and phone handles, so exports are transcoded to the one audio format
 * that plays everywhere. ffmpeg reads from a temp file rather than a pipe
 * because an M4A's moov atom can sit at the end of the file, which a
 * non-seekable stdin cannot reach.
 */
export async function conversationMp3(storagePath: string): Promise<Buffer> {
  const plain = await conversationAudio(storagePath);
  const workDir = await mkdtemp(path.join(tmpdir(), "mp3-"));

  try {
    const inputPath = path.join(
      workDir,
      `source${audioExtension(storagePath)}`,
    );
    const outputPath = path.join(workDir, "recording.mp3");
    await writeFile(inputPath, plain);
    await runFfmpeg([
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-c:a",
      "libmp3lame",
      "-b:a",
      MP3_BITRATE,
      outputPath,
    ]);
    return await readFile(outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
