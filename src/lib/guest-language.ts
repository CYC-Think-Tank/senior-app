import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { guests, profiles } from "@/lib/db/schema";
import { interviewLanguage, normalizeLocale } from "@/lib/i18n";

type GuestLanguageSource = {
  id: string;
  user_id: string | null;
  language: string;
};

/**
 * A signed-in storyteller's interview language follows the language saved on
 * their profile. That makes Rosie use the same language when they return from
 * a different device. The guest row is updated too so admin views and later
 * sessions agree with what Rosie actually spoke.
 *
 * Anonymous guests choose their language on the way into the conversation and
 * have no account preference, so their stored language stays authoritative.
 */
export async function resolveCurrentGuestLanguage(guest: GuestLanguageSource) {
  if (!guest.user_id) {
    return guest.language;
  }

  let locale: string | null = null;
  try {
    const [profile] = await db
      .select({ locale: profiles.locale })
      .from(profiles)
      .where(eq(profiles.id, guest.user_id))
      .limit(1);
    locale = profile?.locale ?? null;
  } catch (error) {
    console.error("Could not load the storyteller's language preference:", error);
    return guest.language;
  }

  if (!locale) return guest.language;

  const language = interviewLanguage(normalizeLocale(locale));
  if (language === guest.language) {
    return language;
  }

  try {
    await db.update(guests).set({ language }).where(eq(guests.id, guest.id));
  } catch (error) {
    // The interview still follows their toggle; only the stored copy is stale.
    console.error("Could not save the storyteller's language preference:", error);
  }

  return language;
}
