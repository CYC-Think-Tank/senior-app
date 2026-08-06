"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Play, Scissors } from "lucide-react";
import { setTurnExcluded } from "@/app/admin/actions";
import { HOST_NAME } from "@/lib/realtime/interviewer-prompt";
import {
  Badge,
  Card,
  formatDuration,
  formatTimestamp,
} from "@/components/ui";
import type { Guest, InterviewSession, TranscriptTurn } from "@/lib/types";

type Props = {
  session: InterviewSession;
  guest: Guest;
  initialTurns: TranscriptTurn[];
  audioUrl: string | null;
};

export default function TranscriptEditor({
  session,
  guest,
  initialTurns,
  audioUrl,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const durationPrimedRef = useRef(false);
  const [turns, setTurns] = useState(initialTurns);
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

  // Streamed WebM from MediaRecorder has no Duration element in its header, so
  // the native <audio> reports duration=Infinity until the whole file buffers
  // and renders a broken, non-linear scrubber. Seeking to the end forces the
  // browser to buffer through and discover the real duration; we then snap back
  // to the start. (Safari's .m4a already carries a duration, so this no-ops.)
  function primeDuration(el: HTMLAudioElement) {
    if (el.duration !== Infinity && !Number.isNaN(el.duration)) return;
    const onTimeUpdate = () => {
      el.removeEventListener("timeupdate", onTimeUpdate);
      if (durationPrimedRef.current) return; // user already seeked — leave them there
      durationPrimedRef.current = true;
      el.currentTime = 0;
    };
    el.addEventListener("timeupdate", onTimeUpdate);
    el.currentTime = 1e101;
  }

  function seekTo(ms: number) {
    const el = audioRef.current;
    if (!el) return;
    durationPrimedRef.current = true; // cancel any pending priming reset
    el.currentTime = ms / 1000;
    void el.play();
  }

  return (
    <div className="space-y-6">
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
          · raw {formatDuration(session.duration_ms)} · kept ≈{" "}
          {formatDuration(keptMs)}
        </p>
      </div>

      {audioUrl ? (
        <Card className="sticky top-4 z-10 p-4">
          <audio
            ref={audioRef}
            controls
            preload="auto"
            src={audioUrl}
            onLoadedMetadata={(e) => primeDuration(e.currentTarget)}
            className="w-full"
          />
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
            Click a line to mark it as cut. Click a timestamp to listen from
            there.
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
