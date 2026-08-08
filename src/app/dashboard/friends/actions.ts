"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
 * Deliberately service-role. Every other read in this app authorises through
 * the caller's RLS client first, but search is the one case where no
 * relationship exists yet — there is no predicate that could authorise it
 * without making `profiles` readable by email to every signed-in user.
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

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, display_name, email")
    // `eq`, never `ilike`: `%` and `_` are legal in a local part and would
    // otherwise turn a typed address into a wildcard search over every
    // account. Migration 013 lowercased the column to make this match.
    .eq("email", email)
    .eq("role", "family")
    .maybeSingle();

  // An admin's address and an address nobody uses return the same thing, so
  // search cannot be used to enumerate who exists or who is privileged.
  if (!profile) return { ok: true, match: null };

  // Worth its own message: this is a mistake to correct, not a secret to keep.
  if (profile.id === user.id) return { ok: false, reason: "self" };

  const { low, high } = friendshipPair(user.id, profile.id);
  const { data: friendship } = await admin
    .from("friendships")
    .select("status, requester_id")
    .eq("user_low", low)
    .eq("user_high", high)
    .maybeSingle();

  let relationship: FriendRelationship = "none";
  if (friendship?.status === "accepted") {
    relationship = "friends";
  } else if (friendship?.status === "pending") {
    relationship =
      friendship.requester_id === user.id ? "request_sent" : "request_received";
  }

  return {
    ok: true,
    match: {
      id: profile.id,
      name: personName(profile.display_name, profile.email),
      relationship,
    },
  };
}

/**
 * Asks another family account to join the caller's circle.
 *
 * There is no RLS read to authorise here — anyone signed in may ask anyone.
 * What keeps it safe is that the caller's half of the pair comes from the
 * verified session claim and never from an argument, so the worst a forged
 * `targetUserId` can do is create a request the caller is themselves part of.
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

  const admin = createSupabaseAdminClient();
  const { data: target } = await admin
    .from("profiles")
    .select("id")
    .eq("id", targetUserId)
    .eq("role", "family")
    .maybeSingle();
  if (!target) return { ok: false, reason: "not_found" };

  const { low, high } = friendshipPair(user.id, targetUserId);

  const { data: existing } = await admin
    .from("friendships")
    .select("id, status, requester_id")
    .eq("user_low", low)
    .eq("user_high", high)
    .maybeSingle();

  if (existing) return acceptOrEcho(existing, user.id);

  const { error } = await admin.from("friendships").insert({
    user_low: low,
    user_high: high,
    requester_id: user.id,
  });

  if (error) {
    // 23505: the other side inserted the same pair between our read and our
    // write. Re-read and fall into the same handshake as above.
    if (error.code === "23505") {
      const { data: raced } = await admin
        .from("friendships")
        .select("id, status, requester_id")
        .eq("user_low", low)
        .eq("user_high", high)
        .maybeSingle();
      if (raced) return acceptOrEcho(raced, user.id);
    }
    console.error("Could not send the friend request:", error);
    return { ok: false, reason: "invalid" };
  }

  revalidateCircle();
  return { ok: true, status: "pending" };
}

/**
 * Resolves a request that already exists for this pair: accept it if it came
 * from the other person, otherwise report it unchanged. Idempotent, so a
 * double-tapped button is harmless.
 */
async function acceptOrEcho(
  existing: { id: string; status: string; requester_id: string },
  me: string,
): Promise<FriendRequestResult> {
  if (existing.status === "accepted") {
    return { ok: false, reason: "already_friends" };
  }
  if (existing.requester_id === me) {
    return { ok: true, status: "pending" };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("friendships")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("id", existing.id)
    .eq("status", "pending");

  if (error) {
    console.error("Could not accept the reciprocal friend request:", error);
    return { ok: false, reason: "invalid" };
  }

  revalidateCircle();
  return { ok: true, status: "accepted" };
}

/**
 * Reads a pending friendship the caller is part of, through their RLS client.
 * The "participants read their friendships" policy is the authorisation: a
 * row comes back only if this account is one of the two in it.
 */
async function readPendingFriendship(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  friendshipId: string,
) {
  const { data } = await supabase
    .from("friendships")
    .select("id, requester_id, status")
    .eq("id", friendshipId)
    .eq("status", "pending")
    .maybeSingle();
  return data;
}

/** Accepts a request someone else sent. Only the recipient may accept. */
export async function acceptFriendRequest(friendshipId: string) {
  const { supabase, user } = await requireUser();

  const friendship = await readPendingFriendship(supabase, friendshipId);
  // Being in the row is not enough — the person who asked cannot accept for
  // the person who was asked.
  if (!friendship || friendship.requester_id === user.id) {
    return { ok: false as const };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("friendships")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("id", friendshipId)
    .eq("status", "pending");

  if (error) {
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
  const { supabase } = await requireUser();

  const friendship = await readPendingFriendship(supabase, friendshipId);
  if (!friendship) return { ok: false as const };

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("friendships")
    .delete()
    .eq("id", friendshipId)
    .eq("status", "pending");

  if (error) {
    console.error("Could not decline the friend request:", error);
    return { ok: false as const };
  }

  revalidateCircle();
  return { ok: true as const };
}

/**
 * Removes someone from the circle. Their access to conversations shared with
 * the circle stops at the next query — `is_friend()` is evaluated per request,
 * not cached on the shared rows.
 */
export async function removeFriend(friendUserId: string) {
  const { supabase, user } = await requireUser();

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
  if (!friendship) return { ok: false as const };

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("friendships")
    .delete()
    .eq("id", friendship.id);

  if (error) {
    console.error("Could not remove the friend:", error);
    return { ok: false as const };
  }

  revalidateCircle();
  return { ok: true as const };
}
