import { and, eq, isNull, lt, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { guests, sessions } from "@/lib/db/schema";
import { ANON_RETENTION_MS, RAW_BUCKET } from "@/lib/constants";
import { partsPrefix } from "@/lib/audio/parts";
import { list, remove } from "@/lib/storage";

// One sweep handles this many sessions; the rest wait for the next run so a
// backlog cannot outlast the request budget.
const BATCH = 200;

export type TrashResult = {
  sessions: number;
  guests: number;
  objects: number;
  errors: string[];
};

/** Every stored object under a session's folder, chunks included. */
async function listSessionObjects(sessionId: string): Promise<string[]> {
  const paths: string[] = [];

  for (const prefix of [sessionId, partsPrefix(sessionId)]) {
    const entries = await list(RAW_BUCKET, prefix);
    for (const entry of entries) {
      paths.push(`${prefix}/${entry.name}`);
    }
  }

  return paths;
}

/**
 * Deletes conversations from the public /interview flow that were never
 * finished: the guest closed the tab, and because the guest belongs to no
 * family and no account, nothing will ever surface or salvage them.
 *
 * Only sessions past the retention window are touched, so someone who steps
 * away and reopens their link still finds the conversation waiting. Finished
 * ('ready') conversations are never trashed, anonymous or not.
 */
export async function trashAbandonedAnonymousSessions(
  retentionMs: number = ANON_RETENTION_MS
): Promise<TrashResult> {
  const cutoff = new Date(Date.now() - retentionMs).toISOString();
  const result: TrashResult = {
    sessions: 0,
    guests: 0,
    objects: 0,
    errors: [],
  };

  // The join is what makes this narrow: a guest with no account to claim them,
  // i.e. an anonymous walk-in from the public /interview flow.
  let abandoned: { id: string; guest_id: string }[];
  try {
    abandoned = await db
      .select({ id: sessions.id, guest_id: sessions.guest_id })
      .from(sessions)
      .innerJoin(guests, eq(guests.id, sessions.guest_id))
      .where(
        and(
          ne(sessions.status, "ready"),
          lt(sessions.created_at, cutoff),
          isNull(guests.user_id)
        )
      )
      .limit(BATCH);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    result.errors.push(`Could not list abandoned sessions: ${detail}`);
    return result;
  }

  for (const session of abandoned) {
    try {
      // Storage first: a row deleted before its audio would strand the chunks
      // with nothing left to point at them.
      const paths = await listSessionObjects(session.id);
      if (paths.length > 0) {
        await remove(RAW_BUCKET, paths);
        result.objects += paths.length;
      }

      // Cascades the transcript turns saved by the live checkpoints.
      await db.delete(sessions).where(eq(sessions.id, session.id));
      result.sessions += 1;

      // The public flow mints one throwaway guest per conversation, so the
      // guest goes too — unless an admin has since given them another session.
      const remaining = await db
        .select({ id: sessions.id })
        .from(sessions)
        .where(eq(sessions.guest_id, session.guest_id))
        .limit(1);

      if (remaining.length === 0) {
        await db.delete(guests).where(eq(guests.id, session.guest_id));
        result.guests += 1;
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      result.errors.push(`${session.id}: ${detail}`);
    }
  }

  return result;
}
