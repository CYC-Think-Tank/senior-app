"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { ownSessionsFilter, ownsGuestOf, ownsReadySession } from "@/lib/authz";
import { db } from "@/lib/db";
import { guests, profiles, sessions, transcriptTurns } from "@/lib/db/schema";
import { deleteConversation as removeConversation } from "@/lib/sessions/delete";
import { interviewLanguage } from "@/lib/i18n";
import { getPreferredLocale } from "@/lib/preferred-locale";
import { personName } from "@/lib/names";
import { isRealtimeVoice } from "@/lib/constants";

export type ShareLinkResult =
  | { ok: true; token: string }
  | { ok: false };

/**
 * Creates (once) a permanent public share token for a finished conversation.
 * The caller must be a signed-in family member who owns the session — that is
 * what `ownsReadySession` establishes before the token is written.
 */
export async function generateShareLink(
  sessionId: string
): Promise<ShareLinkResult> {
  const { user } = await requireUser();

  const [session] = await db
    .select({ id: sessions.id, share_token: sessions.share_token })
    .from(sessions)
    .innerJoin(guests, eq(guests.id, sessions.guest_id))
    .where(
      and(
        eq(sessions.id, sessionId),
        eq(sessions.status, "ready"),
        eq(guests.user_id, user.id)
      )
    )
    .limit(1);

  if (!session) return { ok: false };
  if (session.share_token) return { ok: true, token: session.share_token };

  const token = randomBytes(24).toString("hex");
  try {
    // `is null` keeps this create-once: two clicks in flight together cannot
    // replace a token that may already have been sent to someone.
    await db
      .update(sessions)
      .set({ share_token: token })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.share_token)));
  } catch (error) {
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
 * Access is enforced the same way as sharing, through `ownSessionsFilter`, so
 * this only ever runs on a conversation the caller owns. That filter is also
 * what keeps a *live* interview safe — it only exposes one whose checkpoints
 * have gone stale, so this cannot walk in on a conversation in progress.
 */
export async function resumeConversation(sessionId: string) {
  const { user } = await requireUser();

  const [session] = await db
    .select({ token: sessions.token })
    .from(sessions)
    .where(
      and(
        eq(sessions.id, sessionId),
        eq(sessions.status, "recording"),
        ownSessionsFilter(user.id)
      )
    )
    .limit(1);
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
  const { user } = await requireUser();
  const title = name.trim().slice(0, 120) || null;

  try {
    // Unfinished conversations are nameable too — they show up in the same
    // list — so this is the ownership join rather than `ownsReadySession`.
    const renamed = await db
      .update(sessions)
      .set({ title })
      .where(
        and(
          eq(sessions.id, sessionId),
          inArray(sessions.status, ["ready", "recording"]),
          ownsGuestOf(user.id)
        )
      )
      .returning({ id: sessions.id });
    if (renamed.length === 0) return { ok: false as const };
  } catch (error) {
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
  const { user } = await requireUser();

  // Server Actions are public POST endpoints, so the conversation has to be
  // authorized here — there is no RLS behind this to catch a missing check.
  if (!(await ownsReadySession(user.id, sessionId))) {
    return { ok: false as const };
  }

  try {
    // Matching on session_id too is what stops a turn from another
    // conversation being edited through a session id this caller does own.
    const edited = await db
      .update(transcriptTurns)
      .set({ excluded })
      .where(
        and(
          eq(transcriptTurns.id, turnId),
          eq(transcriptTurns.session_id, sessionId)
        )
      )
      .returning({ id: transcriptTurns.id });
    if (edited.length === 0) return { ok: false as const };
  } catch (error) {
    console.error("Could not edit the transcript line:", error);
    return { ok: false as const };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/conversations");
  revalidatePath(`/dashboard/${sessionId}`);
  revalidatePath(`/dashboard/circle/${sessionId}`);
  return { ok: true as const };
}

/** Permanently removes a conversation after confirming the caller owns it. */
export async function deleteConversation(sessionId: string) {
  const { user } = await requireUser();
  if (!(await ownsReadySession(user.id, sessionId))) {
    return { ok: false as const };
  }

  try {
    await removeConversation(sessionId);
  } catch (error) {
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
 * Both writes are pinned to the verified user id from the session, which is
 * what keeps this to the caller's own rows.
 */
export async function updateMyProfile(
  name: string,
  bio: string,
  voice: string,
) {
  const { user } = await requireUser();

  const displayName = name.trim().slice(0, 80) || null;
  const about = bio.trim().slice(0, 1000) || null;
  // Anything unrecognised is stored as null, which reads back as the app's
  // current default rather than freezing a bad value onto the row.
  const chosenVoice = isRealtimeVoice(voice) ? voice : null;

  let profile: { email: string } | undefined;
  try {
    [profile] = await db
      .update(profiles)
      .set({ display_name: displayName })
      .where(eq(profiles.id, user.id))
      .returning({ email: profiles.email });
  } catch (error) {
    console.error("Could not save the profile:", error);
    return { ok: false as const };
  }

  const guestFields = {
    name: personName(displayName, profile?.email ?? user.email),
    bio: about,
    voice: chosenVoice,
  };

  try {
    const [guest] = await db
      .select({ id: guests.id })
      .from(guests)
      .where(eq(guests.user_id, user.id))
      .limit(1);

    // No guest row yet means they have not recorded anything. Creating it now
    // means the bio is already waiting for the host when they do.
    if (guest) {
      await db.update(guests).set(guestFields).where(eq(guests.id, guest.id));
    } else {
      await db.insert(guests).values({
        ...guestFields,
        user_id: user.id,
        origin: "self_serve",
        language: interviewLanguage(await getPreferredLocale()),
      });
    }
  } catch (guestError) {
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

  const [existingRows, profileRows] = await Promise.all([
    db
      .select({ id: guests.id, name: guests.name, language: guests.language })
      .from(guests)
      .where(eq(guests.user_id, user.id))
      .limit(1),
    db
      .select({ display_name: profiles.display_name, email: profiles.email })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1),
  ]);

  const existing = existingRows[0];
  const profile = profileRows[0];
  let guestId: string;
  const email = profile?.email ?? user.email ?? "";
  const currentName = personName(profile?.display_name, email);
  const currentLanguage = interviewLanguage(locale);

  if (existing) {
    guestId = existing.id;
    if (
      existing.name !== currentName ||
      existing.language !== currentLanguage
    ) {
      try {
        await db
          .update(guests)
          .set({ name: currentName, language: currentLanguage })
          .where(eq(guests.id, guestId));
      } catch (guestError) {
        console.error("Could not update the self guest's name:", guestError);
        throw new Error("Could not start the conversation.");
      }
    }
  } else {
    // The user_id is what makes the finished recording visible on their
    // dashboard; see `ownSessionsFilter`.
    try {
      const [guest] = await db
        .insert(guests)
        .values({
          user_id: user.id,
          name: currentName,
          language: currentLanguage,
          origin: "self_serve",
        })
        .returning({ id: guests.id });
      guestId = guest.id;
    } catch (guestError) {
      console.error("Could not create a self guest:", guestError);
      throw new Error("Could not start the conversation.");
    }
  }

  let token: string;
  try {
    const [session] = await db
      .insert(sessions)
      .values({ guest_id: guestId })
      .returning({ token: sessions.token });
    token = session.token;
  } catch (sessionError) {
    console.error("Could not create a self conversation:", sessionError);
    throw new Error("Could not start the conversation.");
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/conversations");
  redirect(`/interview/${token}`);
}
