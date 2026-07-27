import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { localeCookieName, normalizeLocale } from "@/lib/i18n";
import { SettingsForm } from "./settings-form";
import styles from "../senior-dashboard.module.css";

export const dynamic = "force-dynamic";

export default async function FamilySettingsPage() {
  const [{ supabase, user }, cookieStore] = await Promise.all([
    requireUser(),
    cookies(),
  ]);
  const locale = normalizeLocale(cookieStore.get(localeCookieName)?.value);
  const chinese = locale !== "en";

  // Both reads go through the caller's RLS client: they may read their own
  // profile, and their self guest is visible through their family.
  const [{ data: profile }, { data: guest }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, email")
      .eq("id", user.id)
      .single(),
    supabase.from("guests").select("bio").eq("user_id", user.id).maybeSingle(),
  ]);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>{chinese ? "我的空间" : "My space"}</p>
          <h1 className={styles.title}>{chinese ? "设置" : "Settings"}</h1>
          <p className={styles.intro}>
            {chinese
              ? "告诉我们该怎么称呼您，以及一些关于您的事情。Rosie 会在对话开始前读到这些。"
              : "Tell us what to call you, and a little about yourself. Rosie reads this before each conversation begins."}
          </p>
        </div>
      </header>

      <SettingsForm
        name={profile?.display_name ?? ""}
        bio={guest?.bio ?? ""}
        email={profile?.email ?? user.email ?? ""}
      />
    </div>
  );
}
