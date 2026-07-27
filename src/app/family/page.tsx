import Link from "next/link";
import { ArrowRight, Mic } from "lucide-react";
import { startMyConversation } from "./actions";
import { ConversationList } from "./conversation-list";
import { getFamilyConversations } from "./family-data";
import { getPreferredLocale } from "@/lib/preferred-locale";
import styles from "./senior-dashboard.module.css";

export const dynamic = "force-dynamic";

export default async function FamilyPage() {
  const [{ conversations, origin }, locale] = await Promise.all([
    getFamilyConversations(),
    getPreferredLocale(),
  ]);
  const chinese = locale !== "en";

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>{chinese ? "欢迎回来" : "Welcome home"}</p>
          <h1 className={styles.title}>{chinese ? "您的故事" : "Your stories"}</h1>
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
