import { NextResponse, type NextRequest } from "next/server";
import { desc, eq, inArray, or } from "drizzle-orm";
import { requireMobileUser, unauthorized } from "@/lib/mobile/auth";
import { db } from "@/lib/db";
import { friendships, profiles } from "@/lib/db/schema";
import { otherParticipant, requestDirection } from "@/lib/friends";
import { personName } from "@/lib/names";
import type { Friendship } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * The caller's whole friend graph, in the three shapes the screen renders.
 * Port of `getMyCircle()`.
 *
 * The participant filter is the authorisation: a friendship row is the
 * caller's business only if they are one of the two accounts in it, which also
 * makes everyone named below someone they are already connected to.
 */
export async function GET(request: NextRequest) {
  const auth = await requireMobileUser(request);
  if (!auth) return unauthorized();
  const { user } = auth;

  const rows = (await db
    .select()
    .from(friendships)
    .where(
      or(eq(friendships.userLow, user.id), eq(friendships.userHigh, user.id)),
    )
    .orderBy(desc(friendships.createdAt))) as Friendship[];

  if (rows.length === 0) {
    return NextResponse.json({ friends: [], incoming: [], outgoing: [] });
  }

  const profileRows = await db
    .select({
      id: profiles.id,
      displayName: profiles.displayName,
      email: profiles.email,
    })
    .from(profiles)
    .where(
      inArray(
        profiles.id,
        rows.map((row) => otherParticipant(row, user.id)),
      ),
    );

  const names = new Map<string, string>();
  for (const profile of profileRows) {
    names.set(profile.id, personName(profile.displayName, profile.email));
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
      friends.push({ userId, name, since: row.respondedAt ?? row.createdAt });
    } else if (requestDirection(row, user.id) === "incoming") {
      incoming.push({ id: row.id, userId, name, sentAt: row.createdAt });
    } else {
      outgoing.push({ id: row.id, userId, name, sentAt: row.createdAt });
    }
  }

  friends.sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({ friends, incoming, outgoing });
}
