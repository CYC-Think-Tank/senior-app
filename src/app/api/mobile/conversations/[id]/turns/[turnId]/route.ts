import { NextResponse, type NextRequest } from "next/server";
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
  const { supabase, admin, user } = auth;
  const { id, turnId } = await params;

  const body = await readJson(request);
  const excluded = body.excluded === true;

  const { data: session } = await supabase
    .from("sessions")
    .select("id, guests!inner(user_id)")
    .eq("id", id)
    .eq("status", "ready")
    .eq("guests.user_id", user.id)
    .maybeSingle();
  if (!session) return notFound("This line could not be edited.");

  const { data: turn, error } = await admin
    .from("transcript_turns")
    .update({ excluded })
    .eq("id", turnId)
    .eq("session_id", id)
    .select("id")
    .maybeSingle();

  if (error || !turn) {
    console.error("Could not edit the transcript line:", error);
    return serverError("Could not edit that line.");
  }

  return NextResponse.json({ ok: true });
}
