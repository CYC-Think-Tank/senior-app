"use server";

import { normalizeEmail } from "@/lib/email";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  if (error) {
    console.error("Could not send a password-reset email:", error);
    return {
      ok: false,
      error: t("passwordResetRequestError"),
    };
  }

  return { ok: true };
}
