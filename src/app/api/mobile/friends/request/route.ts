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
import { friendshipPair } from "@/lib/friends";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * Asks another family account to join the caller's circle. Port of
 * `sendFriendRequest()`.
 *
 * There is no RLS read to authorise here — anyone signed in may ask anyone.
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
  const { admin, user } = auth;

  const body = await readJson(request);
  const targetUserId = readString(body, "userId", 64);
  if (!targetUserId || targetUserId === user.id) {
    return badRequest("That request cannot be sent.");
  }

  const { data: target } = await admin
    .from("profiles")
    .select("id")
    .eq("id", targetUserId)
    .eq("role", "family")
    .maybeSingle();
  if (!target) return notFound("Nobody uses WiseShare with that account.");

  const { low, high } = friendshipPair(user.id, targetUserId);

  const { data: existing } = await admin
    .from("friendships")
    .select("id, status, requester_id")
    .eq("user_low", low)
    .eq("user_high", high)
    .maybeSingle();

  if (existing) return acceptOrEcho(admin, existing, user.id);

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
      if (raced) return acceptOrEcho(admin, raced, user.id);
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
  admin: SupabaseClient,
  existing: { id: string; status: string; requester_id: string },
  me: string
) {
  if (existing.status === "accepted") {
    return NextResponse.json({ ok: true, status: "accepted" });
  }
  if (existing.requester_id === me) {
    return NextResponse.json({ ok: true, status: "pending" });
  }

  const { error } = await admin
    .from("friendships")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("id", existing.id)
    .eq("status", "pending");

  if (error) {
    console.error("Could not accept the reciprocal friend request:", error);
    return serverError("Could not send that request.");
  }

  return NextResponse.json({ ok: true, status: "accepted" });
}
