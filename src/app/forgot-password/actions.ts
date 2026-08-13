"use server";

import { normalizeEmail } from "@/lib/email";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PasswordResetRequestResult =
  | { ok: true }
  | { ok: false; error: string };

export async function requestPasswordReset(
  emailInput: string,
): Promise<PasswordResetRequestResult> {
  const email = normalizeEmail(emailInput);
  if (!email) {
    return { ok: false, error: "Enter a valid email address." };
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
      error: "We couldn’t send the reset link. Please try again.",
    };
  }

  return { ok: true };
}
