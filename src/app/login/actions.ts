"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
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

  // The session cookie is set by the `nextCookies()` plugin, which forwards
  // Better Auth's Set-Cookie out of this server action.
  const signIn = await auth.api
    .signInEmail({ body: { email, password }, headers: await headers() })
    .catch((error: unknown) => {
      console.error("Could not sign in with password:", error);
      return null;
    });

  if (!signIn?.user) {
    // Better Auth answers "invalid email or password" either way, on purpose.
    // The app has always told the two apart, so look the account up directly
    // to keep that wording rather than regress the sign-in page.
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
    .where(eq(profiles.id, signIn.user.id))
    .limit(1);

  if (!profile) {
    await auth.api.signOut({ headers: await headers() }).catch(() => {});
    console.error("Signed-in account has no profile row:", signIn.user.id);
    return { ok: false, error: t("loginError") };
  }

  return {
    ok: true,
    redirectTo: profile.role === "admin" ? "/admin" : "/dashboard",
  };
}
