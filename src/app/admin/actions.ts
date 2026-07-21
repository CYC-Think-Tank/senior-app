"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { sendAuthEmail } from "@/lib/resend";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createAuthCallbackUrl } from "@/lib/supabase/auth-link";
import { personName } from "@/lib/names";

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

export async function invitePodcastUser(userId: string) {
  const { user: adminUser } = await requireAdmin();
  if (userId === adminUser.id) throw new Error("You cannot invite your own admin account.");

  const admin = createSupabaseAdminClient();
  const { error: participationStorageError } = await admin
    .from("podcast_participation")
    .select("id")
    .limit(1);
  if (participationStorageError) {
    console.error("Podcast participation storage is unavailable:", participationStorageError);
    throw new Error(
      "Podcast invitations are not set up yet. Apply database migration 003_podcast_participation.sql.",
    );
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id, display_name, email, family_id, role")
    .eq("id", userId)
    .single();
  if (!profile || profile.role === "admin") throw new Error("Could not find that user.");

  const { data: existingGuest } = await admin
    .from("guests")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  let guestId = existingGuest?.id as string | undefined;

  if (!guestId) {
    const { data: guest, error: guestError } = await admin
      .from("guests")
      .insert({
        user_id: userId,
        family_id: profile.family_id,
        name: personName(profile.display_name, profile.email),
        language: "English",
      })
      .select("id")
      .single();
    if (guestError || !guest) throw new Error("Could not prepare the invitation.");
    guestId = guest.id;
  }

  const { data: existingParticipation } = await admin
    .from("podcast_participation")
    .select("session_id, status")
    .eq("user_id", userId)
    .maybeSingle();
  let sessionId = existingParticipation?.session_id as string | null | undefined;

  if (!sessionId || existingParticipation?.status === "interview_done") {
    const { data: session, error: sessionError } = await admin
      .from("sessions")
      .insert({ guest_id: guestId })
      .select("id")
      .single();
    if (sessionError || !session) throw new Error("Could not create the interview invitation.");
    sessionId = session.id;
  }

  const { error } = await admin.from("podcast_participation").upsert(
    {
      user_id: userId,
      session_id: sessionId,
      source: "admin_invite",
      status: "invited",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    console.error("Could not save the podcast invitation:", error);
    throw new Error("Could not save the invitation.");
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin/participation");
  revalidatePath("/family");
}

export async function deletePodcastUser(userId: string) {
  const { user } = await requireAdmin();
  if (userId === user.id) throw new Error("You cannot delete your own account.");
  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error("Could not delete that user.");
  revalidatePath("/admin/users");
  revalidatePath("/admin/participation");
  revalidatePath("/admin");
}

export async function inviteFamily(guestId: string, formData: FormData) {
  await requireAdmin();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (
    email.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new Error("Enter a valid email address.");
  }

  const admin = createSupabaseAdminClient();

  // The invitee joins the guest's family. Give the guest one if it has none.
  const { data: guest } = await admin
    .from("guests")
    .select("family_id")
    .eq("id", guestId)
    .single();
  if (!guest) throw new Error("Could not find that guest.");

  let familyId = guest.family_id as string | null;
  if (!familyId) {
    familyId = randomUUID();
    const { error: familyError } = await admin
      .from("guests")
      .update({ family_id: familyId })
      .eq("id", guestId);
    if (familyError) throw new Error("Could not save the invite.");
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  // An "invite" link also creates the auth user, which fires the trigger that
  // creates their profile — so the profile exists by the time we set family_id.
  const linkType = profile ? "magiclink" : "invite";
  const { data: link, error: linkError } =
    await admin.auth.admin.generateLink({
      type: linkType,
      email,
    });

  if (linkError || !link.properties?.hashed_token) {
    console.error("Could not generate a Supabase invite link:", linkError);
    throw new Error("Could not send the family invitation.");
  }

  const { error: joinError } = await admin
    .from("profiles")
    .update({ family_id: familyId })
    .ilike("email", email);
  if (joinError) {
    console.error("Could not add the invitee to the family:", joinError);
    throw new Error("Could not save the invite.");
  }

  try {
    await sendAuthEmail({
      to: email,
      actionLink: createAuthCallbackUrl(
        link.properties.hashed_token,
        linkType
      ),
      kind: "invitation",
    });
  } catch (error) {
    console.error("Could not send a Resend invitation email:", error);
    throw new Error("Could not send the family invitation.");
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
