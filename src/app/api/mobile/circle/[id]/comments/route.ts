import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { canWriteComment } from "@/lib/authz";
import { db } from "@/lib/db";
import { conversationComments, profiles } from "@/lib/db/schema";
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
 * `canWriteComment` is the whole authorisation. It passes only when the caller
 * is the storyteller, or a friend of theirs *and* the switch is still on — so
 * "it was unshared while I had the screen open" and "I was removed from the
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

  if (!(await canWriteComment(user.id, id))) {
    return NextResponse.json(
      { error: "This conversation is no longer shared with you." },
      { status: 403 }
    );
  }

  const [profile] = await db
    .select({ display_name: profiles.display_name, email: profiles.email })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  const authorName = personName(profile?.display_name, profile?.email ?? user.email);

  try {
    const [comment] = await db
      .insert(conversationComments)
      .values({
        session_id: id,
        author_id: user.id,
        // Snapshotted, not joined at read time — see migration 016.
        author_name: authorName,
        body: text,
      })
      .returning({
        id: conversationComments.id,
        author_id: conversationComments.author_id,
        author_name: conversationComments.author_name,
        body: conversationComments.body,
        created_at: conversationComments.created_at,
      });

    return NextResponse.json({
      id: comment.id,
      authorId: comment.author_id,
      authorName: comment.author_name,
      body: comment.body,
      createdAt: comment.created_at,
      canDelete: true,
    });
  } catch (error) {
    console.error("Could not post the comment:", error);
    return serverError("Could not post your note.");
  }
}
