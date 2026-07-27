"use server";

import { cookies } from "next/headers";
import { localeCookieName, normalizeLocale } from "@/lib/i18n";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function setLocaleAction(locale: string) {
  const nextLocale = normalizeLocale(locale);
  const cookieStore = await cookies();
  cookieStore.set(localeCookieName, nextLocale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return;

  const { error } = await createSupabaseAdminClient()
    .from("profiles")
    .update({ locale: nextLocale })
    .eq("id", userId);

  if (error) {
    console.error("Could not save the user's language preference:", error);
  }
}
