"use client";

import { useRef, useState } from "react";
import { Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { formatTimestamp } from "@/components/ui";
import { useI18n } from "@/components/i18n-provider";

const SPEEDS = [1, 1.25, 1.5, 2];

export function AudioPlayer({
  src,
  durationMs,
}: {
  src: string;
  durationMs?: number | null;
}) {
  const { t } = useI18n();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);

  // MediaRecorder WebM reports duration as Infinity until it has been seeked
  // to the end, so fall back to the length recorded in the database.
  const fallback = durationMs && durationMs > 0 ? durationMs / 1000 : 0;
  const duration = mediaDuration || fallback;

  function readDuration(el: HTMLAudioElement) {
    setMediaDuration(Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0);
  }

  function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  }

  function skip(seconds: number) {
    const el = audioRef.current;
    if (!el) return;
    const limit = duration || Infinity;
    el.currentTime = Math.max(0, Math.min(limit, el.currentTime + seconds));
  }

  function cycleSpeed() {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next];
  }

  return (
    <div className="rounded-2xl border border-line bg-cream p-5">
      <audio
        ref={audioRef}
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          // The stored length rarely matches the media exactly; fill the bar.
          if (duration) setCurrent(duration);
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => readDuration(e.currentTarget)}
        onDurationChange={(e) => readDuration(e.currentTarget)}
      />
      <div className="flex items-center gap-4">
        <button
          onClick={() => skip(-15)}
          className="rounded-full p-2 text-ink-soft hover:bg-paper-deep"
          title={t("commonBack15")}
        >
          <RotateCcw className="h-5 w-5" />
        </button>
        <button
          onClick={toggle}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-ember text-cream transition-colors hover:bg-ember-deep"
        >
          {playing ? (
            <Pause className="h-6 w-6" />
          ) : (
            <Play className="ml-0.5 h-6 w-6" />
          )}
        </button>
        <button
          onClick={() => skip(15)}
          className="rounded-full p-2 text-ink-soft hover:bg-paper-deep"
          title={t("commonForward15")}
        >
          <RotateCw className="h-5 w-5" />
        </button>

        <div className="flex-1">
          <input
            type="range"
            min={0}
            max={duration || 0}
            // Integer steps can't reach a fractional max, which leaves the
            // thumb short of the end when playback finishes.
            step="any"
            value={duration ? Math.min(current, duration) : 0}
            onChange={(e) => {
              const t = Number(e.target.value);
              if (audioRef.current) audioRef.current.currentTime = t;
              setCurrent(t);
            }}
            className="w-full accent-ember"
          />
          <div className="mt-0.5 flex justify-between text-xs text-ink-faint">
            <span>{formatTimestamp(current * 1000)}</span>
            <span>{formatTimestamp((duration || 0) * 1000)}</span>
          </div>
        </div>

        <button
          onClick={cycleSpeed}
          className="w-14 rounded-lg border border-line px-2 py-1 text-sm font-medium text-ink-soft hover:bg-paper-deep"
        >
          {SPEEDS[speedIdx]}×
        </button>
      </div>
    </div>
  );
}
