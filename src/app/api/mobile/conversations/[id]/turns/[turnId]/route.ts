import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { ownsReadySession } from "@/lib/authz";
import { db } from "@/lib/db";
import { transcriptTurns } from "@/lib/db/schema";
import {
  notFound,
  readJson,
  requireMobileUser,
  serverError,
  unauthorized,
} from "@/lib/mobile/auth";

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

  try {
    // Matching on session_id too is what stops a turn id from another
    // conversation being edited through an id this caller does own.
    const edited = await db
      .update(transcriptTurns)
      .set({ excluded })
      .where(
        and(eq(transcriptTurns.id, turnId), eq(transcriptTurns.session_id, id))
      )
      .returning({ id: transcriptTurns.id });
    if (edited.length === 0) return notFound("This line could not be edited.");
  } catch (error) {
    console.error("Could not edit the transcript line:", error);
    return serverError("Could not edit that line.");
  }

  return NextResponse.json({ ok: true });
}
