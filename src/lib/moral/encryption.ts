import {
  decryptTurnText,
  encryptTurnText,
} from "@/lib/transcript/encryption";
import { locales, type Locale } from "@/lib/i18n";

/** The takeaway, in every locale the share page can be read in. */
export type Moral = Record<Locale, string>;

/**
 * The moral is the conversation compressed to its point, so it is sealed like
 * the conversation. A dumped `sessions` table already gives up titles and
 * topics; leaving this in plaintext would hand over a one-line, readable-at-a-
 * glance index of what every family's stories were actually about — the very
 * thing transcript encryption exists to prevent.
 *
 * It reuses the transcript's cipher and key rather than minting a second one,
 * binding itself to turn slot -1: an index `saveTurns` can never write, so a
 * sealed moral cannot be replayed into the transcript, nor a turn hoisted into
 * the moral's place.
 */
const MORAL_SLOT = -1;

export function encryptMoral(sessionId: string, moral: Moral): string {
  return encryptTurnText(sessionId, MORAL_SLOT, JSON.stringify(moral));
}

/**
 * Null for anything that is not a moral we wrote, can still authenticate, and
 * can render in every locale. A share page missing its takeaway is a page that
 * simply does not show one; it is never a reason to fail the whole render, and
 * a partial moral would leave the switcher landing on a blank line.
 */
export function decryptMoral(
  sessionId: string,
  stored: string | null
): Moral | null {
  if (!stored) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(decryptTurnText(sessionId, MORAL_SLOT, stored));
  } catch {
    console.error(`moral for session ${sessionId} could not be read`);
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  const usable = locales.every(
    (locale) =>
      typeof record[locale] === "string" &&
      (record[locale] as string).trim().length > 0
  );
  return usable ? (parsed as Moral) : null;
}
