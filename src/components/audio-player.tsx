"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { formatTimestamp } from "@/components/ui";
import { useI18n } from "@/components/i18n-provider";
import {
  editedAudioDurationMs,
  editedToOriginalTimeMs,
  mergeAudioCuts,
  originalToEditedTimeMs,
  skipDeletedTimeMs,
  type AudioCut,
} from "@/lib/audio/cuts";

const SPEEDS = [1, 1.25, 1.5, 2];
const NO_CUTS: AudioCut[] = [];

export function AudioPlayer({
  src,
  durationMs,
  cuts = NO_CUTS,
}: {
  src: string;
  durationMs?: number | null;
  cuts?: AudioCut[];
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
  const rawDuration = mediaDuration || fallback;
  const mergedCuts = useMemo(
    () => mergeAudioCuts(cuts, rawDuration > 0 ? rawDuration * 1000 : null),
    [cuts, rawDuration],
  );
  const duration =
    editedAudioDurationMs(rawDuration * 1000, mergedCuts) ?? 0;
  const editedCurrent = originalToEditedTimeMs(
    current * 1000,
    mergedCuts,
  );

  function syncPlaybackTime(el: HTMLAudioElement) {
    const currentMs = el.currentTime * 1000;
    const playableMs = skipDeletedTimeMs(currentMs, mergedCuts);
    if (playableMs !== currentMs) el.currentTime = playableMs / 1000;
    setCurrent(playableMs / 1000);
  }

  // `timeupdate` is intentionally sparse. Watch while playing as well so a
  // deleted line is skipped at its boundary instead of leaking a syllable.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const watchCuts = () => {
      const el = audioRef.current;
      if (el) {
        const currentMs = el.currentTime * 1000;
        const playableMs = skipDeletedTimeMs(currentMs, mergedCuts);
        if (playableMs !== currentMs) {
          el.currentTime = playableMs / 1000;
          setCurrent(playableMs / 1000);
        }
      }
      frame = window.requestAnimationFrame(watchCuts);
    };
    frame = window.requestAnimationFrame(watchCuts);
    return () => window.cancelAnimationFrame(frame);
  }, [mergedCuts, playing]);

  // A line can be deleted while the playhead is sitting inside it.
  useEffect(() => {
    if (audioRef.current) syncPlaybackTime(audioRef.current);
    // syncPlaybackTime is deliberately local to the latest merged cut list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mergedCuts]);

  function readDuration(el: HTMLAudioElement) {
    setMediaDuration(Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0);
  }

  function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      syncPlaybackTime(el);
      void el.play();
    }
    else el.pause();
  }

  function skip(seconds: number) {
    const el = audioRef.current;
    if (!el) return;
    const editedTarget = Math.max(
      0,
      Math.min(duration, editedCurrent + seconds * 1000),
    );
    el.currentTime =
      editedToOriginalTimeMs(
        editedTarget,
        rawDuration * 1000,
        mergedCuts,
      ) / 1000;
    setCurrent(el.currentTime);
  }

  function cycleSpeed() {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next];
  }

  return (
    <div className="portal-audio-player rounded-xl border border-line bg-cream p-5">
      <audio
        ref={audioRef}
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          // The stored length rarely matches the media exactly; fill the bar.
          if (rawDuration) setCurrent(rawDuration);
        }}
        onTimeUpdate={(e) => syncPlaybackTime(e.currentTarget)}
        onSeeking={(e) => syncPlaybackTime(e.currentTarget)}
        onLoadedMetadata={(e) => readDuration(e.currentTarget)}
        onDurationChange={(e) => readDuration(e.currentTarget)}
      />
      <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap sm:gap-4">
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

        <div className="order-last w-full flex-[1_0_100%] sm:order-none sm:w-auto sm:flex-1">
          <input
            type="range"
            min={0}
            max={duration || 0}
            // Integer steps can't reach a fractional max, which leaves the
            // thumb short of the end when playback finishes.
            step="any"
            value={duration ? Math.min(editedCurrent, duration) : 0}
            onChange={(e) => {
              const editedMs = Number(e.target.value);
              const originalMs = editedToOriginalTimeMs(
                editedMs,
                rawDuration * 1000,
                mergedCuts,
              );
              if (audioRef.current) {
                audioRef.current.currentTime = originalMs / 1000;
              }
              setCurrent(originalMs / 1000);
            }}
            className="w-full accent-ember"
          />
          <div className="mt-0.5 flex justify-between text-xs text-ink-faint">
            <span>{formatTimestamp(editedCurrent)}</span>
            <span>{formatTimestamp(duration)}</span>
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
