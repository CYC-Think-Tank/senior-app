"use server";

import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { canReadOwnSession, ownsReadySession } from "@/lib/authz";
import { db } from "@/lib/db";
import {
  conversationVideos,
  guests,
  profiles,
  sessions,
  transcriptTurns,
} from "@/lib/db/schema";
import { removeVideoObjects } from "@/lib/memoir/workflow";
import { remove } from "@/lib/storage";
import {
  conversationLanguageChosenCookieName,
  conversationLanguageDraftCookieName,
  interviewLanguage,
  localeCookieName,
  localeFromValue,
} from "@/lib/i18n";
import { getPreferredLocale } from "@/lib/preferred-locale";
import { personName } from "@/lib/names";
import { isRealtimeVoice, RAW_BUCKET } from "@/lib/constants";

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
  const { user } = await requireUser();

  if (!(await ownsReadySession(user.id, sessionId))) return { ok: false };

  const [session] = await db
    .select({ shareToken: sessions.shareToken })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!session) return { ok: false };
  if (session.shareToken) return { ok: true, token: session.shareToken };

  const token = randomBytes(24).toString("hex");
  try {
    // Only fills an empty column, so two tabs racing cannot replace a link
    // that has already been sent to somebody.
    const [written] = await db
      .update(sessions)
      .set({ shareToken: token })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.shareToken)))
      .returning({ shareToken: sessions.shareToken });
    if (!written) {
      const [current] = await db
        .select({ shareToken: sessions.shareToken })
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .limit(1);
      if (!current?.shareToken) return { ok: false };
      return { ok: true, token: current.shareToken };
    }
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
 * Access is enforced the same way as sharing: the session is read through the
 * caller's RLS-scoped client first, so this only ever runs on a conversation
 * their family owns. That read is also what keeps a *live* interview safe —
 * the policy only exposes one whose checkpoints have gone stale, so this
 * cannot walk in on a conversation already in progress.
 */
export async function resumeConversation(sessionId: string) {
  const { user } = await requireUser();

  // canReadOwnSession carries the abandonment window from the policy this
  // replaces: a conversation still checkpointing is live, and this must not
  // walk in on it. Only a stale one comes back.
  if (!(await canReadOwnSession(user.id, sessionId))) {
    throw new Error("This conversation can no longer be continued.");
  }

  const [session] = await db
    .select({ token: sessions.token, status: sessions.status })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!session || session.status !== "recording") {
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

  // Unfinished conversations are nameable too — they show up in the same
  // list — so this is the wider check, not the ready-only one.
  if (!(await canReadOwnSession(user.id, sessionId))) {
    return { ok: false as const };
  }

  const title = name.trim().slice(0, 120) || null;
  try {
    await db.update(sessions).set({ title }).where(eq(sessions.id, sessionId));
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

  // Server Actions are public POST endpoints, so this authorises the
  // conversation explicitly before touching its turns.
  if (!(await ownsReadySession(user.id, sessionId))) {
    return { ok: false as const };
  }

  let turn;
  try {
    // Filtered by session as well as turn id, so a turn id from someone
    // else's conversation matches nothing even though the caller owns this one.
    [turn] = await db
      .update(transcriptTurns)
      .set({ excluded })
      .where(
        and(
          eq(transcriptTurns.id, turnId),
          eq(transcriptTurns.sessionId, sessionId),
        ),
      )
      .returning({ id: transcriptTurns.id });
  } catch (error) {
    console.error("Could not edit the transcript line:", error);
    return { ok: false as const };
  }
  if (!turn) return { ok: false as const };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/conversations");
  revalidatePath(`/dashboard/${sessionId}`);
  revalidatePath(`/dashboard/circle/${sessionId}`);
  return { ok: true as const };
}

/** Permanently removes a conversation after confirming the caller can read it. */
export async function deleteConversation(sessionId: string) {
  const { user } = await requireUser();
  if (!(await ownsReadySession(user.id, sessionId))) {
    return { ok: false as const };
  }

  const [[session], [video]] = await Promise.all([
    db
      .select({ rawAudioPath: sessions.rawAudioPath })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1),
    db
      .select({ id: conversationVideos.id })
      .from(conversationVideos)
      .where(eq(conversationVideos.sessionId, sessionId))
      .limit(1),
  ]);

  // Stored objects first: the row is what points at them, so deleting it
  // first would strand the audio with nothing left to find it by.
  if (session?.rawAudioPath) {
    await remove(RAW_BUCKET, [session.rawAudioPath]);
  }
  if (video?.id) {
    await removeVideoObjects(sessionId, video.id);
  }

  try {
    // Cascades the transcript, circle share, comments, and video rows.
    await db.delete(sessions).where(eq(sessions.id, sessionId));
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

  const displayName = name.trim().slice(0, 80) || null;
  const about = bio.trim().slice(0, 1000) || null;
  // Anything unrecognised is stored as null, which reads back as the app's
  // current default rather than freezing a bad value onto the row.
  const chosenVoice = isRealtimeVoice(voice) ? voice : null;

  const [profile] = await db
    .select({ email: profiles.email })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  try {
    // Every write here is pinned to the verified session id, so this action
    // can only ever save the caller's own name and storyteller details.
    await db
      .update(profiles)
      .set({ displayName })
      .where(eq(profiles.id, user.id));
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
      .where(eq(guests.userId, user.id))
      .limit(1);

    // No guest row yet means they have not recorded anything. Creating it now
    // means the bio is already waiting for the host when they do.
    if (guest) {
      await db.update(guests).set(guestFields).where(eq(guests.id, guest.id));
    } else {
      await db.insert(guests).values({
        ...guestFields,
        userId: user.id,
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
export async function startMyConversation(formData: FormData) {
  const { user } = await requireUser();
  const submittedLocale = localeFromValue(
    String(formData.get("locale") ?? ""),
  );
  const locale = submittedLocale ?? await getPreferredLocale();

  if (submittedLocale) {
    try {
      await db
        .update(profiles)
        .set({ locale: submittedLocale })
        .where(eq(profiles.id, user.id));
    } catch (localeError) {
      console.error("Could not save the conversation language:", localeError);
      throw new Error("Could not start the conversation.");
    }
  }

  const [[existing], [profile]] = await Promise.all([
    db
      .select({ id: guests.id, name: guests.name, language: guests.language })
      .from(guests)
      .where(eq(guests.userId, user.id))
      .limit(1),
    db
      .select({ displayName: profiles.displayName, email: profiles.email })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1),
  ]);

  let guestId: string;
  const email = profile?.email ?? user.email ?? "";
  const currentName = personName(profile?.displayName, email);
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
    try {
      // The userId is what makes the finished recording reachable from their
      // dashboard; every own-conversation check joins through it.
      const [guest] = await db
        .insert(guests)
        .values({
          userId: user.id,
          name: currentName,
          language: currentLanguage,
          origin: "self_serve",
        })
        .returning({ id: guests.id });
      if (!guest) throw new Error("No guest row was created.");
      guestId = guest.id;
    } catch (guestError) {
      console.error("Could not create a self guest:", guestError);
      throw new Error("Could not start the conversation.");
    }
  }

  let session;
  try {
    [session] = await db
      .insert(sessions)
      .values({ guestId })
      .returning({ token: sessions.token });
  } catch (sessionError) {
    console.error("Could not create a self conversation:", sessionError);
    throw new Error("Could not start the conversation.");
  }
  if (!session) throw new Error("Could not start the conversation.");

  try {
    // Only ever fills the column the first time, so the recorded date of
    // their first conversation is not overwritten by later ones.
    await db
      .update(profiles)
      .set({ conversationLanguageChosenAt: new Date().toISOString() })
      .where(
        and(
          eq(profiles.id, user.id),
          isNull(profiles.conversationLanguageChosenAt),
        ),
      );
  } catch (firstLanguageError) {
    console.error(
      "Could not mark the first conversation language as chosen:",
      firstLanguageError,
    );
  }

  const cookieStore = await cookies();
  cookieStore.set(localeCookieName, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  cookieStore.set(conversationLanguageChosenCookieName, "1", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  cookieStore.delete(conversationLanguageDraftCookieName);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/conversations");
  redirect(`/interview/${session.token}`);
}
