import { Download, Mic } from "lucide-react";
import { startMyConversation } from "../actions";
import { ConversationList } from "../conversation-list";
import { getFamilyConversations } from "../family-data";
import { getPreferredLocale } from "@/lib/preferred-locale";
import type { Locale } from "@/lib/i18n";
import styles from "../senior-dashboard.module.css";

export const dynamic = "force-dynamic";

const copyByLocale: Record<Locale, {
  eyebrow: string;
  title: string;
  intro: string;
  exportAll: string;
  newConversation: string;
}> = {
  en: {
    eyebrow: "Your recordings",
    title: "Conversations",
    intro: "Listen to, rename, share, export, or delete any of your saved conversations.",
    exportAll: "Export all",
    newConversation: "New conversation",
  },
  "zh-Hans": {
    eyebrow: "您的录音",
    title: "对话",
    intro: "在这里收听、重命名、分享、导出或删除您的对话。",
    exportAll: "导出所有对话",
    newConversation: "新对话",
  },
  "zh-Hant": {
    eyebrow: "您的錄音",
    title: "對話",
    intro: "在這裡收聽、重新命名、分享、匯出或刪除您的對話。",
    exportAll: "匯出所有對話",
    newConversation: "新對話",
  },
};

export default async function ConversationsPage() {
  const [{ conversations, origin }, locale] = await Promise.all([
    getFamilyConversations(),
    getPreferredLocale(),
  ]);
  const copy = copyByLocale[locale];

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>{copy.eyebrow}</p>
          <h1 className={styles.title}>{copy.title}</h1>
          <p className={styles.intro}>{copy.intro}</p>
        </div>
        <div className={styles.pageHeaderActions}>
          {conversations.length ? (
            <a
              className={styles.exportButton}
              href="/api/family/conversations/export"
              download
            >
              <Download aria-hidden="true" />{" "}
              {copy.exportAll}
            </a>
          ) : null}
          <form action={startMyConversation}>
            <button className={styles.smallStartButton} type="submit">
              <Mic aria-hidden="true" /> {copy.newConversation}
            </button>
          </form>
        </div>
      </header>

      <ConversationList conversations={conversations} origin={origin} />
    </div>
  );
}
