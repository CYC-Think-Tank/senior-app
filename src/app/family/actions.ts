"use server";

import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { localeCookieName, normalizeLocale } from "@/lib/i18n";
import { personName } from "@/lib/names";

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

/**
 * Renames a conversation. Writes to `title`, never `topic` — the latter feeds
 * the AI host and episode metadata, so it must keep describing the interview.
 * Passing an empty name clears it, returning the conversation to numbering.
 */
export async function renameConversation(sessionId: string, name: string) {
  const { supabase } = await requireUser();

  // RLS: only returns a row the caller's family is allowed to see.
  const { data: session } = await supabase
    .from("sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("status", "ready")
    .single();
  if (!session) return { ok: false as const };

  const title = name.trim().slice(0, 120) || null;
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("sessions")
    .update({ title })
    .eq("id", sessionId);

  if (error) {
    console.error("Could not rename the conversation:", error);
    return { ok: false as const };
  }

  revalidatePath("/family");
  revalidatePath(`/family/${sessionId}`);
  return { ok: true as const };
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
        name: personName(profile?.display_name, email),
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
