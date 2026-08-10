import { translate } from "@/lib/i18n";
import { getPreferredLocale } from "@/lib/preferred-locale";
import { getMyCircle } from "./friends-data";
import { FriendsManager } from "./friends-manager";
import styles from "../senior-dashboard.module.css";

export const dynamic = "force-dynamic";

export default async function FriendsPage() {
  const [circle, locale] = await Promise.all([
    getMyCircle(),
    getPreferredLocale(),
  ]);
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>{t("friendsEyebrow")}</p>
          <h1 className={styles.title}>{t("friendsTitle")}</h1>
          <p className={styles.intro}>{t("friendsIntro")}</p>
        </div>
      </header>

      <FriendsManager circle={circle} />
    </div>
  );
}
