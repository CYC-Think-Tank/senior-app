"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth/config";
import { validateNewPassword } from "@/lib/password";
import { translate } from "@/lib/i18n";
import { getPreferredLocale } from "@/lib/preferred-locale";

export type PasswordResetResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Sets a new password from the one-time token in the reset link.
 *
 * The token is the whole authorisation — there is no signed-in session at this
 * point, and there deliberately isn't one: someone resetting a forgotten
 * password cannot have signed in first.
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

  const result = await auth.api
    .resetPassword({
      body: { newPassword: password, token },
      headers: await headers(),
    })
    .catch((error: unknown) => {
      console.error("Could not update the password:", error);
      return null;
    });

  if (!result) {
    return { ok: false, error: t("passwordResetExpired") };
  }

  return { ok: true };
}
