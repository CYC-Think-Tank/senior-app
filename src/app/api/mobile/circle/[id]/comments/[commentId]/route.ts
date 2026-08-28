import { NextResponse, type NextRequest } from "next/server";
import {
  notFound,
  requireMobileUser,
  serverError,
  unauthorized,
} from "@/lib/mobile/auth";
import { eq } from "drizzle-orm";
import { conversationOwner } from "@/lib/authz";
import { db } from "@/lib/db";
import { conversationComments } from "@/lib/db/schema";

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
  const { user } = auth;
  const { commentId } = await params;

  const [comment] = await db
    .select({
      id: conversationComments.id,
      sessionId: conversationComments.sessionId,
      authorId: conversationComments.authorId,
    })
    .from(conversationComments)
    .where(eq(conversationComments.id, commentId))
    .limit(1);
  if (!comment) return notFound("That note is already gone.");

  const allowed =
    comment.authorId === user.id ||
    (await conversationOwner(comment.sessionId)) === user.id;
  if (!allowed) {
    return NextResponse.json({ error: "Not yours to remove." }, { status: 403 });
  }

  try {
    await db
      .delete(conversationComments)
      .where(eq(conversationComments.id, commentId));
  } catch (error) {
    console.error("Could not delete the comment:", error);
    return serverError("Could not remove that note.");
  }

  return NextResponse.json({ ok: true });
}
