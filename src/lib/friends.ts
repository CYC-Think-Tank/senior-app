import type { Friendship } from "@/lib/types";

/**
 * A friendship is stored as a single row holding the two accounts in a fixed
 * order, smaller uuid first. The unique index on that ordered pair is what
 * makes duplicate and reciprocal requests impossible to represent, so every
 * read and write has to normalise through here first.
 */
export function friendshipPair(a: string, b: string) {
  // Lowercased before comparing, because the ordering has to agree with the
  // `user_low < user_high` check in Postgres. Postgres compares uuid by
  // memcmp over the 16 raw bytes; comparing the hyphenated hex strings in JS
  // matches that only while both are lowercase ('A' is 0x41, 'a' is 0x61, so
  // a single uppercase digit flips the result). Supabase hands back lowercase
  // ids today, so this is guarding the invariant rather than fixing a live
  // bug — but the failure it prevents is a check-constraint error on insert.
  const low = a.toLowerCase();
  const high = b.toLowerCase();
  return low < high ? { low, high } : { low: high, high: low };
}

/** The participant who is not `me`. */
export function otherParticipant(
  row: Pick<Friendship, "userLow" | "userHigh">,
  me: string,
) {
  return row.userLow === me ? row.userHigh : row.userLow;
}

/** Which way a pending request points, from `me`'s side of it. */
export function requestDirection(
  row: Pick<Friendship, "requesterId">,
  me: string,
): "incoming" | "outgoing" {
  return row.requesterId === me ? "outgoing" : "incoming";
}
