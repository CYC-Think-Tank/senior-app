import { NextResponse, type NextRequest } from "next/server";
import { resolveCurrentGuestLanguage } from "@/lib/guest-language";
import { resolveCurrentGuestName } from "@/lib/guest-name";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptTurns } from "@/lib/transcript/encryption";
import { getGuestMemorySummary } from "@/lib/memory/summary";
import { buildInterviewerInstructions } from "@/lib/realtime/interviewer-prompt";
import { GUEST_FINISH_TOOL } from "@/lib/realtime/interview-ending";
import {
  isRealtimeVoice,
  REALTIME_MODEL,
  REALTIME_VOICE,
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

  const admin = createSupabaseAdminClient();
  const { data: session } = await admin
    .from("sessions")
    .select("id, status, topic, started_at, guests(*)")
    .eq("token", token)
    .single();

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
  const { data: savedTurns } = await admin
    .from("transcript_turns")
    .select("idx, speaker, text")
    .eq("session_id", session.id)
    .order("idx", { ascending: true });

  const guest = session.guests as unknown as Guest;
  const [guestName, language, memorySummary] = await Promise.all([
    resolveCurrentGuestName(admin, guest),
    resolveCurrentGuestLanguage(admin, guest),
    getGuestMemorySummary(admin, guest.id),
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
  await admin
    .from("sessions")
    .update({
      status: "recording",
      started_at: session.started_at ?? new Date().toISOString(),
    })
    .eq("id", session.id);

  return NextResponse.json(
    { clientSecret: data.value },
    { headers: { "Cache-Control": "no-store" } },
  );
}
