"use server";

import { revalidatePath } from "next/cache";
import { and, eq, or } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { friendships, profiles } from "@/lib/db/schema";
import { normalizeEmail } from "@/lib/email";
import { friendshipPair } from "@/lib/friends";
import { personName } from "@/lib/names";

export type FriendRelationship =
  | "none"
  | "friends"
  | "request_sent"
  | "request_received";

export type FriendMatch = {
  id: string;
  name: string;
  relationship: FriendRelationship;
};

export type FriendSearchResult =
  | { ok: true; match: FriendMatch | null }
  | { ok: false; reason: "invalid_email" | "self" };

export type FriendRequestResult =
  | { ok: true; status: "pending" | "accepted" }
  | { ok: false; reason: "invalid" | "not_found" | "already_friends" };

/** Everything the circle pages need to re-read after the graph changes. */
function revalidateCircle() {
  // The sidebar's pending-request badge is rendered from the family layout.
  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/friends");
  revalidatePath("/dashboard/circle");
}

/**
 * Finds a family account by its exact email address.
 *
 * Search is the one read in this app with no relationship to authorise it —
 * at search time there is none yet, and no predicate could allow it without
 * making `profiles` readable by email to every signed-in user.
 *
 * So the safety lives in the shape of the answer instead: an exact match only,
 * family accounts only, and a return value carrying nothing but an id, a
 * display name, and how the two of you already relate. The email is never
 * echoed back, and an address that belongs to nobody is indistinguishable from
 * one that belongs to an admin.
 */
export async function searchFriendByEmail(
  emailInput: string,
): Promise<FriendSearchResult> {
  const { user } = await requireUser();

  const email = normalizeEmail(emailInput);
  if (!email) return { ok: false, reason: "invalid_email" };

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

  // An admin's address and an address nobody uses return the same thing, so
  // search cannot be used to enumerate who exists or who is privileged.
  if (!profile) return { ok: true, match: null };

  // Worth its own message: this is a mistake to correct, not a secret to keep.
  if (profile.id === user.id) return { ok: false, reason: "self" };

  const { low, high } = friendshipPair(user.id, profile.id);
  const [friendship] = await db
    .select({
      status: friendships.status,
      requesterId: friendships.requesterId,
    })
    .from(friendships)
    .where(and(eq(friendships.userLow, low), eq(friendships.userHigh, high)))
    .limit(1);

  let relationship: FriendRelationship = "none";
  if (friendship?.status === "accepted") {
    relationship = "friends";
  } else if (friendship?.status === "pending") {
    relationship =
      friendship.requesterId === user.id ? "request_sent" : "request_received";
  }

  return {
    ok: true,
    match: {
      id: profile.id,
      name: personName(profile.displayName, profile.email),
      relationship,
    },
  };
}

/**
 * Asks another family account to join the caller's circle.
 *
 * There is nothing to authorise here — anyone signed in may ask anyone. What
 * keeps it safe is that the caller's half of the pair comes from the verified
 * session and never from an argument, so the worst a forged `targetUserId` can
 * do is create a request the caller is themselves part of.
 *
 * If the other person has already asked *you*, this accepts their request
 * instead of creating a second one. The ordered-pair unique index is what
 * turns that race into a handshake rather than two crossed rows.
 */
export async function sendFriendRequest(
  targetUserId: string,
): Promise<FriendRequestResult> {
  const { user } = await requireUser();

  if (!targetUserId || targetUserId === user.id) {
    return { ok: false, reason: "invalid" };
  }

  const [target] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.id, targetUserId), eq(profiles.role, "family")))
    .limit(1);
  if (!target) return { ok: false, reason: "not_found" };

  const { low, high } = friendshipPair(user.id, targetUserId);
  const existing = await readPair(low, high);
  if (existing) return acceptOrEcho(existing, user.id);

  try {
    await db.insert(friendships).values({
      userLow: low,
      userHigh: high,
      requesterId: user.id,
    });
  } catch (error) {
    // 23505: the other side inserted the same pair between our read and our
    // write. Re-read and fall into the same handshake as above.
    if (isUniqueViolation(error)) {
      const raced = await readPair(low, high);
      if (raced) return acceptOrEcho(raced, user.id);
    }
    console.error("Could not send the friend request:", error);
    return { ok: false, reason: "invalid" };
  }

  revalidateCircle();
  return { ok: true, status: "pending" };
}

type PairRow = { id: string; status: string; requesterId: string };

async function readPair(low: string, high: string): Promise<PairRow | undefined> {
  const [row] = await db
    .select({
      id: friendships.id,
      status: friendships.status,
      requesterId: friendships.requesterId,
    })
    .from(friendships)
    .where(and(eq(friendships.userLow, low), eq(friendships.userHigh, high)))
    .limit(1);
  return row;
}

/** Postgres 23505, the unique violation the handshake retry looks for. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "23505"
  );
}

/**
 * Resolves a request that already exists for this pair: accept it if it came
 * from the other person, otherwise report it unchanged. Idempotent, so a
 * double-tapped button is harmless.
 */
async function acceptOrEcho(
  existing: PairRow,
  me: string,
): Promise<FriendRequestResult> {
  if (existing.status === "accepted") {
    return { ok: false, reason: "already_friends" };
  }
  if (existing.requesterId === me) {
    return { ok: true, status: "pending" };
  }

  try {
    await markAccepted(existing.id);
  } catch (error) {
    console.error("Could not accept the reciprocal friend request:", error);
    return { ok: false, reason: "invalid" };
  }

  revalidateCircle();
  return { ok: true, status: "accepted" };
}

/** Flips a still-pending request to accepted. */
async function markAccepted(friendshipId: string) {
  await db
    .update(friendships)
    .set({ status: "accepted", respondedAt: new Date().toISOString() })
    .where(
      and(eq(friendships.id, friendshipId), eq(friendships.status, "pending")),
    );
}

/**
 * Reads a pending friendship the caller is part of.
 *
 * The participant filter is the authorisation, and it is the whole of it: a
 * row comes back only if this account is one of the two in it, so a friendship
 * id belonging to strangers matches nothing.
 */
async function readPendingFriendship(friendshipId: string, me: string) {
  const [row] = await db
    .select({
      id: friendships.id,
      requesterId: friendships.requesterId,
      status: friendships.status,
    })
    .from(friendships)
    .where(
      and(
        eq(friendships.id, friendshipId),
        eq(friendships.status, "pending"),
        or(eq(friendships.userLow, me), eq(friendships.userHigh, me)),
      ),
    )
    .limit(1);
  return row;
}

/** Accepts a request someone else sent. Only the recipient may accept. */
export async function acceptFriendRequest(friendshipId: string) {
  const { user } = await requireUser();

  const friendship = await readPendingFriendship(friendshipId, user.id);
  // Being in the row is not enough — the person who asked cannot accept for
  // the person who was asked.
  if (!friendship || friendship.requesterId === user.id) {
    return { ok: false as const };
  }

  try {
    await markAccepted(friendshipId);
  } catch (error) {
    console.error("Could not accept the friend request:", error);
    return { ok: false as const };
  }

  revalidateCircle();
  return { ok: true as const };
}

/**
 * Turns down a request, or withdraws one you sent — the same row, deleted from
 * whichever side asked to be rid of it.
 *
 * Deleting rather than recording a 'declined' state is deliberate: a tombstone
 * would block the pair from ever trying again, with no screen that could
 * explain the dead end to either of them. Re-asking is the lesser problem.
 */
export async function declineFriendRequest(friendshipId: string) {
  const { user } = await requireUser();

  const friendship = await readPendingFriendship(friendshipId, user.id);
  if (!friendship) return { ok: false as const };

  try {
    await db
      .delete(friendships)
      .where(
        and(
          eq(friendships.id, friendshipId),
          eq(friendships.status, "pending"),
        ),
      );
  } catch (error) {
    console.error("Could not decline the friend request:", error);
    return { ok: false as const };
  }

  revalidateCircle();
  return { ok: true as const };
}

/**
 * Removes someone from the circle. Their access to conversations shared with
 * the circle stops at the next query — `isFriend` is evaluated per request,
 * never cached onto the shared rows.
 */
export async function removeFriend(friendUserId: string) {
  const { user } = await requireUser();

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
  if (!friendship) return { ok: false as const };

  try {
    await db.delete(friendships).where(eq(friendships.id, friendship.id));
  } catch (error) {
    console.error("Could not remove the friend:", error);
    return { ok: false as const };
  }

  revalidateCircle();
  return { ok: true as const };
}
