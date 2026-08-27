import { NextResponse, type NextRequest } from "next/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { ownSessionsFilter } from "@/lib/authz";
import { db } from "@/lib/db";
import {
  circleShares,
  guests,
  profiles,
  sessions,
  transcriptTurns,
} from "@/lib/db/schema";
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
import type { InterviewSession } from "@/lib/types";

export const dynamic = "force-dynamic";

type SessionRow = Pick<
  InterviewSession,
  "id" | "title" | "status" | "created_at" | "duration_ms" | "share_token" | "token"
> & { guests: { name: string; user_id: string } };

/** Everything this account has recorded, newest first. */
export async function GET(request: NextRequest) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { user } = auth;

  const [profileRows, found] = await Promise.all([
    db
      .select({ locale: profiles.locale })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1),
    db
      .select({
        id: sessions.id,
        token: sessions.token,
        title: sessions.title,
        status: sessions.status,
        created_at: sessions.created_at,
        duration_ms: sessions.duration_ms,
        share_token: sessions.share_token,
        guest_name: guests.name,
        guest_user_id: guests.user_id,
      })
      .from(sessions)
      .innerJoin(guests, eq(guests.id, sessions.guest_id))
      // The abandonment window in `ownSessionsFilter` is what keeps a live
      // conversation out of this list — same as the old policy.
      .where(ownSessionsFilter(user.id))
      .orderBy(desc(sessions.created_at)),
  ]);

  const locale = normalizeLocale(profileRows[0]?.locale);
  const rows = found.map(({ guest_name, guest_user_id, ...row }) => ({
    ...row,
    guests: { name: guest_name, user_id: guest_user_id ?? "" },
  })) as unknown as SessionRow[];

  // "owner reads own circle shares", stated explicitly.
  const shares = await db
    .select({ session_id: circleShares.session_id })
    .from(circleShares)
    .where(eq(circleShares.owner_id, user.id));
  const shared = new Set(shares.map((share) => share.session_id));

  const names = conversationNames(rows, (number) =>
    translate(locale, "familyConversationNumbered", { number })
  );
  // Only ids the ownership filter above already authorised are handed to the
  // helper that reads private cut timestamps.
  const cuts = await getExcludedAudioCuts(rows.map((row) => row.id));

  return NextResponse.json(
    rows.map((row) => ({
      id: row.id,
      guestName: row.guests.name,
      name: names.get(row.id) ?? translate(locale, "familyConversationLabel"),
      title: row.title,
      createdAt: row.created_at,
      durationMs: editedAudioDurationMs(row.duration_ms, cuts.get(row.id) ?? []),
      shareToken: row.share_token,
      unfinished: row.status !== "ready",
      sharedWithCircle: shared.has(row.id),
      // Their own conversation's own capability token. The filter only
      // returns a recording session whose checkpoints have gone stale, so this
      // cannot hand back the token of a conversation already in progress.
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

  const [profileRows, existingRows] = await Promise.all([
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
      .select({ id: guests.id, name: guests.name, language: guests.language })
      .from(guests)
      .where(eq(guests.user_id, user.id))
      .limit(1),
  ]);

  const profile = profileRows[0];
  const existing = existingRows[0];
  const email = profile?.email ?? user.email;
  const currentName = personName(profile?.display_name, email);
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
    // The user_id is what makes the finished recording visible on their own
    // dashboard; see `ownSessionsFilter`.
    try {
      const [guest] = await db
        .insert(guests)
        .values({
          user_id: user.id,
          name: currentName,
          language: currentLanguage,
          origin: "self_serve",
        })
        .returning({ id: guests.id });
      guestId = guest.id;
    } catch (error) {
      console.error("Could not create a self guest:", error);
      return serverError("Could not start the conversation.");
    }
  }

  try {
    const [session] = await db
      .insert(sessions)
      .values({ guest_id: guestId })
      .returning({ id: sessions.id, token: sessions.token });
    return NextResponse.json({ sessionId: session.id, token: session.token });
  } catch (error) {
    console.error("Could not create a conversation:", error);
    return serverError("Could not start the conversation.");
  }
}

/**
 * Picks a conversation back up at the link it was recorded on, handing the app
 * everything the earlier sittings saved so the new audio appends to the old.
 *
 * `ownSessionsFilter` is the authorisation, exactly as in
 * `resumeConversation()`: it only exposes a `recording` session whose
 * checkpoints have gone stale, so this cannot walk in on a conversation
 * already in progress, and it cannot reach another account's at all.
 */
async function resumeConversation(userId: string, sessionId: string) {
  const [session] = await db
    .select({
      id: sessions.id,
      token: sessions.token,
      duration_ms: sessions.duration_ms,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.id, sessionId),
        eq(sessions.status, "recording"),
        ownSessionsFilter(userId)
      )
    )
    .limit(1);

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
      start_ms: transcriptTurns.start_ms,
      end_ms: transcriptTurns.end_ms,
    })
    .from(transcriptTurns)
    .where(eq(transcriptTurns.session_id, session.id))
    .orderBy(asc(transcriptTurns.idx));

  const turns = decryptTurns(session.id, rows);
  // Where the new sitting sits on the conversation's timeline. The last
  // checkpoint's duration is what recovery has to work with; the final turn is
  // the floor, so a stale heartbeat cannot rewind over recorded audio.
  const lastTurnEnd = turns.reduce((max, turn) => Math.max(max, turn.end_ms), 0);
  const offsetMs = Math.max(session.duration_ms ?? 0, lastTurnEnd);

  return NextResponse.json({
    sessionId: session.id,
    token: session.token,
    resume: {
      offsetMs,
      turns: turns.map((turn) => ({
        speaker: turn.speaker,
        text: turn.text,
        startMs: turn.start_ms,
        endMs: turn.end_ms,
      })),
    },
  });
}
