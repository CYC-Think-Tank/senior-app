import { requireUser } from "@/lib/auth";
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
  const [{ supabase, user }, locale] = await Promise.all([
    requireUser(),
    getPreferredLocale(),
  ]);
  const copy = copyByLocale[locale];

  // Both reads go through the caller's RLS client: they may read their own
  // profile, and their self guest is visible through their family.
  const [{ data: profile }, { data: guest }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, email")
      .eq("id", user.id)
      .single(),
    supabase
      .from("guests")
      .select("bio, voice")
      .eq("user_id", user.id)
      .maybeSingle(),
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
        name={profile?.display_name ?? ""}
        bio={guest?.bio ?? ""}
        voice={isRealtimeVoice(guest?.voice) ? guest.voice : REALTIME_VOICE}
        email={profile?.email ?? user.email ?? ""}
      />
    </div>
  );
}
