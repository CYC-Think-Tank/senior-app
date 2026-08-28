import "server-only";

import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  circleShares,
  conversationVideos,
  friendships,
  guests,
  profiles,
  sessions,
} from "@/lib/db/schema";
import { ABANDONED_AFTER_MS } from "@/lib/constants";

/**
 * Authorization, formerly Row Level Security.
 *
 * Under Supabase every query the user-scoped client ran was filtered by RLS
 * before it returned, so forgetting a check was usually harmless. The Drizzle
 * client in src/lib/db has no such net: every query it runs sees every row.
 * These functions are the transcription of the 32 policies that used to do
 * that work, and a route that reads somebody else's rows without calling one
 * of them is a data leak, not a missing filter.
 *
 * The naming follows the SQL helpers they replace so the two can be read side
 * by side: `is_admin`, `is_friend`, `is_connected`, `conversation_owner`,
 * `is_circle_shared` in supabase/migrations/013–016.
 *
 * The writes these guard were already service-role writes under Supabase —
 * every social table was read-only under RLS (see the note at the top of
 * migration 013), so "authorise first, then write" is the shape the app
 * already had. What changes is that the reads now need it too.
 */

/** `public.is_admin()` — the caller holds the admin role. */
export async function isAdmin(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  return row?.role === "admin";
}

/**
 * `public.is_friend(other)` — an *accepted* friendship in either direction.
 * This is the predicate that gates circle sharing.
 */
export async function isFriend(userId: string, other: string): Promise<boolean> {
  const [row] = await db
    .select({ id: friendships.id })
    .from(friendships)
    .where(
      and(
        eq(friendships.status, "accepted"),
        or(
          and(
            eq(friendships.userLow, userId),
            eq(friendships.userHigh, other),
          ),
          and(
            eq(friendships.userHigh, userId),
            eq(friendships.userLow, other),
          ),
        ),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * `public.is_connected(other)` — accepted *or* pending, either direction.
 *
 * Wider than `isFriend` on purpose: it is what lets a pending requester's name
 * render on the other person's requests list, before there is a friendship to
 * speak of. Use `isFriend` for anything that exposes content.
 */
export async function isConnected(
  userId: string,
  other: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: friendships.id })
    .from(friendships)
    .where(
      or(
        and(eq(friendships.userLow, userId), eq(friendships.userHigh, other)),
        and(eq(friendships.userHigh, userId), eq(friendships.userLow, other)),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * `public.conversation_owner(session)` — the account behind a conversation.
 *
 * Null for an anonymous /interview walk-in, whose guest row has no user_id.
 * That null is what keeps those conversations out of circle sharing entirely,
 * so callers must treat it as "nobody owns this", never as a wildcard.
 */
export async function conversationOwner(
  sessionId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ ownerId: guests.userId })
    .from(sessions)
    .innerJoin(guests, eq(guests.id, sessions.guestId))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  return row?.ownerId ?? null;
}

/** `public.is_circle_shared(session)` — the whole-circle switch is on. */
export async function isCircleShared(sessionId: string): Promise<boolean> {
  const [row] = await db
    .select({ sessionId: circleShares.sessionId })
    .from(circleShares)
    .where(eq(circleShares.sessionId, sessionId))
    .limit(1);
  return Boolean(row);
}

/**
 * The "users read their own sessions" policy (migration 017), as a reusable
 * SQL condition rather than a boolean, so list queries can filter with it
 * instead of checking one id at a time.
 *
 * A conversation reaches its owner once it is ready, or once it has been
 * recording without a checkpoint for longer than ABANDONED_AFTER_MS — that
 * second branch is how a closed tab's session is recovered, and it is also
 * what stops this exposing a conversation that is live right now.
 */
export function ownSessionCondition(userId: string) {
  const abandonedAfter = `${Math.round(ABANDONED_AFTER_MS / 1000)} seconds`;
  return and(
    eq(guests.userId, userId),
    or(
      eq(sessions.status, "ready"),
      and(
        eq(sessions.status, "recording"),
        sql`${sessions.lastCheckpointAt} is not null`,
        sql`${sessions.lastCheckpointAt} < now() - ${abandonedAfter}::interval`,
      ),
    ),
  );
}

/**
 * Whether this account may see this conversation as its own — the single-row
 * form of `ownSessionCondition`, for the authorize-then-act server actions.
 */
export async function canReadOwnSession(
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .innerJoin(guests, eq(guests.id, sessions.guestId))
    .where(and(eq(sessions.id, sessionId), ownSessionCondition(userId)))
    .limit(1);
  return Boolean(row);
}

/**
 * Whether this account owns this *finished* conversation.
 *
 * Stricter than `canReadOwnSession`, which also admits an abandoned recording
 * so it can be resumed. Everything that publishes, edits, or spends money on a
 * conversation uses this instead, matching the `status = 'ready'` filter those
 * call sites always carried.
 */
export async function ownsReadySession(
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .innerJoin(guests, eq(guests.id, sessions.guestId))
    .where(
      and(
        eq(sessions.id, sessionId),
        eq(sessions.status, "ready"),
        eq(guests.userId, userId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * The "storytellers read their conversation videos" policy (migration 017):
 * a film belongs to whoever recorded the finished conversation behind it.
 *
 * Returns the film, so callers that need its status do not have to read it a
 * second time. Films are expensive to make, so every route that starts, remakes
 * or repairs one goes through here first.
 */
export async function ownedConversationVideo(
  userId: string,
  videoId: string,
): Promise<typeof conversationVideos.$inferSelect | null> {
  const [row] = await db
    .select({ video: conversationVideos })
    .from(conversationVideos)
    .innerJoin(sessions, eq(sessions.id, conversationVideos.sessionId))
    .innerJoin(guests, eq(guests.id, sessions.guestId))
    .where(
      and(
        eq(conversationVideos.id, videoId),
        eq(sessions.status, "ready"),
        eq(guests.userId, userId),
      ),
    )
    .limit(1);
  return row?.video ?? null;
}

/**
 * The "circle reads comments" policy (migration 016): the storyteller always
 * sees their own conversation, and their friends see it while the switch is on
 * and the friendship stands.
 *
 * The owner branch is what keeps a conversation visible to the person who
 * recorded it after they switch circle sharing back off — hidden from the
 * circle rather than gone.
 */
export async function canReadCircleConversation(
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const owner = await conversationOwner(sessionId);
  if (!owner) return false;
  if (owner === userId) return true;
  if (!(await isCircleShared(sessionId))) return false;
  return isFriend(userId, owner);
}

/**
 * Which of `ids` the caller is connected to — the set form of `isConnected`,
 * for the pages that resolve a batch of names at once.
 *
 * Anyone not connected is simply absent from the result, which is how the
 * "read connected profiles" policy behaved: a name the caller may not see came
 * back as no row rather than as an error.
 */
export async function filterConnected(
  userId: string,
  ids: string[],
): Promise<Set<string>> {
  const connected = new Set<string>();
  if (ids.length === 0) return connected;

  const rows = await db
    .select({ low: friendships.userLow, high: friendships.userHigh })
    .from(friendships)
    .where(
      or(
        and(eq(friendships.userLow, userId), inArray(friendships.userHigh, ids)),
        and(eq(friendships.userHigh, userId), inArray(friendships.userLow, ids)),
      ),
    );

  for (const row of rows) {
    connected.add(row.low === userId ? row.high : row.low);
  }
  return connected;
}

/**
 * The circle_shares read policies (migration 015), which are OR-ed: the
 * storyteller sees their own switches, and a friend sees the ones pointed at
 * them. Returns the share row, or null when the caller may not see it.
 *
 * The share row existing is half the answer — this is what makes "unshared
 * while I had the page open" and "unfriended while I had the page open" come
 * back the same way, without either being checked for separately.
 */
export async function readableCircleShare(
  userId: string,
  sessionId: string,
): Promise<{ sessionId: string; ownerId: string; createdAt: string } | null> {
  const [share] = await db
    .select()
    .from(circleShares)
    .where(eq(circleShares.sessionId, sessionId))
    .limit(1);
  if (!share) return null;
  if (share.ownerId === userId) return share;
  return (await isFriend(userId, share.ownerId)) ? share : null;
}

/**
 * The "read connected profiles" policy (migration 014): a profile is readable
 * by its owner, by an admin, and by anyone already connected to it.
 *
 * Friend *search* is deliberately not covered — at search time there is no
 * relationship yet. That path returns a minimal shape from a query that never
 * consults this; see `searchFriendByEmail`.
 */
export async function canReadProfile(
  userId: string,
  profileId: string,
): Promise<boolean> {
  if (userId === profileId) return true;
  if (await isConnected(userId, profileId)) return true;
  return isAdmin(userId);
}
