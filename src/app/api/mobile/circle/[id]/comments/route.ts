import { NextResponse, type NextRequest } from "next/server";
import {
  badRequest,
  readJson,
  requireMobileUser,
  serverError,
  unauthorized,
} from "@/lib/mobile/auth";
import { normalizeCommentBody } from "@/lib/comments";
import { personName } from "@/lib/names";

export const dynamic = "force-dynamic";

/**
 * Adds a note to a conversation the caller can currently reach. Port of
 * `postComment()`.
 *
 * The single circle_shares read below is the whole authorisation. Its policies
 * return a row only when the caller is the owner, or a friend of the owner
 * *and* the switch is still on — so "it was unshared while I had the screen
 * open" and "I was removed from the circle while I had it open" both come back
 * as 403 without being checked for separately.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { supabase, admin, user } = auth;
  const { id } = await params;

  const body = await readJson(request);
  const text = normalizeCommentBody(
    typeof body.body === "string" ? body.body : ""
  );
  if (!text) return badRequest("Write something first.");

  const { data: share } = await supabase
    .from("circle_shares")
    .select("session_id, owner_id")
    .eq("session_id", id)
    .maybeSingle();
  if (!share) {
    return NextResponse.json(
      { error: "This conversation is no longer shared with you." },
      { status: 403 }
    );
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("display_name, email")
    .eq("id", user.id)
    .single();

  const authorName = personName(profile?.display_name, profile?.email ?? user.email);
  const { data: comment, error } = await admin
    .from("conversation_comments")
    .insert({
      session_id: id,
      author_id: user.id,
      // Snapshotted, not joined at read time — see migration 016.
      author_name: authorName,
      body: text,
    })
    .select("id, author_id, author_name, body, created_at")
    .single();

  if (error || !comment) {
    console.error("Could not post the comment:", error);
    return serverError("Could not post your note.");
  }

  return NextResponse.json({
    id: comment.id,
    authorId: comment.author_id,
    authorName: comment.author_name,
    body: comment.body,
    createdAt: comment.created_at,
    canDelete: true,
  });
}
