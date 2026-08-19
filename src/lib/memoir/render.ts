import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import {
  MEMOIR_AUDIO_TRANSITION_SECONDS,
  MEMOIR_OUTPUT_HEIGHT,
  MEMOIR_OUTPUT_FPS,
  MEMOIR_OUTPUT_WIDTH,
  MEMOIR_SCENE_DURATION_SECONDS,
  MEMOIR_TRANSITION_SECONDS,
} from "../constants";
import { buildMemoirRenderPlan } from "./render-plan";

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

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

async function normalizeScene(
  inputPath: string,
  outputPath: string,
  sceneDurationSeconds: number,
  includeAudio: boolean,
) {
  const audioArgs = includeAudio
    ? [
        "-map", "0:a:0",
        "-af", "aresample=48000:async=1:first_pts=0,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo",
        "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2",
      ]
    : ["-an"];
  await runFfmpeg([
    "-y",
    // Some SeeGen MP4s report 1/0 or variable frame rates. This input option
    // discards those timestamps before a clean CFR stream is encoded.
    "-r", String(MEMOIR_OUTPUT_FPS), "-fflags", "+genpts", "-i", inputPath,
    "-map", "0:v:0", ...audioArgs,
    "-vf", `scale=${MEMOIR_OUTPUT_WIDTH}:${MEMOIR_OUTPUT_HEIGHT}:force_original_aspect_ratio=decrease,pad=${MEMOIR_OUTPUT_WIDTH}:${MEMOIR_OUTPUT_HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${MEMOIR_OUTPUT_FPS},settb=1/24000,setpts=N/(${MEMOIR_OUTPUT_FPS}*TB),format=yuv420p`,
    "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-preset", "veryfast", "-crf", "21",
    "-r", String(MEMOIR_OUTPUT_FPS), "-fps_mode", "cfr",
    "-video_track_timescale", "24000",
    "-t", String(sceneDurationSeconds),
    "-movflags", "+faststart", outputPath,
  ]);
}

function durationFromLog(log: string) {
  const progress = [...log.matchAll(/time=(\d+):(\d+):(\d+\.\d+)/g)].at(-1);
  if (!progress) return null;
  return Math.round((Number(progress[1]) * 3600 + Number(progress[2]) * 60 + Number(progress[3])) * 1000);
}

export async function renderMemoirVideo(
  sceneVideos: Buffer[],
  {
    sceneDurationSeconds = MEMOIR_SCENE_DURATION_SECONDS,
    transitionSeconds = MEMOIR_TRANSITION_SECONDS,
    narrationAudio,
  }: {
    sceneDurationSeconds?: number;
    transitionSeconds?: number;
    narrationAudio?: Buffer;
  } = {},
) {
  if (!sceneVideos.length) throw new Error("No completed scenes were available to render.");
  const directory = await mkdtemp(path.join(tmpdir(), "memoir-render-"));
  try {
    const scenePaths = await Promise.all(sceneVideos.map(async (buffer, index) => {
      const file = path.join(directory, `scene-${String(index).padStart(2, "0")}.mp4`);
      await writeFile(file, buffer);
      return file;
    }));
    const outputPath = path.join(directory, "memoir.mp4");
    const narrationPath = narrationAudio
      ? path.join(directory, "narration.m4a")
      : null;
    if (narrationPath && narrationAudio) await writeFile(narrationPath, narrationAudio);

    // Normalize in an independent pass. Correcting a malformed provider stream
    // only inside the xfade graph is not sufficient on every FFmpeg build.
    const includeSceneAudio = !narrationAudio;
    const normalizedScenePaths = await mapLimit(scenePaths, 2, async (file, index) => {
      const normalized = path.join(
        directory,
        `normalized-${String(index).padStart(2, "0")}.mp4`,
      );
      try {
        await normalizeScene(file, normalized, sceneDurationSeconds, includeSceneAudio);
      } catch (error) {
        const message = error instanceof Error ? error.message : "FFmpeg normalization failed.";
        throw new Error(`Could not normalize memoir scene ${index + 1}: ${message}`);
      }
      return normalized;
    });
    const inputs = normalizedScenePaths.flatMap((file) => ["-i", file]);
    if (narrationPath) inputs.push("-i", narrationPath);
    const plan = buildMemoirRenderPlan({
      sceneCount: normalizedScenePaths.length,
      sceneDurationSeconds,
      transitionSeconds,
      audioTransitionSeconds: MEMOIR_AUDIO_TRANSITION_SECONDS,
      width: MEMOIR_OUTPUT_WIDTH,
      height: MEMOIR_OUTPUT_HEIGHT,
      frameRate: MEMOIR_OUTPUT_FPS,
      includeSceneAudio,
    });
    const masterAudioLabel = "mastera";
    const filter = narrationAudio
      ? `${plan.filter};[${normalizedScenePaths.length}:a]aresample=48000:async=1:first_pts=0,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,apad=pad_dur=${plan.durationSeconds},atrim=duration=${plan.durationSeconds},asetpts=PTS-STARTPTS[${masterAudioLabel}]`
      : plan.filter;
    const audioLabel = narrationAudio ? masterAudioLabel : plan.audioLabel;
    if (!audioLabel) throw new Error("The memoir render has no audio timeline.");
    const log = await runFfmpeg([
      "-y", ...inputs,
      "-filter_complex", filter,
      "-map", `[${plan.videoLabel}]`,
      "-map", `[${audioLabel}]`,
      "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p",
      "-preset", "veryfast", "-crf", "21",
      "-r", String(MEMOIR_OUTPUT_FPS), "-fps_mode", "cfr",
      "-c:a", "aac", "-b:a", "160k",
      "-t", String(plan.durationSeconds),
      "-movflags", "+faststart", outputPath,
    ]);
    try {
      await runFfmpeg([
        "-hide_banner", "-i", outputPath,
        "-map", "0:a:0", "-c", "copy", "-f", "null", "-",
      ]);
    } catch {
      throw new Error("The rendered memoir is missing its audio track.");
    }
    return { buffer: await readFile(outputPath), durationMs: durationFromLog(log) };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
