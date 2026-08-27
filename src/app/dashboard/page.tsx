import Link from "next/link";
import { ArrowRight, Mic } from "lucide-react";
import { startMyConversation } from "./actions";
import { ConversationList } from "./conversation-list";
import { getFamilyConversations } from "./family-data";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { personName } from "@/lib/names";
import { getPreferredLocale } from "@/lib/preferred-locale";
import type { Locale } from "@/lib/i18n";
import styles from "./senior-dashboard.module.css";

export const dynamic = "force-dynamic";

const pageCopy: Record<Locale, {
  eyebrow: string;
  intro: string;
  ready: string;
  readyBody: string;
  start: string;
  past: string;
  viewAll: string;
}> = {
  en: {
    eyebrow: "Your Fireside space",
    intro: "Start a warm new conversation, or return to the memories you have already saved.",
    ready: "Ready for a conversation?",
    readyBody: "Rosie will gently guide the conversation. Just speak naturally—there is nothing to type.",
    start: "Start a new conversation",
    past: "Past conversations",
    viewAll: "View all",
  },
  "zh-Hans": {
    eyebrow: "您的炉边夜话空间",
    intro: "开始新的温暖对话，或再次聆听您已经保存的回忆。",
    ready: "准备好聊一聊了吗？",
    readyBody: "Rosie 会耐心地提问。您只需要自然地说话，不需要打字。",
    start: "开始新对话",
    past: "过去的对话",
    viewAll: "查看全部",
  },
  "zh-Hant": {
    eyebrow: "您的爐邊夜話空間",
    intro: "開始新的溫暖對話，或再次聆聽您已經儲存的回憶。",
    ready: "準備好聊一聊了嗎？",
    readyBody: "Rosie 會耐心地提問。您只需要自然地說話，不需要打字。",
    start: "開始新對話",
    past: "過去的對話",
    viewAll: "查看全部",
  },
};

function timeGreeting(name: string, locale: Locale) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "America/Toronto",
    }).format(new Date()),
  );

  if (hour < 5 || hour >= 23) {
    return locale === "en"
      ? `Still up, ${name}?`
      : locale === "zh-Hans"
        ? `还没休息吗，${name}？`
        : `還沒休息嗎，${name}？`;
  }
  if (hour < 12) {
    return locale === "en" ? `Good morning, ${name}.` : `早上好，${name}。`;
  }
  if (hour < 17) {
    return locale === "en" ? `Good afternoon, ${name}.` : `下午好，${name}。`;
  }
  return locale === "en" ? `Good evening, ${name}.` : `晚上好，${name}。`;
}

export default async function FamilyPage() {
  const [{ conversations, origin }, locale, { user }] = await Promise.all([
    getFamilyConversations(),
    getPreferredLocale(),
    requireUser(),
  ]);
  const [profile] = await db
    .select({ display_name: profiles.display_name, email: profiles.email })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  const name = personName(profile?.display_name, profile?.email ?? user.email);
  const copy = pageCopy[locale];
  const greeting = timeGreeting(name, locale);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>{copy.eyebrow}</p>
          <h1 className={styles.title}>
            {greeting}
          </h1>
          <p className={styles.intro}>
            {copy.intro}
          </p>
        </div>
      </header>

      <section className={styles.startCard} aria-labelledby="start-conversation-title">
        <div>
          <h2 id="start-conversation-title">
            {copy.ready}
          </h2>
          <p>
            {copy.readyBody}
          </p>
        </div>
        <form action={startMyConversation}>
          <button className={styles.startButton} type="submit">
            <Mic aria-hidden="true" /> {copy.start}
          </button>
        </form>
      </section>

      <section className={styles.section} aria-labelledby="past-conversations-title">
        <div className={styles.sectionHeader}>
          <h2 id="past-conversations-title">{copy.past}</h2>
          <Link className={styles.viewAll} href="/dashboard/conversations">
            {copy.viewAll} <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        <ConversationList conversations={conversations.slice(0, 5)} origin={origin} />
      </section>
    </div>
  );
}
