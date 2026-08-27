"use server";

import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
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

  // Checked before asking Better Auth to create the account so the page can
  // say "you already have an account" rather than surfacing a duplicate-key
  // failure. Exact match, never `ilike`: `%` and `_` are legal in an email's
  // local part but are wildcards in a LIKE pattern.
  const [existingProfile] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.email, email))
    .limit(1);

  if (existingProfile) {
    return { ok: false, error: t("signupAccountExists") };
  }

  // The matching `profiles` row — including the admin-allowlist role check —
  // is created by the `user.create.after` hook in src/lib/auth/config.ts,
  // which is where the old `handle_new_user()` database trigger now lives.
  const signUp = await auth.api
    .signUpEmail({
      body: { name, email, password },
      headers: await headers(),
    })
    .catch((error: unknown) => {
      console.error("Could not create a password account:", error);
      return null;
    });

  if (!signUp?.user) {
    return { ok: false, error: t("signupError") };
  }

  // The hook set the role from `admin_emails`; the chosen interface language
  // is this action's to record, since only it saw the cookie.
  const [profile] = await db
    .update(profiles)
    .set({ locale })
    .where(eq(profiles.id, signUp.user.id))
    .returning({ role: profiles.role });

  if (!profile) {
    console.error("Could not create the signed-up profile:", signUp.user.id);
    return { ok: false, error: t("signupError") };
  }

  return { ok: true, redirectTo: profile.role === "admin" ? "/admin" : "/dashboard" };
}
