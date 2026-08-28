import { cache } from "react";
import { and, count, desc, eq, inArray, ne, or } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { friendships, profiles } from "@/lib/db/schema";
import { otherParticipant, requestDirection } from "@/lib/friends";
import { personName } from "@/lib/names";
import type { Friendship } from "@/lib/types";

export type CircleFriend = {
  userId: string;
  name: string;
  /** When the request was accepted, or sent if the row predates that stamp. */
  since: string;
};

export type FriendRequest = {
  /** The friendship row's id — what accept and decline act on. */
  id: string;
  userId: string;
  name: string;
  sentAt: string;
};

export type MyCircle = {
  friends: CircleFriend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
};

/**
 * The caller's whole friend graph, in the three shapes the page renders.
 *
 * The `userLow`/`userHigh` filter is the "participants read their friendships"
 * policy, written out: a row is the caller's business only if they are one of
 * the two accounts in it. Everyone named below is therefore someone this
 * account is already connected to, which is exactly what made reading their
 * profiles legal under "read connected profiles" too.
 */
export const getMyCircle = cache(async (): Promise<MyCircle> => {
  const { user } = await requireUser();

  const rows = (await db
    .select()
    .from(friendships)
    .where(
      or(eq(friendships.userLow, user.id), eq(friendships.userHigh, user.id)),
    )
    .orderBy(desc(friendships.createdAt))) as Friendship[];

  if (rows.length === 0) return { friends: [], incoming: [], outgoing: [] };

  // Two plain queries rather than a join: `friendships` has three foreign keys
  // into `profiles`, so joining would need disambiguating for no gain here.
  const otherIds = rows.map((row) => otherParticipant(row, user.id));
  const profileRows = await db
    .select({
      id: profiles.id,
      displayName: profiles.displayName,
      email: profiles.email,
    })
    .from(profiles)
    .where(inArray(profiles.id, otherIds));

  const names = new Map<string, string>();
  for (const profile of profileRows) {
    names.set(profile.id, personName(profile.displayName, profile.email));
  }

  const friends: CircleFriend[] = [];
  const incoming: FriendRequest[] = [];
  const outgoing: FriendRequest[] = [];

  for (const row of rows) {
    const userId = otherParticipant(row, user.id);
    // A profile that did not come back is one we cannot name — skip it rather
    // than inventing a placeholder person in the list.
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
  return { friends, incoming, outgoing };
});

/**
 * How many people are waiting on an answer from this account. Drives the
 * sidebar badge, so it is a count query rather than a second full read.
 */
export const getPendingRequestCount = cache(async (): Promise<number> => {
  const { user } = await requireUser();
  const [row] = await db
    .select({ value: count() })
    .from(friendships)
    .where(
      and(
        eq(friendships.status, "pending"),
        ne(friendships.requesterId, user.id),
        // Scoped to rows the caller is actually in — without this the badge
        // would count every pending request in the database.
        or(eq(friendships.userLow, user.id), eq(friendships.userHigh, user.id)),
      ),
    );
  return row?.value ?? 0;
});
