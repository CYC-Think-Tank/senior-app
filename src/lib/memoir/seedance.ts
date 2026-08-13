import { MEMOIR_SCENE_DURATION_SECONDS, SEEGEN_MODEL } from "@/lib/constants";
import { findTaskId, findTaskStatus, findVideoUrl } from "./seedance-parser";

export { findTaskId, findTaskStatus, findVideoUrl } from "./seedance-parser";

const DEFAULT_BASE = "https://seegen.ai/api/v1";
const PROVIDER_PREFIX = "seegen:";

export function isSeegenConfigured() {
  return Boolean(process.env.SEEGEN_API_KEY?.trim());
}

function config() {
  const key = process.env.SEEGEN_API_KEY?.trim();
  if (!key) throw new Error("Video generation is not configured yet.");
  return {
    key,
    base: (process.env.SEEGEN_API_BASE_URL?.trim() || DEFAULT_BASE).replace(/\/$/, ""),
    model: process.env.SEEGEN_MODEL?.trim() || SEEGEN_MODEL,
    outputResolution: process.env.SEEGEN_OUTPUT_RESOLUTION?.trim() || "480p",
  };
}

async function jsonResponse(response: Response) {
  const text = await response.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch { body = { message: text.slice(0, 300) }; }
  if (!response.ok) {
    if (response.status === 402) {
      throw new Error("Your SeeGen account does not have enough credits to finish this film.");
    }
    if (response.status === 429) {
      throw new Error("SeeGen is already processing the maximum number of tasks. Try this film again after they finish.");
    }
    throw new Error(`SeeGen request failed (${response.status}): ${JSON.stringify(body).slice(0, 500)}`);
  }
  return body;
}

export function isSeegenTaskId(taskId: string | null) {
  return Boolean(taskId?.startsWith(PROVIDER_PREFIX));
}

function rawTaskId(taskId: string) {
  if (!isSeegenTaskId(taskId)) throw new Error("This scene belongs to the previous video provider.");
  return taskId.slice(PROVIDER_PREFIX.length);
}

export async function createSeedanceScene(prompt: string, duration = MEMOIR_SCENE_DURATION_SECONDS) {
  const { key, base, model, outputResolution } = config();
  const response = await fetch(`${base}/jobs/createTask`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Encoding": "identity",
    },
    body: JSON.stringify({
      model,
      inputs: {
        prompt,
        duration: `${Math.max(4, Math.min(MEMOIR_SCENE_DURATION_SECONDS, Math.round(duration)))}s`,
        resolution: "1280x720",
        outputResolution,
        // Narration is generated once on a separate master timeline. Asking
        // Seedance for scene audio would reintroduce voice and word boundaries
        // at every generated clip.
        generateAudio: false,
      },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await jsonResponse(response);
  const taskId = findTaskId(body);
  if (!taskId) throw new Error("SeeGen did not return a task ID.");
  return `${PROVIDER_PREFIX}${taskId}`;
}

export async function getSeedanceScene(taskId: string) {
  const { key, base } = config();
  const response = await fetch(`${base}/jobs/queryTask?taskId=${encodeURIComponent(rawTaskId(taskId))}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", "Accept-Encoding": "identity" },
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  const body = await jsonResponse(response);
  const status = findTaskStatus(body);
  return { status, videoUrl: findVideoUrl(body), body };
}
