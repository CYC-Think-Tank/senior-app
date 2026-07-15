"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Play, RotateCcw, Scissors, Wand2 } from "lucide-react";
import { setTurnExcluded } from "@/app/admin/actions";
import { HOST_NAME } from "@/lib/realtime/interviewer-prompt";
import {
  Badge,
  Card,
  buttonStyles,
  formatDuration,
  formatTimestamp,
} from "@/components/ui";
import type {
  Episode,
  Guest,
  InterviewSession,
  TranscriptTurn,
} from "@/lib/types";

type Props = {
  session: InterviewSession;
  guest: Guest;
  initialTurns: TranscriptTurn[];
  episode: Episode | null;
  audioUrl: string | null;
};

export default function TranscriptEditor({
  session,
  guest,
  initialTurns,
  episode,
  audioUrl,
}: Props) {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [turns, setTurns] = useState(initialTurns);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const keptMs = useMemo(
    () =>
      turns
        .filter((t) => !t.excluded)
        .reduce((sum, t) => sum + (t.end_ms - t.start_ms), 0),
    [turns]
  );

  function toggle(turn: TranscriptTurn) {
    const excluded = !turn.excluded;
    setTurns((prev) =>
      prev.map((t) => (t.id === turn.id ? { ...t, excluded } : t))
    );
    startTransition(async () => {
      try {
        await setTurnExcluded(turn.id, session.id, excluded);
      } catch {
        // Revert the optimistic update on failure.
        setTurns((prev) =>
          prev.map((t) =>
            t.id === turn.id ? { ...t, excluded: !excluded } : t
          )
        );
      }
    });
  }

  function seekTo(ms: number) {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = ms / 1000;
    void el.play();
  }

  async function renderEpisode(regenerateMetadata: boolean) {
    setRendering(true);
    setRenderError(null);
    try {
      const res = await fetch("/api/episodes/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, regenerateMetadata }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? "Rendering failed.");
      }
      router.push(`/admin/episodes/${body.episodeId}`);
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : "Rendering failed.");
      setRendering(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold">
            {guest.name}
            {session.topic ? ` — ${session.topic}` : ""}
          </h1>
          <p className="mt-1 text-ink-soft">
            Recorded{" "}
            {session.started_at
              ? new Date(session.started_at).toLocaleString()
              : "—"}{" "}
            · raw {formatDuration(session.duration_ms)} · edited cut ≈{" "}
            {formatDuration(keptMs)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {episode ? (
            <div className="flex items-center gap-2">
              <Link
                href={`/admin/episodes/${episode.id}`}
                className="text-sm font-medium text-ember hover:text-ember-deep"
              >
                Open episode →
              </Link>
              <button
                onClick={() => renderEpisode(false)}
                disabled={rendering}
                className={buttonStyles.secondary}
              >
                <RotateCcw className="h-4 w-4" />
                {rendering ? "Rendering…" : "Re-render audio"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => renderEpisode(true)}
              disabled={rendering || keptMs === 0}
              className={buttonStyles.primary}
            >
              <Wand2 className="h-4 w-4" />
              {rendering ? "Rendering episode…" : "Generate episode"}
            </button>
          )}
          {rendering && (
            <p className="text-xs text-ink-faint">
              Cutting audio and writing show notes — this can take a minute.
            </p>
          )}
          {renderError && (
            <p className="text-sm text-ember-deep">{renderError}</p>
          )}
        </div>
      </div>

      {audioUrl ? (
        <Card className="sticky top-4 z-10 p-4">
          <audio ref={audioRef} controls src={audioUrl} className="w-full" />
        </Card>
      ) : (
        <Card className="p-4 text-sm text-ink-soft">
          Raw audio not available for this session.
        </Card>
      )}

      <Card className="divide-y divide-line">
        <div className="flex items-center justify-between px-5 py-3 text-sm text-ink-soft">
          <span>
            <Scissors className="mr-1.5 inline h-4 w-4" />
            Click a line to strike it from the episode. Click a timestamp to
            listen from there.
          </span>
          <Badge>{turns.filter((t) => t.excluded).length} cut</Badge>
        </div>
        {turns.length === 0 && (
          <p className="px-5 py-8 text-center text-ink-soft">
            No transcript was captured for this session.
          </p>
        )}
        {turns.map((turn) => (
          <div
            key={turn.id}
            className={`group flex gap-4 px-5 py-4 transition-colors ${
              turn.excluded ? "bg-paper-deep/60" : "hover:bg-paper-deep/30"
            }`}
          >
            <button
              onClick={() => seekTo(turn.start_ms)}
              className="mt-0.5 h-fit shrink-0 rounded-md px-1.5 py-0.5 font-mono text-xs text-ink-faint hover:bg-ember-soft hover:text-ember-deep"
              title="Play from here"
            >
              <Play className="mr-1 inline h-3 w-3" />
              {formatTimestamp(turn.start_ms)}
            </button>
            <button
              onClick={() => toggle(turn)}
              className="flex-1 text-left"
              title={turn.excluded ? "Restore this line" : "Cut this line"}
            >
              <span
                className={`mb-0.5 block text-xs font-semibold uppercase tracking-wide ${
                  turn.speaker === "ai" ? "text-ember" : "text-sage"
                }`}
              >
                {turn.speaker === "ai" ? HOST_NAME : guest.name}
              </span>
              <span
                className={
                  turn.excluded
                    ? "text-ink-faint line-through"
                    : "text-ink"
                }
              >
                {turn.text}
              </span>
            </button>
          </div>
        ))}
      </Card>
    </div>
  );
}
