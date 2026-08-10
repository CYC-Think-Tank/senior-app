"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeCommentBody } from "@/lib/comments";
import { personName } from "@/lib/names";

export type CircleShareResult =
  | { ok: true; shared: boolean }
  | { ok: false };

/**
 * Turns whole-circle sharing on or off for one finished conversation.
 *
 * Authorised the same way as generateShareLink: the session is read through
 * the caller's RLS-scoped client first, so this only ever runs on a finished
 * conversation they recorded themselves. That read is also what keeps two
 * other cases out without special-casing them — an anonymous walk-in guest has
 * no user_id to match, and an admin's blanket access to sessions does not let
 * them share someone else's story.
 */
export async function setCircleSharing(
  sessionId: string,
  shared: boolean,
): Promise<CircleShareResult> {
  const { supabase, user } = await requireUser();

  const { data: session } = await supabase
    .from("sessions")
    .select("id, guests!inner(user_id)")
    .eq("id", sessionId)
    .eq("status", "ready")
    .eq("guests.user_id", user.id)
    .single();

  if (!session) return { ok: false };

  const admin = createSupabaseAdminClient();
  const { error } = shared
    ? await admin
        .from("circle_shares")
        .upsert({ session_id: sessionId, owner_id: user.id })
    : await admin.from("circle_shares").delete().eq("session_id", sessionId);

  if (error) {
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
 * The single circle_shares read below is the whole authorisation. Its policies
 * return a row only when the caller is the owner, or a friend of the owner
 * *and* the switch is still on — so "it was unshared while I had the page
 * open" and "I was removed from the circle while I had the page open" both
 * come back as `forbidden` without needing to be checked for separately.
 */
export async function postComment(
  sessionId: string,
  body: string,
): Promise<PostCommentResult> {
  const { supabase, user } = await requireUser();

  const text = normalizeCommentBody(body);
  if (!text) return { ok: false, reason: "empty" };

  const { data: share } = await supabase
    .from("circle_shares")
    .select("session_id")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (!share) return { ok: false, reason: "forbidden" };

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("display_name, email")
    .eq("id", user.id)
    .single();

  const { error } = await admin.from("conversation_comments").insert({
    session_id: sessionId,
    author_id: user.id,
    // Snapshotted, not joined at read time — see migration 016.
    author_name: personName(profile?.display_name, profile?.email ?? user.email),
    body: text,
  });

  if (error) {
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
  const { supabase, user } = await requireUser();

  // RLS: the select policies mean a comment only comes back if the caller is
  // allowed to see it in the first place.
  const { data: comment } = await supabase
    .from("conversation_comments")
    .select("id, session_id, author_id")
    .eq("id", commentId)
    .maybeSingle();
  if (!comment) return { ok: false as const };

  let allowed = comment.author_id === user.id;
  if (!allowed) {
    const { data: owned } = await supabase
      .from("sessions")
      .select("id, guests!inner(user_id)")
      .eq("id", comment.session_id)
      .eq("guests.user_id", user.id)
      .maybeSingle();
    allowed = Boolean(owned);
  }
  if (!allowed) return { ok: false as const };

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("conversation_comments")
    .delete()
    .eq("id", commentId);

  if (error) {
    console.error("Could not delete the comment:", error);
    return { ok: false as const };
  }

  revalidatePath(`/dashboard/circle/${comment.session_id}`);
  revalidatePath(`/dashboard/${comment.session_id}`);
  return { ok: true as const };
}
