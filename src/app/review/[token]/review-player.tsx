"use client";

import { useRef, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { Heart, MessageCircleMore, Pause, Play } from "lucide-react";
import { approveEpisode, requestChanges } from "@/app/review/actions";
import type { EpisodeStatus } from "@/lib/types";
import { useI18n } from "@/components/i18n-provider";

type Props = {
  token: string;
  guestName: string;
  title: string;
  episodeNumber: number;
  status: EpisodeStatus;
  audioUrl: string | null;
};

export default function ReviewPlayer({
  token,
  guestName,
  title,
  episodeNumber,
  status,
  audioUrl,
}: Props) {
  const { t } = useI18n();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [outcome, setOutcome] = useState<"approved" | "changes" | null>(
    status === "approved" || status === "published" ? "approved" : null
  );
  const [askingChanges, setAskingChanges] = useState(false);
  const [note, setNote] = useState("");
  const [busy, startTransition] = useTransition();

  function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
    } else {
      el.pause();
    }
  }

  if (outcome === "approved") {
    return (
      <Shell>
        <Heart className="mx-auto mb-6 h-14 w-14 fill-ember text-ember" />
        <h1 className="font-serif text-4xl font-semibold sm:text-5xl">
          {t("reviewApprovedTitle", { guestName })}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-2xl leading-relaxed text-ink-soft">
          {t("reviewApprovedBody")}
        </p>
      </Shell>
    );
  }

  if (outcome === "changes") {
    return (
      <Shell>
        <MessageCircleMore className="mx-auto mb-6 h-14 w-14 text-ember" />
        <h1 className="font-serif text-4xl font-semibold sm:text-5xl">
          {t("reviewChangesTitle", { guestName })}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-2xl leading-relaxed text-ink-soft">
          {t("reviewChangesBody")}
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-2xl text-ink-soft">
        {t("interviewHello", { guestName })}
      </p>
      <h1 className="mt-3 font-serif text-4xl font-semibold leading-tight sm:text-5xl">
        {t("reviewReadyTitle")}
      </h1>
      <p className="mt-4 text-xl text-ink-soft">
        {t("reviewEpisodeTitle", { episodeNumber, title })}
      </p>

      {audioUrl ? (
        <>
          <audio
            ref={audioRef}
            src={audioUrl}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(e) => {
              const el = e.currentTarget;
              if (el.duration > 0) setProgress(el.currentTime / el.duration);
            }}
            onEnded={() => setPlaying(false)}
          />
          <motion.button
            onClick={togglePlay}
            whileTap={{ scale: 0.96 }}
            className="mx-auto mt-10 flex h-40 w-40 flex-col items-center justify-center gap-2 rounded-full bg-ember text-cream shadow-lg shadow-ember/30 transition-colors hover:bg-ember-deep sm:h-44 sm:w-44"
          >
            {playing ? (
              <Pause className="h-14 w-14" />
            ) : (
              <Play className="ml-2 h-14 w-14" />
            )}
            <span className="text-xl font-semibold">
              {playing ? t("commonPause") : t("commonListen")}
            </span>
          </motion.button>
          <div className="mx-auto mt-6 h-3 w-full max-w-md overflow-hidden rounded-full bg-paper-deep">
            <div
              className="h-full rounded-full bg-ember transition-[width]"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </>
      ) : (
        <p className="mt-8 text-xl text-ink-soft">
          {t("reviewAudioMissing")}
        </p>
      )}

      <div className="mx-auto mt-12 flex max-w-xl flex-col gap-4">
        <button
          disabled={busy}
          onClick={() =>
            startTransition(async () => {
              await approveEpisode(token);
              setOutcome("approved");
            })
          }
          className="inline-flex items-center justify-center gap-3 rounded-2xl bg-sage px-8 py-5 text-2xl font-semibold text-cream transition-colors hover:brightness-110 disabled:opacity-50"
        >
          <Heart className="h-7 w-7" />
          {t("reviewApprove")}
        </button>

        {askingChanges ? (
          <div className="rounded-2xl border-2 border-line bg-cream p-5 text-left">
            <label className="mb-2 block text-lg font-medium text-ink">
              {t("reviewChangeLabel")}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-line bg-paper px-4 py-3 text-lg focus:border-ember focus:outline-none"
              placeholder={t("reviewChangePlaceholder")}
            />
            <button
              disabled={busy}
              onClick={() =>
                startTransition(async () => {
                  await requestChanges(token, note);
                  setOutcome("changes");
                })
              }
              className="mt-3 w-full rounded-xl bg-ink px-6 py-3 text-lg font-semibold text-cream hover:bg-ink/80 disabled:opacity-50"
            >
              {t("reviewSendRequest")}
            </button>
          </div>
        ) : (
          <button
            disabled={busy}
            onClick={() => setAskingChanges(true)}
            className="inline-flex items-center justify-center gap-3 rounded-2xl border-2 border-line bg-cream px-8 py-5 text-2xl font-semibold text-ink transition-colors hover:bg-paper-deep disabled:opacity-50"
          >
            <MessageCircleMore className="h-7 w-7 text-ember" />
            {t("reviewAskChanges")}
          </button>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-3xl py-10 text-center">{children}</div>
    </main>
  );
}
