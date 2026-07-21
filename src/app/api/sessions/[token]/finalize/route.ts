import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { TurnDraft } from "@/lib/types";

const MAX_TURNS = 1000;

/** Persists the transcript turns and marks the session ready for editing. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await request.json().catch(() => null);
  const audioPath = body?.audioPath;
  const durationMs = body?.durationMs;
  const turns = body?.turns;

  if (
    typeof audioPath !== "string" ||
    typeof durationMs !== "number" ||
    !Array.isArray(turns) ||
    turns.length > MAX_TURNS
  ) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: session } = await admin
    .from("sessions")
    .select("id")
    .eq("token", token)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Invalid link." }, { status: 404 });
  }
  if (!audioPath.startsWith(`${session.id}/`)) {
    return NextResponse.json({ error: "Invalid audio path." }, { status: 400 });
  }

  const rows = (turns as TurnDraft[])
    .filter(
      (t) =>
        (t.speaker === "ai" || t.speaker === "guest") &&
        typeof t.text === "string" &&
        t.text.trim().length > 0
    )
    .sort((a, b) => a.startMs - b.startMs)
    .map((t, idx) => {
      const start = Math.max(0, Math.round(Number(t.startMs) || 0));
      return {
        session_id: session.id,
        idx,
        speaker: t.speaker,
        text: t.text.trim().slice(0, 10_000),
        start_ms: start,
        end_ms: Math.max(start + 100, Math.round(Number(t.endMs) || 0)),
      };
    });

  // Replace any turns from a previous partial attempt on this session.
  await admin.from("transcript_turns").delete().eq("session_id", session.id);
  if (rows.length > 0) {
    const { error } = await admin.from("transcript_turns").insert(rows);
    if (error) {
      console.error("transcript insert failed:", error);
      return NextResponse.json(
        { error: "Could not save the transcript." },
        { status: 500 }
      );
    }
  }

  const { error: updateError } = await admin
    .from("sessions")
    .update({
      status: "ready",
      raw_audio_path: audioPath,
      duration_ms: Math.max(0, Math.round(durationMs)),
    })
    .eq("id", session.id);

  if (updateError) {
    console.error("session finalize failed:", updateError);
    return NextResponse.json(
      { error: "Could not finalize the session." },
      { status: 500 }
    );
  }

  await admin
    .from("podcast_participation")
    .update({ status: "interview_done", updated_at: new Date().toISOString() })
    .eq("session_id", session.id);

  return NextResponse.json({ ok: true });
}
