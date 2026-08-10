import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import {
  MEMOIR_MAX_OUTPUT_SECONDS,
  MEMOIR_OUTPUT_HEIGHT,
  MEMOIR_OUTPUT_WIDTH,
  MEMOIR_SCENE_DURATION_SECONDS,
} from "@/lib/constants";

async function runFfmpeg(args: string[]) {
  if (!ffmpegPath) throw new Error("ffmpeg binary not found.");
  return new Promise<string>((resolve, reject) => {
    const proc = spawn(ffmpegPath as string, args);
    let stderr = "";
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => code === 0
      ? resolve(stderr)
      : reject(new Error(`ffmpeg exited with ${code}: ${stderr.slice(-1200)}`)));
  });
}

function durationFromLog(log: string) {
  const progress = [...log.matchAll(/time=(\d+):(\d+):(\d+\.\d+)/g)].at(-1);
  if (!progress) return null;
  return Math.round((Number(progress[1]) * 3600 + Number(progress[2]) * 60 + Number(progress[3])) * 1000);
}

export async function renderMemoirVideo(sceneVideos: Buffer[]) {
  if (!sceneVideos.length) throw new Error("No completed scenes were available to render.");
  const directory = await mkdtemp(path.join(tmpdir(), "memoir-render-"));
  try {
    const scenePaths = await Promise.all(sceneVideos.map(async (buffer, index) => {
      const file = path.join(directory, `scene-${String(index).padStart(2, "0")}.mp4`);
      await writeFile(file, buffer);
      return file;
    }));
    const outputPath = path.join(directory, "memoir.mp4");

    const inputs = scenePaths.flatMap((file) => ["-i", file]);
    const videoFilters = scenePaths.map((_, index) =>
      `[${index}:v]scale=${MEMOIR_OUTPUT_WIDTH}:${MEMOIR_OUTPUT_HEIGHT}:force_original_aspect_ratio=decrease,pad=${MEMOIR_OUTPUT_WIDTH}:${MEMOIR_OUTPUT_HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,tpad=stop_mode=clone:stop_duration=${MEMOIR_SCENE_DURATION_SECONDS},trim=duration=${MEMOIR_SCENE_DURATION_SECONDS},setpts=PTS-STARTPTS,format=yuv420p[v${index}]`,
    );
    const audioFilters = scenePaths.map((_, index) =>
      `[${index}:a]aresample=async=1:first_pts=0,apad=pad_dur=${MEMOIR_SCENE_DURATION_SECONDS},atrim=duration=${MEMOIR_SCENE_DURATION_SECONDS},asetpts=PTS-STARTPTS[a${index}]`,
    );
    const concatInputs = scenePaths.map((_, index) => `[v${index}][a${index}]`).join("");
    const filter = `${videoFilters.join(";")};${audioFilters.join(";")};${concatInputs}concat=n=${scenePaths.length}:v=1:a=1[vout][aout]`;
    const log = await runFfmpeg([
      "-y", ...inputs,
      "-filter_complex", filter,
      "-map", "[vout]",
      "-map", "[aout]",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
      "-c:a", "aac", "-b:a", "160k",
      "-t", String(MEMOIR_MAX_OUTPUT_SECONDS),
      "-movflags", "+faststart", outputPath,
    ]);
    try {
      await runFfmpeg([
        "-hide_banner", "-i", outputPath,
        "-map", "0:a:0", "-c", "copy", "-f", "null", "-",
      ]);
    } catch {
      throw new Error("The rendered memoir is missing its SeeGen audio track.");
    }
    return { buffer: await readFile(outputPath), durationMs: durationFromLog(log) };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
