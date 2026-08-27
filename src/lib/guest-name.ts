import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { personName } from "@/lib/names";

type GuestNameSource = {
  name: string;
  user_id: string | null;
};

/**
 * A signed-in storyteller's profile is the source of truth for their name.
 * Anonymous and admin-created guests have no linked profile, so their stored
 * guest name remains authoritative.
 */
export async function resolveCurrentGuestName(guest: GuestNameSource) {
  if (!guest.user_id) {
    return guest.name;
  }

  try {
    const [profile] = await db
      .select({ display_name: profiles.display_name, email: profiles.email })
      .from(profiles)
      .where(eq(profiles.id, guest.user_id))
      .limit(1);

    return profile ? personName(profile.display_name, profile.email) : guest.name;
  } catch (error) {
    console.error("Could not resolve the guest's current profile name:", error);
    return guest.name;
  }
}
