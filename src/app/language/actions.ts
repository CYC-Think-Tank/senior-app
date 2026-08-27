"use server";

import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { localeCookieName, normalizeLocale } from "@/lib/i18n";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";

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
    await db
      .update(profiles)
      .set({ locale: nextLocale })
      .where(eq(profiles.id, user.id));
  } catch (error) {
    console.error("Could not save the user's language preference:", error);
  }
}
