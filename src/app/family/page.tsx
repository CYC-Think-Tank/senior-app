import { cookies, headers } from "next/headers";
import { Mic } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { startMyConversation } from "@/app/family/actions";
import { Card, formatDuration } from "@/components/ui";
import { ConversationRow } from "@/components/conversation-row";
import { portalStyles } from "@/components/portal-shell";
import { localeCookieName, normalizeLocale, translate } from "@/lib/i18n";
import { conversationNames } from "@/lib/names";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { InterviewSession } from "@/lib/types";
import { PodcastInvitation } from "./podcast-invitation";

export const dynamic = "force-dynamic";

export default async function FamilyPage() {
  const { supabase, user } = await requireUser();
  const admin = createSupabaseAdminClient();
  const locale = normalizeLocale((await cookies()).get(localeCookieName)?.value);
  const t = (key: Parameters<typeof translate>[1], values = {}) =>
    translate(locale, key, values);

  // Absolute origin for building shareable links, derived from the request.
  const h = await headers();
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host");
  const proto =
    h.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    (host?.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${proto}://${host}` : "";

  // RLS limits this to the family's storyteller(s). Conversations that ended
  // early come along too — their checkpoints saved most of what was said.
  const [{ data: sessions }, { data: participation }] = await Promise.all([
    supabase
      .from("sessions")
      .select("*, guests(name)")
      .in("status", ["ready", "recording"])
      .order("created_at", { ascending: false }),
    admin
      .from("podcast_participation")
      .select("status, sessions(token)")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  type SessionRow = InterviewSession & { guests: { name: string } };
  const rows = (sessions ?? []) as unknown as SessionRow[];
  const names = conversationNames(rows, (number) =>
    t("familyConversationNumbered", { number })
  );
  const participationSession = participation?.sessions as unknown as { token: string } | null;
  const podcastCopy = locale === "en" ? {
    title: "The public Fireside podcast",
    body: "Share your story with the wider Fireside community.",
    request: "Request to join",
    requested: "Request sent",
    invitedTitle: "You’ve been invited to the podcast.",
    invitedBody: "Your interview link is ready. Accept the invitation whenever you feel comfortable beginning.",
    start: "Accept and start",
    later: "Maybe later",
    continue: "Continue interview",
    complete: "Interview complete",
  } : {
    title: "Fireside 公开播客",
    body: "与更广泛的 Fireside 社区分享您的故事。",
    request: "申请参加",
    requested: "申请已发送",
    invitedTitle: "您已受邀参加播客。",
    invitedBody: "您的采访链接已准备好。您可以在准备好后接受邀请并开始。",
    start: "接受并开始",
    later: "稍后再说",
    continue: "继续采访",
    complete: "采访已完成",
  };

  return (
    <div>
      <header className={portalStyles.dashboardHeader}>
        <div>
          <p className={portalStyles.kicker}>{t("commonFamily")}</p>
          <h1 className={portalStyles.pageTitle}>
            {t("familyTitle")}
          </h1>
          <p className={portalStyles.pageIntro}>{t("familyIntro")}</p>
        </div>
        <form action={startMyConversation}>
          <button
            type="submit"
            className={portalStyles.primaryButton}
          >
            <Mic className="h-4 w-4" /> {t("familyStartConversation")}
          </button>
        </form>
      </header>

      <PodcastInvitation
        status={(participation?.status as string | undefined) ?? null}
        interviewToken={participationSession?.token ?? null}
        copy={podcastCopy}
      />

      <section className={portalStyles.section}>
        <div className={portalStyles.sectionHeader}>
          <h2 className={portalStyles.sectionTitle}>
            <span className={portalStyles.sectionNumber}>01</span>
            {t("familyTitle")}
          </h2>
        </div>
        {rows.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="font-serif text-2xl text-ink-soft">
              {t("familyNoConversations")}
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {rows.map((s) => (
              <ConversationRow
                key={s.id}
                sessionId={s.id}
                guestName={s.guests.name}
                name={names.get(s.id) ?? ""}
                title={s.title}
                meta={`${new Date(s.created_at).toLocaleDateString(locale, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })} · ${formatDuration(s.duration_ms)}`}
                shareToken={s.share_token}
                origin={origin}
                unfinished={s.status !== "ready"}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
