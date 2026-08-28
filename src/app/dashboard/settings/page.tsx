import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { guests, profiles } from "@/lib/db/schema";
import { getPreferredLocale } from "@/lib/preferred-locale";
import { isRealtimeVoice, REALTIME_VOICE } from "@/lib/constants";
import { SettingsForm } from "./settings-form";
import type { Locale } from "@/lib/i18n";
import styles from "../senior-dashboard.module.css";

export const dynamic = "force-dynamic";

const copyByLocale: Record<Locale, { eyebrow: string; title: string; intro: string }> = {
  en: {
    eyebrow: "My space",
    title: "Settings",
    intro: "Tell us what to call you, and a little about yourself. Rosie reads this before each conversation begins.",
  },
  "zh-Hans": {
    eyebrow: "我的空间",
    title: "设置",
    intro: "告诉我们该怎么称呼您，以及一些关于您的事情。Rosie 会在对话开始前读到这些。",
  },
  "zh-Hant": {
    eyebrow: "我的空間",
    title: "設定",
    intro: "告訴我們該怎麼稱呼您，以及一些關於您的事情。Rosie 會在對話開始前讀到這些。",
  },
};

export default async function FamilySettingsPage() {
  const [{ user }, locale] = await Promise.all([
    requireUser(),
    getPreferredLocale(),
  ]);
  const copy = copyByLocale[locale];

  // Both reads are pinned to the verified session id, so this page can only
  // ever show the caller their own profile and their own storyteller row.
  const [[profile], [guest]] = await Promise.all([
    db
      .select({ displayName: profiles.displayName, email: profiles.email })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1),
    db
      .select({ bio: guests.bio, voice: guests.voice })
      .from(guests)
      .where(eq(guests.userId, user.id))
      .limit(1),
  ]);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>{copy.eyebrow}</p>
          <h1 className={styles.title}>{copy.title}</h1>
          <p className={styles.intro}>{copy.intro}</p>
        </div>
      </header>

      <SettingsForm
        name={profile?.displayName ?? ""}
        bio={guest?.bio ?? ""}
        voice={isRealtimeVoice(guest?.voice) ? guest.voice : REALTIME_VOICE}
        email={profile?.email ?? user.email ?? ""}
      />
    </div>
  );
}
