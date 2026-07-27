import { cookies } from "next/headers";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  interviewLanguage,
  localeCookieName,
  normalizeLocale,
} from "@/lib/i18n";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

type GuestLanguageSource = {
  id: string;
  user_id: string | null;
  language: string;
};

/**
 * A signed-in storyteller's interview language follows the language toggle in
 * their dashboard, which only writes a cookie. Their stored `language` was
 * settled whenever their guest row happened to be created — from an older
 * toggle state, or hard-coded to English by an admin sending an invitation —
 * so the cookie on this request is the fresher answer. It is saved back so the
 * admin views and later sessions agree with what Rosie actually spoke.
 *
 * Anonymous guests choose their language on the way into the conversation and
 * have no toggle to change it afterwards, so their stored one stays
 * authoritative. A missing cookie is nobody's choice rather than a choice of
 * English, so it leaves the stored language alone as well.
 */
export async function resolveCurrentGuestLanguage(
  admin: AdminClient,
  guest: GuestLanguageSource,
) {
  const chosen = (await cookies()).get(localeCookieName)?.value;
  if (!guest.user_id || !chosen) {
    return guest.language;
  }

  const language = interviewLanguage(normalizeLocale(chosen));
  if (language === guest.language) {
    return language;
  }

  const { error } = await admin
    .from("guests")
    .update({ language })
    .eq("id", guest.id);

  // The interview still follows their toggle; only the stored copy is stale.
  if (error) {
    console.error(
      "Could not save the storyteller's language preference:",
      error,
    );
  }

  return language;
}
