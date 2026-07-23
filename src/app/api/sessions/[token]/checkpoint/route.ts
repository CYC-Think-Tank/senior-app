import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isTurnDraftArray, saveTurns } from "@/lib/transcript/save-turns";

/**
 * Saves the transcript mid-interview so closing the tab early does not throw
 * the conversation away. Called a couple of seconds after each new turn, and
 * on a heartbeat (no `turns`) in between.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const turns = body.turns;
  if (turns !== undefined && !isTurnDraftArray(turns)) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: session } = await admin
    .from("sessions")
    .select("id, status, started_at")
    .eq("token", token)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Invalid link." }, { status: 404 });
  }
  // A finished session is authoritative; a late checkpoint must not reopen it.
  if (session.status === "ready") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (turns !== undefined) {
    const { error } = await saveTurns(admin, session.id, turns);
    if (error) {
      return NextResponse.json({ error }, { status: 500 });
    }
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    status: "recording",
    last_checkpoint_at: now,
  };
  if (!session.started_at) updates.started_at = now;
  if (typeof body.durationMs === "number" && body.durationMs >= 0) {
    updates.duration_ms = Math.round(body.durationMs);
  }
  await admin.from("sessions").update(updates).eq("id", session.id);

  return NextResponse.json({ ok: true });
}
