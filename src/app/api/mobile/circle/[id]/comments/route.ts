import { NextResponse, type NextRequest } from "next/server";
import {
  badRequest,
  readJson,
  requireMobileUser,
  serverError,
  unauthorized,
} from "@/lib/mobile/auth";
import { eq } from "drizzle-orm";
import { readableCircleShare } from "@/lib/authz";
import { db } from "@/lib/db";
import { conversationComments, profiles } from "@/lib/db/schema";
import { normalizeCommentBody } from "@/lib/comments";
import { personName } from "@/lib/names";

export const dynamic = "force-dynamic";

/**
 * Adds a note to a conversation the caller can currently reach. Port of
 * `postComment()`.
 *
 * `readableCircleShare` is the whole authorisation. It answers only when the
 * caller is the owner, or a friend of the owner *and* the switch is still on —
 * so "it was unshared while I had the screen open" and "I was removed from the
 * circle while I had it open" both come back as 403 without being checked for
 * separately.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { user } = auth;
  const { id } = await params;

  const body = await readJson(request);
  const text = normalizeCommentBody(
    typeof body.body === "string" ? body.body : ""
  );
  if (!text) return badRequest("Write something first.");

  if (!(await readableCircleShare(user.id, id))) {
    return NextResponse.json(
      { error: "This conversation is no longer shared with you." },
      { status: 403 }
    );
  }

  const [profile] = await db
    .select({ displayName: profiles.displayName, email: profiles.email })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  const authorName = personName(profile?.displayName, profile?.email ?? user.email);
  let comment;
  try {
    [comment] = await db
      .insert(conversationComments)
      .values({
        sessionId: id,
        authorId: user.id,
        // Snapshotted, not joined at read time — see migration 016.
        authorName,
        body: text,
      })
      .returning({
        id: conversationComments.id,
        authorId: conversationComments.authorId,
        authorName: conversationComments.authorName,
        body: conversationComments.body,
        createdAt: conversationComments.createdAt,
      });
  } catch (error) {
    console.error("Could not post the comment:", error);
    return serverError("Could not post your note.");
  }
  if (!comment) return serverError("Could not post your note.");

  return NextResponse.json({
    id: comment.id,
    authorId: comment.authorId,
    authorName: comment.authorName,
    body: comment.body,
    createdAt: comment.createdAt,
    canDelete: true,
  });
}
