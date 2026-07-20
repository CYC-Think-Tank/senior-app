"use server";

import { cookies } from "next/headers";
import { localeCookieName, normalizeLocale } from "@/lib/i18n";

export async function setLocaleAction(locale: string) {
  const nextLocale = normalizeLocale(locale);
  const cookieStore = await cookies();
  cookieStore.set(localeCookieName, nextLocale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
