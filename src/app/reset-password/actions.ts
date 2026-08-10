"use server";

import { validateNewPassword } from "@/lib/password";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PasswordResetResult =
  | { ok: true }
  | { ok: false; error: string };

export async function resetPassword(
  password: string,
): Promise<PasswordResetResult> {
  const passwordError = validateNewPassword(password);
  if (passwordError) return { ok: false, error: passwordError };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      ok: false,
      error: "This reset link has expired. Request a new one.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error("Could not update the password:", error);
    return {
      ok: false,
      error: "We couldn’t update your password. Please try again.",
    };
  }

  await supabase.auth.signOut();
  return { ok: true };
}
