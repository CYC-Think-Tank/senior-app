import { NextResponse, type NextRequest } from "next/server";
import {
  notFound,
  requireMobileUser,
  serverError,
  unauthorized,
} from "@/lib/mobile/auth";

export const dynamic = "force-dynamic";

/**
 * Removes a note. Port of `deleteComment()`: its author may always take back
 * what they said, and the storyteller may remove anything left on their own
 * conversation — the second is moderation of your own story, not of someone
 * else's.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { supabase, admin, user } = auth;
  const { commentId } = await params;

  // RLS: the select policies mean a comment only comes back if the caller is
  // allowed to see it in the first place.
  const { data: comment } = await supabase
    .from("conversation_comments")
    .select("id, session_id, author_id")
    .eq("id", commentId)
    .maybeSingle();
  if (!comment) return notFound("That note is already gone.");

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
  if (!allowed) {
    return NextResponse.json({ error: "Not yours to remove." }, { status: 403 });
  }

  const { error } = await admin
    .from("conversation_comments")
    .delete()
    .eq("id", commentId);

  if (error) {
    console.error("Could not delete the comment:", error);
    return serverError("Could not remove that note.");
  }

  return NextResponse.json({ ok: true });
}
