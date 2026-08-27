import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
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

  const [session] = await db
    .select({
      id: sessions.id,
      status: sessions.status,
      started_at: sessions.started_at,
    })
    .from(sessions)
    .where(eq(sessions.token, token))
    .limit(1);

  if (!session) {
    return NextResponse.json({ error: "Invalid link." }, { status: 404 });
  }
  // A finished session is authoritative; a late checkpoint must not reopen it.
  if (session.status === "ready") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (turns !== undefined) {
    const { error } = await saveTurns(session.id, turns);
    if (error) {
      return NextResponse.json({ error }, { status: 500 });
    }
  }

  const now = new Date().toISOString();
  const updates: Partial<typeof sessions.$inferInsert> = {
    status: "recording",
    last_checkpoint_at: now,
  };
  if (!session.started_at) updates.started_at = now;
  if (typeof body.durationMs === "number" && body.durationMs >= 0) {
    updates.duration_ms = Math.round(body.durationMs);
  }
  await db.update(sessions).set(updates).where(eq(sessions.id, session.id));

  return NextResponse.json({ ok: true });
}
