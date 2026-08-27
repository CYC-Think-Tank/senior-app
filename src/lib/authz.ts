import "server-only";
import { and, eq, exists, gte, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  circleShares,
  friendships,
  guests,
  profiles,
  sessions,
} from "@/lib/db/schema";
import { ABANDONED_AFTER_MS } from "@/lib/constants";
import { friendshipPair } from "@/lib/friends";

/**
 * Authorization, transcribed from the row-level security policies that used to
 * enforce it inside Postgres.
 *
 * Under Supabase, the user-scoped client was safe by default: RLS silently
 * filtered every query down to the rows the caller was allowed to see, and a
 * forgotten check leaked nothing. The Drizzle client has no such net — every
 * query it runs has the reach the service-role client used to have. So each
 * policy from `supabase/migrations/*.sql` lives here as an explicit predicate,
 * and callers apply it themselves.
 *
 * Two shapes are offered for each rule, and which one to use matters:
 *
 *   * `can…` / `is…` — a boolean about one row. Use before acting on a known
 *     id (a server action given a `sessionId`, say).
 *   * `…Filter` — a `SQL` predicate to AND into a list query, so rows the
 *     caller may not see never come back in the first place.
 *
 * The originals are named in each doc comment. Changing a policy means
 * changing it here; nothing in the database enforces these any more.
 */

/** The window after which a session still marked `recording` counts as lost. */
const abandonedCutoff = () =>
  new Date(Date.now() - ABANDONED_AFTER_MS).toISOString();

// ---------------------------------------------------------------------------
// Roles and relationships
// ---------------------------------------------------------------------------

/** `public.is_admin()` — the caller's profile carries the admin role. */
export async function isAdmin(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  return row?.role === "admin";
}

/**
 * `public.is_friend(other)` — an *accepted* friendship exists in either
 * direction. This is the predicate that gates circle sharing and its comments.
 */
export async function isFriend(userId: string, other: string): Promise<boolean> {
  if (userId === other) return false;
  const { low, high } = friendshipPair(userId, other);
  const [row] = await db
    .select({ id: friendships.id })
    .from(friendships)
    .where(
      and(
        eq(friendships.user_low, low),
        eq(friendships.user_high, high),
        eq(friendships.status, "accepted")
      )
    )
    .limit(1);
  return Boolean(row);
}

/**
 * `public.is_connected(other)` — accepted *or* pending, either direction.
 *
 * Wider than `isFriend` on purpose: it is what lets a pending requester's name
 * render on the other person's requests list, before there is a friendship to
 * speak of. Do not use it to gate conversation content.
 */
export async function isConnected(userId: string, other: string): Promise<boolean> {
  if (userId === other) return false;
  const { low, high } = friendshipPair(userId, other);
  const [row] = await db
    .select({ id: friendships.id })
    .from(friendships)
    .where(and(eq(friendships.user_low, low), eq(friendships.user_high, high)))
    .limit(1);
  return Boolean(row);
}

/** The ids of everyone the caller has an accepted friendship with. */
export async function friendIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ low: friendships.user_low, high: friendships.user_high })
    .from(friendships)
    .where(
      and(
        eq(friendships.status, "accepted"),
        or(eq(friendships.user_low, userId), eq(friendships.user_high, userId))
      )
    );
  return rows.map((row) => (row.low === userId ? row.high : row.low));
}

/**
 * `"participants read their friendships"` — the caller is one of the two
 * accounts on the row.
 */
export function friendshipsFilter(userId: string): SQL {
  return or(
    eq(friendships.user_low, userId),
    eq(friendships.user_high, userId)
  )!;
}

/**
 * `"read own profile"` OR `"read connected profiles"` — the caller's own row,
 * plus anyone they have a pending or accepted friendship with.
 *
 * Note what this does *not* cover: friend search. At search time there is no
 * relationship yet, so no predicate could authorise it. `searchFriendByEmail`
 * queries without this filter and returns a deliberately minimal shape
 * instead — the same carve-out migration 014 documents.
 */
export function profilesFilter(userId: string): SQL {
  const connected = db
    .select({ one: sql`1` })
    .from(friendships)
    .where(
      and(
        or(
          and(eq(friendships.user_low, userId), eq(friendships.user_high, profiles.id)),
          and(eq(friendships.user_high, userId), eq(friendships.user_low, profiles.id))
        )
      )
    );

  return or(eq(profiles.id, userId), exists(connected))!;
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

/**
 * `public.conversation_owner(session)` — the account behind a conversation.
 *
 * Null for an anonymous `/interview` walk-in, whose guest row has no
 * `user_id`. That null is what keeps those conversations out of circle
 * sharing entirely, so callers must treat it as "nobody", never as a match.
 */
export async function conversationOwner(sessionId: string): Promise<string | null> {
  const [row] = await db
    .select({ owner: guests.user_id })
    .from(sessions)
    .innerJoin(guests, eq(guests.id, sessions.guest_id))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  return row?.owner ?? null;
}

/** `public.is_circle_shared(session)` — the whole-circle switch is on. */
export async function isCircleShared(sessionId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: circleShares.session_id })
    .from(circleShares)
    .where(eq(circleShares.session_id, sessionId))
    .limit(1);
  return Boolean(row);
}

/**
 * `"users read their own sessions"` — the caller owns the conversation, and it
 * is either finished or was abandoned mid-recording.
 *
 * The abandonment branch is how a closed tab's conversation is recovered, and
 * it is also what keeps this from walking in on a conversation still in
 * progress. Keep the window in step with `ABANDONED_AFTER_MS`.
 */
export function ownSessionsFilter(userId: string): SQL {
  const ownGuest = db
    .select({ one: sql`1` })
    .from(guests)
    .where(and(eq(guests.id, sessions.guest_id), eq(guests.user_id, userId)));

  return and(
    or(
      eq(sessions.status, "ready"),
      and(
        eq(sessions.status, "recording"),
        sql`${sessions.last_checkpoint_at} is not null`,
        sql`${sessions.last_checkpoint_at} < ${abandonedCutoff()}`
      )
    ),
    exists(ownGuest)
  )!;
}

/**
 * Just the ownership half of `ownSessionsFilter`: the caller is the account
 * behind the conversation, whatever state it is in.
 *
 * Renaming wants this rather than the full policy — an unfinished conversation
 * is nameable, and it appears in the same list — so the status branch is left
 * to the caller to add.
 */
export function ownsGuestOf(userId: string): SQL {
  return exists(
    db
      .select({ one: sql`1` })
      .from(guests)
      .where(and(eq(guests.id, sessions.guest_id), eq(guests.user_id, userId)))
  );
}

/** Whether one named conversation passes `ownSessionsFilter`. */
export async function canReadOwnSession(
  userId: string,
  sessionId: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), ownSessionsFilter(userId)))
    .limit(1);
  return Boolean(row);
}

/**
 * Whether the caller owns a *finished* conversation.
 *
 * The narrower check the write paths want: renaming, sharing, deleting and
 * transcript edits all required `status = 'ready'` on top of the read policy,
 * so they get their own predicate rather than re-deriving it at each site.
 */
export async function ownsReadySession(
  userId: string,
  sessionId: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .innerJoin(guests, eq(guests.id, sessions.guest_id))
    .where(
      and(
        eq(sessions.id, sessionId),
        eq(sessions.status, "ready"),
        eq(guests.user_id, userId)
      )
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Whether the caller may see a conversation shared into a friend's circle.
 *
 * The circle half of `"circle reads comments"`: the switch is on, the
 * conversation has a real owner, and the caller is that owner's friend.
 */
export async function canReadSharedSession(
  userId: string,
  sessionId: string
): Promise<boolean> {
  const owner = await conversationOwner(sessionId);
  if (!owner) return false;
  if (owner === userId) return true;
  if (!(await isCircleShared(sessionId))) return false;
  return isFriend(userId, owner);
}

/**
 * Every conversation the caller may see on the circle page: their friends'
 * shared ones. Returns session ids, which callers then read in full.
 */
export async function circleVisibleSessionIds(userId: string): Promise<string[]> {
  const friends = await friendIds(userId);
  if (friends.length === 0) return [];
  const rows = await db
    .select({ id: circleShares.session_id })
    .from(circleShares)
    .where(inArray(circleShares.owner_id, friends));
  return rows.map((row) => row.id);
}

/**
 * `"owner reads own circle shares"` OR `"friends read circle shares"`.
 *
 * Takes the friend ids rather than looking them up, so a list query does one
 * friendship read instead of one per row.
 */
export function circleSharesFilter(userId: string, friends: string[]): SQL {
  const owners = [userId, ...friends];
  return inArray(circleShares.owner_id, owners);
}

/**
 * `"storytellers read their conversation videos"` — the memoir film is
 * readable by the owner of the finished conversation behind it.
 */
export async function canReadConversationVideo(
  userId: string,
  sessionId: string
): Promise<boolean> {
  return ownsReadySession(userId, sessionId);
}

/**
 * `"circle reads comments"` OR `"author reads own comments"` — who may read
 * the comment thread on a conversation.
 *
 * The storyteller always sees the comments on their own conversation, even
 * after switching circle sharing back off; their friends see them only while
 * the switch is on and the friendship stands.
 */
export async function canReadComments(
  userId: string,
  sessionId: string
): Promise<boolean> {
  return canReadSharedSession(userId, sessionId);
}

/**
 * Whether the caller may *write* a comment on a conversation.
 *
 * Stricter than reading: the owner can always read their thread, but a friend
 * may only add to it while the conversation is actually shared with the
 * circle. Both cases still require the conversation to be finished.
 */
export async function canWriteComment(
  userId: string,
  sessionId: string
): Promise<boolean> {
  const [row] = await db
    .select({ owner: guests.user_id })
    .from(sessions)
    .innerJoin(guests, eq(guests.id, sessions.guest_id))
    .where(and(eq(sessions.id, sessionId), eq(sessions.status, "ready")))
    .limit(1);

  if (!row?.owner) return false;
  if (row.owner === userId) return true;
  if (!(await isCircleShared(sessionId))) return false;
  return isFriend(userId, row.owner);
}

/**
 * `"people read their own support requests"` — the caller filed it. Admins
 * read the whole queue through the admin routes, which check `isAdmin` first.
 */
export function ownSupportRequestsFilter(
  userId: string,
  requesterColumn: Parameters<typeof eq>[0]
): SQL {
  return eq(requesterColumn, userId);
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/** Raised by the `assert…` helpers so route handlers can answer 403 uniformly. */
export class ForbiddenError extends Error {
  constructor(message = "You do not have access to this.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export async function assertAdmin(userId: string): Promise<void> {
  if (!(await isAdmin(userId))) throw new ForbiddenError();
}

export async function assertOwnsReadySession(
  userId: string,
  sessionId: string
): Promise<void> {
  if (!(await ownsReadySession(userId, sessionId))) throw new ForbiddenError();
}

// `gte` is re-exported so callers composing their own filters alongside these
// do not need a second drizzle import for the common comparisons.
export { and, eq, or, gte };
