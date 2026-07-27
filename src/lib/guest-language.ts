import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { interviewLanguage, normalizeLocale } from "@/lib/i18n";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

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
export async function resolveCurrentGuestLanguage(
  admin: AdminClient,
  guest: GuestLanguageSource,
) {
  if (!guest.user_id) {
    return guest.language;
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("locale")
    .eq("id", guest.user_id)
    .maybeSingle();

  if (profileError || !profile?.locale) {
    if (profileError) {
      console.error(
        "Could not load the storyteller's language preference:",
        profileError,
      );
    }
    return guest.language;
  }

  const language = interviewLanguage(normalizeLocale(profile.locale));
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
