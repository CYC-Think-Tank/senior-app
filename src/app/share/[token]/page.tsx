import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarDays,
  Clock3,
  Headphones,
  LockKeyhole,
  Sprout,
} from "lucide-react";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { guests, sessions } from "@/lib/db/schema";
import { createAudioUrl } from "@/lib/audio/encryption";
import { editedAudioDurationMs } from "@/lib/audio/cuts";
import { ensureMoral } from "@/lib/moral/generate";
import { AudioPlayer } from "@/components/audio-player";
import { Card, Wordmark, formatDuration } from "@/components/ui";
import { LanguageSwitcher } from "@/components/language-switcher";
import {
  PortalShell,
  portalStyles,
} from "@/components/portal-shell";
import { RAW_BUCKET } from "@/lib/constants";
import { translate } from "@/lib/i18n";
import { getPreferredLocale } from "@/lib/preferred-locale";
import { getExcludedAudioCuts } from "@/lib/transcript/audio-cuts";
import type { InterviewSession } from "@/lib/types";
import styles from "./share-page.module.css";

export const dynamic = "force-dynamic";

const copy = {
  en: {
    home: "Home",
    eyebrow: "Shared from WiseShare",
    defaultTitle: (name: string) => `A conversation with ${name}`,
    intro: (name: string) =>
      `A personal recording shared by ${name}. Settle in and listen at your own pace.`,
    storyteller: "Storyteller",
    recorded: "Recorded",
    duration: "Duration",
    moral: "Moral of the story",
    moralNote: "Drawn from this conversation by AI.",
    listen: "Listen to the conversation",
    ready: "Ready when you are",
    privateLink: "Private link",
    privacy:
      "Anyone with this private link can listen. Please share it thoughtfully.",
  },
  "zh-Hans": {
    home: "首页",
    eyebrow: "来自慧享的分享",
    defaultTitle: (name: string) => `与${name}的对话`,
    intro: (name: string) =>
      `${name}与你分享了一段珍贵的录音。慢慢听，在故事里坐一会儿。`,
    storyteller: "讲述者",
    recorded: "录制日期",
    duration: "时长",
    moral: "故事的启示",
    moralNote: "由 AI 从这段对话中提炼。",
    listen: "收听这段对话",
    ready: "准备好时即可开始",
    privateLink: "私密链接",
    privacy: "任何拥有此私密链接的人都可以收听，请谨慎分享。",
  },
  "zh-Hant": {
    home: "首頁",
    eyebrow: "來自慧享的分享",
    defaultTitle: (name: string) => `與${name}的對話`,
    intro: (name: string) =>
      `${name}與你分享了一段珍貴的錄音。慢慢聽，在故事裡坐一會兒。`,
    storyteller: "講述者",
    recorded: "錄製日期",
    duration: "時長",
    moral: "故事的啟示",
    moralNote: "由 AI 從這段對話中提煉。",
    listen: "收聽這段對話",
    ready: "準備好時即可開始",
    privateLink: "私密連結",
    privacy: "任何擁有此私密連結的人都可以收聽，請謹慎分享。",
  },
} as const;

// Token-gated public share page — no login required. The unguessable
// share_token is the credential; only "ready" conversations are shareable.
export default async function SharedConversationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const locale = await getPreferredLocale();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const pageCopy = copy[locale];

  // The share token in the URL is the credential, and only a finished
  // conversation has one — an unfinished recording is not shareable at all.
  const [row] = await db
    .select({ session: sessions, guestName: guests.name })
    .from(sessions)
    .innerJoin(guests, eq(guests.id, sessions.guestId))
    .where(and(eq(sessions.shareToken, token), eq(sessions.status, "ready")))
    .limit(1);
  if (!row) notFound();

  const s = row.session as InterviewSession;
  const guestName = row.guestName;

  const audioUrl = s.rawAudioPath
    ? createAudioUrl(RAW_BUCKET, s.rawAudioPath, 60 * 60 * 6)
    : null;
  const audioCuts = (await getExcludedAudioCuts([s.id])).get(s.id) ?? [];
  const editedDuration = editedAudioDurationMs(s.durationMs, audioCuts);

  // Written on the first view that needs it, then read from the row forever
  // after. Null for a conversation too short — or too unreadable — to have a
  // point, and the section simply does not appear.
  const moral = await ensureMoral(s, guestName);

  const title = s.topic?.trim() || pageCopy.defaultTitle(guestName);
  const recordedDate = new Date(s.createdAt).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <PortalShell>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Wordmark tone="light" locale={locale} />
          <nav
            className={styles.nav}
            aria-label={locale === "en" ? "Public navigation" : locale === "zh-Hans" ? "公开导航" : "公開導覽"}
          >
            <Link href="/dashboard">{pageCopy.home}</Link>
          </nav>
          <div className={styles.headerTools}>
            <LanguageSwitcher tone="bare" />
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <div className={`${portalStyles.surface} ${styles.content}`}>
          <section className={styles.hero} aria-labelledby="conversation-title">
            <p className={styles.eyebrow}>{pageCopy.eyebrow}</p>
            <h1 className={styles.title} id="conversation-title">
              {title}
            </h1>
            <p className={styles.intro}>{pageCopy.intro(guestName)}</p>

            <div className={styles.details}>
              <div className={styles.storyteller}>
                <span className={styles.avatar} aria-hidden="true">
                  {guestName.trim().charAt(0).toUpperCase()}
                </span>
                <span>
                  <small>{pageCopy.storyteller}</small>
                  <strong>{guestName}</strong>
                </span>
              </div>
              <div className={styles.detail}>
                <CalendarDays aria-hidden="true" />
                <span>
                  <small>{pageCopy.recorded}</small>
                  <strong>{recordedDate}</strong>
                </span>
              </div>
              <div className={styles.detail}>
                <Clock3 aria-hidden="true" />
                <span>
                  <small>{pageCopy.duration}</small>
                  <strong>{formatDuration(editedDuration)}</strong>
                </span>
              </div>
            </div>
          </section>

          {moral ? (
            <section className={styles.moralPanel} aria-labelledby="moral-title">
              <span className={styles.moralIcon} aria-hidden="true">
                <Sprout />
              </span>
              <div>
                <h2 className={styles.moralLabel} id="moral-title">
                  {pageCopy.moral}
                </h2>
                <p className={styles.moralText}>{moral[locale]}</p>
                <p className={styles.moralNote}>{pageCopy.moralNote}</p>
              </div>
            </section>
          ) : null}

          <section className={styles.playerPanel} aria-labelledby="listen-title">
            <div className={styles.playerHeader}>
              <div>
                <span className={styles.playerIcon} aria-hidden="true">
                  <Headphones />
                </span>
                <span>
                  <small>{pageCopy.ready}</small>
                  <h2 id="listen-title">{pageCopy.listen}</h2>
                </span>
              </div>
              <span className={styles.privateBadge}>
                <LockKeyhole aria-hidden="true" />
                {pageCopy.privateLink}
              </span>
            </div>

            {audioUrl ? (
              <AudioPlayer
                src={audioUrl}
                durationMs={s.durationMs}
                cuts={audioCuts}
              />
            ) : (
              <Card className={styles.missingAudio}>
                {t("audioMissing")}
              </Card>
            )}

            <p className={styles.privacyNote}>
              <LockKeyhole aria-hidden="true" />
              {pageCopy.privacy}
            </p>
          </section>
        </div>
      </main>
    </PortalShell>
  );
}
