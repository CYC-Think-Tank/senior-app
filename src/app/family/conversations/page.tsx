import { Download, Mic } from "lucide-react";
import { startMyConversation } from "../actions";
import { ConversationList } from "../conversation-list";
import { getFamilyConversations } from "../family-data";
import { getPreferredLocale } from "@/lib/preferred-locale";
import styles from "../senior-dashboard.module.css";

export const dynamic = "force-dynamic";

export default async function ConversationsPage() {
  const [{ conversations, origin }, locale] = await Promise.all([
    getFamilyConversations(),
    getPreferredLocale(),
  ]);
  const chinese = locale !== "en";

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>{chinese ? "您的录音" : "Your recordings"}</p>
          <h1 className={styles.title}>{chinese ? "对话" : "Conversations"}</h1>
          <p className={styles.intro}>
            {chinese
              ? "在这里收听、重命名、分享、导出或删除您的对话。"
              : "Listen to, rename, share, export, or delete any of your saved conversations."}
          </p>
        </div>
        <div className={styles.pageHeaderActions}>
          {conversations.length ? (
            <a
              className={styles.exportButton}
              href="/api/family/conversations/export"
              download
            >
              <Download aria-hidden="true" />{" "}
              {locale === "zh-Hant"
                ? "匯出所有對話"
                : locale === "zh-Hans"
                  ? "导出所有对话"
                  : "Export all"}
            </a>
          ) : null}
          <form action={startMyConversation}>
            <button className={styles.smallStartButton} type="submit">
              <Mic aria-hidden="true" /> {chinese ? "新对话" : "New conversation"}
            </button>
          </form>
        </div>
      </header>

      <ConversationList conversations={conversations} origin={origin} />
    </div>
  );
}
