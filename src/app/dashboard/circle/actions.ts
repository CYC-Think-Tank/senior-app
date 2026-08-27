"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import {
  canReadComments,
  canWriteComment,
  conversationOwner,
  ownsReadySession,
} from "@/lib/authz";
import { db } from "@/lib/db";
import { circleShares, conversationComments, profiles } from "@/lib/db/schema";
import { normalizeCommentBody } from "@/lib/comments";
import { personName } from "@/lib/names";

export type CircleShareResult =
  | { ok: true; shared: boolean }
  | { ok: false };

/**
 * Turns whole-circle sharing on or off for one finished conversation.
 *
 * Authorised the same way as generateShareLink, through `ownsReadySession`, so
 * this only ever runs on a finished conversation the caller recorded
 * themselves. That check also keeps two other cases out without special-casing
 * them — an anonymous walk-in guest has no user_id to match, and being an
 * admin does not let anyone share someone else's story.
 */
export async function setCircleSharing(
  sessionId: string,
  shared: boolean,
): Promise<CircleShareResult> {
  const { user } = await requireUser();

  if (!(await ownsReadySession(user.id, sessionId))) return { ok: false };

  try {
    if (shared) {
      await db
        .insert(circleShares)
        .values({ session_id: sessionId, owner_id: user.id })
        .onConflictDoUpdate({
          target: circleShares.session_id,
          set: { owner_id: sql`excluded.owner_id` },
        });
    } else {
      await db
        .delete(circleShares)
        .where(eq(circleShares.session_id, sessionId));
    }
  } catch (error) {
    console.error("Could not change circle sharing:", error);
    return { ok: false };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/conversations");
  revalidatePath(`/dashboard/${sessionId}`);
  revalidatePath("/dashboard/circle");
  return { ok: true, shared };
}

export type PostCommentResult =
  | { ok: true }
  | { ok: false; reason: "empty" | "forbidden" | "failed" };

/**
 * Adds a comment to a conversation the caller can currently reach.
 *
 * `canWriteComment` is the whole authorisation. It passes only when the caller
 * is the storyteller, or a friend of theirs *and* the switch is still on — so
 * "it was unshared while I had the page open" and "I was removed from the
 * circle while I had the page open" both come back as `forbidden` without
 * needing to be checked for separately.
 */
export async function postComment(
  sessionId: string,
  body: string,
): Promise<PostCommentResult> {
  const { user } = await requireUser();

  const text = normalizeCommentBody(body);
  if (!text) return { ok: false, reason: "empty" };

  if (!(await canWriteComment(user.id, sessionId))) {
    return { ok: false, reason: "forbidden" };
  }

  const [profile] = await db
    .select({ display_name: profiles.display_name, email: profiles.email })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  try {
    await db.insert(conversationComments).values({
      session_id: sessionId,
      author_id: user.id,
      // Snapshotted, not joined at read time — see migration 016.
      author_name: personName(profile?.display_name, profile?.email ?? user.email),
      body: text,
    });
  } catch (error) {
    console.error("Could not post the comment:", error);
    return { ok: false, reason: "failed" };
  }

  revalidatePath(`/dashboard/circle/${sessionId}`);
  revalidatePath(`/dashboard/${sessionId}`);
  return { ok: true };
}

/**
 * Removes a comment. Its author may always take back what they said, and the
 * storyteller may remove anything left on their own conversation — the second
 * is moderation of your own story, not of someone else's.
 */
export async function deleteComment(commentId: string) {
  const { user } = await requireUser();

  const [comment] = await db
    .select({
      id: conversationComments.id,
      session_id: conversationComments.session_id,
      author_id: conversationComments.author_id,
    })
    .from(conversationComments)
    .where(eq(conversationComments.id, commentId))
    .limit(1);
  if (!comment) return { ok: false as const };

  // Two separate questions the select policies used to answer together: may
  // this person see the thread at all, and is this note theirs to remove.
  const isAuthor = comment.author_id === user.id;
  const isOwner = (await conversationOwner(comment.session_id)) === user.id;
  if (!isAuthor && !(await canReadComments(user.id, comment.session_id))) {
    return { ok: false as const };
  }
  if (!isAuthor && !isOwner) return { ok: false as const };

  try {
    await db
      .delete(conversationComments)
      .where(eq(conversationComments.id, commentId));
  } catch (error) {
    console.error("Could not delete the comment:", error);
    return { ok: false as const };
  }

  revalidatePath(`/dashboard/circle/${comment.session_id}`);
  revalidatePath(`/dashboard/${comment.session_id}`);
  return { ok: true as const };
}
