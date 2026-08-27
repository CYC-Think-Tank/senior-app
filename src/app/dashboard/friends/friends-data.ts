import { cache } from "react";
import { and, count, desc, eq, inArray, ne } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { friendshipsFilter } from "@/lib/authz";
import { db } from "@/lib/db";
import { friendships, profiles } from "@/lib/db/schema";
import { otherParticipant, requestDirection } from "@/lib/friends";
import { personName } from "@/lib/names";
import type { Friendship, Profile } from "@/lib/types";

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
 * `friendshipsFilter` is the old "participants read their friendships" policy,
 * scoping the first read to rows this account is in. The profile read that
 * follows stands on the same ground migration 014's "read connected profiles"
 * did: every id in it came out of one of those rows.
 */
export const getMyCircle = cache(async (): Promise<MyCircle> => {
  const { user } = await requireUser();

  const rows = (await db
    .select()
    .from(friendships)
    .where(friendshipsFilter(user.id))
    .orderBy(desc(friendships.created_at))) as Friendship[];

  if (rows.length === 0) return { friends: [], incoming: [], outgoing: [] };

  // Two plain queries rather than one join: `friendships` has three foreign
  // keys into `profiles`, so joining would need disambiguating for no gain at
  // this size.
  const otherIds = rows.map((row) => otherParticipant(row, user.id));
  const profileRows = (await db
    .select({
      id: profiles.id,
      display_name: profiles.display_name,
      email: profiles.email,
    })
    .from(profiles)
    .where(inArray(profiles.id, otherIds))) as Pick<
    Profile,
    "id" | "display_name" | "email"
  >[];

  const names = new Map<string, string>();
  for (const profile of profileRows) {
    names.set(profile.id, personName(profile.display_name, profile.email));
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
      friends.push({ userId, name, since: row.responded_at ?? row.created_at });
    } else if (requestDirection(row, user.id) === "incoming") {
      incoming.push({ id: row.id, userId, name, sentAt: row.created_at });
    } else {
      outgoing.push({ id: row.id, userId, name, sentAt: row.created_at });
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
        friendshipsFilter(user.id),
        eq(friendships.status, "pending"),
        ne(friendships.requester_id, user.id)
      )
    );
  return row?.value ?? 0;
});
