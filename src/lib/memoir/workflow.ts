import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  conversationVideoScenes,
  conversationVideos,
  guests,
  profiles,
  sessions,
  transcriptTurns,
} from "@/lib/db/schema";
import { list, remove, upload, download } from "@/lib/storage";
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

type SceneRow = typeof conversationVideoScenes.$inferSelect;

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

function sceneArchivePath(video: Pick<ConversationVideo, "id" | "sessionId">, sceneIndex: number) {
  return `${video.sessionId}/${video.id}/scenes/scene-${sceneIndex + 1}.mp4`;
}

function narrationArchivePath(video: Pick<ConversationVideo, "id" | "sessionId">) {
  return `${video.sessionId}/${video.id}/narration.m4a`;
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
  userId: string,
): Promise<VideoGenerationQuota> {
  const [row] = await db
    .select({ used: profiles.videoGenerationsUsed })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  const used = Math.max(0, Number(row?.used ?? 0));
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
async function claimVideoGeneration(userId: string) {
  const result = await db.execute<{ claim: number | null }>(
    sql`select claim_video_generation(${userId}::uuid, ${MEMOIR_MAX_GENERATIONS_PER_ACCOUNT}) as claim`,
  );
  const claim = result.rows[0]?.claim;
  // -1 is the function's "no" — and anything that is not a number at all
  // means the counter did not move, so refuse rather than give a free film.
  const remaining = typeof claim === "number" ? claim : -1;
  if (remaining < 0) throw new VideoGenerationLimitError();
  return remaining;
}

/** Returns a claimed generation after the job failed to start. */
async function releaseVideoGeneration(userId: string) {
  try {
    await db.execute(sql`select release_video_generation(${userId}::uuid)`);
  } catch (error) {
    // Best effort: the caller is already handling a failure, and losing the
    // refund must not mask it.
    console.error("Could not return an unused video generation:", error);
  }
}

export async function publicConversationVideo(video: ConversationVideo): Promise<PublicConversationVideo> {
  const prefix = `${video.sessionId}/${video.id}/scenes`;
  let archived: Awaited<ReturnType<typeof list>> = [];
  try {
    archived = await list(STORY_VIDEOS_BUCKET, prefix);
  } catch (error) {
    console.error("Could not list archived memoir scenes:", error);
  }
  const clips = archived.flatMap((object) => {
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
    durationMs: video.durationMs,
    error: video.errorMessage,
    videoUrl: video.status === "ready" && video.videoPath
      ? createAudioUrl(STORY_VIDEOS_BUCKET, video.videoPath, 6 * 60 * 60)
      : null,
    clips,
    sceneRegenerationQuota: memoirSceneRegenerationQuota(video.sceneRegenerationsUsed),
    createdAt: video.createdAt,
  };
}

type VideoUpdate = Partial<typeof conversationVideos.$inferInsert>;

async function updateVideo(id: string, values: VideoUpdate) {
  await db
    .update(conversationVideos)
    .set({ ...values, updatedAt: now() })
    .where(eq(conversationVideos.id, id));
}

async function markFailed(id: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Video generation failed.";
  console.error("memoir video failed:", id, error);
  await updateVideo(id, {
    status: "failed",
    errorMessage: message.slice(0, 800),
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
  try {
    // Claim planning atomically so a page refresh and the recovery cron cannot
    // buy the same storyboard twice.
    const [video] = await db
      .update(conversationVideos)
      .set({ status: "preparing", updatedAt: now() })
      .where(
        and(
          eq(conversationVideos.id, videoId),
          eq(conversationVideos.status, "planning"),
        ),
      )
      .returning();
    if (!video) return;

    const [sessionRows, rows] = await Promise.all([
      db
        .select({
          status: sessions.status,
          durationMs: sessions.durationMs,
          guest: guests,
        })
        .from(sessions)
        .innerJoin(guests, eq(guests.id, sessions.guestId))
        .where(eq(sessions.id, video.sessionId))
        .limit(1),
      db
        .select()
        .from(transcriptTurns)
        .where(eq(transcriptTurns.sessionId, video.sessionId))
        .orderBy(asc(transcriptTurns.idx)),
    ]);
    const session = sessionRows[0];
    if (!session || session.status !== "ready") throw new Error("Only finished conversations can become films.");
    const guest = session.guest as Guest;
    const turns = decryptTurns(video.sessionId, rows as TranscriptTurn[]);
    const sceneCount = memoirSceneCountForConversation(session.durationMs);
    const story = await generateMemoirStory({
      guestName: guest.name,
      language: guest.language,
      sceneCount,
      turns,
    });
    if (story.narration.length > 4096) throw new Error("The generated narration was too long to voice safely.");

    const scenes = await generateMemoirStoryboard({ ...story, sceneCount });
    await updateVideo(video.id, {
      title: story.title,
      storyCiphertext: encryptMemoirText(video.id, "story", story.story),
      narrationCiphertext: encryptMemoirText(video.id, "narration", story.narration),
      visualBibleCiphertext: encryptMemoirText(video.id, "visual-bible", story.visualBible),
      narrationPath: null,
      durationMs: memoirOutputSeconds(sceneCount) * 1000,
    });

    const sceneRows = scenes.map((scene, idx) => ({
      videoId: video.id,
      idx,
      promptCiphertext: encryptMemoirText(video.id, `scene-${idx}`, scene.prompt),
      durationSeconds: MEMOIR_SCENE_DURATION_SECONDS,
      status: "queued",
    }));
    const inserted = await db
      .insert(conversationVideoScenes)
      .values(sceneRows)
      .onConflictDoUpdate({
        target: [conversationVideoScenes.videoId, conversationVideoScenes.idx],
        set: {
          promptCiphertext: sql`excluded.prompt_ciphertext`,
          durationSeconds: sql`excluded.duration_seconds`,
          status: sql`excluded.status`,
          updatedAt: now(),
        },
      })
      .returning();
    if (!inserted.length) throw new Error("Could not save the storyboard.");

    await updateVideo(video.id, { status: "generating", errorMessage: null });
    await submitQueuedScenes(video.id, inserted);
  } catch (error) {
    await markFailed(videoId, error);
  }
}

async function submitQueuedScenes(videoId: string, scenes: SceneRow[]) {
  // SeeGen permits three active tasks. Fill only the open slots, then let a
  // later poll submit the next batch after these finish.
  const openSlots = Math.max(0, 3 - scenes.filter((scene) => scene.status === "running").length);
  const batch = scenes.filter((scene) => scene.status === "queued").slice(0, openSlots);
  await mapLimit(batch, Math.max(1, openSlots), async (scene) => {
      const prompt = decryptMemoirText(videoId, `scene-${scene.idx}`, scene.promptCiphertext);
      const taskId = await createSeedanceScene(prompt, scene.durationSeconds, videoId);
      await db
        .update(conversationVideoScenes)
        .set({ providerTaskId: taskId, status: "running", updatedAt: now() })
        .where(eq(conversationVideoScenes.id, scene.id));
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
  const [existing] = await db
    .select()
    .from(conversationVideos)
    .where(eq(conversationVideos.sessionId, sessionId))
    .limit(1);

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
      const [repairing] = await db
        .update(conversationVideos)
        .set({ status: "generating", errorMessage: null, updatedAt: now() })
        .where(
          and(
            eq(conversationVideos.id, video.id),
            eq(conversationVideos.status, "ready"),
          ),
        )
        .returning();
      if (!repairing) throw new Error("Wait for the current video job to finish before repairing playback.");
      return repairing as ConversationVideo;
    }
    const sceneRows = await db
      .select()
      .from(conversationVideoScenes)
      .where(eq(conversationVideoScenes.videoId, video.id))
      .orderBy(asc(conversationVideoScenes.idx));
    const hasCurrentLayout =
      sceneRows.length >= MEMOIR_MIN_SCENES &&
      sceneRows.length <= MEMOIR_MAX_SCENES &&
      sceneRows.every(
        (scene) => scene.durationSeconds === MEMOIR_SCENE_DURATION_SECONDS,
      );
    const hasLegacyLayout =
      sceneRows.length === LEGACY_SCENE_COUNT &&
      sceneRows.every(
        (scene) => scene.durationSeconds === LEGACY_SCENE_DURATION_SECONDS,
      );
    const hasReusableStoryboard = Boolean(
      (hasCurrentLayout || hasLegacyLayout)
      && sceneRows.every((scene) => {
        const prompt = decryptMemoirText(video.id, `scene-${scene.idx}`, scene.promptCiphertext);
        return prompt.includes(SEEGEN_SILENT_PROMPT_MARKER)
          || prompt.includes(LEGACY_SEEGEN_AUDIO_PROMPT_MARKER);
      })
    );
    if (!canRegenerate && video.narrationCiphertext && hasReusableStoryboard) {
      if (sceneRows.every((scene) => scene.status === "succeeded")) {
        // Rendering failed after every paid clip was archived. Keep the scene
        // rows succeeded so the next worker goes directly to the local FFmpeg
        // pass without querying or purchasing anything from SeeGen.
        await updateVideo(video.id, { status: "generating", errorMessage: null });
        return reloadVideo(video.id);
      }
      // Keep the completed story, script, and storyboard on every provider
      // retry. Keep paid SeeGen tasks, but discard task IDs from the previous
      // provider so they are never queried through the wrong API.
      for (const scene of sceneRows) {
        const reusable = isSeegenTaskId(scene.providerTaskId) && scene.status !== "failed";
        await db
          .update(conversationVideoScenes)
          .set({
            status: reusable ? "running" : "queued",
            providerTaskId: reusable ? scene.providerTaskId : null,
            resultUrl: null,
            errorMessage: null,
            updatedAt: now(),
          })
          .where(eq(conversationVideoScenes.id, scene.id));
      }
      await updateVideo(video.id, { status: "generating", errorMessage: null });
      return reloadVideo(video.id);
    }
    // Everything below replans the film from scratch. A remake pays for that;
    // a retry after a failure does not, because the generation was already
    // spent when this film was first started.
    if (canRegenerate) await claimVideoGeneration(userId);

    try {
      await removeVideoObjects(sessionId, video.id);
      await db
        .delete(conversationVideoScenes)
        .where(eq(conversationVideoScenes.videoId, video.id));
      await updateVideo(video.id, {
        status: "planning", title: null, storyCiphertext: null,
        narrationCiphertext: null, visualBibleCiphertext: null,
        narrationPath: null, videoPath: null, durationMs: null, errorMessage: null,
        ...(canRegenerate ? { sceneRegenerationsUsed: 0 } : {}),
      });
      video = await reloadVideo(video.id);
    } catch (error) {
      // The remake never got as far as ordering anything, so give the
      // generation back instead of charging for a server-side failure.
      if (canRegenerate) await releaseVideoGeneration(userId);
      throw error;
    }
  } else {
    await claimVideoGeneration(userId);
    try {
      const [created] = await db
        .insert(conversationVideos)
        .values({ sessionId, status: "planning" })
        .returning();
      if (!created) throw new Error("Could not create the video job.");
      video = created as ConversationVideo;
    } catch (error) {
      await releaseVideoGeneration(userId);
      throw error;
    }
  }

  return video;
}

/** Re-reads a job after an update, for the callers that return the fresh row. */
async function reloadVideo(id: string): Promise<ConversationVideo> {
  const [video] = await db
    .select()
    .from(conversationVideos)
    .where(eq(conversationVideos.id, id))
    .limit(1);
  if (!video) throw new Error("Could not reload the video job.");
  return video as ConversationVideo;
}

/**
 * Clears every object a film wrote — the combined MP4, the narration master,
 * and the archived scene clips — so a remake starts from an empty folder.
 */
export async function removeVideoObjects(sessionId: string, videoId: string) {
  const prefix = `${sessionId}/${videoId}`;
  const [objects, sceneObjects] = await Promise.all([
    list(STORY_VIDEOS_BUCKET, prefix),
    list(STORY_VIDEOS_BUCKET, `${prefix}/scenes`),
  ]);
  await remove(STORY_VIDEOS_BUCKET, [
    ...objects.map((o) => `${prefix}/${o.name}`),
    ...sceneObjects.map((o) => `${prefix}/scenes/${o.name}`),
  ]);
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

  const sceneIndex = sceneNumber - 1;
  // The database moves the counter, claims the ready film, and queues the
  // scene in one transaction. Two tabs therefore cannot spend the same slot.
  const result = await db.execute<{ claim: number | null }>(
    sql`select claim_video_scene_regeneration(${videoId}::uuid, ${sceneIndex}, ${MEMOIR_MAX_SCENE_REGENERATIONS_PER_VIDEO}) as claim`,
  );
  const claim = result.rows[0]?.claim;
  const remaining = claim === null || claim === undefined ? Number.NaN : Number(claim);
  if (remaining === -1) throw new VideoSceneRegenerationLimitError();
  if (remaining === -3) throw new Error("Scene not found.");
  if (!Number.isInteger(remaining) || remaining < 0) {
    throw new Error("Wait for the current video job to finish before regenerating a scene.");
  }

  return reloadVideo(videoId);
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
  video: Pick<ConversationVideo, "id" | "sessionId">,
  scene: Pick<SceneRow, "idx">,
  url: string,
) {
  const buffer = await downloadScene(url);
  await upload(
    STORY_VIDEOS_BUCKET,
    sceneArchivePath(video, scene.idx),
    encryptAudio(buffer),
  );
  return buffer;
}

async function readArchivedScene(
  video: Pick<ConversationVideo, "id" | "sessionId">,
  scene: SceneRow,
) {
  const stored = await download(
    STORY_VIDEOS_BUCKET,
    sceneArchivePath(video, scene.idx),
  );
  if (stored) return decryptAudio(stored);
  if (!scene.resultUrl) throw new Error(`Scene ${scene.idx + 1} has no saved video.`);
  return archiveSceneVideo(video, scene, scene.resultUrl);
}

async function readNarrationMaster(
  video: ConversationVideo,
  scenes: SceneRow[],
) {
  if (video.narrationPath) {
    const stored = await download(STORY_VIDEOS_BUCKET, video.narrationPath);
    if (!stored) {
      throw new Error("The saved master narration could not be downloaded.");
    }
    return decryptAudio(stored);
  }
  if (!video.narrationCiphertext) {
    throw new Error("The memoir has no narration script to voice.");
  }
  const sceneDurationSeconds = scenes[0]?.durationSeconds;
  if (!sceneDurationSeconds) throw new Error("The memoir has no scenes to synchronize.");
  const narration = decryptMemoirText(video.id, "narration", video.narrationCiphertext);
  const generated = await generateNarrationMaster(narration, scenes.length, {
    sceneDurationSeconds,
  });
  const path = narrationArchivePath(video);
  await upload(STORY_VIDEOS_BUCKET, path, encryptAudio(generated.buffer));
  await updateVideo(video.id, { narrationPath: path });
  return generated.buffer;
}

async function renderCompletedVideo(video: ConversationVideo, scenes: SceneRow[]) {
  const ordered = [...scenes].sort((a, b) => a.idx - b.idx);
  const sceneDurationSeconds = ordered[0]?.durationSeconds;
  if (
    !sceneDurationSeconds ||
    ordered.some((scene) => scene.durationSeconds !== sceneDurationSeconds)
  ) {
    throw new Error("The memoir scenes do not share one render duration.");
  }
  const sceneBuffers = await Promise.all(
    ordered.map((scene) => readArchivedScene(video, scene)),
  );
  const usesNativeSceneAudio = ordered.every((scene) => {
    const prompt = decryptMemoirText(video.id, `scene-${scene.idx}`, scene.promptCiphertext);
    return prompt.includes(LEGACY_SEEGEN_AUDIO_PROMPT_MARKER)
      && !prompt.includes(SEEGEN_SILENT_PROMPT_MARKER);
  });
  // Silent storyboards made during the master-narrator release remain
  // playable. New and original native-audio storyboards keep their full
  // SeeGen tracks instead.
  const narrationAudio = usesNativeSceneAudio
    ? undefined
    : await readNarrationMaster(video, ordered);
  const rendered = await renderMemoirVideo(sceneBuffers, {
    sceneDurationSeconds,
    narrationAudio,
  });
  const videoPath = `${video.sessionId}/${video.id}/memoir-${Date.now()}.mp4`;
  await upload(STORY_VIDEOS_BUCKET, videoPath, encryptAudio(rendered.buffer));
  if (video.videoPath && video.videoPath !== videoPath) {
    try {
      await remove(STORY_VIDEOS_BUCKET, [video.videoPath]);
    } catch (cleanupError) {
      console.error("Could not remove the replaced memoir video:", cleanupError);
    }
  }
  await db
    .update(conversationVideoScenes)
    .set({ resultUrl: null, updatedAt: now() })
    .where(eq(conversationVideoScenes.videoId, video.id));
  await updateVideo(video.id, {
    status: "ready",
    videoPath,
    durationMs: rendered.durationMs ?? video.durationMs,
    errorMessage: null,
  });
}

/** The scenes of one film, in storyboard order. */
async function loadScenes(videoId: string): Promise<SceneRow[]> {
  return db
    .select()
    .from(conversationVideoScenes)
    .where(eq(conversationVideoScenes.videoId, videoId))
    .orderBy(asc(conversationVideoScenes.idx));
}

export async function progressConversationVideo(videoId: string) {
  let video = await reloadVideo(videoId);
  if (video.status === "planning") {
    await prepareConversationVideo(video.id);
    return reloadVideo(video.id);
  }
  if (video.status === "ready" || video.status === "failed" || video.status === "preparing") return video;

  try {
    let scenes = await loadScenes(video.id);

    let shouldRender = false;
    if (video.status === "generating") {
      await submitQueuedScenes(video.id, scenes);
      scenes = await loadScenes(video.id);
      await mapLimit(scenes.filter((scene) => scene.status === "running"), 4, async (scene) => {
        if (!scene.providerTaskId) throw new Error(`Scene ${scene.idx + 1} has no provider task.`);
        const result = await getSeedanceScene(scene.providerTaskId);
        const success = ["succeeded", "completed", "success"].includes(result.status);
        const failed = ["failed", "expired", "cancelled", "canceled"].includes(result.status);
        if (!success && !failed) return;
        if (success && result.videoUrl) {
          await archiveSceneVideo(video, scene, result.videoUrl);
        }
        const values = success && result.videoUrl
          ? { status: "succeeded", resultUrl: null, errorMessage: null }
          : { status: "failed", errorMessage: success ? "Seedance returned no video URL." : `Seedance scene ended as ${result.status}.` };
        await db
          .update(conversationVideoScenes)
          .set({ ...values, updatedAt: now() })
          .where(eq(conversationVideoScenes.id, scene.id));
      });
      scenes = await loadScenes(video.id);
      const failedScene = scenes.find((scene) => scene.status === "failed");
      if (failedScene) throw new Error(failedScene.errorMessage ?? `Scene ${failedScene.idx + 1} failed.`);
      if (!scenes.length || scenes.some((scene) => scene.status !== "succeeded")) return video;
      // Claiming the render by status means only one worker gets past here
      // however many polls arrive at once.
      const [claimed] = await db
        .update(conversationVideos)
        .set({ status: "rendering", updatedAt: now() })
        .where(
          and(
            eq(conversationVideos.id, video.id),
            eq(conversationVideos.status, "generating"),
          ),
        )
        .returning();
      if (!claimed) return video;
      video = claimed as ConversationVideo;
      shouldRender = true;
    }

    if (video.status === "rendering" && !shouldRender) {
      const stale = Date.now() - new Date(video.updatedAt).getTime() > 10 * 60 * 1000;
      if (!stale) return video;
      // Compare-and-swap on updated_at, so a render abandoned mid-flight is
      // picked up by exactly one worker. The token is the full-precision
      // string src/lib/db preserves; truncated to milliseconds it would match
      // nothing and no worker would ever take the job back.
      const [claimed] = await db
        .update(conversationVideos)
        .set({ updatedAt: now() })
        .where(
          and(
            eq(conversationVideos.id, video.id),
            eq(conversationVideos.status, "rendering"),
            eq(conversationVideos.updatedAt, video.updatedAt),
          ),
        )
        .returning();
      if (!claimed) return video;
      video = claimed as ConversationVideo;
      shouldRender = true;
    }

    if (shouldRender) {
      await renderCompletedVideo(video, scenes);
    }
  } catch (error) {
    await markFailed(video.id, error);
  }
  return reloadVideo(video.id);
}

export async function progressPendingConversationVideos(limit = 2) {
  const staleRendering = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const rows = await db
    .select({
      id: conversationVideos.id,
      status: conversationVideos.status,
      updatedAt: conversationVideos.updatedAt,
    })
    .from(conversationVideos)
    .where(
      inArray(conversationVideos.status, [
        "planning",
        "preparing",
        "generating",
        "rendering",
      ]),
    )
    .orderBy(asc(conversationVideos.updatedAt))
    .limit(limit * 2);
  const eligible = rows.filter((row) =>
    row.status === "planning" || row.status === "generating" || row.updatedAt < staleRendering,
  ).slice(0, limit);
  for (const row of eligible) {
    // A job stuck in "preparing" past the stale window lost its worker; hand
    // it back to planning so the claim in prepareConversationVideo can take
    // it, and only if nobody else has touched it since this read.
    if (row.status === "preparing" && row.updatedAt < staleRendering) {
      await db
        .update(conversationVideos)
        .set({ status: "planning", updatedAt: now() })
        .where(
          and(
            eq(conversationVideos.id, row.id),
            eq(conversationVideos.status, "preparing"),
            eq(conversationVideos.updatedAt, row.updatedAt),
          ),
        );
    }
    await progressConversationVideo(row.id);
  }
  return eligible.length;
}
