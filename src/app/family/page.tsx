import Link from "next/link";
import { ArrowRight, Mic } from "lucide-react";
import { startMyConversation } from "./actions";
import { ConversationList } from "./conversation-list";
import { getFamilyConversations } from "./family-data";
import { requireUser } from "@/lib/auth";
import { personName } from "@/lib/names";
import { getPreferredLocale } from "@/lib/preferred-locale";
import styles from "./senior-dashboard.module.css";

export const dynamic = "force-dynamic";

function timeGreeting(name: string, chinese: boolean) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "America/Toronto",
    }).format(new Date()),
  );

  if (hour < 5 || hour >= 23) {
    return chinese ? `还没休息吗，${name}？` : `Still up, ${name}?`;
  }
  if (hour < 12) {
    return chinese ? `早上好，${name}。` : `Good morning, ${name}.`;
  }
  if (hour < 17) {
    return chinese ? `下午好，${name}。` : `Good afternoon, ${name}.`;
  }
  return chinese ? `晚上好，${name}。` : `Good evening, ${name}.`;
}

export default async function FamilyPage() {
  const [{ conversations, origin }, locale, { supabase, user }] = await Promise.all([
    getFamilyConversations(),
    getPreferredLocale(),
    requireUser(),
  ]);
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, email")
    .eq("id", user.id)
    .maybeSingle();
  const name = personName(profile?.display_name, profile?.email ?? user.email);
  const chinese = locale !== "en";
  const greeting = timeGreeting(name, chinese);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>{chinese ? "您的炉边夜话空间" : "Your Fireside space"}</p>
          <h1 className={styles.title}>
            {greeting}
          </h1>
          <p className={styles.intro}>
            {chinese
              ? "开始新的温暖对话，或再次聆听您已经保存的回忆。"
              : "Start a warm new conversation, or return to the memories you have already saved."}
          </p>
        </div>
      </header>

      <section className={styles.startCard} aria-labelledby="start-conversation-title">
        <div>
          <h2 id="start-conversation-title">
            {chinese ? "准备好聊一聊了吗？" : "Ready for a conversation?"}
          </h2>
          <p>
            {chinese
              ? "Rosie 会耐心地提问。您只需要自然地说话，不需要打字。"
              : "Rosie will gently guide the conversation. Just speak naturally—there is nothing to type."}
          </p>
        </div>
        <form action={startMyConversation}>
          <button className={styles.startButton} type="submit">
            <Mic aria-hidden="true" /> {chinese ? "开始新对话" : "Start a new conversation"}
          </button>
        </form>
      </section>

      <section className={styles.section} aria-labelledby="past-conversations-title">
        <div className={styles.sectionHeader}>
          <h2 id="past-conversations-title">{chinese ? "过去的对话" : "Past conversations"}</h2>
          <Link className={styles.viewAll} href="/family/conversations">
            {chinese ? "查看全部" : "View all"} <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        <ConversationList conversations={conversations.slice(0, 5)} origin={origin} />
      </section>
    </div>
  );
}
