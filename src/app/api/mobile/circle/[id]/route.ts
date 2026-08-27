import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { canReadSharedSession, conversationOwner } from "@/lib/authz";
import { db } from "@/lib/db";
import {
  conversationComments,
  profiles,
  sessions,
} from "@/lib/db/schema";
import { notFound, requireMobileUser, unauthorized } from "@/lib/mobile/auth";
import { createAudioUrl } from "@/lib/audio/encryption";
import { editedAudioDurationMs } from "@/lib/audio/cuts";
import { RAW_BUCKET } from "@/lib/constants";
import { normalizeLocale } from "@/lib/i18n";
import { personName } from "@/lib/names";
import { ensureMoral } from "@/lib/moral/generate";
import { getExcludedAudioCuts } from "@/lib/transcript/audio-cuts";
import type { ConversationComment, InterviewSession } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * One conversation shared with the caller's circle, with its notes. Port of
 * `getCircleConversation()` and `getConversationComments()`.
 *
 * A 404 covers "never shared with me", "unshared while I was looking at it"
 * and "unfriended while I was looking at it" alike — `canReadSharedSession` is
 * evaluated on every request, which is what keeps those three
 * indistinguishable from outside.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { user } = auth;
  const { id } = await params;

  if (!(await canReadSharedSession(user.id, id))) {
    return notFound("This conversation could not be opened.");
  }

  const ownerId = await conversationOwner(id);
  if (!ownerId) return notFound("This conversation could not be opened.");
  const isOwner = ownerId === user.id;

  const [ownerProfile] = await db
    .select({ display_name: profiles.display_name, email: profiles.email })
    .from(profiles)
    .where(eq(profiles.id, ownerId))
    .limit(1);
  const ownerName = ownerProfile
    ? personName(ownerProfile.display_name, ownerProfile.email)
    : isOwner
      ? personName(null, user.email)
      : null;
  if (!ownerName) return notFound("This conversation could not be opened.");

  const [session] = (await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.status, "ready")))
    .limit(1)) as InterviewSession[];
  if (!session) return notFound("This conversation could not be opened.");

  const [profileRows, commentRows] = await Promise.all([
    db
      .select({ locale: profiles.locale })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1),
    // Reachable because `canReadSharedSession` above already granted access to
    // the conversation these belong to — the old "circle reads comments"
    // policy said the same thing in SQL.
    db
      .select({
        id: conversationComments.id,
        author_id: conversationComments.author_id,
        author_name: conversationComments.author_name,
        body: conversationComments.body,
        created_at: conversationComments.created_at,
      })
      .from(conversationComments)
      .where(eq(conversationComments.session_id, id))
      .orderBy(asc(conversationComments.created_at)),
  ]);

  const locale = normalizeLocale(profileRows[0]?.locale);
  const cuts = (await getExcludedAudioCuts([session.id])).get(session.id) ?? [];
  const audioPath = session.raw_audio_path
    ? createAudioUrl(RAW_BUCKET, session.raw_audio_path, 60 * 60 * 6)
    : null;

  // Generated on the first view that needs it, then cached on the row.
  const moral = await ensureMoral(session, ownerName);

  const comments = (commentRows as Pick<
    ConversationComment,
    "id" | "author_id" | "author_name" | "body" | "created_at"
  >[]).map((row) => ({
    id: row.id,
    authorId: row.author_id,
    authorName: row.author_name,
    body: row.body,
    createdAt: row.created_at,
    // Its author may always take back what they said, and the storyteller may
    // remove anything left on their own conversation.
    canDelete: row.author_id === user.id || isOwner,
  }));

  return NextResponse.json({
    sessionId: session.id,
    ownerId,
    ownerName,
    name: session.title?.trim() || session.topic?.trim() || "",
    createdAt: session.created_at,
    durationMs: editedAudioDurationMs(session.duration_ms, cuts),
    audioPath,
    moral: moral?.[locale] ?? null,
    isOwner,
    comments,
  });
}
