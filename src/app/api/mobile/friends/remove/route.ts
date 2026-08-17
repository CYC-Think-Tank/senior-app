import { NextResponse, type NextRequest } from "next/server";
import {
  notFound,
  readJson,
  readString,
  requireMobileUser,
  serverError,
  unauthorized,
} from "@/lib/mobile/auth";
import { friendshipPair } from "@/lib/friends";

export const dynamic = "force-dynamic";

/**
 * Removes someone from the circle. Port of `removeFriend()`.
 *
 * Their access to conversations shared with the circle stops at the next
 * query — `is_friend()` is evaluated per request, not cached on the shared
 * rows.
 */
export async function POST(request: NextRequest) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { supabase, admin, user } = auth;

  const body = await readJson(request);
  const friendUserId = readString(body, "userId", 64);
  const { low, high } = friendshipPair(user.id, friendUserId);

  // RLS again: this only returns the row if the caller is one of its two
  // participants, so nobody can dissolve a friendship they are not in.
  const { data: friendship } = await supabase
    .from("friendships")
    .select("id")
    .eq("user_low", low)
    .eq("user_high", high)
    .eq("status", "accepted")
    .maybeSingle();
  if (!friendship) return notFound("You are not in that circle.");

  const { error } = await admin.from("friendships").delete().eq("id", friendship.id);
  if (error) {
    console.error("Could not remove the friend:", error);
    return serverError("Could not remove them.");
  }

  return NextResponse.json({ ok: true });
}
