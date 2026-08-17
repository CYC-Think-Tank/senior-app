"use server";

import { validateNewPassword } from "@/lib/password";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { translate } from "@/lib/i18n";
import { getPreferredLocale } from "@/lib/preferred-locale";

export type PasswordResetResult =
  | { ok: true }
  | { ok: false; error: string };

export async function resetPassword(
  password: string,
): Promise<PasswordResetResult> {
  const locale = await getPreferredLocale();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const passwordError = validateNewPassword(password);
  if (passwordError) return { ok: false, error: t("authPasswordMin") };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      ok: false,
      error: t("passwordResetExpired"),
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error("Could not update the password:", error);
    return {
      ok: false,
      error: t("passwordResetError"),
    };
  }

  await supabase.auth.signOut();
  return { ok: true };
}
