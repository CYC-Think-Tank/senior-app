import { NextResponse, type NextRequest } from "next/server";
import { resolveCurrentGuestLanguage } from "@/lib/guest-language";
import { resolveCurrentGuestName } from "@/lib/guest-name";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { guests, sessions, transcriptTurns } from "@/lib/db/schema";
import { decryptTurns } from "@/lib/transcript/encryption";
import { getGuestMemorySummary } from "@/lib/memory/summary";
import { buildInterviewerInstructions } from "@/lib/realtime/interviewer-prompt";
import { GUEST_FINISH_TOOL } from "@/lib/realtime/interview-ending";
import type { Speaker } from "@/lib/types";
import {
  isRealtimeVoice,
  REALTIME_MODEL,
  REALTIME_VOICE,
} from "@/lib/constants";

/**
 * Mints an ephemeral OpenAI Realtime client secret for an interview session,
 * with the interviewer persona and audio config baked in. The browser only
 * ever sees the short-lived secret, never the API key or the instructions.
 */
export async function POST(request: NextRequest) {
  const { token } = await request.json().catch(() => ({}));
  if (typeof token !== "string" || !token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const [row] = await db
    .select({
      id: sessions.id,
      status: sessions.status,
      topic: sessions.topic,
      startedAt: sessions.startedAt,
      guest: guests,
    })
    .from(sessions)
    .innerJoin(guests, eq(guests.id, sessions.guestId))
    .where(eq(sessions.token, token))
    .limit(1);

  const session = row;
  if (!session) {
    return NextResponse.json(
      { error: "This interview link is not valid." },
      { status: 404 }
    );
  }
  if (session.status === "ready") {
    return NextResponse.json(
      { error: "This interview has already been recorded." },
      { status: 409 }
    );
  }

  // Whatever the live checkpoints saved before the tab closed. Handing it to
  // the interviewer is what turns reopening the link into carrying on rather
  // than starting the conversation again.
  const savedTurns = await db
    .select({
      idx: transcriptTurns.idx,
      speaker: transcriptTurns.speaker,
      text: transcriptTurns.text,
    })
    .from(transcriptTurns)
    .where(eq(transcriptTurns.sessionId, session.id))
    .orderBy(asc(transcriptTurns.idx));

  const guest = session.guest;
  const [guestName, language, memorySummary] = await Promise.all([
    resolveCurrentGuestName(guest),
    resolveCurrentGuestLanguage(guest),
    getGuestMemorySummary(guest.id),
  ]);
  const instructions = buildInterviewerInstructions({
    guestName,
    bio: guest.bio,
    topics: guest.topics,
    memorySummary,
    language,
    topic: session.topic,
    priorTurns: decryptTurns(session.id, savedTurns) as { speaker: Speaker; text: string }[],
  });

  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      expires_after: { anchor: "created_at", seconds: 3600 },
      session: {
        type: "realtime",
        model: REALTIME_MODEL,
        instructions,
        tools: [GUEST_FINISH_TOOL],
        tool_choice: "auto",
        audio: {
          input: {
            transcription: { model: "gpt-4o-transcribe" },
            // Semantic VAD understands when a thought is finished while still
            // allowing natural pauses. Medium eagerness closes the turn after
            // a reasonable silence instead of leaving Rosie waiting forever.
            turn_detection: {
              type: "semantic_vad",
              eagerness: "medium",
            },
          },
          output: {
            // An unrecognised stored voice (an old name, or one retired by
            // OpenAI) would fail the whole session, so fall back instead.
            voice: isRealtimeVoice(guest.voice) ? guest.voice : REALTIME_VOICE,
          },
        },
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("Realtime client_secrets failed:", res.status, detail);
    return NextResponse.json(
      { error: "The voice service is unavailable right now." },
      { status: 502 }
    );
  }

  const data = await res.json();

  // `started_at` marks when the conversation began, not this sitting, so a
  // resumed one leaves it alone.
  await db
    .update(sessions)
    .set({
      status: "recording",
      startedAt: session.startedAt ?? new Date().toISOString(),
    })
    .where(eq(sessions.id, session.id));

  // The model rides along for clients that have to name it themselves. The
  // browser does not — WebRTC carries it in the offer — but a WebSocket
  // transport puts it in the connect URL, and reading it back from the same
  // response that minted the secret is what keeps the two from drifting.
  return NextResponse.json(
    { clientSecret: data.value, model: REALTIME_MODEL },
    { headers: { "Cache-Control": "no-store" } },
  );
}
