import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { personName } from "@/lib/names";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

type GuestNameSource = {
  name: string;
  user_id: string | null;
};

/**
 * A signed-in storyteller's profile is the source of truth for their name.
 * Anonymous and admin-created guests have no linked profile, so their stored
 * guest name remains authoritative.
 */
export async function resolveCurrentGuestName(
  admin: AdminClient,
  guest: GuestNameSource,
) {
  if (!guest.user_id) {
    return guest.name;
  }

  const { data: profile, error } = await admin
    .from("profiles")
    .select("display_name, email")
    .eq("id", guest.user_id)
    .maybeSingle();

  if (error) {
    console.error("Could not resolve the guest's current profile name:", error);
    return guest.name;
  }

  return profile
    ? personName(profile.display_name, profile.email)
    : guest.name;
}
