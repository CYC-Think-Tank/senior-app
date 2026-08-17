import { NextResponse, type NextRequest } from "next/server";
import {
  notFound,
  readJson,
  readString,
  requireMobileUser,
  serverError,
  unauthorized,
} from "@/lib/mobile/auth";

export const dynamic = "force-dynamic";

/**
 * Accepts a request, declines one, or withdraws one you sent. Port of
 * `acceptFriendRequest()` and `declineFriendRequest()`, which are one endpoint
 * here because the app shows them as one row with two buttons.
 *
 * Declining deletes the row rather than recording a 'declined' state: a
 * tombstone would block the pair from ever trying again, with no screen that
 * could explain the dead end to either of them.
 */
export async function POST(request: NextRequest) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { supabase, admin, user } = auth;

  const body = await readJson(request);
  const friendshipId = readString(body, "friendshipId", 64);
  const accept = body.accept === true;

  // RLS: "participants read their friendships" is the authorisation — a row
  // comes back only if this account is one of the two in it.
  const { data: friendship } = await supabase
    .from("friendships")
    .select("id, requester_id, status")
    .eq("id", friendshipId)
    .eq("status", "pending")
    .maybeSingle();
  if (!friendship) return notFound("That request is no longer waiting.");

  if (accept) {
    // Being in the row is not enough — the person who asked cannot accept for
    // the person who was asked.
    if (friendship.requester_id === user.id) {
      return NextResponse.json(
        { error: "You cannot accept your own request." },
        { status: 403 }
      );
    }

    const { error } = await admin
      .from("friendships")
      .update({ status: "accepted", responded_at: new Date().toISOString() })
      .eq("id", friendshipId)
      .eq("status", "pending");

    if (error) {
      console.error("Could not accept the friend request:", error);
      return serverError("Could not accept that request.");
    }
    return NextResponse.json({ ok: true });
  }

  const { error } = await admin
    .from("friendships")
    .delete()
    .eq("id", friendshipId)
    .eq("status", "pending");

  if (error) {
    console.error("Could not decline the friend request:", error);
    return serverError("Could not decline that request.");
  }

  return NextResponse.json({ ok: true });
}
