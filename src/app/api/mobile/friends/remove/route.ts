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
import { db } from "@/lib/db";
import { friendships } from "@/lib/db/schema";
import { friendshipPair } from "@/lib/friends";

export const dynamic = "force-dynamic";

/**
 * Removes someone from the circle. Port of `removeFriend()`.
 *
 * Their access to conversations shared with the circle stops at the next
 * query — `isFriend` is evaluated per request, never cached onto the shared
 * rows.
 */
export async function POST(request: NextRequest) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { user } = auth;

  const body = await readJson(request);
  const friendUserId = readString(body, "userId", 64);
  const { low, high } = friendshipPair(user.id, friendUserId);

  // The caller's own id is half of the pair by construction, so this cannot
  // dissolve a friendship they are not in.
  const [friendship] = await db
    .select({ id: friendships.id })
    .from(friendships)
    .where(
      and(
        eq(friendships.userLow, low),
        eq(friendships.userHigh, high),
        eq(friendships.status, "accepted"),
      ),
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
