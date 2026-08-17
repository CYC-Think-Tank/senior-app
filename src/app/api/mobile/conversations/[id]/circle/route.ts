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
 * Turns whole-circle sharing on or off for one finished conversation. Port of
 * `setCircleSharing()`.
 *
 * The RLS read keeps two other cases out without special-casing them: an
 * anonymous walk-in guest has no user_id to match, and an admin's blanket
 * access to sessions does not let them share someone else's story.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { supabase, admin, user } = auth;
  const { id } = await params;

  const body = await readJson(request);
  const shared = body.shared === true;

  const { data: session } = await supabase
    .from("sessions")
    .select("id, guests!inner(user_id)")
    .eq("id", id)
    .eq("status", "ready")
    .eq("guests.user_id", user.id)
    .maybeSingle();
  if (!session) return notFound("This conversation could not be shared.");

  const { error } = shared
    ? await admin.from("circle_shares").upsert({ session_id: id, owner_id: user.id })
    : await admin.from("circle_shares").delete().eq("session_id", id);

  if (error) {
    console.error("Could not change circle sharing:", error);
    return serverError("Could not change sharing.");
  }

  return NextResponse.json({ ok: true, shared });
}
