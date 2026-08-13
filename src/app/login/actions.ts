"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeEmail } from "@/lib/email";

export type PasswordSignInResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

const SIGN_IN_ERROR =
  "We couldn’t sign you in. Please wait a moment and try again.";
const ACCOUNT_NOT_FOUND = "Account not found";
const INCORRECT_PASSWORD = "Incorrect password";

export async function signInWithPassword(
  emailInput: string,
  password: string,
): Promise<PasswordSignInResult> {
  const email = normalizeEmail(emailInput);

  if (!email) {
    return { ok: false, error: "Enter a valid email address." };
  }

  if (!password) {
    return { ok: false, error: "Enter your password." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: signIn, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !signIn.user) {
    console.error("Could not sign in with password:", error);
    // Supabase returns the same "invalid credentials" error whether the email
    // is unknown or the password is wrong, so look the account up directly to
    // tell the two apart. The admin client bypasses RLS; the email column is
    // stored lowercase, matching normalizeEmail's output (see @/lib/email).
    const admin = createSupabaseAdminClient();
    const { data: account, error: lookupError } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (lookupError) {
      console.error("Could not check for an existing account:", lookupError);
      return { ok: false, error: SIGN_IN_ERROR };
    }
    return {
      ok: false,
      error: account ? INCORRECT_PASSWORD : ACCOUNT_NOT_FOUND,
    };
  }

  // Filtered by id rather than left to RLS: an admin reads every profile, and
  // anyone with a friend reads theirs too, so an unfiltered single() sees more
  // than one row and fails — signing out the very people it just let in.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", signIn.user.id)
    .single();
  if (profileError || !profile) {
    await supabase.auth.signOut();
    console.error("Could not load the signed-in profile:", profileError);
    return { ok: false, error: SIGN_IN_ERROR };
  }

  return {
    ok: true,
    redirectTo: profile.role === "admin" ? "/admin" : "/dashboard",
  };
}
