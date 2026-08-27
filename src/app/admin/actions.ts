"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { authUsers, guests, profiles, transcriptTurns } from "@/lib/db/schema";

/**
 * Removes an account and everything hanging off it.
 *
 * Supabase did most of this through foreign keys into `auth.users`:
 * `profiles.id` cascaded, and `guests.user_id` was set null. There is no
 * `auth` schema any more — `001_migrate_azure.sql` deliberately dropped it —
 * so those two rules are spelled out here, in the same order, inside one
 * transaction so a half-deleted account cannot survive a failure.
 *
 * Deleting the profile still cascades in the database: friendships, circle
 * shares, comments and support requests all reference it.
 */
export async function deleteUser(userId: string) {
  const { user } = await requireAdmin();
  if (userId === user.id) throw new Error("You cannot delete your own account.");

  try {
    await db.transaction(async (tx) => {
      // Their conversations outlive them, unowned — what `on delete set null`
      // did. Deleting the guest instead would take the recordings with it.
      await tx
        .update(guests)
        .set({ user_id: null })
        .where(eq(guests.user_id, userId));

      await tx.delete(profiles).where(eq(profiles.id, userId));
      await tx.delete(authUsers).where(eq(authUsers.id, userId));
    });
  } catch (error) {
    console.error("Could not delete that user:", error);
    throw new Error("Could not delete that user.");
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin");
}

export async function setTurnExcluded(
  turnId: string,
  sessionId: string,
  excluded: boolean
) {
  // Admins had blanket access to transcript_turns under RLS; `requireAdmin`
  // is what stands in for that now.
  await requireAdmin();

  try {
    await db
      .update(transcriptTurns)
      .set({ excluded })
      .where(
        and(
          eq(transcriptTurns.id, turnId),
          eq(transcriptTurns.session_id, sessionId)
        )
      );
  } catch (error) {
    console.error("Could not update the turn:", error);
    throw new Error("Could not update the turn.");
  }

  revalidatePath(`/admin/sessions/${sessionId}`);
  revalidatePath(`/dashboard/${sessionId}`);
  revalidatePath(`/dashboard/circle/${sessionId}`);
}
