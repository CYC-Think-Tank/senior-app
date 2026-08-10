import Link from "next/link";
import { Headphones, UserPlus, Users } from "lucide-react";
import { translate } from "@/lib/i18n";
import { getPreferredLocale } from "@/lib/preferred-locale";
import { formatDuration, Monogram } from "@/components/ui";
import { getMyCircle } from "../friends/friends-data";
import { getCircleFeed } from "./circle-data";
import styles from "../senior-dashboard.module.css";

export const dynamic = "force-dynamic";

export default async function CirclePage() {
  const [feed, circle, locale] = await Promise.all([
    getCircleFeed(),
    getMyCircle(),
    getPreferredLocale(),
  ]);
  const t = (key: Parameters<typeof translate>[1], values = {}) =>
    translate(locale, key, values);

  const hasFriends = circle.friends.length > 0;
  const pending = circle.incoming.length;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>{t("circleEyebrow")}</p>
          <h1 className={styles.title}>{t("circleTitle")}</h1>
          <p className={styles.intro}>{t("circleIntro")}</p>
        </div>
        <div className={styles.pageHeaderActions}>
          <Link className={styles.exportButton} href="/dashboard/friends">
            <Users aria-hidden="true" /> {t("circleManageFriends")}
          </Link>
        </div>
      </header>

      {/* The sidebar badge is too small to be an affordance on its own for
          this audience, so pending requests also get a full card here. */}
      {pending ? (
        <section className={styles.startCard} aria-labelledby="pending-title">
          <div>
            <h2 id="pending-title">
              {pending === 1
                ? t("circlePendingBannerOne")
                : t("circlePendingBanner", { count: String(pending) })}
            </h2>
          </div>
          <Link className={styles.startButton} href="/dashboard/friends">
            <UserPlus aria-hidden="true" /> {t("circlePendingAction")}
          </Link>
        </section>
      ) : null}

      {feed.length ? (
        <div className={styles.conversationTable}>
          {feed.map((conversation) => (
            <div
              className={`${styles.conversationRow} ${styles.friendRow}`}
              key={conversation.sessionId}
            >
              <Link
                className={styles.friendMain}
                href={`/dashboard/circle/${conversation.sessionId}`}
              >
                <Monogram name={conversation.ownerName} />
                <span className={styles.conversationDetails}>
                  <span className={styles.conversationName}>
                    {conversation.name ||
                      t("circleSharedBy", { name: conversation.ownerName })}
                  </span>
                  <span className={styles.conversationMeta}>
                    {t("circleSharedBy", { name: conversation.ownerName })} ·{" "}
                    {formatDuration(conversation.durationMs)} ·{" "}
                    {t("circleListen")}
                  </span>
                </span>
              </Link>
              <span className={styles.conversationDate}>
                {new Intl.DateTimeFormat(locale, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                }).format(new Date(conversation.createdAt))}
              </span>
            </div>
          ))}
        </div>
      ) : (
        // Someone with no friends yet needs a way in, not an explanation of
        // why the list is empty.
        <div className={`${styles.conversationTable} ${styles.emptyState}`}>
          {hasFriends ? (
            <>
              <Headphones aria-hidden="true" />
              <h2>{t("circleEmptyTitle")}</h2>
              <p>{t("circleEmptyBody")}</p>
            </>
          ) : (
            <>
              <UserPlus aria-hidden="true" />
              <h2>{t("circleNoFriendsTitle")}</h2>
              <p>{t("circleNoFriendsBody")}</p>
              <Link className={styles.exportButton} href="/dashboard/friends">
                <UserPlus aria-hidden="true" /> {t("circleAddFriend")}
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
