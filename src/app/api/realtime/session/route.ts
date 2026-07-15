import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildInterviewerInstructions } from "@/lib/realtime/interviewer-prompt";
import { REALTIME_MODEL, REALTIME_VOICE } from "@/lib/constants";
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
    .select("id, status, topic, guests(*)")
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

  const guest = session.guests as unknown as Guest;
  const instructions = buildInterviewerInstructions({
    guestName: guest.name,
    bio: guest.bio,
    topics: guest.topics,
    language: guest.language,
    topic: session.topic,
  });

  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
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
        audio: {
          input: {
            transcription: { model: "gpt-4o-transcribe" },
            // Semantic VAD understands when a thought is finished rather than
            // counting silence; low eagerness gives seniors room to pause
            // mid-story without being interrupted.
            turn_detection: {
              type: "semantic_vad",
              eagerness: "low",
            },
          },
          output: { voice: REALTIME_VOICE },
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

  await admin
    .from("sessions")
    .update({ status: "recording", started_at: new Date().toISOString() })
    .eq("id", session.id);

  return NextResponse.json({ clientSecret: data.value });
}
