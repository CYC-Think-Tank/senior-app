import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import {
  MEMOIR_OUTPUT_HEIGHT,
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

    const inputs = [...scenePaths, ...(narrationPath ? [narrationPath] : [])]
      .flatMap((file) => ["-i", file]);
    const plan = buildMemoirRenderPlan({
      sceneCount: scenePaths.length,
      sceneDurationSeconds,
      transitionSeconds,
      width: MEMOIR_OUTPUT_WIDTH,
      height: MEMOIR_OUTPUT_HEIGHT,
      includeSceneAudio: !narrationAudio,
    });
    const masterAudioLabel = "mastera";
    const filter = narrationAudio
      ? `${plan.filter};[${scenePaths.length}:a]aresample=48000:async=1:first_pts=0,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,apad=pad_dur=${plan.durationSeconds},atrim=duration=${plan.durationSeconds},asetpts=PTS-STARTPTS[${masterAudioLabel}]`
      : plan.filter;
    const audioLabel = narrationAudio ? masterAudioLabel : plan.audioLabel;
    if (!audioLabel) throw new Error("The memoir render has no audio timeline.");
    const log = await runFfmpeg([
      "-y", ...inputs,
      "-filter_complex", filter,
      "-map", `[${plan.videoLabel}]`,
      "-map", `[${audioLabel}]`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
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
      throw new Error("The rendered memoir is missing its master narration track.");
    }
    return { buffer: await readFile(outputPath), durationMs: durationFromLog(log) };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
