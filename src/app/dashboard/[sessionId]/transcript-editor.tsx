"use client";

import { useMemo, useState, useTransition } from "react";
import { RotateCcw, Scissors, Trash2 } from "lucide-react";
import { setConversationTurnExcluded } from "@/app/dashboard/actions";
import { AudioPlayer } from "@/components/audio-player";
import { useI18n } from "@/components/i18n-provider";
import { Badge, Card, formatTimestamp } from "@/components/ui";
import { HOST_NAME } from "@/lib/realtime/interviewer-prompt";
import type { TranscriptTurn } from "@/lib/types";

type Props = {
  sessionId: string;
  guestName: string;
  initialTurns: TranscriptTurn[];
  audioUrl: string | null;
  durationMs: number | null;
};

export function ConversationTranscriptEditor({
  sessionId,
  guestName,
  initialTurns,
  audioUrl,
  durationMs,
}: Props) {
  const { t } = useI18n();
  const [turns, setTurns] = useState(initialTurns);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const cuts = useMemo(
    () =>
      turns
        .filter((turn) => turn.excluded)
        .map((turn) => ({ startMs: turn.startMs, endMs: turn.endMs })),
    [turns],
  );

  function toggleTurn(turn: TranscriptTurn) {
    const excluded = !turn.excluded;
    setError(false);
    setTurns((current) =>
      current.map((item) =>
        item.id === turn.id ? { ...item, excluded } : item,
      ),
    );

    startTransition(async () => {
      try {
        const result = await setConversationTurnExcluded(
          sessionId,
          turn.id,
          excluded,
        );
        if (result.ok) return;
      } catch (cause) {
        console.error("Could not edit the transcript line:", cause);
      }

      setTurns((current) =>
        current.map((item) =>
          item.id === turn.id ? { ...item, excluded: !excluded } : item,
        ),
      );
      setError(true);
    });
  }

  return (
    <section className="space-y-5" aria-labelledby="transcript-editor-title">
      {audioUrl ? (
        <AudioPlayer src={audioUrl} durationMs={durationMs} cuts={cuts} />
      ) : (
        <Card className="p-6 text-ink-soft">{t("audioMissing")}</Card>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="max-w-2xl">
            <h2
              id="transcript-editor-title"
              className="flex items-center gap-2 font-serif text-2xl font-semibold"
            >
              <Scissors className="h-5 w-5 text-ember" aria-hidden="true" />
              {t("transcriptEditTitle")}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              {t("transcriptEditIntro")}
            </p>
          </div>
          <Badge tone={cuts.length ? "ember" : "neutral"}>
            {t("transcriptDeletedCount", { count: cuts.length })}
          </Badge>
        </div>

        {error ? (
          <p
            className="border-b border-line bg-ember-soft px-5 py-3 text-sm text-ember-deep"
            role="alert"
          >
            {t("transcriptEditError")}
          </p>
        ) : null}

        {turns.length === 0 ? (
          <p className="px-5 py-8 text-center text-ink-soft">
            {t("transcriptEmpty")}
          </p>
        ) : (
          <div className="divide-y divide-line">
            {turns.map((turn) => (
              <div
                key={turn.id}
                className={`flex items-start gap-3 px-5 py-4 transition-colors sm:gap-4 ${
                  turn.excluded ? "bg-paper-deep/70" : "hover:bg-paper-deep/30"
                }`}
              >
                <span className="mt-0.5 shrink-0 font-mono text-xs text-ink-faint">
                  {formatTimestamp(turn.startMs)}
                </span>
                <div className="min-w-0 flex-1">
                  <span
                    className={`mb-0.5 block text-xs font-semibold uppercase tracking-wide ${
                      turn.speaker === "ai" ? "text-ember" : "text-sage"
                    }`}
                  >
                    {turn.speaker === "ai" ? HOST_NAME : guestName}
                  </span>
                  <p
                    className={
                      turn.excluded
                        ? "text-ink-faint line-through"
                        : "text-ink"
                    }
                  >
                    {turn.text}
                  </p>
                  {turn.excluded ? (
                    <span className="mt-1 inline-block text-xs font-medium text-ember-deep">
                      {t("transcriptDeletedLine")}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => toggleTurn(turn)}
                  disabled={pending}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors disabled:cursor-wait disabled:opacity-50 ${
                    turn.excluded
                      ? "text-ink-soft hover:bg-cream hover:text-ink"
                      : "text-ember-deep hover:bg-ember-soft"
                  }`}
                  aria-label={
                    turn.excluded
                      ? t("transcriptRestoreLine")
                      : t("transcriptDeleteLine")
                  }
                  title={
                    turn.excluded
                      ? t("transcriptRestoreLine")
                      : t("transcriptDeleteLine")
                  }
                >
                  {turn.excluded ? (
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span className="hidden sm:inline">
                    {turn.excluded
                      ? t("transcriptRestoreLine")
                      : t("transcriptDeleteLine")}
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}
