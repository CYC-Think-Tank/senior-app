import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { notFound, requireMobileUser, unauthorized } from "@/lib/mobile/auth";
import {
  canReadCircleConversation,
  filterConnected,
  readableCircleShare,
} from "@/lib/authz";
import { db } from "@/lib/db";
import { conversationComments, profiles, sessions } from "@/lib/db/schema";
import { createAudioUrl } from "@/lib/audio/encryption";
import { editedAudioDurationMs } from "@/lib/audio/cuts";
import { RAW_BUCKET } from "@/lib/constants";
import { normalizeLocale } from "@/lib/i18n";
import { personName } from "@/lib/names";
import { ensureMoral } from "@/lib/moral/generate";
import { getExcludedAudioCuts } from "@/lib/transcript/audio-cuts";
import type { InterviewSession } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * One conversation shared with the caller's circle, with its notes. Port of
 * `getCircleConversation()` and `getConversationComments()`.
 *
 * A 404 covers "never shared with me", "unshared while I was looking at it"
 * and "unfriended while I was looking at it" alike — the share is
 * re-authorised on every request, which is what keeps those three
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

  const share = await readableCircleShare(user.id, id);
  if (!share) return notFound("This conversation could not be opened.");

  const isOwner = share.ownerId === user.id;
  // A caller is not "connected" to themselves, so the owner's own name is read
  // directly rather than through the friendship filter.
  const canSeeOwner =
    isOwner || (await filterConnected(user.id, [share.ownerId])).has(share.ownerId);
  const [ownerProfile] = canSeeOwner
    ? await db
        .select({ displayName: profiles.displayName, email: profiles.email })
        .from(profiles)
        .where(eq(profiles.id, share.ownerId))
        .limit(1)
    : [];
  const ownerName = ownerProfile
    ? personName(ownerProfile.displayName, ownerProfile.email)
    : isOwner
      ? personName(null, user.email)
      : null;
  if (!ownerName) return notFound("This conversation could not be opened.");

  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.status, "ready")))
    .limit(1);
  if (!row) return notFound("This conversation could not be opened.");
  const session = row as InterviewSession;

  // The comment policy is wider than the share: the storyteller keeps seeing
  // the notes on their own conversation after switching sharing back off.
  const mayReadComments = await canReadCircleConversation(user.id, id);

  const [[profile], commentRows] = await Promise.all([
    db
      .select({ locale: profiles.locale })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1),
    mayReadComments
      ? db
          .select({
            id: conversationComments.id,
            authorId: conversationComments.authorId,
            authorName: conversationComments.authorName,
            body: conversationComments.body,
            createdAt: conversationComments.createdAt,
          })
          .from(conversationComments)
          .where(eq(conversationComments.sessionId, id))
          .orderBy(asc(conversationComments.createdAt))
      : [],
  ]);

  const locale = normalizeLocale(profile?.locale);
  const cuts = (await getExcludedAudioCuts([session.id])).get(session.id) ?? [];
  const audioPath = session.rawAudioPath
    ? createAudioUrl(RAW_BUCKET, session.rawAudioPath, 60 * 60 * 6)
    : null;

  // Generated on the first view that needs it, then cached on the row.
  const moral = await ensureMoral(session, ownerName);

  const comments = commentRows.map((row) => ({
    id: row.id,
    authorId: row.authorId,
    authorName: row.authorName,
    body: row.body,
    createdAt: row.createdAt,
    // Its author may always take back what they said, and the storyteller may
    // remove anything left on their own conversation.
    canDelete: row.authorId === user.id || isOwner,
  }));

  return NextResponse.json({
    sessionId: session.id,
    ownerId: share.ownerId,
    ownerName,
    name: session.title?.trim() || session.topic?.trim() || "",
    createdAt: session.createdAt,
    durationMs: editedAudioDurationMs(session.durationMs, cuts),
    audioPath,
    moral: moral?.[locale] ?? null,
    isOwner,
    comments,
  });
}
