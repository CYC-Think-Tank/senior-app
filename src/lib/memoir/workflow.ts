import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptTurns } from "@/lib/transcript/encryption";
import { createAudioUrl, decryptAudio, encryptAudio } from "@/lib/audio/encryption";
import {
  MEMOIR_MAX_GENERATIONS_PER_ACCOUNT,
  MEMOIR_MAX_SCENE_REGENERATIONS_PER_VIDEO,
  MEMOIR_MAX_SCENES,
  MEMOIR_MIN_SCENES,
  MEMOIR_SCENE_DURATION_SECONDS,
  STORY_VIDEOS_BUCKET,
  memoirSceneRegenerationQuota,
  memoirOutputSeconds,
  memoirSceneCountForConversation,
} from "@/lib/constants";
import type { ConversationVideo, Guest, TranscriptTurn } from "@/lib/types";
import { decryptMemoirText, encryptMemoirText } from "./encryption";
import { renderMemoirVideo } from "./render";
import {
  generateMemoirStoryboard,
  generateMemoirStory,
} from "./story";
import {
  LEGACY_SEEGEN_AUDIO_PROMPT_MARKER,
  SEEGEN_SILENT_PROMPT_MARKER,
} from "./story-helpers";
import { generateNarrationMaster } from "./narration";
import { createSeedanceScene, getSeedanceScene, isSeegenTaskId } from "./seedance";

type SceneRow = {
  id: string;
  video_id: string;
  idx: number;
  prompt_ciphertext: string;
  duration_seconds: number;
  provider_task_id: string | null;
  status: "queued" | "running" | "succeeded" | "failed";
  result_url: string | null;
  error_message: string | null;
};

// Jobs bought before audio crossfades shipped used this layout. Keep accepting
// it on retry so a transient provider failure does not throw paid clips away.
const LEGACY_SCENE_COUNT = 15;
const LEGACY_SCENE_DURATION_SECONDS = 10;

const now = () => new Date().toISOString();

export type PublicConversationVideo = {
  id: string;
  status: ConversationVideo["status"];
  title: string | null;
  durationMs: number | null;
  error: string | null;
  videoUrl: string | null;
  clips: Array<{ sceneNumber: number; videoUrl: string }>;
  sceneRegenerationQuota: ReturnType<typeof memoirSceneRegenerationQuota>;
  createdAt: string;
};

function sceneArchivePath(video: Pick<ConversationVideo, "id" | "session_id">, sceneIndex: number) {
  return `${video.session_id}/${video.id}/scenes/scene-${sceneIndex + 1}.mp4`;
}

function narrationArchivePath(video: Pick<ConversationVideo, "id" | "session_id">) {
  return `${video.session_id}/${video.id}/narration.m4a`;
}

export type VideoGenerationQuota = {
  used: number;
  limit: number;
  remaining: number;
};

/**
 * Raised when an account asks for one film more than it is allowed. Routes
 * turn this into a 403 rather than a 500 — nothing went wrong, the answer is
 * simply no.
 */
export class VideoGenerationLimitError extends Error {
  readonly limit = MEMOIR_MAX_GENERATIONS_PER_ACCOUNT;

  constructor() {
    super(
      `This account has used all ${MEMOIR_MAX_GENERATIONS_PER_ACCOUNT} of its film generations.`,
    );
    this.name = "VideoGenerationLimitError";
  }
}

/** A finished film has already used both of its individual scene changes. */
export class VideoSceneRegenerationLimitError extends Error {
  readonly limit = MEMOIR_MAX_SCENE_REGENERATIONS_PER_VIDEO;

  constructor() {
    super(
      `This film has used both of its ${MEMOIR_MAX_SCENE_REGENERATIONS_PER_VIDEO} scene regenerations.`,
    );
    this.name = "VideoSceneRegenerationLimitError";
  }
}

/**
 * How many complete films this account has left. Safe to call with the
 * caller's own RLS-bound client: "read own profile" covers it.
 */
export async function getVideoGenerationQuota(
  supabase: SupabaseClient,
  userId: string,
): Promise<VideoGenerationQuota> {
  const { data } = await supabase
    .from("profiles")
    .select("video_generations_used")
    .eq("id", userId)
    .maybeSingle();
  const used = Math.max(0, Number(data?.video_generations_used ?? 0));
  return {
    used,
    limit: MEMOIR_MAX_GENERATIONS_PER_ACCOUNT,
    remaining: Math.max(0, MEMOIR_MAX_GENERATIONS_PER_ACCOUNT - used),
  };
}

/**
 * Takes one generation from the account, or refuses. The counter moves inside
 * a single guarded UPDATE, so two racing requests cannot both take the last
 * one however fast the storyteller double-clicks.
 */
async function claimVideoGeneration(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin.rpc("claim_video_generation", {
    p_user_id: userId,
    p_limit: MEMOIR_MAX_GENERATIONS_PER_ACCOUNT,
  });
  if (error) throw error;
  // -1 is the function's "no" — and anything that is not a number at all
  // means the counter did not move, so refuse rather than give a free film.
  const remaining = typeof data === "number" ? data : -1;
  if (remaining < 0) throw new VideoGenerationLimitError();
  return remaining;
}

/** Returns a claimed generation after the job failed to start. */
async function releaseVideoGeneration(admin: SupabaseClient, userId: string) {
  const { error } = await admin.rpc("release_video_generation", { p_user_id: userId });
  // Best effort: the caller is already handling a failure, and losing the
  // refund must not mask it.
  if (error) console.error("Could not return an unused video generation:", error);
}

export async function publicConversationVideo(video: ConversationVideo): Promise<PublicConversationVideo> {
  const admin = createSupabaseAdminClient();
  const prefix = `${video.session_id}/${video.id}/scenes`;
  const { data: archived, error } = await admin.storage
    .from(STORY_VIDEOS_BUCKET)
    .list(prefix, { limit: 100, sortBy: { column: "name", order: "asc" } });
  if (error) console.error("Could not list archived memoir scenes:", error);
  const clips = (archived ?? []).flatMap((object) => {
    const match = object.name.match(/^scene-(\d+)\.mp4$/);
    if (!match) return [];
    return [{
      sceneNumber: Number(match[1]),
      videoUrl: createAudioUrl(STORY_VIDEOS_BUCKET, `${prefix}/${object.name}`, 6 * 60 * 60),
    }];
  }).sort((a, b) => a.sceneNumber - b.sceneNumber);

  return {
    id: video.id,
    status: video.status,
    title: video.title,
    durationMs: video.duration_ms,
    error: video.error_message,
    videoUrl: video.status === "ready" && video.video_path
      ? createAudioUrl(STORY_VIDEOS_BUCKET, video.video_path, 6 * 60 * 60)
      : null,
    clips,
    sceneRegenerationQuota: memoirSceneRegenerationQuota(video.scene_regenerations_used),
    createdAt: video.created_at,
  };
}

async function updateVideo(admin: SupabaseClient, id: string, values: Record<string, unknown>) {
  const { error } = await admin
    .from("conversation_videos")
    .update({ ...values, updated_at: now() })
    .eq("id", id);
  if (error) throw error;
}

async function markFailed(admin: SupabaseClient, id: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Video generation failed.";
  console.error("memoir video failed:", id, error);
  await updateVideo(admin, id, {
    status: "failed",
    error_message: message.slice(0, 800),
  });
}

async function mapLimit<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
    }
  }));
}

async function prepareConversationVideo(videoId: string) {
  const admin = createSupabaseAdminClient();
  try {
    // Claim planning atomically so a page refresh and the recovery cron cannot
    // buy the same storyboard twice.
    const { data: video } = await admin
      .from("conversation_videos")
      .update({ status: "preparing", updated_at: now() })
      .eq("id", videoId)
      .eq("status", "planning")
      .select("*")
      .maybeSingle();
    if (!video) return;

    const [{ data: session }, { data: rows }] = await Promise.all([
      admin.from("sessions").select("id, status, duration_ms, guests(*)").eq("id", video.session_id).single(),
      admin.from("transcript_turns").select("*").eq("session_id", video.session_id).order("idx"),
    ]);
    if (!session || session.status !== "ready") throw new Error("Only finished conversations can become films.");
    const guest = session.guests as unknown as Guest;
    const turns = decryptTurns(video.session_id, (rows ?? []) as TranscriptTurn[]);
    const sceneCount = memoirSceneCountForConversation(session.duration_ms);
    const story = await generateMemoirStory({
      guestName: guest.name,
      language: guest.language,
      sceneCount,
      turns,
    });
    if (story.narration.length > 4096) throw new Error("The generated narration was too long to voice safely.");

    const scenes = await generateMemoirStoryboard({ ...story, sceneCount });
    await updateVideo(admin, video.id, {
      title: story.title,
      story_ciphertext: encryptMemoirText(video.id, "story", story.story),
      narration_ciphertext: encryptMemoirText(video.id, "narration", story.narration),
      visual_bible_ciphertext: encryptMemoirText(video.id, "visual-bible", story.visualBible),
      narration_path: null,
      duration_ms: memoirOutputSeconds(sceneCount) * 1000,
    });

    const sceneRows = scenes.map((scene, idx) => ({
      video_id: video.id,
      idx,
      prompt_ciphertext: encryptMemoirText(video.id, `scene-${idx}`, scene.prompt),
      duration_seconds: MEMOIR_SCENE_DURATION_SECONDS,
      status: "queued",
    }));
    const { data: inserted, error: insertError } = await admin
      .from("conversation_video_scenes")
      .upsert(sceneRows, { onConflict: "video_id,idx" })
      .select("*");
    if (insertError || !inserted) throw insertError ?? new Error("Could not save the storyboard.");

    await updateVideo(admin, video.id, { status: "generating", error_message: null });
    await submitQueuedScenes(admin, video.id, inserted as SceneRow[]);
  } catch (error) {
    await markFailed(admin, videoId, error);
  }
}

async function submitQueuedScenes(admin: SupabaseClient, videoId: string, scenes: SceneRow[]) {
  // SeeGen permits three active tasks. Fill only the open slots, then let a
  // later poll submit the next batch after these finish.
  const openSlots = Math.max(0, 3 - scenes.filter((scene) => scene.status === "running").length);
  const batch = scenes.filter((scene) => scene.status === "queued").slice(0, openSlots);
  await mapLimit(batch, Math.max(1, openSlots), async (scene) => {
      const prompt = decryptMemoirText(videoId, `scene-${scene.idx}`, scene.prompt_ciphertext);
      const taskId = await createSeedanceScene(prompt, scene.duration_seconds, videoId);
      const { error } = await admin.from("conversation_video_scenes").update({
        provider_task_id: taskId,
        status: "running",
        updated_at: now(),
      }).eq("id", scene.id);
      if (error) throw error;
    });
}

/**
 * Starts, resumes, remakes, or repairs the film for one conversation.
 *
 * `userId` is the storyteller the work is billed to. Only the two paths that
 * buy a fresh set of clips — the first film for a conversation, and remaking
 * a finished one — spend a generation from that account's allowance; resuming
 * a failed job and repairing playback reuse clips already paid for.
 */
export async function startConversationVideo(
  sessionId: string,
  {
    userId,
    regenerate = false,
    repair = false,
  }: { userId: string; regenerate?: boolean; repair?: boolean },
) {
  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from("conversation_videos")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();

  let video: ConversationVideo;
  if (existing) {
    video = existing as ConversationVideo;
    const canRegenerate = regenerate && video.status === "ready";
    const canRepair = repair && video.status === "ready";
    if (video.status !== "failed" && !canRegenerate && !canRepair) return video;
    if (canRepair) {
      // Rebuild only the combined MP4 from archived clips. Marking it as
      // generating lets the normal worker claim and render it without
      // submitting any new provider tasks.
      const { data: repairing, error: repairError } = await admin
        .from("conversation_videos")
        .update({ status: "generating", error_message: null, updated_at: now() })
        .eq("id", video.id)
        .eq("status", "ready")
        .select("*")
        .maybeSingle();
      if (repairError) throw repairError;
      if (!repairing) throw new Error("Wait for the current video job to finish before repairing playback.");
      return repairing as ConversationVideo;
    }
    const { data: reusableScenes } = await admin
      .from("conversation_video_scenes")
      .select("*")
      .eq("video_id", video.id)
      .order("idx");
    const sceneRows = (reusableScenes ?? []) as SceneRow[];
    const hasCurrentLayout =
      sceneRows.length >= MEMOIR_MIN_SCENES &&
      sceneRows.length <= MEMOIR_MAX_SCENES &&
      sceneRows.every(
        (scene) => scene.duration_seconds === MEMOIR_SCENE_DURATION_SECONDS,
      );
    const hasLegacyLayout =
      sceneRows.length === LEGACY_SCENE_COUNT &&
      sceneRows.every(
        (scene) => scene.duration_seconds === LEGACY_SCENE_DURATION_SECONDS,
      );
    const hasReusableStoryboard = Boolean(
      (hasCurrentLayout || hasLegacyLayout)
      && sceneRows.every((scene) => {
        const prompt = decryptMemoirText(video.id, `scene-${scene.idx}`, scene.prompt_ciphertext);
        return prompt.includes(SEEGEN_SILENT_PROMPT_MARKER)
          || prompt.includes(LEGACY_SEEGEN_AUDIO_PROMPT_MARKER);
      })
    );
    if (!canRegenerate && video.narration_ciphertext && hasReusableStoryboard) {
      if (sceneRows.every((scene) => scene.status === "succeeded")) {
        // Rendering failed after every paid clip was archived. Keep the scene
        // rows succeeded so the next worker goes directly to the local FFmpeg
        // pass without querying or purchasing anything from SeeGen.
        await updateVideo(admin, video.id, { status: "generating", error_message: null });
        const { data: rerendering } = await admin
          .from("conversation_videos")
          .select("*")
          .eq("id", video.id)
          .single();
        return rerendering as ConversationVideo;
      }
      // Keep the completed story, script, and storyboard on every provider
      // retry. Keep paid SeeGen tasks, but discard task IDs from the previous
      // provider so they are never queried through the wrong API.
      for (const scene of reusableScenes as SceneRow[]) {
        const reusable = isSeegenTaskId(scene.provider_task_id) && scene.status !== "failed";
        await admin.from("conversation_video_scenes").update({
          status: reusable ? "running" : "queued",
          provider_task_id: reusable ? scene.provider_task_id : null,
          result_url: null,
          error_message: null,
          updated_at: now(),
        }).eq("id", scene.id);
      }
      await updateVideo(admin, video.id, { status: "generating", error_message: null });
      const { data: resumed } = await admin.from("conversation_videos").select("*").eq("id", video.id).single();
      return resumed as ConversationVideo;
    }
    // Everything below replans the film from scratch. A remake pays for that;
    // a retry after a failure does not, because the generation was already
    // spent when this film was first started.
    if (canRegenerate) await claimVideoGeneration(admin, userId);

    let reset: ConversationVideo;
    try {
      const prefix = `${sessionId}/${video.id}`;
      const [{ data: objects }, { data: sceneObjects }] = await Promise.all([
        admin.storage.from(STORY_VIDEOS_BUCKET).list(prefix),
        admin.storage.from(STORY_VIDEOS_BUCKET).list(`${prefix}/scenes`),
      ]);
      const storedPaths = [
        ...(objects ?? []).filter((o) => o.id).map((o) => `${prefix}/${o.name}`),
        ...(sceneObjects ?? []).filter((o) => o.id).map((o) => `${prefix}/scenes/${o.name}`),
      ];
      if (storedPaths.length) {
        await admin.storage.from(STORY_VIDEOS_BUCKET).remove(storedPaths);
      }
      await admin.from("conversation_video_scenes").delete().eq("video_id", video.id);
      await updateVideo(admin, video.id, {
        status: "planning", title: null, story_ciphertext: null,
        narration_ciphertext: null, visual_bible_ciphertext: null,
        narration_path: null, video_path: null, duration_ms: null, error_message: null,
        ...(canRegenerate ? { scene_regenerations_used: 0 } : {}),
      });
      const { data: reloaded, error: resetError } = await admin
        .from("conversation_videos")
        .select("*")
        .eq("id", video.id)
        .single();
      if (resetError || !reloaded) {
        throw resetError ?? new Error("Could not reload the reset video job.");
      }
      reset = reloaded as ConversationVideo;
    } catch (error) {
      // The remake never got as far as ordering anything, so give the
      // generation back instead of charging for a server-side failure.
      if (canRegenerate) await releaseVideoGeneration(admin, userId);
      throw error;
    }
    video = reset;
  } else {
    await claimVideoGeneration(admin, userId);
    const { data, error } = await admin
      .from("conversation_videos")
      .insert({ session_id: sessionId, status: "planning" })
      .select("*")
      .single();
    if (error || !data) {
      await releaseVideoGeneration(admin, userId);
      throw error ?? new Error("Could not create the video job.");
    }
    video = data as ConversationVideo;
  }

  return video;
}

/**
 * Reuses the saved storyboard prompt for one scene, then lets the normal
 * generation pipeline replace that clip and rebuild the finished film.
 */
export async function regenerateConversationVideoScene(
  videoId: string,
  sceneNumber: number,
) {
  if (!Number.isInteger(sceneNumber) || sceneNumber < 1) {
    throw new Error("Choose a valid scene to regenerate.");
  }

  const admin = createSupabaseAdminClient();
  const sceneIndex = sceneNumber - 1;
  // The database moves the counter, claims the ready film, and queues the
  // scene in one transaction. Two tabs therefore cannot spend the same slot.
  const { data: claim, error: claimError } = await admin.rpc(
    "claim_video_scene_regeneration",
    {
      p_video_id: videoId,
      p_scene_index: sceneIndex,
      p_limit: MEMOIR_MAX_SCENE_REGENERATIONS_PER_VIDEO,
    },
  );
  if (claimError) throw claimError;
  const remaining = claim === null || claim === undefined ? Number.NaN : Number(claim);
  if (remaining === -1) throw new VideoSceneRegenerationLimitError();
  if (remaining === -3) throw new Error("Scene not found.");
  if (!Number.isInteger(remaining) || remaining < 0) {
    throw new Error("Wait for the current video job to finish before regenerating a scene.");
  }

  const { data: video, error: videoError } = await admin
    .from("conversation_videos")
    .select("*")
    .eq("id", videoId)
    .single();
  if (videoError || !video) throw videoError ?? new Error("Video not found.");
  return video as ConversationVideo;
}

async function downloadScene(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Could not download a completed scene (${response.status}).`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > 120 * 1024 * 1024) throw new Error("A generated scene was unexpectedly large.");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 120 * 1024 * 1024) throw new Error("A generated scene was unexpectedly large.");
  return buffer;
}

async function archiveSceneVideo(
  admin: SupabaseClient,
  video: Pick<ConversationVideo, "id" | "session_id">,
  scene: Pick<SceneRow, "idx">,
  url: string,
) {
  const buffer = await downloadScene(url);
  const path = sceneArchivePath(video, scene.idx);
  const { error } = await admin.storage.from(STORY_VIDEOS_BUCKET).upload(
    path,
    encryptAudio(buffer),
    { contentType: "application/octet-stream", upsert: true },
  );
  if (error) throw error;
  return buffer;
}

async function readArchivedScene(
  admin: SupabaseClient,
  video: Pick<ConversationVideo, "id" | "session_id">,
  scene: SceneRow,
) {
  const { data, error } = await admin.storage
    .from(STORY_VIDEOS_BUCKET)
    .download(sceneArchivePath(video, scene.idx));
  if (!error && data) return decryptAudio(Buffer.from(await data.arrayBuffer()));
  if (!scene.result_url) throw new Error(`Scene ${scene.idx + 1} has no saved video.`);
  return archiveSceneVideo(admin, video, scene, scene.result_url);
}

async function readNarrationMaster(
  admin: SupabaseClient,
  video: ConversationVideo,
  scenes: SceneRow[],
) {
  if (video.narration_path) {
    const { data, error } = await admin.storage
      .from(STORY_VIDEOS_BUCKET)
      .download(video.narration_path);
    if (error || !data) {
      throw error ?? new Error("The saved master narration could not be downloaded.");
    }
    return decryptAudio(Buffer.from(await data.arrayBuffer()));
  }
  if (!video.narration_ciphertext) {
    throw new Error("The memoir has no narration script to voice.");
  }
  const sceneDurationSeconds = scenes[0]?.duration_seconds;
  if (!sceneDurationSeconds) throw new Error("The memoir has no scenes to synchronize.");
  const narration = decryptMemoirText(video.id, "narration", video.narration_ciphertext);
  const generated = await generateNarrationMaster(narration, scenes.length, {
    sceneDurationSeconds,
  });
  const path = narrationArchivePath(video);
  const { error } = await admin.storage.from(STORY_VIDEOS_BUCKET).upload(
    path,
    encryptAudio(generated.buffer),
    { contentType: "application/octet-stream", upsert: true },
  );
  if (error) throw error;
  await updateVideo(admin, video.id, { narration_path: path });
  return generated.buffer;
}

async function renderCompletedVideo(admin: SupabaseClient, video: ConversationVideo, scenes: SceneRow[]) {
  const ordered = [...scenes].sort((a, b) => a.idx - b.idx);
  const sceneDurationSeconds = ordered[0]?.duration_seconds;
  if (
    !sceneDurationSeconds ||
    ordered.some((scene) => scene.duration_seconds !== sceneDurationSeconds)
  ) {
    throw new Error("The memoir scenes do not share one render duration.");
  }
  const sceneBuffers = await Promise.all(
    ordered.map((scene) => readArchivedScene(admin, video, scene)),
  );
  const usesNativeSceneAudio = ordered.every((scene) => {
    const prompt = decryptMemoirText(video.id, `scene-${scene.idx}`, scene.prompt_ciphertext);
    return prompt.includes(LEGACY_SEEGEN_AUDIO_PROMPT_MARKER)
      && !prompt.includes(SEEGEN_SILENT_PROMPT_MARKER);
  });
  // Silent storyboards made during the master-narrator release remain
  // playable. New and original native-audio storyboards keep their full
  // SeeGen tracks instead.
  const narrationAudio = usesNativeSceneAudio
    ? undefined
    : await readNarrationMaster(admin, video, ordered);
  const rendered = await renderMemoirVideo(sceneBuffers, {
    sceneDurationSeconds,
    narrationAudio,
  });
  const videoPath = `${video.session_id}/${video.id}/memoir-${Date.now()}.mp4`;
  const { error: uploadError } = await admin.storage.from(STORY_VIDEOS_BUCKET).upload(
    videoPath,
    encryptAudio(rendered.buffer),
    { contentType: "application/octet-stream", upsert: true },
  );
  if (uploadError) throw uploadError;
  if (video.video_path && video.video_path !== videoPath) {
    const { error: cleanupError } = await admin.storage
      .from(STORY_VIDEOS_BUCKET)
      .remove([video.video_path]);
    if (cleanupError) console.error("Could not remove the replaced memoir video:", cleanupError);
  }
  await admin.from("conversation_video_scenes").update({ result_url: null, updated_at: now() }).eq("video_id", video.id);
  await updateVideo(admin, video.id, {
    status: "ready",
    video_path: videoPath,
    duration_ms: rendered.durationMs ?? video.duration_ms,
    error_message: null,
  });
}

export async function progressConversationVideo(videoId: string) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("conversation_videos").select("*").eq("id", videoId).single();
  if (!data) throw new Error("Video job not found.");
  let video = data as ConversationVideo;
  if (video.status === "planning") {
    await prepareConversationVideo(video.id);
    const { data: prepared } = await admin.from("conversation_videos").select("*").eq("id", video.id).single();
    return prepared as ConversationVideo;
  }
  if (video.status === "ready" || video.status === "failed" || video.status === "preparing") return video;

  try {
    const { data: sceneData } = await admin
      .from("conversation_video_scenes")
      .select("*")
      .eq("video_id", video.id)
      .order("idx");
    let scenes = (sceneData ?? []) as SceneRow[];

    let shouldRender = false;
    if (video.status === "generating") {
      await submitQueuedScenes(admin, video.id, scenes);
      const afterSubmission = await admin.from("conversation_video_scenes").select("*").eq("video_id", video.id).order("idx");
      scenes = (afterSubmission.data ?? []) as SceneRow[];
      await mapLimit(scenes.filter((scene) => scene.status === "running"), 4, async (scene) => {
        if (!scene.provider_task_id) throw new Error(`Scene ${scene.idx + 1} has no provider task.`);
        const result = await getSeedanceScene(scene.provider_task_id);
        const success = ["succeeded", "completed", "success"].includes(result.status);
        const failed = ["failed", "expired", "cancelled", "canceled"].includes(result.status);
        if (!success && !failed) return;
        if (success && result.videoUrl) {
          await archiveSceneVideo(admin, video, scene, result.videoUrl);
        }
        const values = success && result.videoUrl
          ? { status: "succeeded", result_url: null, error_message: null }
          : { status: "failed", error_message: success ? "Seedance returned no video URL." : `Seedance scene ended as ${result.status}.` };
        await admin.from("conversation_video_scenes").update({ ...values, updated_at: now() }).eq("id", scene.id);
      });
      const refreshed = await admin.from("conversation_video_scenes").select("*").eq("video_id", video.id).order("idx");
      scenes = (refreshed.data ?? []) as SceneRow[];
      const failedScene = scenes.find((scene) => scene.status === "failed");
      if (failedScene) throw new Error(failedScene.error_message ?? `Scene ${failedScene.idx + 1} failed.`);
      if (!scenes.length || scenes.some((scene) => scene.status !== "succeeded")) return video;
      const claimed = await admin.from("conversation_videos").update({
        status: "rendering", updated_at: now(),
      }).eq("id", video.id).eq("status", "generating").select("*").maybeSingle();
      if (!claimed.data) return video;
      video = claimed.data as ConversationVideo;
      shouldRender = true;
    }

    if (video.status === "rendering" && !shouldRender) {
      const stale = Date.now() - new Date(video.updated_at).getTime() > 10 * 60 * 1000;
      if (!stale) return video;
      const claimed = await admin.from("conversation_videos").update({ updated_at: now() })
        .eq("id", video.id).eq("status", "rendering").eq("updated_at", video.updated_at)
        .select("*").maybeSingle();
      if (!claimed.data) return video;
      video = claimed.data as ConversationVideo;
      shouldRender = true;
    }

    if (shouldRender) {
      await renderCompletedVideo(admin, video, scenes);
    }
  } catch (error) {
    await markFailed(admin, video.id, error);
  }
  const { data: current } = await admin.from("conversation_videos").select("*").eq("id", video.id).single();
  return current as ConversationVideo;
}

export async function progressPendingConversationVideos(limit = 2) {
  const admin = createSupabaseAdminClient();
  const staleRendering = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data } = await admin
    .from("conversation_videos")
    .select("id, status, updated_at")
    .in("status", ["planning", "preparing", "generating", "rendering"])
    .order("updated_at")
    .limit(limit * 2);
  const eligible = (data ?? []).filter((row) =>
    row.status === "planning" || row.status === "generating" || row.updated_at < staleRendering,
  ).slice(0, limit);
  for (const row of eligible) {
    if (row.status === "preparing" && row.updated_at < staleRendering) {
      await admin.from("conversation_videos").update({ status: "planning", updated_at: now() })
        .eq("id", row.id).eq("status", "preparing").eq("updated_at", row.updated_at);
    }
    await progressConversationVideo(row.id);
  }
  return eligible.length;
}
