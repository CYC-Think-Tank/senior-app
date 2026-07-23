import type { SupabaseClient } from "@supabase/supabase-js";
import { ANON_RETENTION_MS, RAW_BUCKET } from "@/lib/constants";
import { partsPrefix } from "@/lib/audio/parts";

// One sweep handles this many sessions; the rest wait for the next run so a
// backlog cannot outlast the request budget.
const BATCH = 200;
const LIST_PAGE = 1000;

export type TrashResult = {
  sessions: number;
  guests: number;
  objects: number;
  errors: string[];
};

/** Every stored object under a session's folder, chunks included. */
async function listSessionObjects(
  admin: SupabaseClient,
  sessionId: string
): Promise<string[]> {
  const paths: string[] = [];

  for (const prefix of [sessionId, partsPrefix(sessionId)]) {
    for (let offset = 0; ; offset += LIST_PAGE) {
      const { data, error } = await admin.storage
        .from(RAW_BUCKET)
        .list(prefix, { limit: LIST_PAGE, offset });
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;
      for (const entry of data) {
        // Folders come back with a null id; only files can be removed.
        if (entry.id) paths.push(`${prefix}/${entry.name}`);
      }
      if (data.length < LIST_PAGE) break;
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
  admin: SupabaseClient,
  retentionMs: number = ANON_RETENTION_MS
): Promise<TrashResult> {
  const cutoff = new Date(Date.now() - retentionMs).toISOString();
  const result: TrashResult = {
    sessions: 0,
    guests: 0,
    objects: 0,
    errors: [],
  };

  // `!inner` makes the guest filters narrow the sessions themselves: no
  // family to listen, no account to claim it.
  const { data: sessions, error } = await admin
    .from("sessions")
    .select("id, guest_id, guests!inner(family_id, user_id)")
    .neq("status", "ready")
    .lt("created_at", cutoff)
    .is("guests.family_id", null)
    .is("guests.user_id", null)
    .limit(BATCH);

  if (error) {
    result.errors.push(`Could not list abandoned sessions: ${error.message}`);
    return result;
  }

  for (const session of sessions ?? []) {
    try {
      // Storage first: a row deleted before its audio would strand the chunks
      // with nothing left to point at them.
      const paths = await listSessionObjects(admin, session.id);
      if (paths.length > 0) {
        const { error: removeError } = await admin.storage
          .from(RAW_BUCKET)
          .remove(paths);
        if (removeError) throw new Error(removeError.message);
        result.objects += paths.length;
      }

      // Cascades the transcript turns saved by the live checkpoints.
      const { error: deleteError } = await admin
        .from("sessions")
        .delete()
        .eq("id", session.id);
      if (deleteError) throw new Error(deleteError.message);
      result.sessions += 1;

      // The public flow mints one throwaway guest per conversation, so the
      // guest goes too — unless an admin has since given them another session.
      const { data: remaining } = await admin
        .from("sessions")
        .select("id")
        .eq("guest_id", session.guest_id)
        .limit(1);
      if (!remaining || remaining.length === 0) {
        const { error: guestError } = await admin
          .from("guests")
          .delete()
          .eq("id", session.guest_id);
        if (guestError) throw new Error(guestError.message);
        result.guests += 1;
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      result.errors.push(`${session.id}: ${detail}`);
    }
  }

  return result;
}
