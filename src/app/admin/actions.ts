"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { sendAuthEmail } from "@/lib/resend";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createAuthCallbackUrl } from "@/lib/supabase/auth-link";
import { finalizeSessionAudio } from "@/lib/sessions/finalize";
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
    .insert({
      name,
      bio,
      language,
      topics: topics.length ? topics : null,
      origin: "admin_invite",
    })
    .select("id")
    .single();

  if (error || !guest) throw new Error("Could not create the guest.");
  redirect(`/admin/guests/${guest.id}`);
}

export async function updateGuest(guestId: string, formData: FormData) {
  const { supabase } = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false as const };
  const bio = String(formData.get("bio") ?? "").trim() || null;
  const language = String(formData.get("language") ?? "").trim() || "English";
  const topics = String(formData.get("topics") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const { error } = await supabase
    .from("guests")
    .update({ name, bio, language, topics: topics.length ? topics : null })
    .eq("id", guestId);

  if (error) {
    console.error("Could not update the guest:", error);
    return { ok: false as const };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/guests");
  revalidatePath(`/admin/guests/${guestId}`);
  return { ok: true as const };
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

/**
 * Salvages an interview whose tab was closed before the guest ended it. The
 * transcript is already saved by the live checkpoints; this stitches together
 * the recording chunks that made it up and marks the session ready.
 */
export async function recoverSession(sessionId: string, guestId: string) {
  await requireAdmin();
  const admin = createSupabaseAdminClient();

  const { data: session } = await admin
    .from("sessions")
    .select("id, status, duration_ms")
    .eq("id", sessionId)
    .single();
  if (!session) throw new Error("Session not found.");
  if (session.status === "ready") return;

  const { error } = await finalizeSessionAudio(admin, session);
  if (error) throw new Error(error);

  revalidatePath(`/admin/guests/${guestId}`);
  revalidatePath("/admin");
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
    .select("id, name, origin")
    .eq("user_id", userId)
    .maybeSingle();
  let guestId: string;
  const currentName = personName(profile.display_name, profile.email);

  if (existingGuest) {
    guestId = existingGuest.id;
    // Inviting someone who already set themselves up makes them ours: the
    // origin has to follow, or they never reach the Guests tab.
    const changes: { name?: string; origin?: string } = {};
    if (existingGuest.name !== currentName) changes.name = currentName;
    if (existingGuest.origin !== "admin_invite") changes.origin = "admin_invite";
    if (Object.keys(changes).length) {
      const { error: guestError } = await admin
        .from("guests")
        .update(changes)
        .eq("id", guestId);
      if (guestError) throw new Error("Could not prepare the invitation.");
    }
  } else {
    const { data: guest, error: guestError } = await admin
      .from("guests")
      .insert({
        user_id: userId,
        family_id: profile.family_id,
        name: currentName,
        language: "English",
        origin: "admin_invite",
      })
      .select("id")
      .single();
    if (guestError || !guest) throw new Error("Could not prepare the invitation.");
    guestId = guest.id;
  }

  const { data: existingParticipation } = await admin
    .from("podcast_participation")
    .select("session_id, status, source, request_kind")
    .eq("user_id", userId)
    .maybeSingle();
  // A submitted conversation can only be reviewed when it still points to the
  // finished session. Older or interrupted requests may have the request kind
  // but no session; turn those into a normal new-interview invite instead of
  // leaving the admin on a Server Action error page.
  if (
    existingParticipation?.status === "requested" &&
    existingParticipation.request_kind === "existing_conversation" &&
    existingParticipation.session_id
  ) {
    throw new Error("This request already includes a finished conversation. Review it from the requests page.");
  }
  let sessionId = existingParticipation?.session_id as string | null | undefined;
  const needsNewSession =
    !sessionId || existingParticipation?.status === "interview_done";

  if (needsNewSession) {
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
      source: existingParticipation?.source ?? "admin_invite",
      // A record without a usable submitted conversation now represents the
      // new interview we just created.
      request_kind: needsNewSession
        ? "new_interview"
        : existingParticipation?.request_kind ?? "new_interview",
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
  revalidatePath("/family/requests");
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

  const { error } = await supabase
    .from("episodes")
    .update({
      ...(title ? { title } : {}),
      description,
      show_notes: showNotes,
    })
    .eq("id", episodeId);
  if (error) throw new Error("Could not update the episode.");
  revalidatePath(`/admin/episodes/${episodeId}`);
  revalidatePath("/feed");
  revalidatePath(`/feed/${episodeId}`);
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
    .update({
      status: "approved",
      change_note: null,
      publish_at: new Date().toISOString(),
    })
    .eq("id", episodeId);
  if (error) throw new Error("Could not update the episode.");
  revalidatePath(`/admin/episodes/${episodeId}`);
  revalidatePath("/feed");
  revalidatePath(`/feed/${episodeId}`);
}
