import { Mic } from "lucide-react";
import { cookies } from "next/headers";
import { startMyConversation } from "../actions";
import { ConversationList } from "../conversation-list";
import { getFamilyConversations } from "../family-data";
import { localeCookieName, normalizeLocale } from "@/lib/i18n";
import styles from "../senior-dashboard.module.css";

export const dynamic = "force-dynamic";

export default async function ConversationsPage() {
  const [{ conversations, origin }, cookieStore] = await Promise.all([
    getFamilyConversations(),
    cookies(),
  ]);
  const locale = normalizeLocale(cookieStore.get(localeCookieName)?.value);
  const chinese = locale !== "en";

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>{chinese ? "您的录音" : "Your recordings"}</p>
          <h1 className={styles.title}>{chinese ? "对话" : "Conversations"}</h1>
          <p className={styles.intro}>
            {chinese
              ? "在这里收听、重命名、分享或删除您的对话。"
              : "Listen to, rename, share, or delete any of your saved conversations."}
          </p>
        </div>
        <form action={startMyConversation}>
          <button className={styles.smallStartButton} type="submit">
            <Mic aria-hidden="true" /> {chinese ? "新对话" : "New conversation"}
          </button>
        </form>
      </header>

      <ConversationList conversations={conversations} origin={origin} />
    </div>
  );
}
