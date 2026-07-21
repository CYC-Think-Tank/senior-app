/**
 * Layout of the chunks the browser uploads while an interview is running.
 * Kept free of node-only imports so route handlers can use it cheaply.
 *
 * A conversation can be recorded across several sittings — a guest whose tab
 * closed picks it back up later — so chunks are grouped by attempt:
 * `<attemptId>-<index>`, both zero-padded so one lexicographic sort puts the
 * sittings in the order they happened and the chunks in order within each.
 * The attempt id is stamped by the server, never the guest's device clock,
 * which is what makes that ordering trustworthy.
 */

const ATTEMPT_DIGITS = 13;
const INDEX_DIGITS = 5;

/** Storage prefix holding the in-progress chunks for a session. */
export function partsPrefix(sessionId: string): string {
  return `${sessionId}/parts`;
}

export function partPath(
  sessionId: string,
  attemptId: number,
  index: number,
  ext: string
): string {
  const attempt = String(attemptId).padStart(ATTEMPT_DIGITS, "0");
  const idx = String(index).padStart(INDEX_DIGITS, "0");
  return `${partsPrefix(sessionId)}/${attempt}-${idx}.${ext}`;
}

export function isValidAttemptId(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) > 0 &&
    String(value).length === ATTEMPT_DIGITS
  );
}
