import { cache } from "react";
import { headers } from "next/headers";
import { desc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { ownSessionsFilter } from "@/lib/authz";
import { db } from "@/lib/db";
import { circleShares, guests, sessions } from "@/lib/db/schema";
import { translate } from "@/lib/i18n";
import { getPreferredLocale } from "@/lib/preferred-locale";
import { conversationNames } from "@/lib/names";
import { editedAudioDurationMs } from "@/lib/audio/cuts";
import { getExcludedAudioCuts } from "@/lib/transcript/audio-cuts";
import type { InterviewSession } from "@/lib/types";

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

  type SessionRow = Pick<
    InterviewSession,
    "id" | "title" | "status" | "created_at" | "duration_ms" | "share_token"
  > & { guests: { name: string; user_id: string } };

  // `ownSessionsFilter` is the old "users read their own sessions" policy: the
  // caller's finished conversations, plus any that were abandoned mid-recording
  // long enough ago to be recoverable.
  const found = await db
    .select({
      id: sessions.id,
      title: sessions.title,
      status: sessions.status,
      created_at: sessions.created_at,
      duration_ms: sessions.duration_ms,
      share_token: sessions.share_token,
      guest_name: guests.name,
      guest_user_id: guests.user_id,
    })
    .from(sessions)
    .innerJoin(guests, eq(guests.id, sessions.guest_id))
    .where(ownSessionsFilter(user.id))
    .orderBy(desc(sessions.created_at));

  const rows = found.map(({ guest_name, guest_user_id, ...row }) => ({
    ...row,
    guests: { name: guest_name, user_id: guest_user_id ?? "" },
  })) as unknown as SessionRow[];

  // "owner reads own circle shares", stated explicitly.
  const shares = await db
    .select({ session_id: circleShares.session_id })
    .from(circleShares)
    .where(eq(circleShares.owner_id, user.id));
  const sharedWithCircle = new Set(shares.map((share) => share.session_id));

  const names = conversationNames(rows, (number) =>
    t("familyConversationNumbered", { number }),
  );
  // Only ids the ownership filter above already authorized are handed to the
  // helper that reads private transcript cut timestamps.
  const cutsBySession = await getExcludedAudioCuts(rows.map((row) => row.id));
  const conversations: FamilyConversation[] = rows.map((row) => ({
    id: row.id,
    guestName: row.guests.name,
    name: names.get(row.id) ?? t("familyConversationLabel"),
    title: row.title,
    createdAt: row.created_at,
    durationMs: editedAudioDurationMs(
      row.duration_ms,
      cutsBySession.get(row.id) ?? [],
    ),
    shareToken: row.share_token,
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
    locale,
    origin: host ? `${protocol}://${host}` : "",
  };
});
