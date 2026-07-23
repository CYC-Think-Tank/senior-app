import { randomBytes } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { finalizeSessionAudio } from "@/lib/sessions/finalize";
import { isTurnDraftArray, saveTurns } from "@/lib/transcript/save-turns";

// Stitching an hour-long interview means fetching every chunk back and
// remuxing it, which outlasts the default request budget.
export const maxDuration = 300;

/**
 * Ends an interview: writes the final transcript, assembles the recording
 * from the chunks uploaded along the way, and marks the session ready.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await request.json().catch(() => null);
  const durationMs = body?.durationMs;
  const turns = body?.turns;

  if (typeof durationMs !== "number" || !isTurnDraftArray(turns)) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: session } = await admin
    .from("sessions")
    .select("id, duration_ms, share_token")
    .eq("token", token)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Invalid link." }, { status: 404 });
  }

  const { error: turnsError } = await saveTurns(admin, session.id, turns);
  if (turnsError) {
    return NextResponse.json({ error: turnsError }, { status: 500 });
  }

  const { error } = await finalizeSessionAudio(admin, session, durationMs);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const shareToken = session.share_token ?? randomBytes(24).toString("hex");
  const { error: updateError } = await admin
    .from("sessions")
    .update({ share_token: shareToken })
    .eq("id", session.id);

  if (updateError) {
    console.error("session finalize failed:", updateError);
    return NextResponse.json(
      { error: "Could not finalize the session." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, shareToken });
}
