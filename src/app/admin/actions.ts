"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function createGuest(formData: FormData) {
  const { supabase } = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const bio = String(formData.get("bio") ?? "").trim() || null;
  const language = String(formData.get("language") ?? "").trim() || "English";
  const topics = String(formData.get("topics") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const { data: guest, error } = await supabase
    .from("guests")
    .insert({ name, bio, language, topics: topics.length ? topics : null })
    .select("id")
    .single();

  if (error || !guest) throw new Error("Could not create the guest.");
  redirect(`/admin/guests/${guest.id}`);
}

export async function createSession(guestId: string, formData: FormData) {
  const { supabase } = await requireAdmin();
  const topic = String(formData.get("topic") ?? "").trim() || null;

  const { error } = await supabase
    .from("sessions")
    .insert({ guest_id: guestId, topic });
  if (error) throw new Error("Could not create the interview link.");
  revalidatePath(`/admin/guests/${guestId}`);
}

export async function deleteSession(sessionId: string, guestId: string) {
  const { supabase } = await requireAdmin();
  await supabase.from("sessions").delete().eq("id", sessionId);
  revalidatePath(`/admin/guests/${guestId}`);
  revalidatePath("/admin");
}

export async function inviteFamily(guestId: string, formData: FormData) {
  await requireAdmin();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email) return;

  const admin = createSupabaseAdminClient();

  // If this person already has an account, link them immediately.
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  const { error } = await admin.from("family_access").upsert(
    {
      guest_id: guestId,
      invite_email: email,
      user_id: profile?.id ?? null,
      status: profile ? "active" : "pending",
    },
    { onConflict: "guest_id,invite_email" }
  );
  if (error) throw new Error("Could not save the invite.");

  if (!profile) {
    // Sends a Supabase invite email; the signup trigger claims the invite.
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    await admin.auth.admin
      .inviteUserByEmail(email, { redirectTo: `${site}/auth/callback` })
      .catch((err) => console.warn("inviteUserByEmail failed:", err));
  }

  revalidatePath(`/admin/guests/${guestId}`);
}

export async function setTurnExcluded(
  turnId: string,
  sessionId: string,
  excluded: boolean
) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("transcript_turns")
    .update({ excluded })
    .eq("id", turnId);
  if (error) throw new Error("Could not update the turn.");
  revalidatePath(`/admin/sessions/${sessionId}`);
}

export async function updateEpisodeMeta(episodeId: string, formData: FormData) {
  const { supabase } = await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const showNotes = String(formData.get("show_notes") ?? "").trim() || null;
  const publishAtRaw = String(formData.get("publish_at") ?? "").trim();
  const publishAt = publishAtRaw ? new Date(publishAtRaw).toISOString() : null;

  const { error } = await supabase
    .from("episodes")
    .update({
      ...(title ? { title } : {}),
      description,
      show_notes: showNotes,
      publish_at: publishAt,
    })
    .eq("id", episodeId);
  if (error) throw new Error("Could not update the episode.");
  revalidatePath(`/admin/episodes/${episodeId}`);
}

export async function sendForApproval(episodeId: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("episodes")
    .update({ status: "pending_approval", change_note: null })
    .eq("id", episodeId);
  if (error) throw new Error("Could not update the episode.");
  revalidatePath(`/admin/episodes/${episodeId}`);
}

/** Admin override for demos/testing — normally the senior approves. */
export async function markApproved(episodeId: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("episodes")
    .update({ status: "approved" })
    .eq("id", episodeId);
  if (error) throw new Error("Could not update the episode.");
  revalidatePath(`/admin/episodes/${episodeId}`);
}
