"use server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EmailSignInResult =
  | { ok: true }
  | { ok: false; error: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SIGN_IN_ERROR =
  "We couldn’t sign you in. Please wait a moment and try again.";

export async function signInWithEmail(
  emailInput: string
): Promise<EmailSignInResult> {
  const email = emailInput.trim().toLowerCase();

  if (email.length > 320 || !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (error || !data.properties?.hashed_token) {
    console.error("Could not generate a Supabase sign-in token:", error);
    return { ok: false, error: SIGN_IN_ERROR };
  }

  if (!data.user?.id) {
    console.error("Supabase generated a sign-in token without a user.");
    return { ok: false, error: SIGN_IN_ERROR };
  }

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: data.user.id,
      email,
      role: "admin",
    },
    { onConflict: "id" }
  );

  if (profileError) {
    console.error("Could not prepare the signed-in profile:", profileError);
    return { ok: false, error: SIGN_IN_ERROR };
  }

  const { error: accessError } = await admin
    .from("family_access")
    .update({ user_id: data.user.id, status: "active" })
    .ilike("invite_email", email);

  if (accessError) {
    console.error("Could not link pending family access:", accessError);
  }

  const supabase = await createSupabaseServerClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "magiclink",
  });

  if (verifyError) {
    console.error("Could not verify the Supabase sign-in token:", verifyError);
    return { ok: false, error: SIGN_IN_ERROR };
  }

  return { ok: true };
}
