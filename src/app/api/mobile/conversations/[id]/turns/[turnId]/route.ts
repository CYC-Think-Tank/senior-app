import { NextResponse, type NextRequest } from "next/server";
import {
  notFound,
  readJson,
  requireMobileUser,
  serverError,
  unauthorized,
} from "@/lib/mobile/auth";
import { and, eq } from "drizzle-orm";
import { ownsReadySession } from "@/lib/authz";
import { db } from "@/lib/db";
import { transcriptTurns } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/**
 * Removes or restores one transcript line. Port of
 * `setConversationTurnExcluded()`: the row is kept so an accidental edit can be
 * undone, and every player treats its timestamp range as deleted while
 * `excluded` is true.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; turnId: string }> }
) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { user } = auth;
  const { id, turnId } = await params;

  const body = await readJson(request);
  const excluded = body.excluded === true;

  if (!(await ownsReadySession(user.id, id))) {
    return notFound("This line could not be edited.");
  }

  let turn;
  try {
    // Filtered by session as well as turn id, so a turn id from someone
    // else's conversation matches nothing even though the caller owns this one.
    [turn] = await db
      .update(transcriptTurns)
      .set({ excluded })
      .where(
        and(
          eq(transcriptTurns.id, turnId),
          eq(transcriptTurns.sessionId, id),
        ),
      )
      .returning({ id: transcriptTurns.id });
  } catch (error) {
    console.error("Could not edit the transcript line:", error);
    return serverError("Could not edit that line.");
  }
  if (!turn) return notFound("This line could not be edited.");

  return NextResponse.json({ ok: true });
}
