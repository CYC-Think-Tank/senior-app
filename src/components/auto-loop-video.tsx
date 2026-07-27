"use client";

import { useEffect, useRef } from "react";

type AutoLoopVideoProps = {
  src: string;
  ariaLabel: string;
  fallback: string;
  className?: string;
};

export function AutoLoopVideo({
  src,
  ariaLabel,
  fallback,
  className,
}: AutoLoopVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;

    const resumePlayback = () => {
      if (document.visibilityState !== "visible" || !video.paused) return;
      void video.play().catch(() => undefined);
    };

    const videoEvents = ["canplay", "loadeddata", "pause", "ended"];
    videoEvents.forEach((event) => video.addEventListener(event, resumePlayback));
    document.addEventListener("visibilitychange", resumePlayback);
    window.addEventListener("focus", resumePlayback);
    window.addEventListener("pageshow", resumePlayback);
    resumePlayback();

    return () => {
      videoEvents.forEach((event) =>
        video.removeEventListener(event, resumePlayback),
      );
      document.removeEventListener("visibilitychange", resumePlayback);
      window.removeEventListener("focus", resumePlayback);
      window.removeEventListener("pageshow", resumePlayback);
    };
  }, []);

  return (
    <video
      ref={videoRef}
      className={className}
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      aria-label={ariaLabel}
    >
      <source src={src} type="video/mp4" />
      {fallback}
    </video>
  );
}
