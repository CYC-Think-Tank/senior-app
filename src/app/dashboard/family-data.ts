import { cache } from "react";
import { headers } from "next/headers";
import { desc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { ownSessionCondition } from "@/lib/authz";
import { db } from "@/lib/db";
import { circleShares, guests, profiles, sessions } from "@/lib/db/schema";
import { translate } from "@/lib/i18n";
import { getPreferredLocale } from "@/lib/preferred-locale";
import { conversationNames } from "@/lib/names";
import { editedAudioDurationMs } from "@/lib/audio/cuts";
import { getExcludedAudioCuts } from "@/lib/transcript/audio-cuts";

export type FamilyConversation = {
  id: string;
  guestName: string;
  name: string;
  title: string | null;
  createdAt: string;
  durationMs: number | null;
  shareToken: string | null;
  // Ended early and still resumable — the checkpoints saved most of what was
  // said. These have no finished recording to listen to yet.
  unfinished: boolean;
  /** Switched on for the whole friend circle; see circle_shares. */
  sharedWithCircle: boolean;
};

export const getFamilyConversations = cache(async () => {
  const { user } = await requireUser();
  const locale = await getPreferredLocale();
  const t = (key: Parameters<typeof translate>[1], values = {}) =>
    translate(locale, key, values);

  const [rows, firstSession, profileRows] = await Promise.all([
    // ownSessionCondition is the "users read their own sessions" policy: their
    // own conversations, finished or abandoned long enough to be resumable.
    db
      .select({
        id: sessions.id,
        title: sessions.title,
        status: sessions.status,
        createdAt: sessions.createdAt,
        durationMs: sessions.durationMs,
        shareToken: sessions.shareToken,
        guestName: guests.name,
      })
      .from(sessions)
      .innerJoin(guests, eq(guests.id, sessions.guestId))
      .where(ownSessionCondition(user.id))
      .orderBy(desc(sessions.createdAt)),
    // Whether they have ever recorded at all, which is a wider question than
    // the list above: a pending conversation counts.
    db
      .select({ id: sessions.id })
      .from(sessions)
      .innerJoin(guests, eq(guests.id, sessions.guestId))
      .where(eq(guests.userId, user.id))
      .limit(1),
    db
      .select({ chosenAt: profiles.conversationLanguageChosenAt })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1),
  ]);
  const profile = profileRows[0];

  // Scoped to the caller's own switches; a friend's shares live in the feed.
  const shares = await db
    .select({ sessionId: circleShares.sessionId })
    .from(circleShares)
    .where(eq(circleShares.ownerId, user.id));
  const sharedWithCircle = new Set(shares.map((share) => share.sessionId));

  const names = conversationNames(rows, (number) =>
    t("familyConversationNumbered", { number }),
  );
  // Only ids the read above already authorised are handed to the helper that
  // reads private transcript cut timestamps.
  const cutsBySession = await getExcludedAudioCuts(rows.map((row) => row.id));
  const conversations: FamilyConversation[] = rows.map((row) => ({
    id: row.id,
    guestName: row.guestName,
    name: names.get(row.id) ?? t("familyConversationLabel"),
    title: row.title,
    createdAt: row.createdAt,
    durationMs: editedAudioDurationMs(
      row.durationMs,
      cutsBySession.get(row.id) ?? [],
    ),
    shareToken: row.shareToken,
    unfinished: row.status !== "ready",
    sharedWithCircle: sharedWithCircle.has(row.id),
  }));

  const headerStore = await headers();
  const host =
    headerStore.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    headerStore.get("host");
  const protocol =
    headerStore.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    (host?.startsWith("localhost") ? "http" : "https");

  return {
    conversations,
    hasStartedConversation:
      Boolean(profile?.chosenAt) || firstSession.length > 0,
    locale,
    origin: host ? `${protocol}://${host}` : "",
  };
});
