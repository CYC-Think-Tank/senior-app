import { cache } from "react";
import { requireUser } from "@/lib/auth";
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
 * Both queries run through the RLS client: "participants read their
 * friendships" scopes the first to rows this account is in, and "read
 * connected profiles" (migration 014) is what makes the second one legal.
 */
export const getMyCircle = cache(async (): Promise<MyCircle> => {
  const { supabase, user } = await requireUser();

  const { data } = await supabase
    .from("friendships")
    .select("id, user_low, user_high, requester_id, status, created_at, responded_at")
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as Friendship[];
  if (rows.length === 0) return { friends: [], incoming: [], outgoing: [] };

  // Two plain queries rather than a PostgREST embed: `friendships` has three
  // foreign keys into `profiles`, so an embed would need disambiguating hints
  // for no gain at this size.
  const otherIds = rows.map((row) => otherParticipant(row, user.id));
  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .in("id", otherIds);

  const names = new Map<string, string>();
  for (const profile of (profileRows ?? []) as Pick<
    Profile,
    "id" | "display_name" | "email"
  >[]) {
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
  const { supabase, user } = await requireUser();
  const { count } = await supabase
    .from("friendships")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .neq("requester_id", user.id);
  return count ?? 0;
});
