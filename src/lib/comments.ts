/** Matches the char_length check on conversation_comments.body. */
export const MAX_COMMENT_LENGTH = 1000;

/**
 * Tidies a comment for storage: trims the ends, collapses runs of blank lines,
 * and caps the length. Returns null when there is nothing left to save.
 *
 * Clamps rather than rejects, like the rest of the app's writes — the database
 * check constraint is the backstop, not the first line of defence.
 */
export function normalizeCommentBody(raw: string | null | undefined) {
  const body = (raw ?? "")
    .replace(/\r\n/g, "\n")
    // Three or more newlines is someone leaning on Return, not a paragraph.
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_COMMENT_LENGTH);
  return body || null;
}
