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
  const { supabase, user } = auth;

  const [{ data: profile }, { data }] = await Promise.all([
    supabase.from("profiles").select("locale").eq("id", user.id).maybeSingle(),
    supabase
      .from("sessions")
      .select(
        "id, token, title, status, created_at, duration_ms, share_token, guests!inner(name, user_id)"
      )
      .in("status", ["ready", "recording"])
      .eq("guests.user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const locale = normalizeLocale(profile?.locale);
  const rows = (data ?? []) as unknown as SessionRow[];

  // "owner reads own circle shares" scopes this to the caller's own switches.
  const { data: shares } = await supabase
    .from("circle_shares")
    .select("session_id")
    .eq("owner_id", user.id);
  const shared = new Set((shares ?? []).map((share) => share.session_id));

  const names = conversationNames(rows, (number) =>
    translate(locale, "familyConversationNumbered", { number })
  );
  // Only ids the caller's own RLS read already authorised are handed to the
  // service helper that reads private cut timestamps.
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
      // Their own conversation's own capability token. The RLS policy only
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
  const { supabase, admin, user } = auth;

  const body = await readJson(request);
  const resumeSessionId = readString(body, "resumeSessionId", 64);

  if (resumeSessionId) {
    return resumeConversation(auth, resumeSessionId);
  }

  const [{ data: profile }, { data: existing }] = await Promise.all([
    admin.from("profiles").select("display_name, email, locale").eq("id", user.id).single(),
    admin.from("guests").select("id, name, language").eq("user_id", user.id).maybeSingle(),
  ]);

  const email = profile?.email ?? user.email;
  const currentName = personName(profile?.display_name, email);
  const currentLanguage = interviewLanguage(normalizeLocale(profile?.locale));

  let guestId: string;
  if (existing) {
    guestId = existing.id;
    if (existing.name !== currentName || existing.language !== currentLanguage) {
      const { error } = await admin
        .from("guests")
        .update({ name: currentName, language: currentLanguage })
        .eq("id", guestId);
      if (error) {
        console.error("Could not update the self guest:", error);
        return serverError("Could not start the conversation.");
      }
    }
  } else {
    // The user_id is what makes the finished recording visible on their own
    // dashboard; see the "users read their own sessions" policy.
    const { data: guest, error } = await admin
      .from("guests")
      .insert({
        user_id: user.id,
        name: currentName,
        language: currentLanguage,
        origin: "self_serve",
      })
      .select("id")
      .single();
    if (error || !guest) {
      console.error("Could not create a self guest:", error);
      return serverError("Could not start the conversation.");
    }
    guestId = guest.id;
  }

  const { data: session, error } = await admin
    .from("sessions")
    .insert({ guest_id: guestId })
    .select("id, token")
    .single();

  if (error || !session) {
    console.error("Could not create a conversation:", error);
    return serverError("Could not start the conversation.");
  }

  void supabase;
  return NextResponse.json({ sessionId: session.id, token: session.token });
}

/**
 * Picks a conversation back up at the link it was recorded on, handing the app
 * everything the earlier sittings saved so the new audio appends to the old.
 *
 * The RLS read is the authorisation, exactly as in `resumeConversation()`: the
 * policy only exposes a `recording` session whose checkpoints have gone stale,
 * so this cannot walk in on a conversation already in progress.
 */
async function resumeConversation(
  auth: NonNullable<Awaited<ReturnType<typeof requireMobileUser>>>,
  sessionId: string
) {
  const { supabase, admin } = auth;

  const { data: session } = await supabase
    .from("sessions")
    .select("id, token, duration_ms")
    .eq("id", sessionId)
    .eq("status", "recording")
    .maybeSingle();

  if (!session) {
    return NextResponse.json(
      { error: "This conversation can no longer be continued." },
      { status: 409 }
    );
  }

  const { data: rows } = await admin
    .from("transcript_turns")
    .select("idx, speaker, text, start_ms, end_ms")
    .eq("session_id", session.id)
    .order("idx", { ascending: true });

  const turns = decryptTurns(session.id, rows ?? []);
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
