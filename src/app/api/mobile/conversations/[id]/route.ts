import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { ownSessionsFilter, ownsReadySession } from "@/lib/authz";
import { db } from "@/lib/db";
import {
  circleShares,
  profiles,
  sessions,
  transcriptTurns,
} from "@/lib/db/schema";
import { deleteConversation } from "@/lib/sessions/delete";
import {
  notFound,
  readJson,
  readString,
  requireMobileUser,
  serverError,
  unauthorized,
} from "@/lib/mobile/auth";
import { createAudioUrl } from "@/lib/audio/encryption";
import { editedAudioDurationMs } from "@/lib/audio/cuts";
import { RAW_BUCKET } from "@/lib/constants";
import { normalizeLocale, translate } from "@/lib/i18n";
import { conversationNames, personName } from "@/lib/names";
import { ensureMoral } from "@/lib/moral/generate";
import { decryptTurns } from "@/lib/transcript/encryption";
import type { InterviewSession } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * One conversation with its transcript, ready to play and edit.
 *
 * `ownSessionsFilter` is the authorisation for all three verbs in this file:
 * it is the old "users read their own sessions" policy, applied by hand now
 * that nothing in the database applies it for us.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { user } = auth;
  const { id } = await params;

  const [session] = (await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), ownSessionsFilter(user.id)))
    .limit(1)) as InterviewSession[];
  if (!session) return notFound("This conversation could not be opened.");

  const [profileRows, turnRows, shareRows, allSessions] = await Promise.all([
    db
      .select({
        display_name: profiles.display_name,
        email: profiles.email,
        locale: profiles.locale,
      })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1),
    db
      .select({
        id: transcriptTurns.id,
        idx: transcriptTurns.idx,
        speaker: transcriptTurns.speaker,
        text: transcriptTurns.text,
        start_ms: transcriptTurns.start_ms,
        end_ms: transcriptTurns.end_ms,
        excluded: transcriptTurns.excluded,
      })
      .from(transcriptTurns)
      .where(eq(transcriptTurns.session_id, id))
      .orderBy(asc(transcriptTurns.idx)),
    db
      .select({ session_id: circleShares.session_id })
      .from(circleShares)
      .where(
        and(
          eq(circleShares.session_id, id),
          eq(circleShares.owner_id, user.id)
        )
      )
      .limit(1),
    // Names are positional — "Conversation 3" only means anything against
    // the whole list — so the list is what numbering is computed from.
    db
      .select({
        id: sessions.id,
        title: sessions.title,
        created_at: sessions.created_at,
      })
      .from(sessions)
      .where(ownSessionsFilter(user.id)),
  ]);

  const profile = profileRows[0];
  const share = shareRows[0];
  const locale = normalizeLocale(profile?.locale);
  const names = conversationNames(
    allSessions,
    (number) => translate(locale, "familyConversationNumbered", { number })
  );

  const turns = decryptTurns(id, turnRows).map((turn) => ({
    id: turn.id,
    idx: turn.idx,
    speaker: turn.speaker,
    text: turn.text,
    startMs: turn.start_ms,
    endMs: turn.end_ms,
    excluded: turn.excluded,
  }));

  const cuts = turns
    .filter((turn) => turn.excluded)
    .map((turn) => ({ startMs: turn.startMs, endMs: turn.endMs }));

  // Audio at rest is ciphertext, so playback goes through the signed
  // /api/audio proxy rather than a storage URL the player could fetch itself.
  const audioPath = session.raw_audio_path
    ? createAudioUrl(RAW_BUCKET, session.raw_audio_path, 60 * 60 * 6)
    : null;

  // Written once, on the first view that needs it, then cached on the row —
  // exactly as the share page and the circle page do it.
  const ownerName = personName(profile?.display_name, profile?.email ?? user.email);
  const moral =
    session.status === "ready" ? await ensureMoral(session, ownerName) : null;

  return NextResponse.json({
    id: session.id,
    name: names.get(session.id) ?? translate(locale, "familyConversationLabel"),
    title: session.title,
    createdAt: session.created_at,
    durationMs: editedAudioDurationMs(session.duration_ms, cuts),
    status: session.status,
    shareToken: session.share_token,
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

  try {
    const renamed = await db
      .update(sessions)
      .set({ title })
      // The ownership filter is part of the write, so an id the caller does
      // not own updates nothing rather than being checked and then trusted.
      .where(and(eq(sessions.id, id), ownSessionsFilter(user.id)))
      .returning({ id: sessions.id });
    if (renamed.length === 0) {
      return notFound("This conversation could not be renamed.");
    }
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

  try {
    await deleteConversation(id);
  } catch (error) {
    console.error("Could not delete the conversation:", error);
    return serverError("Could not delete the conversation.");
  }

  return NextResponse.json({ ok: true });
}
