"use server";

import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { localeCookieName, normalizeLocale } from "@/lib/i18n";

export type ShareLinkResult =
  | { ok: true; token: string }
  | { ok: false };

/**
 * Creates (once) a permanent public share token for a finished conversation.
 * The caller must be a signed-in family member with access to the session —
 * that's enforced by reading the session through their RLS-scoped client
 * first; only then do we use the service role to persist the token.
 */
export async function generateShareLink(
  sessionId: string
): Promise<ShareLinkResult> {
  const { supabase } = await requireUser();

  // RLS: this returns a row only if the user may see this ready conversation.
  const { data: session } = await supabase
    .from("sessions")
    .select("id, share_token, status")
    .eq("id", sessionId)
    .eq("status", "ready")
    .single();

  if (!session) return { ok: false };
  if (session.share_token) return { ok: true, token: session.share_token };

  const token = randomBytes(24).toString("hex");
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("sessions")
    .update({ share_token: token })
    .eq("id", sessionId)
    .is("share_token", null);

  if (error) {
    console.error("Could not create a conversation share link:", error);
    return { ok: false };
  }

  revalidatePath("/family");
  return { ok: true, token };
}

/** Falls back to the email's local part when no display name is set. */
function speakerName(displayName: string | null, email: string) {
  const raw =
    displayName?.trim() ||
    email.split("@")[0].replace(/[._-]+/g, " ").trim() ||
    "Friend";
  return raw.replace(/(^|\s)(\p{L})/gu, (_, space, letter) =>
    `${space}${letter.toLocaleUpperCase()}`
  );
}

/**
 * Starts a new conversation spoken by the signed-in user. Each account gets a
 * single reusable "self" guest (plus family access to it, so the finished
 * recording shows up on their own dashboard), then a fresh session per run.
 */
export async function startMyConversation() {
  const { user } = await requireUser();
  const locale = normalizeLocale((await cookies()).get(localeCookieName)?.value);
  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from("guests")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  let guestId = existing?.id as string | undefined;

  if (!guestId) {
    const { data: profile } = await admin
      .from("profiles")
      .select("display_name, email, family_id")
      .eq("id", user.id)
      .single();

    const email = profile?.email ?? user.email ?? "";
    // Stamping the user's family on the guest is what makes the finished
    // recording visible to the rest of their family (and to them).
    const { data: guest, error: guestError } = await admin
      .from("guests")
      .insert({
        user_id: user.id,
        family_id: profile?.family_id ?? null,
        name: speakerName(profile?.display_name ?? null, email),
        language: locale === "en" ? "English" : "Chinese",
      })
      .select("id")
      .single();

    if (guestError || !guest) {
      console.error("Could not create a self guest:", guestError);
      throw new Error("Could not start the conversation.");
    }
    guestId = guest.id;
  }

  const { data: session, error: sessionError } = await admin
    .from("sessions")
    .insert({ guest_id: guestId })
    .select("token")
    .single();

  if (sessionError || !session) {
    console.error("Could not create a self conversation:", sessionError);
    throw new Error("Could not start the conversation.");
  }

  revalidatePath("/family");
  redirect(`/interview/${session.token}`);
}
