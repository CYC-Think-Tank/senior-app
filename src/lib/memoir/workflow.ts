import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  conversationVideoScenes,
  conversationVideos,
  guests as guestsTable,
  sessions as sessionsTable,
  transcriptTurns,
} from "@/lib/db/schema";
import { download, list, remove, upload } from "@/lib/storage";
import { decryptTurns } from "@/lib/transcript/encryption";
import { createAudioUrl, decryptAudio, encryptAudio } from "@/lib/audio/encryption";
import {
  MEMOIR_MAX_OUTPUT_SECONDS,
  MEMOIR_MAX_SCENES,
  MEMOIR_MIN_SCENES,
  MEMOIR_SCENE_DURATION_SECONDS,
  STORY_VIDEOS_BUCKET,
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
  createdAt: string;
};

function sceneArchivePath(video: Pick<ConversationVideo, "id" | "session_id">, sceneIndex: number) {
  return `${video.session_id}/${video.id}/scenes/scene-${sceneIndex + 1}.mp4`;
}

function narrationArchivePath(video: Pick<ConversationVideo, "id" | "session_id">) {
  return `${video.session_id}/${video.id}/narration.m4a`;
}

export async function publicConversationVideo(video: ConversationVideo): Promise<PublicConversationVideo> {
  const prefix = `${video.session_id}/${video.id}/scenes`;
  const archived = await list(STORY_VIDEOS_BUCKET, prefix).catch((error: unknown) => {
    console.error("Could not list archived memoir scenes:", error);
    return [];
  });
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
    durationMs: video.duration_ms,
    error: video.error_message,
    videoUrl: video.status === "ready" && video.video_path
      ? createAudioUrl(STORY_VIDEOS_BUCKET, video.video_path, 6 * 60 * 60)
      : null,
    clips,
    createdAt: video.created_at,
  };
}

type VideoUpdate = Partial<typeof conversationVideos.$inferInsert>;

async function updateVideo(id: string, values: VideoUpdate) {
  await db
    .update(conversationVideos)
    .set({ ...values, updated_at: now() })
    .where(eq(conversationVideos.id, id));
}

async function markFailed(id: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Video generation failed.";
  console.error("memoir video failed:", id, error);
  await updateVideo(id, {
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
  try {
    // Claim planning atomically so a page refresh and the recovery cron cannot
    // buy the same storyboard twice.
    const [video] = await db
      .update(conversationVideos)
      .set({ status: "preparing", updated_at: now() })
      .where(
        and(eq(conversationVideos.id, videoId), eq(conversationVideos.status, "planning"))
      )
      .returning();
    if (!video) return;

    const [sessionRows, rows] = await Promise.all([
      db
        .select({ status: sessionsTable.status, guest: guestsTable })
        .from(sessionsTable)
        .innerJoin(guestsTable, eq(guestsTable.id, sessionsTable.guest_id))
        .where(eq(sessionsTable.id, video.session_id))
        .limit(1),
      db
        .select()
        .from(transcriptTurns)
        .where(eq(transcriptTurns.session_id, video.session_id))
        .orderBy(asc(transcriptTurns.idx)),
    ]);
    const session = sessionRows[0];
    if (!session || session.status !== "ready") throw new Error("Only finished conversations can become films.");
    const guest = session.guest as unknown as Guest;
    const turns = decryptTurns(video.session_id, rows as TranscriptTurn[]);
    const story = await generateMemoirStory({ guestName: guest.name, language: guest.language, turns });
    if (story.narration.length > 4096) throw new Error("The generated narration was too long to voice safely.");

    const sceneCount = MEMOIR_MIN_SCENES;
    const scenes = await generateMemoirStoryboard({ ...story, sceneCount });
    // Voice the approved storyboard before buying any Seedance tasks. If the
    // script cannot fit naturally, the job fails without spending video credits.
    const narrationMaster = await generateNarrationMaster(story.narration, sceneCount);
    const narrationPath = narrationArchivePath(video);
    await upload(
      STORY_VIDEOS_BUCKET,
      narrationPath,
      encryptAudio(narrationMaster.buffer)
    );

    await updateVideo(video.id, {
      title: story.title,
      story_ciphertext: encryptMemoirText(video.id, "story", story.story),
      narration_ciphertext: encryptMemoirText(video.id, "narration", story.narration),
      visual_bible_ciphertext: encryptMemoirText(video.id, "visual-bible", story.visualBible),
      narration_path: narrationPath,
      duration_ms: MEMOIR_MAX_OUTPUT_SECONDS * 1000,
    });

    const sceneRows = scenes.map((scene, idx) => ({
      video_id: video.id,
      idx,
      prompt_ciphertext: encryptMemoirText(video.id, `scene-${idx}`, scene.prompt),
      duration_seconds: MEMOIR_SCENE_DURATION_SECONDS,
      status: "queued" as const,
    }));
    const inserted = await db
      .insert(conversationVideoScenes)
      .values(sceneRows)
      .onConflictDoUpdate({
        target: [conversationVideoScenes.video_id, conversationVideoScenes.idx],
        set: {
          prompt_ciphertext: sql`excluded.prompt_ciphertext`,
          duration_seconds: sql`excluded.duration_seconds`,
          status: sql`excluded.status`,
          updated_at: now(),
        },
      })
      .returning();
    if (inserted.length === 0) throw new Error("Could not save the storyboard.");

    await updateVideo(video.id, { status: "generating", error_message: null });
    await submitQueuedScenes(video.id, inserted as SceneRow[]);
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
      const prompt = decryptMemoirText(videoId, `scene-${scene.idx}`, scene.prompt_ciphertext);
      const taskId = await createSeedanceScene(prompt, scene.duration_seconds);
      await db
        .update(conversationVideoScenes)
        .set({ provider_task_id: taskId, status: "running", updated_at: now() })
        .where(eq(conversationVideoScenes.id, scene.id));
    });
}

export async function startConversationVideo(
  sessionId: string,
  { regenerate = false }: { regenerate?: boolean } = {},
) {
  const [existing] = await db
    .select()
    .from(conversationVideos)
    .where(eq(conversationVideos.session_id, sessionId))
    .limit(1);

  let video: ConversationVideo;
  if (existing) {
    video = existing as ConversationVideo;
    const canRegenerate = regenerate && video.status === "ready";
    if (video.status !== "failed" && !canRegenerate) return video;
    const reusableScenes = await db
      .select()
      .from(conversationVideoScenes)
      .where(eq(conversationVideoScenes.video_id, video.id))
      .orderBy(asc(conversationVideoScenes.idx));
    const sceneRows = reusableScenes as SceneRow[];
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
      // Keep the completed story, script, and storyboard on every provider
      // retry. Keep paid SeeGen tasks, but discard task IDs from the previous
      // provider so they are never queried through the wrong API.
      for (const scene of sceneRows) {
        const reusable = isSeegenTaskId(scene.provider_task_id) && scene.status !== "failed";
        await db
          .update(conversationVideoScenes)
          .set({
            status: reusable ? "running" : "queued",
            provider_task_id: reusable ? scene.provider_task_id : null,
            result_url: null,
            error_message: null,
            updated_at: now(),
          })
          .where(eq(conversationVideoScenes.id, scene.id));
      }
      await updateVideo(video.id, { status: "generating", error_message: null });
      const [resumed] = await db
        .select()
        .from(conversationVideos)
        .where(eq(conversationVideos.id, video.id))
        .limit(1);
      return resumed as ConversationVideo;
    }
    const prefix = `${sessionId}/${video.id}`;
    const [objects, sceneObjects] = await Promise.all([
      list(STORY_VIDEOS_BUCKET, prefix),
      list(STORY_VIDEOS_BUCKET, `${prefix}/scenes`),
    ]);
    const storedPaths = [
      ...objects.map((o) => `${prefix}/${o.name}`),
      ...sceneObjects.map((o) => `${prefix}/scenes/${o.name}`),
    ];
    if (storedPaths.length) {
      await remove(STORY_VIDEOS_BUCKET, storedPaths);
    }
    await db
      .delete(conversationVideoScenes)
      .where(eq(conversationVideoScenes.video_id, video.id));
    await updateVideo(video.id, {
      status: "planning", title: null, story_ciphertext: null,
      narration_ciphertext: null, visual_bible_ciphertext: null,
      narration_path: null, video_path: null, duration_ms: null, error_message: null,
    });
    const [reset] = await db
      .select()
      .from(conversationVideos)
      .where(eq(conversationVideos.id, video.id))
      .limit(1);
    if (!reset) throw new Error("Could not reload the reset video job.");
    video = reset as ConversationVideo;
  } else {
    const [created] = await db
      .insert(conversationVideos)
      .values({ session_id: sessionId, status: "planning" })
      .returning();
    if (!created) throw new Error("Could not create the video job.");
    video = created as ConversationVideo;
  }

  return video;
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
  video: Pick<ConversationVideo, "id" | "session_id">,
  scene: Pick<SceneRow, "idx">,
  url: string,
) {
  const buffer = await downloadScene(url);
  await upload(
    STORY_VIDEOS_BUCKET,
    sceneArchivePath(video, scene.idx),
    encryptAudio(buffer)
  );
  return buffer;
}

async function readArchivedScene(
  video: Pick<ConversationVideo, "id" | "session_id">,
  scene: SceneRow,
) {
  const data = await download(
    STORY_VIDEOS_BUCKET,
    sceneArchivePath(video, scene.idx)
  );
  if (data) return decryptAudio(data);
  if (!scene.result_url) throw new Error(`Scene ${scene.idx + 1} has no saved video.`);
  return archiveSceneVideo(video, scene, scene.result_url);
}

async function readNarrationMaster(
  video: ConversationVideo,
  scenes: SceneRow[],
) {
  if (video.narration_path) {
    const data = await download(STORY_VIDEOS_BUCKET, video.narration_path);
    if (!data) {
      throw new Error("The saved master narration could not be downloaded.");
    }
    return decryptAudio(data);
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
  await upload(STORY_VIDEOS_BUCKET, path, encryptAudio(generated.buffer));
  await updateVideo(video.id, { narration_path: path });
  return generated.buffer;
}

async function renderCompletedVideo(video: ConversationVideo, scenes: SceneRow[]) {
  const ordered = [...scenes].sort((a, b) => a.idx - b.idx);
  const sceneDurationSeconds = ordered[0]?.duration_seconds;
  if (
    !sceneDurationSeconds ||
    ordered.some((scene) => scene.duration_seconds !== sceneDurationSeconds)
  ) {
    throw new Error("The memoir scenes do not share one render duration.");
  }
  const sceneBuffers = await Promise.all(
    ordered.map((scene) => readArchivedScene(video, scene)),
  );
  const narrationAudio = await readNarrationMaster(video, ordered);
  const rendered = await renderMemoirVideo(sceneBuffers, {
    sceneDurationSeconds,
    narrationAudio,
  });
  const videoPath = `${video.session_id}/${video.id}/memoir-${Date.now()}.mp4`;
  await upload(STORY_VIDEOS_BUCKET, videoPath, encryptAudio(rendered.buffer));
  await db
    .update(conversationVideoScenes)
    .set({ result_url: null, updated_at: now() })
    .where(eq(conversationVideoScenes.video_id, video.id));
  await updateVideo(video.id, {
    status: "ready",
    video_path: videoPath,
    duration_ms: rendered.durationMs ?? video.duration_ms,
    error_message: null,
  });
}

export async function progressConversationVideo(videoId: string) {
  const [data] = await db
    .select()
    .from(conversationVideos)
    .where(eq(conversationVideos.id, videoId))
    .limit(1);
  if (!data) throw new Error("Video job not found.");
  let video = data as ConversationVideo;
  if (video.status === "planning") {
    await prepareConversationVideo(video.id);
    const [prepared] = await db
      .select()
      .from(conversationVideos)
      .where(eq(conversationVideos.id, video.id))
      .limit(1);
    return prepared as ConversationVideo;
  }
  if (video.status === "ready" || video.status === "failed" || video.status === "preparing") return video;

  try {
    const readScenes = () =>
      db
        .select()
        .from(conversationVideoScenes)
        .where(eq(conversationVideoScenes.video_id, video.id))
        .orderBy(asc(conversationVideoScenes.idx)) as Promise<SceneRow[]>;

    let scenes = await readScenes();

    let shouldRender = false;
    if (video.status === "generating") {
      await submitQueuedScenes(video.id, scenes);
      scenes = await readScenes();
      await mapLimit(scenes.filter((scene) => scene.status === "running"), 4, async (scene) => {
        if (!scene.provider_task_id) throw new Error(`Scene ${scene.idx + 1} has no provider task.`);
        const result = await getSeedanceScene(scene.provider_task_id);
        const success = ["succeeded", "completed", "success"].includes(result.status);
        const failed = ["failed", "expired", "cancelled", "canceled"].includes(result.status);
        if (!success && !failed) return;
        if (success && result.videoUrl) {
          await archiveSceneVideo(video, scene, result.videoUrl);
        }
        const values = success && result.videoUrl
          ? { status: "succeeded" as const, result_url: null, error_message: null }
          : { status: "failed" as const, error_message: success ? "Seedance returned no video URL." : `Seedance scene ended as ${result.status}.` };
        await db
          .update(conversationVideoScenes)
          .set({ ...values, updated_at: now() })
          .where(eq(conversationVideoScenes.id, scene.id));
      });
      scenes = await readScenes();
      const failedScene = scenes.find((scene) => scene.status === "failed");
      if (failedScene) throw new Error(failedScene.error_message ?? `Scene ${failedScene.idx + 1} failed.`);
      if (!scenes.length || scenes.some((scene) => scene.status !== "succeeded")) return video;
      const [claimed] = await db
        .update(conversationVideos)
        .set({ status: "rendering", updated_at: now() })
        .where(
          and(
            eq(conversationVideos.id, video.id),
            eq(conversationVideos.status, "generating")
          )
        )
        .returning();
      if (!claimed) return video;
      video = claimed as ConversationVideo;
      shouldRender = true;
    }

    if (video.status === "rendering" && !shouldRender) {
      const stale = Date.now() - new Date(video.updated_at).getTime() > 10 * 60 * 1000;
      if (!stale) return video;
      const [claimed] = await db
        .update(conversationVideos)
        .set({ updated_at: now() })
        .where(
          and(
            eq(conversationVideos.id, video.id),
            eq(conversationVideos.status, "rendering"),
            eq(conversationVideos.updated_at, video.updated_at)
          )
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
  const [current] = await db
    .select()
    .from(conversationVideos)
    .where(eq(conversationVideos.id, video.id))
    .limit(1);
  return current as ConversationVideo;
}

export async function progressPendingConversationVideos(limit = 2) {
  const staleRendering = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const pending = await db
    .select({
      id: conversationVideos.id,
      status: conversationVideos.status,
      updated_at: conversationVideos.updated_at,
    })
    .from(conversationVideos)
    .where(
      inArray(conversationVideos.status, [
        "planning",
        "preparing",
        "generating",
        "rendering",
      ])
    )
    .orderBy(asc(conversationVideos.updated_at))
    .limit(limit * 2);

  const eligible = pending.filter((row) =>
    row.status === "planning" || row.status === "generating" || row.updated_at < staleRendering,
  ).slice(0, limit);

  for (const row of eligible) {
    if (row.status === "preparing" && row.updated_at < staleRendering) {
      await db
        .update(conversationVideos)
        .set({ status: "planning", updated_at: now() })
        .where(
          and(
            eq(conversationVideos.id, row.id),
            eq(conversationVideos.status, "preparing"),
            eq(conversationVideos.updated_at, row.updated_at)
          )
        );
    }
    await progressConversationVideo(row.id);
  }
  return eligible.length;
}
