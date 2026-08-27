import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import {
  localeCookieName,
  normalizeLocale,
  type Locale,
} from "@/lib/i18n";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";

/**
 * Resolves the language for a request. A signed-in person's saved preference
 * is authoritative so it follows them to another device; everyone else uses
 * the local cookie.
 */
export const getPreferredLocale = cache(async (): Promise<Locale> => {
  const cookieLocale = normalizeLocale(
    (await cookies()).get(localeCookieName)?.value,
  );

  const user = await getSessionUser();
  if (!user) return cookieLocale;

  try {
    const [profile] = await db
      .select({ locale: profiles.locale })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1);
    return profile?.locale ? normalizeLocale(profile.locale) : cookieLocale;
  } catch (error) {
    console.error("Could not load the user's language preference:", error);
    return cookieLocale;
  }
});
