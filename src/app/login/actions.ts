"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { normalizeEmail } from "@/lib/email";
import { translate } from "@/lib/i18n";
import { getPreferredLocale } from "@/lib/preferred-locale";

export type PasswordSignInResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

export async function signInWithPassword(
  emailInput: string,
  password: string,
): Promise<PasswordSignInResult> {
  const email = normalizeEmail(emailInput);
  const locale = await getPreferredLocale();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  if (!email) {
    return { ok: false, error: t("authEmailInvalid") };
  }

  if (!password) {
    return { ok: false, error: t("authPasswordRequired") };
  }

  let userId: string;
  try {
    // The nextCookies plugin turns the Set-Cookie this produces into the
    // session cookie on the action's response.
    const result = await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });
    userId = result.user.id;
  } catch (error) {
    if (!(error instanceof APIError)) throw error;
    console.error("Could not sign in with password:", error);
    // Better Auth answers the same way whether the address is unknown or the
    // password is wrong, so look the account up directly to tell the two
    // apart. The email column is lowercase, matching normalizeEmail's output.
    const [account] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.email, email))
      .limit(1);
    return {
      ok: false,
      error: account ? t("loginIncorrectPassword") : t("loginAccountNotFound"),
    };
  }

  const [profile] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  if (!profile) {
    await auth.api.signOut({ headers: await headers() });
    console.error("Signed in an account with no profile row:", userId);
    return { ok: false, error: t("loginError") };
  }

  return {
    ok: true,
    redirectTo: profile.role === "admin" ? "/admin" : "/dashboard",
  };
}
