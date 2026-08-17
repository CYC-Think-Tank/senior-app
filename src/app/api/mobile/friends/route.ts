import { NextResponse, type NextRequest } from "next/server";
import { requireMobileUser, unauthorized } from "@/lib/mobile/auth";
import { otherParticipant, requestDirection } from "@/lib/friends";
import { personName } from "@/lib/names";
import type { Friendship, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * The caller's whole friend graph, in the three shapes the screen renders.
 * Port of `getMyCircle()`.
 *
 * Both queries run through the RLS client: "participants read their
 * friendships" scopes the first to rows this account is in, and "read
 * connected profiles" (migration 014) is what makes the second one legal.
 */
export async function GET(request: NextRequest) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { supabase, user } = auth;

  const { data } = await supabase
    .from("friendships")
    .select("id, user_low, user_high, requester_id, status, created_at, responded_at")
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as Friendship[];
  if (rows.length === 0) {
    return NextResponse.json({ friends: [], incoming: [], outgoing: [] });
  }

  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .in(
      "id",
      rows.map((row) => otherParticipant(row, user.id))
    );

  const names = new Map<string, string>();
  for (const profile of (profileRows ?? []) as Pick<
    Profile,
    "id" | "display_name" | "email"
  >[]) {
    names.set(profile.id, personName(profile.display_name, profile.email));
  }

  const friends = [];
  const incoming = [];
  const outgoing = [];

  for (const row of rows) {
    const userId = otherParticipant(row, user.id);
    // Someone we cannot name is skipped rather than shown as a placeholder
    // person in the list.
    const name = names.get(userId);
    if (!name) continue;

    if (row.status === "accepted") {
      friends.push({ userId, name, since: row.responded_at ?? row.created_at });
    } else if (requestDirection(row, user.id) === "incoming") {
      incoming.push({ id: row.id, userId, name, sentAt: row.created_at });
    } else {
      outgoing.push({ id: row.id, userId, name, sentAt: row.created_at });
    }
  }

  friends.sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({ friends, incoming, outgoing });
}
