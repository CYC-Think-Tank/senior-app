import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import OpenAI from "openai";
import {
  MEMOIR_SCENE_DURATION_SECONDS,
  MEMOIR_TRANSITION_SECONDS,
  MEMOIR_TTS_MODEL,
  MEMOIR_TTS_VOICE,
} from "../constants";
import { splitNarrationIntoScenes } from "./story-helpers";
import { buildNarrationTimeline, wavDurationSeconds } from "./narration-plan";

export const MEMOIR_NARRATOR_INSTRUCTIONS =
  "Speak as one warm, natural older storyteller sharing a cherished memory with family. " +
  "Sound intimate, emotionally grounded, and conversational, never theatrical, announcer-like, or robotic. " +
  "Use natural breathing, gentle expressive variation, clear diction, and an unhurried pace. " +
  "Use the language of the provided text and pronounce names carefully. " +
  "Speak only the provided words, exactly once, without adding, omitting, repeating, or paraphrasing anything. " +
  "Keep the same voice, age, accent, energy, and cadence throughout the memoir, and finish with a natural sentence-ending pause.";

async function runFfmpeg(args: string[]) {
  if (!ffmpegPath) throw new Error("ffmpeg binary not found.");
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegPath as string, args);
    let stderr = "";
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => code === 0
      ? resolve()
      : reject(new Error(`ffmpeg exited with ${code}: ${stderr.slice(-1200)}`)));
  });
}

async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

function tempoFilter(tempo: number) {
  return tempo > 1 ? `,atempo=${tempo}` : "";
}

export async function renderNarrationMaster(
  speechSegments: Buffer[],
  {
    sceneDurationSeconds = MEMOIR_SCENE_DURATION_SECONDS,
    transitionSeconds = MEMOIR_TRANSITION_SECONDS,
  }: {
    sceneDurationSeconds?: number;
    transitionSeconds?: number;
  } = {},
) {
  if (!speechSegments.length) throw new Error("No narration segments were available to mix.");
  const durations = speechSegments.map(wavDurationSeconds);
  const timeline = buildNarrationTimeline({
    segmentDurationsSeconds: durations,
    sceneDurationSeconds,
    transitionSeconds,
  });
  const directory = await mkdtemp(path.join(tmpdir(), "memoir-narration-"));
  try {
    const segmentPaths = await Promise.all(speechSegments.map(async (buffer, index) => {
      const file = path.join(directory, `sentence-${String(index).padStart(2, "0")}.wav`);
      await writeFile(file, buffer);
      return file;
    }));
    const outputPath = path.join(directory, "narration.m4a");
    const filters = timeline.segments.map((segment, index) => {
      const delayMs = Math.round(segment.delaySeconds * 1000);
      return `[${index}:a]aresample=48000:async=1:first_pts=0,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo${tempoFilter(segment.tempo)},adelay=${delayMs}:all=1,apad=pad_dur=${timeline.durationSeconds},atrim=duration=${timeline.durationSeconds},asetpts=PTS-STARTPTS[n${index}]`;
    });
    const inputs = segmentPaths.flatMap((file) => ["-i", file]);
    const labels = segmentPaths.map((_, index) => `[n${index}]`).join("");
    const fadeOutAt = Math.max(0, timeline.durationSeconds - 0.2);
    filters.push(
      `${labels}amix=inputs=${segmentPaths.length}:duration=longest:dropout_transition=0:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=7,atrim=duration=${timeline.durationSeconds},afade=t=in:st=0:d=0.2,afade=t=out:st=${fadeOutAt}:d=0.2[aout]`,
    );
    await runFfmpeg([
      "-y", ...inputs,
      "-filter_complex", filters.join(";"),
      "-map", "[aout]",
      "-ar", "48000", "-ac", "2",
      "-c:a", "aac", "-b:a", "160k",
      "-t", String(timeline.durationSeconds),
      outputPath,
    ]);
    return {
      buffer: await readFile(outputPath),
      durationMs: Math.round(timeline.durationSeconds * 1000),
      timeline,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Generates complete sentences, then places them on one final audio timeline. */
export async function generateNarrationMaster(
  narration: string,
  sceneCount: number,
  options?: { sceneDurationSeconds?: number; transitionSeconds?: number },
) {
  const sentences = splitNarrationIntoScenes(narration, sceneCount);
  const openai = new OpenAI();
  const speechSegments = await mapLimit(sentences, 3, async (sentence) => {
    const response = await openai.audio.speech.create({
      model: MEMOIR_TTS_MODEL,
      voice: MEMOIR_TTS_VOICE,
      input: sentence,
      instructions: MEMOIR_NARRATOR_INSTRUCTIONS,
      response_format: "wav",
    });
    return Buffer.from(await response.arrayBuffer());
  });
  return renderNarrationMaster(speechSegments, options);
}
