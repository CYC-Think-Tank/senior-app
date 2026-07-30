import { requireUser } from "@/lib/auth";
import { getPreferredLocale } from "@/lib/preferred-locale";
import { getFamilyConversations } from "../family-data";
import { PodcastRequestPanel } from "./request-panel";
import styles from "../senior-dashboard.module.css";

export const dynamic = "force-dynamic";

export default async function PodcastRequestsPage() {
  const [{ supabase, user }, { conversations }, locale] = await Promise.all([
    requireUser(),
    getFamilyConversations(),
    getPreferredLocale(),
  ]);
  const chinese = locale !== "en";
  const { data } = await supabase
    .from("podcast_participation")
    .select("status, request_kind, session_id, sessions(token)")
    .eq("user_id", user.id)
    .maybeSingle();
  const joinedSession = data?.sessions as unknown as { token: string } | null;
  const participation = data
    ? {
        status: data.status as string,
        requestKind: (data.request_kind ?? "new_interview") as "existing_conversation" | "new_interview",
        sessionId: data.session_id as string | null,
        interviewToken: joinedSession?.token ?? null,
      }
    : null;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>{chinese ? "慧仁享公共播客" : "The public WiseShare podcast"}</p>
          <h1 className={styles.title}>{chinese ? "播客申请" : "Podcast requests"}</h1>
          <p className={styles.intro}>
            {chinese
              ? "如果您愿意，可以选择一个故事与更多慧仁享听众分享。"
              : "If you would like, choose a story to share with the wider WiseShare community."}
          </p>
        </div>
      </header>
      <PodcastRequestPanel conversations={conversations} participation={participation} />
    </div>
  );
}
