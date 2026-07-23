"use server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyGeneratedEmailLink } from "@/lib/supabase/email-link-session";

export type SignUpResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SIGN_UP_ERROR =
  "We couldn’t create your account. Please wait a moment and try again.";

export async function signUpWithEmail(
  nameInput: string,
  emailInput: string
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

  const admin = createSupabaseAdminClient();
  const { data: existingProfile, error: profileLookupError } = await admin
    .from("profiles")
    .select("id, role")
    .ilike("email", email)
    .maybeSingle();

  if (profileLookupError) {
    console.error("Could not check for an existing profile:", profileLookupError);
    return { ok: false, error: SIGN_UP_ERROR };
  }

  if (existingProfile) {
    // A prior signup may have created the Supabase user before its session
    // handoff failed. Treat a retry like the app's email-only login flow so
    // the user reaches the dashboard instead of getting stuck.
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (error || !data.properties) {
      console.error("Could not recover the existing signup:", error);
      return { ok: false, error: SIGN_UP_ERROR };
    }

    const sessionResult = await verifyGeneratedEmailLink(data.properties);
    if (!sessionResult.ok) {
      console.error(
        "Could not create a session for the existing signup:",
        sessionResult.error
      );
      return { ok: false, error: SIGN_UP_ERROR };
    }

    return {
      ok: true,
      redirectTo: existingProfile.role === "admin" ? "/admin" : "/family",
    };
  }

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      data: { display_name: name },
    },
  });

  if (error || !data.properties?.hashed_token || !data.user?.id) {
    console.error("Could not create a Supabase sign-up token:", error);
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
    },
    { onConflict: "id" }
  );

  if (profileError) {
    console.error("Could not create the signed-up profile:", profileError);
    return { ok: false, error: SIGN_UP_ERROR };
  }

  const sessionResult = await verifyGeneratedEmailLink(data.properties);
  if (!sessionResult.ok) {
    console.error(
      "Could not verify the Supabase sign-up token:",
      sessionResult.error
    );
    return { ok: false, error: SIGN_UP_ERROR };
  }

  return { ok: true, redirectTo: role === "admin" ? "/admin" : "/family" };
}
