"use server";

import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { localeCookieName, normalizeLocale } from "@/lib/i18n";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";

export async function setLocaleAction(locale: string) {
  const nextLocale = normalizeLocale(locale);
  const cookieStore = await cookies();
  cookieStore.set(localeCookieName, nextLocale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  const user = await getSessionUser();
  if (!user) return;

  try {
    // Pinned to the verified session id, so this only ever writes the caller's
    // own row.
    await db
      .update(profiles)
      .set({ locale: nextLocale })
      .where(eq(profiles.id, user.id));
  } catch (error) {
    console.error("Could not save the user's language preference:", error);
  }
}
