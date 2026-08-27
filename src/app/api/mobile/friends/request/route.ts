import { NextResponse, type NextRequest } from "next/server";
import {
  badRequest,
  notFound,
  readJson,
  readString,
  requireMobileUser,
  serverError,
  unauthorized,
} from "@/lib/mobile/auth";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { friendships, profiles } from "@/lib/db/schema";
import { friendshipPair } from "@/lib/friends";

export const dynamic = "force-dynamic";

/**
 * Asks another family account to join the caller's circle. Port of
 * `sendFriendRequest()`.
 *
 * There is nothing to authorise here — anyone signed in may ask anyone.
 * What keeps it safe is that the caller's half of the pair comes from the
 * verified token and never from the body, so the worst a forged `userId` can
 * do is create a request the caller is themselves part of.
 *
 * If the other person has already asked *you*, this accepts their request
 * instead of creating a second one. The ordered-pair unique index turns that
 * race into a handshake rather than two crossed rows.
 */
export async function POST(request: NextRequest) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { user } = auth;

  const body = await readJson(request);
  const targetUserId = readString(body, "userId", 64);
  if (!targetUserId || targetUserId === user.id) {
    return badRequest("That request cannot be sent.");
  }

  const [target] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.id, targetUserId), eq(profiles.role, "family")))
    .limit(1);
  if (!target) return notFound("Nobody uses WiseShare with that account.");

  const { low, high } = friendshipPair(user.id, targetUserId);
  const readPair = async () => {
    const [row] = await db
      .select({
        id: friendships.id,
        status: friendships.status,
        requester_id: friendships.requester_id,
      })
      .from(friendships)
      .where(and(eq(friendships.user_low, low), eq(friendships.user_high, high)))
      .limit(1);
    return row;
  };

  const existing = await readPair();
  if (existing) return acceptOrEcho(existing, user.id);

  try {
    await db.insert(friendships).values({
      user_low: low,
      user_high: high,
      requester_id: user.id,
    });
  } catch (error) {
    // 23505: the other side inserted the same pair between our read and our
    // write. Re-read and fall into the same handshake as above.
    if ((error as { code?: string } | null)?.code === "23505") {
      const raced = await readPair();
      if (raced) return acceptOrEcho(raced, user.id);
    }
    console.error("Could not send the friend request:", error);
    return serverError("Could not send that request.");
  }

  return NextResponse.json({ ok: true, status: "pending" });
}

/**
 * Resolves a request that already exists for this pair: accept it if it came
 * from the other person, otherwise report it unchanged. Idempotent, so a
 * double-tapped button is harmless.
 */
async function acceptOrEcho(
  existing: { id: string; status: string; requester_id: string },
  me: string
) {
  if (existing.status === "accepted") {
    return NextResponse.json({ ok: true, status: "accepted" });
  }
  if (existing.requester_id === me) {
    return NextResponse.json({ ok: true, status: "pending" });
  }

  try {
    await db
      .update(friendships)
      .set({ status: "accepted", responded_at: new Date().toISOString() })
      .where(
        and(eq(friendships.id, existing.id), eq(friendships.status, "pending"))
      );
  } catch (error) {
    console.error("Could not accept the reciprocal friend request:", error);
    return serverError("Could not send that request.");
  }

  return NextResponse.json({ ok: true, status: "accepted" });
}
