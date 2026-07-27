import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import {
  localeCookieName,
  normalizeLocale,
  type Locale,
} from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Resolves the language for a request. A signed-in person's saved preference
 * is authoritative so it follows them to another device; everyone else uses
 * the local cookie.
 */
export const getPreferredLocale = cache(async (): Promise<Locale> => {
  const cookieLocale = normalizeLocale(
    (await cookies()).get(localeCookieName)?.value,
  );
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (!userId) return cookieLocale;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("locale")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Could not load the user's language preference:", error);
    return cookieLocale;
  }

  return profile?.locale ? normalizeLocale(profile.locale) : cookieLocale;
});
