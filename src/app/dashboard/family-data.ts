import { cache } from "react";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { translate } from "@/lib/i18n";
import { getPreferredLocale } from "@/lib/preferred-locale";
import { conversationNames } from "@/lib/names";
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
  const { supabase, user } = await requireUser();
  const locale = await getPreferredLocale();
  const t = (key: Parameters<typeof translate>[1], values = {}) =>
    translate(locale, key, values);
  const { data } = await supabase
    .from("sessions")
    .select("id, title, status, created_at, duration_ms, share_token, guests!inner(name, user_id)")
    .in("status", ["ready", "recording"])
    .eq("guests.user_id", user.id)
    .order("created_at", { ascending: false });

  type SessionRow = Pick<
    InterviewSession,
    "id" | "title" | "status" | "created_at" | "duration_ms" | "share_token"
  > & { guests: { name: string; user_id: string } };
  const rows = (data ?? []) as unknown as SessionRow[];

  // "owner reads own circle shares" scopes this to the caller's own switches.
  const { data: shares } = await supabase
    .from("circle_shares")
    .select("session_id")
    .eq("owner_id", user.id);
  const sharedWithCircle = new Set(
    (shares ?? []).map((share) => share.session_id),
  );

  const names = conversationNames(rows, (number) =>
    t("familyConversationNumbered", { number }),
  );
  const conversations: FamilyConversation[] = rows.map((row) => ({
    id: row.id,
    guestName: row.guests.name,
    name: names.get(row.id) ?? t("familyConversationLabel"),
    title: row.title,
    createdAt: row.created_at,
    durationMs: row.duration_ms,
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
