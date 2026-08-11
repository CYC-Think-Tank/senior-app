import { randomBytes } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { finalizeSessionAudio } from "@/lib/sessions/finalize";
import { isTurnDraftArray, saveTurns } from "@/lib/transcript/save-turns";
import { updateGuestMemoryFromSession } from "@/lib/memory/summary";

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
    .select(
      "id, guest_id, duration_ms, share_token, created_at, guests(name, user_id, origin)"
    )
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

  // Memory is an enhancement, never part of whether their recording saved.
  // Await it here so the very next conversation can reliably use what was just
  // said, while the helper absorbs model/database failures without changing
  // this successful response.
  const guest = session.guests as unknown as {
    name: string;
    user_id: string | null;
    origin: string;
  };
  // Public walk-ins get a one-use guest row, so there is no future interview
  // in which their memory could be used. Avoid retaining and paying to process
  // a summary that has no continuity value.
  if (guest.user_id || guest.origin !== "public") {
    await updateGuestMemoryFromSession(admin, {
      id: session.id,
      guestId: session.guest_id,
      guestName: guest.name,
      createdAt: session.created_at,
    });
  }

  return NextResponse.json({ ok: true, shareToken });
}
