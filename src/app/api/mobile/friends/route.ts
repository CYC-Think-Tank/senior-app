import { NextResponse, type NextRequest } from "next/server";
import { desc, inArray } from "drizzle-orm";
import { friendshipsFilter } from "@/lib/authz";
import { db } from "@/lib/db";
import { friendships, profiles } from "@/lib/db/schema";
import { requireMobileUser, unauthorized } from "@/lib/mobile/auth";
import { otherParticipant, requestDirection } from "@/lib/friends";
import { personName } from "@/lib/names";
import type { Friendship, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * The caller's whole friend graph, in the three shapes the screen renders.
 * Port of `getMyCircle()`.
 *
 * `friendshipsFilter` is the old "participants read their friendships" policy,
 * now applied by hand. The profile read that follows is safe for the same
 * reason migration 014's "read connected profiles" policy was: every id in it
 * came out of a friendship row the caller is part of.
 */
export async function GET(request: NextRequest) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { user } = auth;

  const rows = (await db
    .select()
    .from(friendships)
    .where(friendshipsFilter(user.id))
    .orderBy(desc(friendships.created_at))) as Friendship[];

  if (rows.length === 0) {
    return NextResponse.json({ friends: [], incoming: [], outgoing: [] });
  }

  const profileRows = (await db
    .select({
      id: profiles.id,
      display_name: profiles.display_name,
      email: profiles.email,
    })
    .from(profiles)
    .where(
      inArray(
        profiles.id,
        rows.map((row) => otherParticipant(row, user.id))
      )
    )) as Pick<Profile, "id" | "display_name" | "email">[];

  const names = new Map<string, string>();
  for (const profile of profileRows) {
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
