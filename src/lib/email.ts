/**
 * Email address handling, shared by sign-in, sign-up, and friend search.
 *
 * Addresses are stored lowercase (migration 013 normalised the column and
 * pinned it at the new-user trigger), so every lookup is an exact `eq` match.
 * That matters for more than tidiness: `ilike` treats `%` and `_` in the
 * pattern as wildcards, and both characters are legal in an email's local
 * part, so a user-supplied address reaching `ilike` is a wildcard search
 * wearing an email's clothes.
 */

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The longest address the profiles column is expected to hold. */
export const MAX_EMAIL_LENGTH = 320;

/**
 * Trims and lowercases an address, or returns null when it is not shaped like
 * one. The lowercase result is what matches the stored column.
 */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const email = (raw ?? "").trim().toLowerCase();
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    return null;
  }
  return email;
}
