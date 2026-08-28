import { NextResponse, type NextRequest } from "next/server";
import {
  readJson,
  readString,
  requireMobileUser,
  serverError,
  unauthorized,
} from "@/lib/mobile/auth";
import { editedAudioDurationMs } from "@/lib/audio/cuts";
import { interviewLanguage, normalizeLocale, translate } from "@/lib/i18n";
import { conversationNames, personName } from "@/lib/names";
import { getExcludedAudioCuts } from "@/lib/transcript/audio-cuts";
import { decryptTurns } from "@/lib/transcript/encryption";
import { and, asc, desc, eq } from "drizzle-orm";
import { canReadOwnSession, ownSessionCondition } from "@/lib/authz";
import { db } from "@/lib/db";
import {
  circleShares,
  guests,
  profiles,
  sessions,
  transcriptTurns,
} from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** Everything this account has recorded, newest first. */
export async function GET(request: NextRequest) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { user } = auth;

  const [profileRows, rows] = await Promise.all([
    db
      .select({ locale: profiles.locale })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1),
    // ownSessionCondition is the "users read their own sessions" policy: their
    // own conversations, finished or abandoned long enough to be resumable.
    db
      .select({
        id: sessions.id,
        token: sessions.token,
        title: sessions.title,
        status: sessions.status,
        createdAt: sessions.createdAt,
        durationMs: sessions.durationMs,
        shareToken: sessions.shareToken,
        guestName: guests.name,
      })
      .from(sessions)
      .innerJoin(guests, eq(guests.id, sessions.guestId))
      .where(ownSessionCondition(user.id))
      .orderBy(desc(sessions.createdAt)),
  ]);

  const locale = normalizeLocale(profileRows[0]?.locale);

  // Scoped to the caller's own switches; a friend's shares live in the feed.
  const shares = await db
    .select({ sessionId: circleShares.sessionId })
    .from(circleShares)
    .where(eq(circleShares.ownerId, user.id));
  const shared = new Set(shares.map((share) => share.sessionId));

  const names = conversationNames(rows, (number) =>
    translate(locale, "familyConversationNumbered", { number })
  );
  // Only ids the read above already authorised are handed to the helper that
  // reads private cut timestamps.
  const cuts = await getExcludedAudioCuts(rows.map((row) => row.id));

  return NextResponse.json(
    rows.map((row) => ({
      id: row.id,
      guestName: row.guestName,
      name: names.get(row.id) ?? translate(locale, "familyConversationLabel"),
      title: row.title,
      createdAt: row.createdAt,
      durationMs: editedAudioDurationMs(row.durationMs, cuts.get(row.id) ?? []),
      shareToken: row.shareToken,
      unfinished: row.status !== "ready",
      sharedWithCircle: shared.has(row.id),
      // Their own conversation's own capability token. ownSessionCondition
      // only admits a recording session whose checkpoints have gone stale, so
      // this cannot hand back the token of a conversation already in progress.
      resumeToken: row.status === "ready" ? null : row.token,
    }))
  );
}

/**
 * Starts a conversation, or reopens one that ended before it was wrapped up.
 * Port of `startMyConversation()` and `resumeConversation()`, which are one
 * call here because the app treats them as one button.
 */
export async function POST(request: NextRequest) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { user } = auth;

  const body = await readJson(request);
  const resumeSessionId = readString(body, "resumeSessionId", 64);

  if (resumeSessionId) {
    return resumeConversation(user.id, resumeSessionId);
  }

  const [[profile], [existing]] = await Promise.all([
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
      .select({ id: guests.id, name: guests.name, language: guests.language })
      .from(guests)
      .where(eq(guests.userId, user.id))
      .limit(1),
  ]);

  const email = profile?.email ?? user.email;
  const currentName = personName(profile?.displayName, email);
  const currentLanguage = interviewLanguage(normalizeLocale(profile?.locale));

  let guestId: string;
  if (existing) {
    guestId = existing.id;
    if (existing.name !== currentName || existing.language !== currentLanguage) {
      try {
        await db
          .update(guests)
          .set({ name: currentName, language: currentLanguage })
          .where(eq(guests.id, guestId));
      } catch (error) {
        console.error("Could not update the self guest:", error);
        return serverError("Could not start the conversation.");
      }
    }
  } else {
    try {
      // The userId is what makes the finished recording reachable from their
      // own dashboard; every own-conversation check joins through it.
      const [guest] = await db
        .insert(guests)
        .values({
          userId: user.id,
          name: currentName,
          language: currentLanguage,
          origin: "self_serve",
        })
        .returning({ id: guests.id });
      if (!guest) throw new Error("No guest row was created.");
      guestId = guest.id;
    } catch (error) {
      console.error("Could not create a self guest:", error);
      return serverError("Could not start the conversation.");
    }
  }

  let session;
  try {
    [session] = await db
      .insert(sessions)
      .values({ guestId })
      .returning({ id: sessions.id, token: sessions.token });
  } catch (error) {
    console.error("Could not create a conversation:", error);
    return serverError("Could not start the conversation.");
  }
  if (!session) return serverError("Could not start the conversation.");

  return NextResponse.json({ sessionId: session.id, token: session.token });
}

/**
 * Picks a conversation back up at the link it was recorded on, handing the app
 * everything the earlier sittings saved so the new audio appends to the old.
 *
 * `canReadOwnSession` is the authorisation, exactly as in the web
 * `resumeConversation()`: it only admits a `recording` session whose
 * checkpoints have gone stale, so this cannot walk in on a conversation
 * already in progress.
 */
async function resumeConversation(userId: string, sessionId: string) {
  const stillContinuable = await canReadOwnSession(userId, sessionId);

  const [session] = stillContinuable
    ? await db
        .select({
          id: sessions.id,
          token: sessions.token,
          durationMs: sessions.durationMs,
        })
        .from(sessions)
        .where(
          and(eq(sessions.id, sessionId), eq(sessions.status, "recording")),
        )
        .limit(1)
    : [];

  if (!session) {
    return NextResponse.json(
      { error: "This conversation can no longer be continued." },
      { status: 409 }
    );
  }

  const rows = await db
    .select({
      idx: transcriptTurns.idx,
      speaker: transcriptTurns.speaker,
      text: transcriptTurns.text,
      startMs: transcriptTurns.startMs,
      endMs: transcriptTurns.endMs,
    })
    .from(transcriptTurns)
    .where(eq(transcriptTurns.sessionId, session.id))
    .orderBy(asc(transcriptTurns.idx));

  const turns = decryptTurns(session.id, rows);
  // Where the new sitting sits on the conversation's timeline. The last
  // checkpoint's duration is what recovery has to work with; the final turn is
  // the floor, so a stale heartbeat cannot rewind over recorded audio.
  const lastTurnEnd = turns.reduce((max, turn) => Math.max(max, turn.endMs), 0);
  const offsetMs = Math.max(session.durationMs ?? 0, lastTurnEnd);

  return NextResponse.json({
    sessionId: session.id,
    token: session.token,
    resume: {
      offsetMs,
      turns: turns.map((turn) => ({
        speaker: turn.speaker,
        text: turn.text,
        startMs: turn.startMs,
        endMs: turn.endMs,
      })),
    },
  });
}
