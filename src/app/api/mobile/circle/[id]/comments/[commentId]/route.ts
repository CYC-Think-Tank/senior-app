import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { canReadComments, conversationOwner } from "@/lib/authz";
import { db } from "@/lib/db";
import { conversationComments } from "@/lib/db/schema";
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
  const { user } = auth;
  const { commentId } = await params;

  const [comment] = await db
    .select({
      id: conversationComments.id,
      session_id: conversationComments.session_id,
      author_id: conversationComments.author_id,
    })
    .from(conversationComments)
    .where(eq(conversationComments.id, commentId))
    .limit(1);
  if (!comment) return notFound("That note is already gone.");

  // Two separate questions the select policies used to answer together: may
  // this person see the thread at all, and is this particular note theirs to
  // remove. Authors may always take back what they said; the storyteller may
  // remove anything left on their own conversation.
  const isAuthor = comment.author_id === user.id;
  const isOwner = (await conversationOwner(comment.session_id)) === user.id;
  const canSee = isAuthor || (await canReadComments(user.id, comment.session_id));

  if (!canSee) return notFound("That note is already gone.");
  if (!isAuthor && !isOwner) {
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
