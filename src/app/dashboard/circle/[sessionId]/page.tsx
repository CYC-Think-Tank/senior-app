import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock3, Sprout, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { AudioPlayer } from "@/components/audio-player";
import { Card, Monogram, formatDuration } from "@/components/ui";
import { editedAudioDurationMs } from "@/lib/audio/cuts";
import { translate } from "@/lib/i18n";
import { getPreferredLocale } from "@/lib/preferred-locale";
import { getCircleConversation, getConversationComments } from "../circle-data";
import { CommentThread } from "../comment-thread";
import styles from "../../senior-dashboard.module.css";

export const dynamic = "force-dynamic";

/**
 * A conversation someone in the caller's circle shared. Audio and the AI
 * moral, as on the public share page — never the transcript.
 */
export default async function CircleConversationPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const { user } = await requireUser();
  const locale = await getPreferredLocale();
  const t = (key: Parameters<typeof translate>[1], values = {}) =>
    translate(locale, key, values);

  const detail = await getCircleConversation(sessionId);
  // "never shared with me", "just unshared", and "just unfriended" all land
  // here, and all look the same from outside — which is the point.
  if (!detail) notFound();

  const comments = await getConversationComments(sessionId);
  const { session, ownerName, audioUrl, audioCuts, moral, isOwner } = detail;
  const title =
    session.title?.trim() ||
    session.topic?.trim() ||
    t("circleSharedBy", { name: ownerName });

  return (
    <div className={styles.page}>
      <Link className={styles.viewAll} href="/dashboard/circle">
        <ArrowLeft aria-hidden="true" /> {t("circleBack")}
      </Link>

      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>
            {t("circleSharedWithCircle", { name: ownerName })}
          </p>
          <h1 className={styles.title}>{title}</h1>
        </div>
      </header>

      <div className={styles.circleDetails}>
        <span className={styles.circleDetail}>
          <Monogram name={ownerName} />
          <span>
            <small>{t("circleSharedBy", { name: ownerName })}</small>
            <strong>{ownerName}</strong>
          </span>
        </span>
        <span className={styles.circleDetail}>
          <CalendarDays aria-hidden="true" />
          <span>
            <strong>
              {new Date(session.created_at).toLocaleDateString(locale, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </strong>
          </span>
        </span>
        <span className={styles.circleDetail}>
          <Clock3 aria-hidden="true" />
          <span>
            <strong>
              {formatDuration(
                editedAudioDurationMs(session.duration_ms, audioCuts),
              )}
            </strong>
          </span>
        </span>
      </div>

      {moral ? (
        <section className={styles.moralPanel} aria-labelledby="moral-title">
          <span className={styles.moralIcon} aria-hidden="true">
            <Sprout />
          </span>
          <div>
            <h2 className={styles.moralLabel} id="moral-title">
              {t("circleMoral")}
            </h2>
            <p className={styles.moralText}>{moral}</p>
            <p className={styles.settingsHint}>{t("circleMoralNote")}</p>
          </div>
        </section>
      ) : null}

      {audioUrl ? (
        <AudioPlayer
          src={audioUrl}
          durationMs={session.duration_ms}
          cuts={audioCuts}
        />
      ) : (
        <Card className="p-6">{t("audioMissing")}</Card>
      )}

      <p className={styles.settingsHint}>
        <Users aria-hidden="true" />{" "}
        {t("circleSharedWithCircle", { name: ownerName })}
      </p>

      <CommentThread
        sessionId={sessionId}
        comments={comments}
        viewerId={user.id}
        isOwner={isOwner}
        canComment
      />
    </div>
  );
}
