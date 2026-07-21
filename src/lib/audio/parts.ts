/**
 * Layout of the chunks the browser uploads while an interview is running.
 * Kept free of node-only imports so route handlers can use it cheaply.
 *
 * A guest whose tab closed can reopen the link and start over, so chunks are
 * grouped by attempt: `<attemptId>-<index>`, both zero-padded so one
 * lexicographic sort groups the attempts and orders the chunks within each.
 * The attempt id is stamped by the server, never the guest's device clock.
 */

const ATTEMPT_DIGITS = 13;
const INDEX_DIGITS = 5;
const PART_NAME = new RegExp(
  `^(\\d{${ATTEMPT_DIGITS}})-(\\d{${INDEX_DIGITS}})\\.(webm|m4a)$`
);

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

/** The attempt a chunk belongs to, or null if the name is not one of ours. */
export function parseAttemptId(name: string): number | null {
  const match = PART_NAME.exec(name);
  return match ? Number(match[1]) : null;
}

export function isValidAttemptId(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) > 0 &&
    String(value).length === ATTEMPT_DIGITS
  );
}
