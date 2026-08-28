"use server";

import { headers } from "next/headers";
import { APIError } from "better-auth/api";
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

  try {
    // The emailed link lands on /reset-password carrying the one-time token,
    // which the form there sends back with the new password.
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: "/reset-password" },
      headers: await headers(),
    });
  } catch (error) {
    if (!(error instanceof APIError)) throw error;
    console.error("Could not send a password-reset email:", error);
    return { ok: false, error: t("passwordResetRequestError") };
  }

  return { ok: true };
}
