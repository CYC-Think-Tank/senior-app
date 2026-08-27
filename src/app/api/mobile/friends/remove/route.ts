import { NextResponse, type NextRequest } from "next/server";
import {
  notFound,
  readJson,
  readString,
  requireMobileUser,
  serverError,
  unauthorized,
} from "@/lib/mobile/auth";
import { and, eq } from "drizzle-orm";
import { friendshipsFilter } from "@/lib/authz";
import { db } from "@/lib/db";
import { friendships } from "@/lib/db/schema";
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
  const { user } = auth;

  const body = await readJson(request);
  const friendUserId = readString(body, "userId", 64);
  const { low, high } = friendshipPair(user.id, friendUserId);

  // The membership filter again, so nobody can dissolve a friendship they are
  // not in. (The ordered pair is built from the caller's own id, so this is
  // belt and braces — but it is the check, not a side effect of how the pair
  // was derived, and it should read that way.)
  const [friendship] = await db
    .select({ id: friendships.id })
    .from(friendships)
    .where(
      and(
        eq(friendships.user_low, low),
        eq(friendships.user_high, high),
        eq(friendships.status, "accepted"),
        friendshipsFilter(user.id)
      )
    )
    .limit(1);
  if (!friendship) return notFound("You are not in that circle.");

  try {
    await db.delete(friendships).where(eq(friendships.id, friendship.id));
  } catch (error) {
    console.error("Could not remove the friend:", error);
    return serverError("Could not remove them.");
  }

  return NextResponse.json({ ok: true });
}
