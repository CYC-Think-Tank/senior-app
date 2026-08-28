"use server";

import { headers } from "next/headers";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth/config";
import { validateNewPassword } from "@/lib/password";
import { translate } from "@/lib/i18n";
import { getPreferredLocale } from "@/lib/preferred-locale";

export type PasswordResetResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Sets a new password from the one-time token in the emailed link.
 *
 * The token is the whole authorisation — nobody is signed in at this point,
 * which is the situation someone who forgot their password is in. It is
 * single-use and short-lived, and Better Auth clears every other session for
 * the account once it is spent.
 */
export async function resetPassword(
  password: string,
  token: string,
): Promise<PasswordResetResult> {
  const locale = await getPreferredLocale();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const passwordError = validateNewPassword(password);
  if (passwordError) return { ok: false, error: t("authPasswordMin") };

  if (!token) {
    return { ok: false, error: t("passwordResetExpired") };
  }

  try {
    await auth.api.resetPassword({
      body: { newPassword: password, token },
      headers: await headers(),
    });
  } catch (error) {
    if (!(error instanceof APIError)) throw error;
    console.error("Could not update the password:", error);
    // A token that is spent, expired, or forged is indistinguishable here and
    // means the same thing to the person: ask for a fresh link.
    return { ok: false, error: t("passwordResetExpired") };
  }

  return { ok: true };
}
