import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { stitchSessionParts } from "@/lib/audio/stitch-parts";

/**
 * Turns the chunks uploaded during an interview into the session's finished
 * recording and marks it ready for editing.
 */
export async function finalizeSessionAudio(
  session: { id: string; durationMs: number | null },
  clientDurationMs?: number
): Promise<{ error: string | null }> {
  const stitched = await stitchSessionParts(session.id);
  if (!stitched) {
    return { error: "No audio was recorded." };
  }

  // ffmpeg measured the audio itself; the browser's clock is the fallback, and
  // the last checkpoint's is what recovery has to work with.
  const durationMs =
    stitched.durationMs ?? clientDurationMs ?? session.durationMs ?? 0;

  try {
    await db
      .update(sessions)
      .set({
        status: "ready",
        rawAudioPath: stitched.path,
        durationMs: Math.max(0, Math.round(durationMs)),
      })
      .where(eq(sessions.id, session.id));
  } catch (error) {
    console.error("session finalize failed:", error);
    return { error: "Could not finalize the session." };
  }

  return { error: null };
}
