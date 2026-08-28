"use server";

import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { adminEmails, profiles } from "@/lib/db/schema";
import { validateNewPassword } from "@/lib/password";
import { localeCookieName, normalizeLocale, translate } from "@/lib/i18n";
import { normalizeEmail } from "@/lib/email";

export type SignUpResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

export async function signUpWithPassword(
  nameInput: string,
  emailInput: string,
  password: string,
): Promise<SignUpResult> {
  const name = nameInput.trim().replace(/\s+/g, " ");
  const email = normalizeEmail(emailInput);
  const locale = normalizeLocale(
    (await cookies()).get(localeCookieName)?.value,
  );
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  if (
    name.length < 1 ||
    name.length > 80 ||
    !/\p{L}/u.test(name) ||
    /[\p{Cc}\p{Cf}]/u.test(name)
  ) {
    return { ok: false, error: t("signupNameError") };
  }

  if (!email) {
    return { ok: false, error: t("authEmailInvalid") };
  }

  const passwordError = validateNewPassword(password);
  if (passwordError) return { ok: false, error: t("authPasswordMin") };

  const [existingProfile] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.email, email))
    .limit(1);

  if (existingProfile) {
    return { ok: false, error: t("signupAccountExists") };
  }

  let userId: string;
  try {
    // autoSignIn is on, so this both creates the account and signs them in;
    // nextCookies writes the session cookie onto this action's response.
    const result = await auth.api.signUpEmail({
      body: { name, email, password },
      headers: await headers(),
    });
    userId = result.user.id;
  } catch (error) {
    if (!(error instanceof APIError)) throw error;
    console.error("Could not create a password account:", error);
    return { ok: false, error: t("signupError") };
  }

  // Exact match, never `ilike`: `%` and `_` are legal in an email's local part
  // but are wildcards in a LIKE pattern, and here the comparison decides the
  // account's role — under `ilike`, signing up as `j%@gmail.com` would match a
  // seeded admin address and grant admin. Both sides are lowercase.
  const [adminEmail] = await db
    .select({ email: adminEmails.email })
    .from(adminEmails)
    .where(eq(adminEmails.email, email))
    .limit(1);
  const role = adminEmail ? "admin" : "family";

  try {
    await db
      .insert(profiles)
      .values({ id: userId, email, displayName: name, locale, role })
      .onConflictDoUpdate({
        target: profiles.id,
        set: { email, displayName: name, locale, role },
      });
  } catch (error) {
    console.error("Could not create the signed-up profile:", error);
    return { ok: false, error: t("signupError") };
  }

  return { ok: true, redirectTo: role === "admin" ? "/admin" : "/dashboard" };
}
