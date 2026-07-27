"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PasswordSignInResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SIGN_IN_ERROR =
  "We couldn’t sign you in. Please wait a moment and try again.";

export async function signInWithPassword(
  emailInput: string,
  password: string,
): Promise<PasswordSignInResult> {
  const email = emailInput.trim().toLowerCase();

  if (email.length > 320 || !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  if (!password) {
    return { ok: false, error: "Enter your password." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error("Could not sign in with password:", error);
    return { ok: false, error: SIGN_IN_ERROR };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .single();
  if (profileError || !profile) {
    await supabase.auth.signOut();
    console.error("Could not load the signed-in profile:", profileError);
    return { ok: false, error: SIGN_IN_ERROR };
  }

  return {
    ok: true,
    redirectTo: profile.role === "admin" ? "/admin" : "/family",
  };
}
