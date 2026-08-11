"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { interviewLanguage } from "@/lib/i18n";
import { getPreferredLocale } from "@/lib/preferred-locale";
import { personName } from "@/lib/names";
import {
  isRealtimeVoice,
  RAW_BUCKET,
  STORY_VIDEOS_BUCKET,
} from "@/lib/constants";

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
  const { supabase, user } = await requireUser();

  // RLS: this returns a row only if the user may see this ready conversation.
  const { data: session } = await supabase
    .from("sessions")
    .select("id, share_token, status, guests!inner(user_id)")
    .eq("id", sessionId)
    .eq("status", "ready")
    .eq("guests.user_id", user.id)
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

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/conversations");
  return { ok: true, token };
}

/**
 * Picks a conversation that ended before it was wrapped up back up, at the
 * interview link it was recorded on. The transcript its live checkpoints saved
 * is handed to the AI host, and the new recording is appended to the old one.
 *
 * Access is enforced the same way as sharing: the session is read through the
 * caller's RLS-scoped client first, so this only ever runs on a conversation
 * their family owns. That read is also what keeps a *live* interview safe —
 * the policy only exposes one whose checkpoints have gone stale, so this
 * cannot walk in on a conversation already in progress.
 */
export async function resumeConversation(sessionId: string) {
  const { supabase } = await requireUser();

  const { data: session } = await supabase
    .from("sessions")
    .select("token")
    .eq("id", sessionId)
    .eq("status", "recording")
    .single();
  if (!session) {
    throw new Error("This conversation can no longer be continued.");
  }

  redirect(`/interview/${session.token}`);
}

/**
 * Renames a conversation. Writes to `title`, never `topic` — the latter feeds
 * the AI host, so it must keep describing the interview. Passing an empty name
 * clears it, returning the conversation to numbering.
 */
export async function renameConversation(sessionId: string, name: string) {
  const { supabase, user } = await requireUser();

  // RLS: only returns a row the caller's family is allowed to see. Unfinished
  // conversations are nameable too — they show up in the same list.
  const { data: session } = await supabase
    .from("sessions")
    .select("id, guests!inner(user_id)")
    .eq("id", sessionId)
    .in("status", ["ready", "recording"])
    .eq("guests.user_id", user.id)
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

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/conversations");
  revalidatePath(`/dashboard/${sessionId}`);
  return { ok: true as const };
}

/**
 * Removes or restores one transcript line for the storyteller who owns it.
 * The row is kept so an accidental edit can be undone; every conversation
 * player treats its timestamp range as deleted while `excluded` is true.
 */
export async function setConversationTurnExcluded(
  sessionId: string,
  turnId: string,
  excluded: boolean,
) {
  const { supabase, user } = await requireUser();

  // Server Actions are public POST endpoints. Authorize the conversation
  // through the caller's RLS client before the service role touches its turns.
  const { data: session } = await supabase
    .from("sessions")
    .select("id, guests!inner(user_id)")
    .eq("id", sessionId)
    .eq("status", "ready")
    .eq("guests.user_id", user.id)
    .single();
  if (!session) return { ok: false as const };

  const admin = createSupabaseAdminClient();
  const { data: turn, error } = await admin
    .from("transcript_turns")
    .update({ excluded })
    .eq("id", turnId)
    .eq("session_id", sessionId)
    .select("id")
    .maybeSingle();

  if (error || !turn) {
    console.error("Could not edit the transcript line:", error);
    return { ok: false as const };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/conversations");
  revalidatePath(`/dashboard/${sessionId}`);
  revalidatePath(`/dashboard/circle/${sessionId}`);
  return { ok: true as const };
}

/** Permanently removes a conversation after confirming the caller can read it. */
export async function deleteConversation(sessionId: string) {
  const { supabase, user } = await requireUser();
  const { data: visibleSession } = await supabase
    .from("sessions")
    .select("id, guests!inner(user_id)")
    .eq("id", sessionId)
    .eq("status", "ready")
    .eq("guests.user_id", user.id)
    .single();
  if (!visibleSession) return { ok: false as const };

  const admin = createSupabaseAdminClient();
  const [{ data: session }, { data: video }] = await Promise.all([
    admin
      .from("sessions")
      .select("raw_audio_path")
      .eq("id", sessionId)
      .single(),
    admin
      .from("conversation_videos")
      .select("id")
      .eq("session_id", sessionId)
      .maybeSingle(),
  ]);

  if (session?.raw_audio_path) {
    await admin.storage.from(RAW_BUCKET).remove([session.raw_audio_path]);
  }
  if (video?.id) {
    const prefix = `${sessionId}/${video.id}`;
    const [{ data: objects }, { data: sceneObjects }] = await Promise.all([
      admin.storage.from(STORY_VIDEOS_BUCKET).list(prefix),
      admin.storage.from(STORY_VIDEOS_BUCKET).list(`${prefix}/scenes`),
    ]);
    const paths = [
      ...(objects ?? []).filter((object) => object.id).map((object) => `${prefix}/${object.name}`),
      ...(sceneObjects ?? []).filter((object) => object.id).map((object) => `${prefix}/scenes/${object.name}`),
    ];
    if (paths.length) {
      await admin.storage.from(STORY_VIDEOS_BUCKET).remove(paths);
    }
  }

  const { error } = await admin.from("sessions").delete().eq("id", sessionId);
  if (error) {
    console.error("Could not delete the conversation:", error);
    return { ok: false as const };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/conversations");
  revalidatePath("/admin");
  return { ok: true as const };
}

/**
 * Saves the signed-in person's own name and bio.
 *
 * The name lives on their profile — it is what the portal greets them by. The
 * bio and chosen voice live on their "self" guest row, because that is the
 * record the AI host reads before an interview. Their guest name is kept in
 * step here so the host does not greet them by a name they just changed;
 * `startMyConversation` does the same sync for accounts that were renamed
 * before this page existed.
 *
 * Both writes go through the service role: family accounts have read-only
 * policies on `profiles` and `guests`, and the rows are pinned to the verified
 * user id from the session claims.
 */
export async function updateMyProfile(
  name: string,
  bio: string,
  voice: string,
) {
  const { user } = await requireUser();
  const admin = createSupabaseAdminClient();

  const displayName = name.trim().slice(0, 80) || null;
  const about = bio.trim().slice(0, 1000) || null;
  // Anything unrecognised is stored as null, which reads back as the app's
  // current default rather than freezing a bad value onto the row.
  const chosenVoice = isRealtimeVoice(voice) ? voice : null;

  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", user.id)
    .single();

  const { error } = await admin
    .from("profiles")
    .update({ display_name: displayName })
    .eq("id", user.id);
  if (error) {
    console.error("Could not save the profile:", error);
    return { ok: false as const };
  }

  const guestFields = {
    name: personName(displayName, profile?.email ?? user.email),
    bio: about,
    voice: chosenVoice,
  };
  const { data: guest } = await admin
    .from("guests")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  // No guest row yet means they have not recorded anything. Creating it now
  // means the bio is already waiting for the host when they do.
  const { error: guestError } = guest
    ? await admin.from("guests").update(guestFields).eq("id", guest.id)
    : await admin.from("guests").insert({
        ...guestFields,
        user_id: user.id,
        origin: "self_serve",
        language: interviewLanguage(await getPreferredLocale()),
      });

  if (guestError) {
    console.error("Could not save the storyteller details:", guestError);
    return { ok: false as const };
  }

  // The sidebar greets them by name from the family layout, so refresh the
  // whole segment rather than just the settings page.
  revalidatePath("/dashboard", "layout");
  return { ok: true as const };
}

/**
 * Starts a new conversation spoken by the signed-in user. Each account gets a
 * single reusable "self" guest (plus family access to it, so the finished
 * recording shows up on their own dashboard), then a fresh session per run.
 */
export async function startMyConversation() {
  const { user } = await requireUser();
  const locale = await getPreferredLocale();
  const admin = createSupabaseAdminClient();

  const [{ data: existing }, { data: profile }] = await Promise.all([
    admin
      .from("guests")
      .select("id, name")
      .eq("user_id", user.id)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("display_name, email")
      .eq("id", user.id)
      .single(),
  ]);

  let guestId: string;
  const email = profile?.email ?? user.email ?? "";
  const currentName = personName(profile?.display_name, email);

  if (existing) {
    guestId = existing.id;
    if (existing.name !== currentName) {
      const { error: guestError } = await admin
        .from("guests")
        .update({ name: currentName })
        .eq("id", guestId);

      if (guestError) {
        console.error("Could not update the self guest's name:", guestError);
        throw new Error("Could not start the conversation.");
      }
    }
  } else {
    // The user_id is what makes the finished recording visible on their
    // dashboard; see the "users read their own sessions" policy.
    const { data: guest, error: guestError } = await admin
      .from("guests")
      .insert({
        user_id: user.id,
        name: currentName,
        language: interviewLanguage(locale),
        origin: "self_serve",
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

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/conversations");
  redirect(`/interview/${session.token}`);
}
