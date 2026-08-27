import { NextResponse, type NextRequest } from "next/server";
import { resolveCurrentGuestLanguage } from "@/lib/guest-language";
import { resolveCurrentGuestName } from "@/lib/guest-name";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { guests, sessions, transcriptTurns } from "@/lib/db/schema";
import { decryptTurns } from "@/lib/transcript/encryption";
import { getGuestMemorySummary } from "@/lib/memory/summary";
import { buildInterviewerInstructions } from "@/lib/realtime/interviewer-prompt";
import { transcriptionLanguage } from "@/lib/i18n";
import { transcriptionKeywords } from "@/lib/realtime/transcription-keywords";
import { GUEST_FINISH_TOOL } from "@/lib/realtime/interview-ending";
import {
  isRealtimeVoice,
  REALTIME_MODEL,
  REALTIME_VOICE,
  TRANSCRIBE_MODEL,
} from "@/lib/constants";
import type { Guest } from "@/lib/types";

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

  const [session] = await db
    .select({
      id: sessions.id,
      status: sessions.status,
      topic: sessions.topic,
      started_at: sessions.started_at,
      guest: guests,
    })
    .from(sessions)
    .innerJoin(guests, eq(guests.id, sessions.guest_id))
    .where(eq(sessions.token, token))
    .limit(1);

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
    .where(eq(transcriptTurns.session_id, session.id))
    .orderBy(asc(transcriptTurns.idx));

  const guest = session.guest as unknown as Guest;
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
    priorTurns: decryptTurns(session.id, savedTurns ?? []),
  });

  const keywords = transcriptionKeywords({
    guestName,
    topics: guest.topics,
    topic: session.topic,
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
            // Filters the buffer before it reaches turn detection or the
            // transcriber, so a cough or a television is less likely to become
            // a turn at all. `near_field` is the close-microphone profile,
            // which fits a phone in the hand and a laptop on the desk; both
            // clients also have room noise rather than a conference hall.
            noise_reduction: { type: "near_field" },
            // Naming the language stops the transcriber picking one per
            // utterance — background noise transcribed as fluent nonsense in
            // an unrelated language is what that looks like from the outside.
            transcription: {
              model: TRANSCRIBE_MODEL,
              languages: [transcriptionLanguage(language)],
              // Omitted entirely rather than sent empty when a storyteller has
              // named neither a topic nor themselves.
              ...(keywords.length ? { keywords } : {}),
              // Trades latency for accuracy. An interview is not a support
              // call: a beat before the transcript catches up costs nothing
              // here, and the storyteller is waiting on Rosie's voice rather
              // than on text appearing.
              delay: "medium",
            },
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
      started_at: session.started_at ?? new Date().toISOString(),
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
