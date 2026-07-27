"use server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { validateNewPassword } from "@/lib/password";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SignUpResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SIGN_UP_ERROR =
  "We couldn’t create your account. Please wait a moment and try again.";

export async function signUpWithPassword(
  nameInput: string,
  emailInput: string,
  password: string,
): Promise<SignUpResult> {
  const name = nameInput.trim().replace(/\s+/g, " ");
  const email = emailInput.trim().toLowerCase();

  if (
    name.length < 1 ||
    name.length > 80 ||
    !/\p{L}/u.test(name) ||
    /[\p{Cc}\p{Cf}]/u.test(name)
  ) {
    return { ok: false, error: "Enter your name." };
  }

  if (email.length > 320 || !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const passwordError = validateNewPassword(password);
  if (passwordError) return { ok: false, error: passwordError };

  const admin = createSupabaseAdminClient();
  const { data: existingProfile, error: profileLookupError } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  if (profileLookupError) {
    console.error("Could not check for an existing profile:", profileLookupError);
    return { ok: false, error: SIGN_UP_ERROR };
  }

  if (existingProfile) {
    return {
      ok: false,
      error: "An account with this email already exists. Sign in instead.",
    };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: name },
  });

  if (error || !data.user?.id) {
    console.error("Could not create a password account:", error);
    return { ok: false, error: SIGN_UP_ERROR };
  }

  const { data: adminEmail } = await admin
    .from("admin_emails")
    .select("email")
    .ilike("email", email)
    .maybeSingle();
  const role = adminEmail ? "admin" : "family";

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: data.user.id,
      email,
      display_name: name,
      role,
      // Admins belong to no family. Family accounts keep the family the
      // new-user trigger gave them (or the column default, if this insert wins).
      ...(role === "admin" ? { family_id: null } : {}),
    },
    { onConflict: "id" }
  );

  if (profileError) {
    console.error("Could not create the signed-up profile:", profileError);
    return { ok: false, error: SIGN_UP_ERROR };
  }

  const supabase = await createSupabaseServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) {
    console.error("Could not sign in after password sign-up:", signInError);
    return { ok: false, error: SIGN_UP_ERROR };
  }

  return { ok: true, redirectTo: role === "admin" ? "/admin" : "/family" };
}
