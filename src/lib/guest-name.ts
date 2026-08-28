import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { personName } from "@/lib/names";

type GuestNameSource = {
  name: string;
  userId: string | null;
};

/**
 * A signed-in storyteller's profile is the source of truth for their name.
 * Anonymous and admin-created guests have no linked profile, so their stored
 * guest name remains authoritative.
 */
export async function resolveCurrentGuestName(guest: GuestNameSource) {
  if (!guest.userId) {
    return guest.name;
  }

  try {
    const [profile] = await db
      .select({ displayName: profiles.displayName, email: profiles.email })
      .from(profiles)
      .where(eq(profiles.id, guest.userId))
      .limit(1);
    return profile ? personName(profile.displayName, profile.email) : guest.name;
  } catch (error) {
    console.error("Could not resolve the guest's current profile name:", error);
    return guest.name;
  }
}
