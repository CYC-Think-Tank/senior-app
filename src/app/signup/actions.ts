"use server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { validateNewPassword } from "@/lib/password";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { localeCookieName, normalizeLocale } from "@/lib/i18n";
import { normalizeEmail } from "@/lib/email";

export type SignUpResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

const SIGN_UP_ERROR =
  "We couldn’t create your account. Please wait a moment and try again.";

export async function signUpWithPassword(
  nameInput: string,
  emailInput: string,
  password: string,
): Promise<SignUpResult> {
  const name = nameInput.trim().replace(/\s+/g, " ");
  const email = normalizeEmail(emailInput);
  const locale = normalizeLocale(
    (await cookies()).get(localeCookieName)?.value,
  );

  if (
    name.length < 1 ||
    name.length > 80 ||
    !/\p{L}/u.test(name) ||
    /[\p{Cc}\p{Cf}]/u.test(name)
  ) {
    return { ok: false, error: "Enter your name." };
  }

  if (!email) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const passwordError = validateNewPassword(password);
  if (passwordError) return { ok: false, error: passwordError };

  const admin = createSupabaseAdminClient();
  // Exact match, never `ilike`: `%` and `_` are legal in an email's local part
  // but are wildcards in a LIKE pattern, so an address like `j%@gmail.com`
  // would otherwise match every j-address on the domain. Both sides of this
  // comparison are lowercased (migration 013 backfilled the column).
  const { data: existingProfile, error: profileLookupError } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
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

  // Exact match for the same reason as the profile lookup above, and here it
  // decides the account's role: under `ilike`, signing up as `j%@gmail.com`
  // would match a seeded admin address and grant admin. Migration 013
  // lowercased this table so `eq` matches what the signup trigger does.
  const { data: adminEmail } = await admin
    .from("admin_emails")
    .select("email")
    .eq("email", email)
    .maybeSingle();
  const role = adminEmail ? "admin" : "family";

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: data.user.id,
      email,
      display_name: name,
      locale,
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

  return { ok: true, redirectTo: role === "admin" ? "/admin" : "/dashboard" };
}
