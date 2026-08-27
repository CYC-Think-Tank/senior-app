import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversationVideos, sessions } from "@/lib/db/schema";
import { RAW_BUCKET, STORY_VIDEOS_BUCKET } from "@/lib/constants";
import { list, remove } from "@/lib/storage";

/**
 * Permanently removes a conversation: its recording, any generated memoir
 * film, and the row itself.
 *
 * **Authorizes nothing.** Callers must have established that the caller owns
 * the finished conversation first — `assertOwnsReadySession` in `@/lib/authz`
 * — because there is no row-level security left to catch a missing check. The
 * web action and the mobile route both do that, and both used to duplicate
 * everything below.
 *
 * Storage goes first: deleting the row before its audio would strand the blobs
 * with nothing left pointing at them. Deleting the session row cascades to the
 * transcript, circle share, comments and video rows.
 */
export async function deleteConversation(sessionId: string): Promise<void> {
  const [[session], [video]] = await Promise.all([
    db
      .select({ raw_audio_path: sessions.raw_audio_path })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1),
    db
      .select({ id: conversationVideos.id })
      .from(conversationVideos)
      .where(eq(conversationVideos.session_id, sessionId))
      .limit(1),
  ]);

  if (session?.raw_audio_path) {
    await remove(RAW_BUCKET, [session.raw_audio_path]);
  }

  if (video?.id) {
    const prefix = `${sessionId}/${video.id}`;
    // The scenes live one level down, and listing is by hierarchy, so the
    // child prefix needs its own call.
    const [objects, scenes] = await Promise.all([
      list(STORY_VIDEOS_BUCKET, prefix),
      list(STORY_VIDEOS_BUCKET, `${prefix}/scenes`),
    ]);
    const paths = [
      ...objects.map((object) => `${prefix}/${object.name}`),
      ...scenes.map((object) => `${prefix}/scenes/${object.name}`),
    ];
    if (paths.length) {
      await remove(STORY_VIDEOS_BUCKET, paths);
    }
  }

  await db.delete(sessions).where(eq(sessions.id, sessionId));
}
