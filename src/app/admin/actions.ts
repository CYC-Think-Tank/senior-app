"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { authUsers, guests, profiles, transcriptTurns } from "@/lib/db/schema";

/**
 * Removes an account and everything that identifies it.
 *
 * Supabase used to cascade this from `auth.users` through foreign keys. Those
 * keys deliberately do not exist here (see the closing note in
 * 002_better_auth.sql), so the two rules they encoded are written out instead,
 * in one transaction so a half-deleted account is not representable:
 *
 *   * the profile goes with the account
 *   * their guest row survives, unlinked, so the conversations they recorded
 *     keep their storyteller's name instead of losing it
 */
export async function deleteUser(userId: string) {
  const { user } = await requireAdmin();
  if (userId === user.id) throw new Error("You cannot delete your own account.");

  try {
    await db.transaction(async (tx) => {
      await tx.update(guests).set({ userId: null }).where(eq(guests.userId, userId));
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
  await requireAdmin();

  try {
    await db
      .update(transcriptTurns)
      .set({ excluded })
      .where(
        and(
          eq(transcriptTurns.id, turnId),
          eq(transcriptTurns.sessionId, sessionId),
        ),
      );
  } catch (error) {
    console.error("Could not update the turn:", error);
    throw new Error("Could not update the turn.");
  }

  revalidatePath(`/admin/sessions/${sessionId}`);
  revalidatePath(`/dashboard/${sessionId}`);
  revalidatePath(`/dashboard/circle/${sessionId}`);
}
