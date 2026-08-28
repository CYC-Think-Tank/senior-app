import { NextResponse, type NextRequest } from "next/server";
import {
  badRequest,
  readJson,
  readString,
  requireMobileUser,
  unauthorized,
} from "@/lib/mobile/auth";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { friendships, profiles } from "@/lib/db/schema";
import { normalizeEmail } from "@/lib/email";
import { friendshipPair } from "@/lib/friends";
import { personName } from "@/lib/names";

export const dynamic = "force-dynamic";

/**
 * Finds a family account by its exact email address. Port of
 * `searchFriendByEmail()`.
 *
 * Search is the one read with no relationship to authorise it — at search time
 * there is none yet, and no predicate could allow it without making `profiles`
 * readable by email to every signed-in user.
 *
 * So the safety lives in the shape of the answer instead: an exact match only,
 * family accounts only, and nothing returned but an id, a display name, and
 * how the two of you already relate. The email is never echoed back, and an
 * address that belongs to nobody is indistinguishable from one belonging to an
 * admin — so search cannot enumerate who exists or who is privileged.
 */
export async function POST(request: NextRequest) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { user } = auth;

  const body = await readJson(request);
  const email = normalizeEmail(readString(body, "email", 320));
  if (!email) return badRequest("Enter a valid email address.");

  const [profile] = await db
    .select({
      id: profiles.id,
      displayName: profiles.displayName,
      email: profiles.email,
    })
    .from(profiles)
    // `eq`, never a LIKE: `%` and `_` are legal in a local part and would
    // otherwise turn a typed address into a wildcard search over every
    // account. Migration 013 lowercased the column to make this match.
    .where(and(eq(profiles.email, email), eq(profiles.role, "family")))
    .limit(1);

  if (!profile) return NextResponse.json({ match: null });

  // Worth its own status: this is a mistake to correct, not a secret to keep.
  if (profile.id === user.id) {
    return NextResponse.json({ error: "That is your own address." }, { status: 409 });
  }

  const { low, high } = friendshipPair(user.id, profile.id);
  const [friendship] = await db
    .select({
      status: friendships.status,
      requesterId: friendships.requesterId,
    })
    .from(friendships)
    .where(and(eq(friendships.userLow, low), eq(friendships.userHigh, high)))
    .limit(1);

  let relationship = "none";
  if (friendship?.status === "accepted") {
    relationship = "friends";
  } else if (friendship?.status === "pending") {
    relationship =
      friendship.requesterId === user.id ? "request_sent" : "request_received";
  }

  return NextResponse.json({
    match: {
      id: profile.id,
      name: personName(profile.displayName, profile.email),
      relationship,
    },
  });
}
