import { NextResponse, type NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import {
  notFound,
  readJson,
  readString,
  requireMobileUser,
  serverError,
  unauthorized,
} from "@/lib/mobile/auth";
import {
  canReadOwnSession,
  ownSessionCondition,
  ownsReadySession,
} from "@/lib/authz";
import { db } from "@/lib/db";
import {
  circleShares,
  conversationVideos,
  guests,
  profiles,
  sessions,
  transcriptTurns,
} from "@/lib/db/schema";
import { createAudioUrl } from "@/lib/audio/encryption";
import { editedAudioDurationMs } from "@/lib/audio/cuts";
import { RAW_BUCKET } from "@/lib/constants";
import { normalizeLocale, translate } from "@/lib/i18n";
import { conversationNames, personName } from "@/lib/names";
import { removeVideoObjects } from "@/lib/memoir/workflow";
import { ensureMoral } from "@/lib/moral/generate";
import { remove } from "@/lib/storage";
import { decryptTurns } from "@/lib/transcript/encryption";
import type { InterviewSession } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * One conversation with its transcript, ready to play and edit.
 *
 * `canReadOwnSession` is the authorisation for all three verbs in this file:
 * it answers only when the caller recorded the conversation themselves.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { user } = auth;
  const { id } = await params;

  if (!(await canReadOwnSession(user.id, id))) {
    return notFound("This conversation could not be opened.");
  }

  const [row] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, id))
    .limit(1);
  if (!row) return notFound("This conversation could not be opened.");
  const session = row as InterviewSession;

  const [[profile], turnRows, [share], allSessions] = await Promise.all([
    db
      .select({
        displayName: profiles.displayName,
        email: profiles.email,
        locale: profiles.locale,
      })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1),
    db
      .select()
      .from(transcriptTurns)
      .where(eq(transcriptTurns.sessionId, id))
      .orderBy(asc(transcriptTurns.idx)),
    db
      .select({ sessionId: circleShares.sessionId })
      .from(circleShares)
      .where(eq(circleShares.sessionId, id))
      .limit(1),
    // Names are positional — "Conversation 3" only means anything against
    // the whole list — so the list is what numbering is computed from.
    db
      .select({
        id: sessions.id,
        title: sessions.title,
        createdAt: sessions.createdAt,
      })
      .from(sessions)
      .innerJoin(guests, eq(guests.id, sessions.guestId))
      .where(ownSessionCondition(user.id)),
  ]);

  const locale = normalizeLocale(profile?.locale);
  const names = conversationNames(allSessions, (number) =>
    translate(locale, "familyConversationNumbered", { number }),
  );

  const turns = decryptTurns(id, turnRows).map((turn) => ({
    id: turn.id,
    idx: turn.idx,
    speaker: turn.speaker,
    text: turn.text,
    startMs: turn.startMs,
    endMs: turn.endMs,
    excluded: turn.excluded,
  }));

  const cuts = turns
    .filter((turn) => turn.excluded)
    .map((turn) => ({ startMs: turn.startMs, endMs: turn.endMs }));

  // Audio at rest is ciphertext, so playback goes through the signed
  // /api/audio proxy rather than a storage URL.
  const audioPath = session.rawAudioPath
    ? createAudioUrl(RAW_BUCKET, session.rawAudioPath, 60 * 60 * 6)
    : null;

  // Written once, on the first view that needs it, then cached on the row —
  // exactly as the share page and the circle page do it.
  const ownerName = personName(profile?.displayName, profile?.email ?? user.email);
  const moral =
    session.status === "ready" ? await ensureMoral(session, ownerName) : null;

  return NextResponse.json({
    id: session.id,
    name: names.get(session.id) ?? translate(locale, "familyConversationLabel"),
    title: session.title,
    createdAt: session.createdAt,
    durationMs: editedAudioDurationMs(session.durationMs, cuts),
    status: session.status,
    shareToken: session.shareToken,
    sharedWithCircle: Boolean(share),
    resumeToken: session.status === "ready" ? null : session.token,
    audioPath,
    moral: moral?.[locale] ?? null,
    turns,
  });
}

/**
 * Renames a conversation. Writes `title`, never `topic` — the latter feeds the
 * AI host, so it has to keep describing the interview. An empty name clears it
 * and the conversation returns to numbering.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { user } = auth;
  const { id } = await params;

  const body = await readJson(request);
  const title = readString(body, "title", 120) || null;

  // Unfinished conversations are nameable too — they show up in the same list.
  if (!(await canReadOwnSession(user.id, id))) {
    return notFound("This conversation could not be renamed.");
  }

  try {
    await db.update(sessions).set({ title }).where(eq(sessions.id, id));
  } catch (error) {
    console.error("Could not rename the conversation:", error);
    return serverError("Could not rename the conversation.");
  }

  return NextResponse.json({ ok: true });
}

/** Permanently removes a conversation, its recording, and any story video. */
export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { user } = auth;
  const { id } = await params;

  if (!(await ownsReadySession(user.id, id))) {
    return notFound("This conversation could not be deleted.");
  }

  const [[session], [video]] = await Promise.all([
    db
      .select({ rawAudioPath: sessions.rawAudioPath })
      .from(sessions)
      .where(eq(sessions.id, id))
      .limit(1),
    db
      .select({ id: conversationVideos.id })
      .from(conversationVideos)
      .where(eq(conversationVideos.sessionId, id))
      .limit(1),
  ]);

  // Stored objects first: the row is what points at them, so deleting it
  // first would strand the audio with nothing left to find it by.
  if (session?.rawAudioPath) {
    await remove(RAW_BUCKET, [session.rawAudioPath]);
  }
  if (video?.id) {
    await removeVideoObjects(id, video.id);
  }

  try {
    // Cascades the transcript, circle share, comments, and video rows.
    await db.delete(sessions).where(eq(sessions.id, id));
  } catch (error) {
    console.error("Could not delete the conversation:", error);
    return serverError("Could not delete the conversation.");
  }

  return NextResponse.json({ ok: true });
}
