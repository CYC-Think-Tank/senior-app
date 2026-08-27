"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth/config";
import { normalizeEmail } from "@/lib/email";
import { translate } from "@/lib/i18n";
import { getPreferredLocale } from "@/lib/preferred-locale";

export type PasswordResetRequestResult =
  | { ok: true }
  | { ok: false; error: string };

export async function requestPasswordReset(
  emailInput: string,
): Promise<PasswordResetRequestResult> {
  const email = normalizeEmail(emailInput);
  const locale = await getPreferredLocale();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  if (!email) {
    return { ok: false, error: t("authEmailInvalid") };
  }

  // `redirectTo` is where Better Auth sends the browser once the emailed link
  // has been checked; it arrives there with the one-time token on the query
  // string, which /reset-password hands back to `resetPassword`.
  const result = await auth.api
    .requestPasswordReset({
      body: { email, redirectTo: "/reset-password" },
      headers: await headers(),
    })
    .catch((error: unknown) => {
      console.error("Could not send a password-reset email:", error);
      return null;
    });

  if (!result) {
    return { ok: false, error: t("passwordResetRequestError") };
  }

  return { ok: true };
}
