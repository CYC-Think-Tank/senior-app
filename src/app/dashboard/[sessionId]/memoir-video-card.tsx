"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Check,
  Clock3,
  Download,
  Film,
  Gauge,
  Maximize2,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import type {
  PublicConversationVideo,
  VideoGenerationQuota,
} from "@/lib/memoir/workflow";
import type { Locale } from "@/lib/i18n";
import styles from "./memoir-video-card.module.css";

const copyByLocale: Record<Locale, {
  refreshError: string;
  startError: string;
  planning: string;
  rendering: string;
  repairing: string;
  generating: string;
  regeneratingPart: (number: number) => string;
  kicker: string;
  title: string;
  body: string;
  disclosure: string;
  unsupported: string;
  downloadFilm: string;
  remakeWholeFilm: string;
  retry: string;
  create: string;
  partOf: (number: number, count: number) => string;
  videoLabel: string;
  playbackControls: string;
  playbackBar: string;
  play: string;
  pause: string;
  mute: string;
  unmute: string;
  fullscreen: string;
  regeneratePart: string;
  regenerateHelp: string;
  generationTitle: string;
  generationBody: string;
  regenerateProgressBody: string;
  generationStepPlan: string;
  generationStepAnimate: string;
  generationStepFinish: string;
  safeToLeave: string;
  createTitle: string;
  createBody: string;
  createLength: string;
  createVoice: string;
  createEdit: string;
  confirmationTitleCreate: string;
  confirmationBodyCreate: string;
  confirmationActionCreate: string;
  confirmationTitleWhole: string;
  confirmationBodyWhole: string;
  confirmationActionWhole: string;
  confirmationTitlePart: (number: number) => string;
  confirmationBodyPart: (number: number) => string;
  confirmationActionPart: (number: number) => string;
  cancel: string;
  sceneError: string;
  allowance: (remaining: number, limit: number) => string;
  allowanceNote: string;
  allowanceUsedUp: (limit: number) => string;
}> = {
  en: {
    refreshError: "Could not refresh the video.",
    startError: "Could not start the video.",
    planning: "Preparing the story and visual style…",
    rendering: "Putting the finished film together…",
    repairing: "Repairing the film for browser playback…",
    generating: "Creating the animated scenes…",
    regeneratingPart: (number) => `Recreating part ${number}…`,
    kicker: "Animated memoir",
    title: "Turn this story into a short film",
    body: "AI will adapt the complete story into a short animated memoir with narration and natural ambience.",
    disclosure: "The visuals, ambience, and narrator are AI-generated. The narrator does not use or imitate your voice.",
    unsupported: "Your browser cannot play this video.",
    downloadFilm: "Download film",
    remakeWholeFilm: "Remake the whole film",
    retry: "Try creating it again",
    create: "Create my film",
    partOf: (number, count) => `Part ${number} of ${count}`,
    videoLabel: "Your animated memoir",
    playbackControls: "Film playback controls",
    playbackBar: "Move through your film",
    play: "Play film",
    pause: "Pause film",
    mute: "Mute sound",
    unmute: "Turn sound on",
    fullscreen: "View full screen",
    regeneratePart: "Regenerate this part",
    regenerateHelp: "Only this part will be replaced. The rest of your film stays exactly as it is.",
    generationTitle: "We’re creating your film",
    generationBody: "This takes a little while because every scene is made especially for your story.",
    regenerateProgressBody: "The selected part is being replaced. All other parts are safely saved.",
    generationStepPlan: "Prepare the story",
    generationStepAnimate: "Create the scenes",
    generationStepFinish: "Finish the film",
    safeToLeave: "You can safely leave this page and come back later.",
    createTitle: "Your story, made into a film",
    createBody: "We’ll create the complete film for you. When it is ready, you can watch it and redo just one part at a time.",
    createLength: "About 2 minutes",
    createVoice: "A new narrator voice",
    createEdit: "Redo one part later",
    confirmationTitleCreate: "Create your animated film?",
    confirmationBodyCreate: "Video generation may incur a charge. Your original conversation will not be changed.",
    confirmationActionCreate: "Yes, create my film",
    confirmationTitleWhole: "Remake the entire film?",
    confirmationBodyWhole: "Every part of the current film will be replaced. Video generation may incur a charge.",
    confirmationActionWhole: "Yes, remake the whole film",
    confirmationTitlePart: (number) => `Regenerate part ${number}?`,
    confirmationBodyPart: (number) => `Only part ${number} will be replaced. The rest of the film will stay the same. Video generation may incur a charge.`,
    confirmationActionPart: (number) => `Yes, regenerate part ${number}`,
    cancel: "Cancel",
    sceneError: "Could not regenerate this part.",
    allowance: (remaining, limit) =>
      `${remaining} of ${limit} film generations left on your account`,
    allowanceNote: "Creating a film and remaking a whole film each use one. Redoing a single part is free.",
    allowanceUsedUp: (limit) =>
      `You have used all ${limit} film generations on your account. You can still redo one part of a film you already have.`,
  },
  "zh-Hans": {
    refreshError: "无法刷新视频。",
    startError: "无法开始生成视频。",
    planning: "正在准备故事和画面风格……",
    rendering: "正在合成完整短片……",
    repairing: "正在修复短片以便浏览器播放……",
    generating: "正在创作动画场景……",
    regeneratingPart: (number) => `正在重新创作第 ${number} 部分……`,
    kicker: "动画回忆",
    title: "把这个故事变成一部短片",
    body: "AI 会把完整故事改编成一部带旁白和自然环境音的动画回忆短片。",
    disclosure: "画面、环境音和讲述者均由 AI 生成。讲述者不会使用或模仿您的声音。",
    unsupported: "您的浏览器无法播放此视频。",
    downloadFilm: "下载短片",
    remakeWholeFilm: "重新制作整部短片",
    retry: "再试一次",
    create: "创作我的短片",
    partOf: (number, count) => `第 ${number} 部分，共 ${count} 部分`,
    videoLabel: "您的动画回忆短片",
    playbackControls: "短片播放控制",
    playbackBar: "在短片中移动",
    play: "播放短片",
    pause: "暂停短片",
    mute: "关闭声音",
    unmute: "打开声音",
    fullscreen: "全屏观看",
    regeneratePart: "重新生成这一部分",
    regenerateHelp: "只会替换这一部分，短片的其余内容会保持原样。",
    generationTitle: "正在创作您的短片",
    generationBody: "每个场景都是为您的故事特别创作的，因此需要一些时间。",
    regenerateProgressBody: "正在替换所选部分，其他部分均已安全保存。",
    generationStepPlan: "准备故事",
    generationStepAnimate: "创作场景",
    generationStepFinish: "完成短片",
    safeToLeave: "您可以安全离开此页面，稍后再回来。",
    createTitle: "把您的故事变成短片",
    createBody: "我们会为您创作完整短片。完成后，您可以观看，也可以每次只重新制作其中一个部分。",
    createLength: "约 2 分钟",
    createVoice: "全新的讲述者声音",
    createEdit: "稍后可重做一个部分",
    confirmationTitleCreate: "要创作动画短片吗？",
    confirmationBodyCreate: "生成视频可能会产生费用。您的原始对话不会被更改。",
    confirmationActionCreate: "是，创作我的短片",
    confirmationTitleWhole: "要重新制作整部短片吗？",
    confirmationBodyWhole: "当前短片的每个部分都会被替换。生成视频可能会产生费用。",
    confirmationActionWhole: "是，重新制作整部短片",
    confirmationTitlePart: (number) => `要重新生成第 ${number} 部分吗？`,
    confirmationBodyPart: (number) => `只会替换第 ${number} 部分，短片其余内容会保持不变。生成视频可能会产生费用。`,
    confirmationActionPart: (number) => `是，重新生成第 ${number} 部分`,
    cancel: "取消",
    sceneError: "无法重新生成这一部分。",
    allowance: (remaining, limit) => `您的账户还可生成 ${remaining} 部短片（共 ${limit} 部）`,
    allowanceNote: "创作短片和重新制作整部短片各消耗一次；重新制作其中一个部分不消耗次数。",
    allowanceUsedUp: (limit) =>
      `您的账户已用完全部 ${limit} 次短片生成机会。已有短片仍可重新制作其中一个部分。`,
  },
  "zh-Hant": {
    refreshError: "無法重新整理影片。",
    startError: "無法開始生成影片。",
    planning: "正在準備故事和畫面風格……",
    rendering: "正在合成完整短片……",
    repairing: "正在修復短片以便瀏覽器播放……",
    generating: "正在創作動畫場景……",
    regeneratingPart: (number) => `正在重新創作第 ${number} 部分……`,
    kicker: "動畫回憶",
    title: "把這個故事變成一部短片",
    body: "AI 會把完整故事改編成一部帶旁白和自然環境音的動畫回憶短片。",
    disclosure: "畫面、環境音和講述者均由 AI 生成。講述者不會使用或模仿您的聲音。",
    unsupported: "您的瀏覽器無法播放此影片。",
    downloadFilm: "下載短片",
    remakeWholeFilm: "重新製作整部短片",
    retry: "再試一次",
    create: "創作我的短片",
    partOf: (number, count) => `第 ${number} 部分，共 ${count} 部分`,
    videoLabel: "您的動畫回憶短片",
    playbackControls: "短片播放控制",
    playbackBar: "在短片中移動",
    play: "播放短片",
    pause: "暫停短片",
    mute: "關閉聲音",
    unmute: "開啟聲音",
    fullscreen: "全螢幕觀看",
    regeneratePart: "重新生成這一部分",
    regenerateHelp: "只會取代這一部分，短片的其餘內容會保持原樣。",
    generationTitle: "正在創作您的短片",
    generationBody: "每個場景都是為您的故事特別創作的，因此需要一些時間。",
    regenerateProgressBody: "正在取代所選部分，其他部分均已安全儲存。",
    generationStepPlan: "準備故事",
    generationStepAnimate: "創作場景",
    generationStepFinish: "完成短片",
    safeToLeave: "您可以安全離開此頁面，稍後再回來。",
    createTitle: "把您的故事變成短片",
    createBody: "我們會為您創作完整短片。完成後，您可以觀看，也可以每次只重新製作其中一個部分。",
    createLength: "約 2 分鐘",
    createVoice: "全新的講述者聲音",
    createEdit: "稍後可重做一個部分",
    confirmationTitleCreate: "要創作動畫短片嗎？",
    confirmationBodyCreate: "生成影片可能會產生費用。您的原始對話不會被更改。",
    confirmationActionCreate: "是，創作我的短片",
    confirmationTitleWhole: "要重新製作整部短片嗎？",
    confirmationBodyWhole: "目前短片的每個部分都會被取代。生成影片可能會產生費用。",
    confirmationActionWhole: "是，重新製作整部短片",
    confirmationTitlePart: (number) => `要重新生成第 ${number} 部分嗎？`,
    confirmationBodyPart: (number) => `只會取代第 ${number} 部分，短片其餘內容會保持不變。生成影片可能會產生費用。`,
    confirmationActionPart: (number) => `是，重新生成第 ${number} 部分`,
    cancel: "取消",
    sceneError: "無法重新生成這一部分。",
    allowance: (remaining, limit) => `您的帳戶還可生成 ${remaining} 部短片（共 ${limit} 部）`,
    allowanceNote: "創作短片和重新製作整部短片各消耗一次；重新製作其中一個部分不消耗次數。",
    allowanceUsedUp: (limit) =>
      `您的帳戶已用完全部 ${limit} 次短片生成機會。已有短片仍可重新製作其中一個部分。`,
  },
};

type Confirmation =
  | { kind: "create" }
  | { kind: "whole" }
  | { kind: "part"; sceneNumber: number };

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

export function MemoirVideoCard({
  sessionId,
  initialVideo,
  initialQuota,
}: {
  sessionId: string;
  initialVideo: PublicConversationVideo | null;
  initialQuota: VideoGenerationQuota | null;
}) {
  const { locale } = useI18n();
  const copy = copyByLocale[locale];
  const initialScene = initialVideo?.clips[0]?.sceneNumber ?? 1;
  const initialDuration = Math.max(0, (initialVideo?.durationMs ?? 0) / 1000);
  const [video, setVideo] = useState(initialVideo);
  const [quota, setQuota] = useState(initialQuota);
  const [starting, setStarting] = useState(false);
  const [repairAttempted, setRepairAttempted] = useState(false);
  const [pendingScene, setPendingScene] = useState<number | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [selectedScene, setSelectedScene] = useState(initialScene);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(initialDuration);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const masterVideoRef = useRef<HTMLVideoElement>(null);
  const playerShellRef = useRef<HTMLDivElement>(null);
  const confirmationRef = useRef<HTMLElement>(null);

  const clips = useMemo(
    () => [...(video?.clips ?? [])].sort((a, b) => a.sceneNumber - b.sceneNumber),
    [video?.clips],
  );
  const clipCount = clips.length;
  const effectiveSelectedScene = clips.some((clip) => clip.sceneNumber === selectedScene)
    ? selectedScene
    : clips[0]?.sceneNumber ?? selectedScene;
  const timelineDuration = playbackDuration
    || Math.max(0, (video?.durationMs ?? 0) / 1000)
    || clipCount * 14;
  const selectedIndex = Math.max(0, clips.findIndex((clip) => clip.sceneNumber === effectiveSelectedScene));
  const sceneLength = clipCount ? timelineDuration / clipCount : 0;
  const selectedStart = selectedIndex * sceneLength;
  const selectedEnd = Math.min(timelineDuration, selectedStart + sceneLength);
  const playbackProgress = timelineDuration
    ? Math.max(0, Math.min(100, (currentTime / timelineDuration) * 100))
    : 0;

  const refresh = useCallback(async () => {
    if (!video || video.status === "ready" || video.status === "failed") return;
    try {
      const response = await fetch(`/api/family/conversation-videos/${video.id}`, {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(locale === "en" ? body.error ?? copy.refreshError : copy.refreshError);
      }
      setRequestError(null);
      setVideo(body.video);
      if (body.video.status === "ready" || body.video.status === "failed") {
        setPendingScene(null);
      }
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : copy.refreshError);
    }
  }, [copy.refreshError, locale, video]);

  useEffect(() => {
    if (!video || video.status === "ready" || video.status === "failed") return;
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, [refresh, video]);

  useEffect(() => {
    if (!confirmation) return;
    confirmationRef.current?.focus();
  }, [confirmation]);

  useEffect(() => {
    const player = masterVideoRef.current;
    if (!player) return;
    const readDuration = () => {
      if (Number.isFinite(player.duration) && player.duration > 0) {
        setPlaybackDuration(player.duration);
      }
    };
    player.addEventListener("loadedmetadata", readDuration);
    player.addEventListener("durationchange", readDuration);
    const frame = window.requestAnimationFrame(readDuration);
    return () => {
      window.cancelAnimationFrame(frame);
      player.removeEventListener("loadedmetadata", readDuration);
      player.removeEventListener("durationchange", readDuration);
    };
  }, [video?.videoUrl]);

  async function start(regenerate = false) {
    masterVideoRef.current?.pause();
    setIsPlaying(false);
    setStarting(true);
    setPendingScene(null);
    setRepairAttempted(false);
    setRequestError(null);
    setVideo((current) => current ?? {
      id: "preparing",
      status: "planning",
      title: null,
      durationMs: null,
      error: null,
      videoUrl: null,
      clips: [],
      createdAt: new Date().toISOString(),
    });
    try {
      const response = await fetch("/api/family/conversation-videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, regenerate }),
      });
      const body = await response.json();
      if (body.quota) setQuota(body.quota);
      if (!response.ok) {
        throw new Error(locale === "en" ? body.error ?? copy.startError : copy.startError);
      }
      setVideo(body.video);
    } catch (error) {
      setVideo(initialVideo);
      setRequestError(error instanceof Error ? error.message : copy.startError);
    } finally {
      setStarting(false);
    }
  }

  async function regenerateScene(sceneNumber: number) {
    if (!video) return;
    masterVideoRef.current?.pause();
    setIsPlaying(false);
    setPendingScene(sceneNumber);
    setStarting(true);
    setRepairAttempted(false);
    setRequestError(null);
    try {
      const response = await fetch(
        `/api/family/conversation-videos/${video.id}/scenes/${sceneNumber}`,
        { method: "POST" },
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(locale === "en" ? body.error ?? copy.sceneError : copy.sceneError);
      }
      setVideo(body.video);
    } catch (error) {
      setPendingScene(null);
      setRequestError(error instanceof Error ? error.message : copy.sceneError);
    } finally {
      setStarting(false);
    }
  }

  async function repairPlayback() {
    if (!video || repairAttempted || video.status !== "ready") return;
    setRepairAttempted(true);
    setStarting(true);
    setRequestError(null);
    try {
      const response = await fetch("/api/family/conversation-videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, repair: true }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(locale === "en" ? body.error ?? copy.startError : copy.startError);
      }
      setVideo(body.video);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : copy.startError);
    } finally {
      setStarting(false);
    }
  }

  function syncPlayback(target: HTMLVideoElement) {
    const duration = Number.isFinite(target.duration) ? target.duration : timelineDuration;
    const time = Number.isFinite(target.currentTime) ? target.currentTime : 0;
    setCurrentTime(time);
    if (duration > 0) setPlaybackDuration(duration);
    if (!clips.length || duration <= 0) return;
    // A tiny tolerance prevents floating-point rounding from selecting the
    // previous part when the player lands exactly on a scene boundary.
    const index = Math.min(
      clips.length - 1,
      Math.floor(((time + 0.02) / duration) * clips.length),
    );
    setSelectedScene(clips[index].sceneNumber);
  }

  async function togglePlayback() {
    const player = masterVideoRef.current;
    if (!player) return;
    if (player.paused || player.ended) {
      if (player.ended) player.currentTime = 0;
      try {
        await player.play();
      } catch {
        setIsPlaying(false);
      }
    } else {
      player.pause();
    }
  }

  function seekPlayback(time: number) {
    const player = masterVideoRef.current;
    const duration = player?.duration && Number.isFinite(player.duration)
      ? player.duration
      : timelineDuration;
    const nextTime = Math.max(0, Math.min(duration, time));
    setCurrentTime(nextTime);
    if (player) player.currentTime = nextTime;
  }

  function toggleMute() {
    const player = masterVideoRef.current;
    if (!player) return;
    const nextMuted = !player.muted;
    player.muted = nextMuted;
    setIsMuted(nextMuted);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await playerShellRef.current?.requestFullscreen();
      }
    } catch {
      // Some mobile browsers expose fullscreen only through their native
      // video UI. Playback remains fully usable when that API is unavailable.
    }
  }

  function confirmAction(action: Confirmation) {
    setConfirmation(action);
  }

  function performConfirmedAction() {
    if (!confirmation) return;
    const action = confirmation;
    setConfirmation(null);
    if (action.kind === "part") {
      void regenerateScene(action.sceneNumber);
    } else {
      void start(action.kind === "whole");
    }
  }

  // A missing allowance means the page could not read one; never block on that.
  const outOfGenerations = Boolean(quota && quota.remaining <= 0);

  const active = Boolean(video && ["planning", "preparing", "generating", "rendering"].includes(video.status));
  const progressMessage = repairAttempted
    ? copy.repairing
    : pendingScene
      ? copy.regeneratingPart(pendingScene)
      : video?.status === "planning" || video?.status === "preparing"
        ? copy.planning
        : video?.status === "rendering"
          ? copy.rendering
          : copy.generating;
  const progressStep = video?.status === "rendering"
    ? 2
    : video?.status === "generating"
      ? 1
      : 0;

  let confirmationTitle = "";
  let confirmationBody = "";
  let confirmationAction = "";
  if (confirmation?.kind === "create") {
    confirmationTitle = copy.confirmationTitleCreate;
    confirmationBody = copy.confirmationBodyCreate;
    confirmationAction = copy.confirmationActionCreate;
  } else if (confirmation?.kind === "whole") {
    confirmationTitle = copy.confirmationTitleWhole;
    confirmationBody = copy.confirmationBodyWhole;
    confirmationAction = copy.confirmationActionWhole;
  } else if (confirmation?.kind === "part") {
    confirmationTitle = copy.confirmationTitlePart(confirmation.sceneNumber);
    confirmationBody = copy.confirmationBodyPart(confirmation.sceneNumber);
    confirmationAction = copy.confirmationActionPart(confirmation.sceneNumber);
  }

  return (
    <section className={styles.card} aria-labelledby="memoir-video-title">
      <header className={styles.header}>
        <div className={styles.headerIcon}>
          <Film aria-hidden="true" />
        </div>
        <div className={styles.headerCopy}>
          <p className={styles.kicker}>{copy.kicker}</p>
          <h2 id="memoir-video-title">{video?.title || copy.title}</h2>
          <p className={styles.intro}>{copy.body}</p>
          <p className={styles.disclosure}>{copy.disclosure}</p>
        </div>
      </header>

      {video?.status === "ready" && video.videoUrl ? (
        <div className={styles.editor}>
          <div ref={playerShellRef} className={styles.playerShell}>
            <div className={styles.previewFrame}>
              <video
                ref={masterVideoRef}
                className={styles.preview}
                playsInline
                preload="metadata"
                src={video.videoUrl}
                aria-label={copy.videoLabel}
                onLoadedMetadata={(event) => syncPlayback(event.currentTarget)}
                onDurationChange={(event) => syncPlayback(event.currentTarget)}
                onTimeUpdate={(event) => syncPlayback(event.currentTarget)}
                onSeeking={(event) => syncPlayback(event.currentTarget)}
                onSeeked={(event) => syncPlayback(event.currentTarget)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                onError={() => void repairPlayback()}
              >
                {copy.unsupported}
              </video>
              {!isPlaying ? (
                <button
                  className={styles.previewPlayButton}
                  type="button"
                  aria-label={copy.play}
                  onClick={() => void togglePlayback()}
                >
                  <Play aria-hidden="true" fill="currentColor" />
                </button>
              ) : null}
            </div>

            <div className={styles.appleControls} role="group" aria-label={copy.playbackControls}>
              <button
                className={styles.playbackButton}
                type="button"
                aria-label={isPlaying ? copy.pause : copy.play}
                onClick={() => void togglePlayback()}
              >
                {isPlaying
                  ? <Pause aria-hidden="true" fill="currentColor" />
                  : <Play aria-hidden="true" fill="currentColor" />}
              </button>

              <div className={styles.appleScrubber}>
                <div className={styles.scrubFilmstrip} aria-hidden="true">
                  {clips.map((clip) => (
                    <span className={styles.scrubFrame} key={clip.sceneNumber}>
                      <video
                        src={clip.videoUrl}
                        preload="metadata"
                        muted
                        playsInline
                        tabIndex={-1}
                        onLoadedMetadata={(event) => {
                          event.currentTarget.currentTime = Math.min(0.2, event.currentTarget.duration / 2);
                        }}
                      />
                    </span>
                  ))}
                </div>
                {clipCount ? (
                  <span
                    className={styles.scrubSelection}
                    style={{
                      left: `${(selectedIndex / clipCount) * 100}%`,
                      width: `${100 / clipCount}%`,
                    }}
                    aria-hidden="true"
                  />
                ) : null}
                <span className={`${styles.scrubEdge} ${styles.scrubEdgeLeft}`} aria-hidden="true" />
                <span className={`${styles.scrubEdge} ${styles.scrubEdgeRight}`} aria-hidden="true" />
                <span
                  className={styles.scrubPlayhead}
                  style={{ left: `${playbackProgress}%` }}
                  aria-hidden="true"
                />
                <input
                  className={styles.scrubInput}
                  type="range"
                  min="0"
                  max={timelineDuration || 0.01}
                  step="0.05"
                  value={Math.min(currentTime, timelineDuration || 0)}
                  aria-label={copy.playbackBar}
                  aria-valuetext={`${formatTime(currentTime)} / ${formatTime(timelineDuration)}`}
                  disabled={!timelineDuration}
                  onInput={(event) => seekPlayback(Number(event.currentTarget.value))}
                />
              </div>

              <span className={styles.playbackTime} aria-hidden="true">
                <strong>{formatTime(currentTime)}</strong>
                <span>/</span>
                {formatTime(timelineDuration)}
              </span>
              <button
                className={styles.playbackButton}
                type="button"
                aria-label={isMuted ? copy.unmute : copy.mute}
                onClick={toggleMute}
              >
                {isMuted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
              </button>
              <button
                className={styles.playbackButton}
                type="button"
                aria-label={copy.fullscreen}
                onClick={() => void toggleFullscreen()}
              >
                <Maximize2 aria-hidden="true" />
              </button>
            </div>
          </div>

          {clipCount ? (
            <section className={styles.selectionPanel} aria-labelledby="selected-video-part">
              <div className={styles.selectionSummary}>
                <div className={styles.selectionHeading}>
                  <h3 id="selected-video-part" aria-live="polite">
                    {copy.partOf(effectiveSelectedScene, clipCount)}
                  </h3>
                  <p className={styles.timeRange}>
                    <Clock3 aria-hidden="true" />
                    {formatTime(selectedStart)} – {formatTime(selectedEnd)}
                  </p>
                </div>
                <p className={styles.selectionHelp}>
                  <ShieldCheck aria-hidden="true" />
                  <span>{copy.regenerateHelp}</span>
                </p>
              </div>
              <div className={styles.selectionActions}>
                <button
                  className={styles.regenerateButton}
                  type="button"
                  onClick={() => confirmAction({ kind: "part", sceneNumber: effectiveSelectedScene })}
                  disabled={starting}
                >
                  <RefreshCw aria-hidden="true" />
                  <span>{copy.regeneratePart}</span>
                </button>
                <a
                  className={styles.downloadButton}
                  href={video.videoUrl}
                  download={`${video.title || "animated-memoir"}.mp4`}
                >
                  <Download aria-hidden="true" />
                  <span>{copy.downloadFilm}</span>
                </a>
              </div>
            </section>
          ) : null}

          <div className={styles.editorFooter}>
            {quota ? (
              <span className={styles.footerAllowance}>
                {outOfGenerations
                  ? copy.allowanceUsedUp(quota.limit)
                  : copy.allowance(quota.remaining, quota.limit)}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => confirmAction({ kind: "whole" })}
              disabled={starting || outOfGenerations}
            >
              <RefreshCw aria-hidden="true" />
              {copy.remakeWholeFilm}
            </button>
          </div>
        </div>
      ) : active ? (
        <div className={styles.progressPanel} role="status" aria-live="polite">
          <div className={styles.progressArtwork} aria-hidden="true">
            <div />
            <div />
            <div />
            <span><RefreshCw /></span>
          </div>
          <div className={styles.progressContent}>
            <p className={styles.progressKicker}>{progressMessage}</p>
            <h3>{pendingScene ? copy.regeneratingPart(pendingScene) : copy.generationTitle}</h3>
            <p>{pendingScene ? copy.regenerateProgressBody : copy.generationBody}</p>
            <ol className={styles.progressSteps}>
              {[copy.generationStepPlan, copy.generationStepAnimate, copy.generationStepFinish].map((step, index) => (
                <li
                  className={index < progressStep ? styles.stepComplete : index === progressStep ? styles.stepCurrent : ""}
                  key={step}
                >
                  <span>{index < progressStep ? <Check aria-hidden="true" /> : index + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
            <p className={styles.safeToLeave}>
              <ShieldCheck aria-hidden="true" />
              {copy.safeToLeave}
            </p>
          </div>
        </div>
      ) : (
        <div className={styles.creationPanel}>
          <div className={styles.creationIntro}>
            <span><Sparkles aria-hidden="true" /></span>
            <div>
              <h3>{copy.createTitle}</h3>
              <p>{copy.createBody}</p>
            </div>
          </div>
          <ul className={styles.creationFacts}>
            <li><Clock3 aria-hidden="true" /><span>{copy.createLength}</span></li>
            <li><Film aria-hidden="true" /><span>{copy.createVoice}</span></li>
            <li><RefreshCw aria-hidden="true" /><span>{copy.createEdit}</span></li>
          </ul>
          {quota ? (
            <p className={outOfGenerations ? styles.allowanceSpent : styles.allowance}>
              <Gauge aria-hidden="true" />
              <span>
                {outOfGenerations
                  ? copy.allowanceUsedUp(quota.limit)
                  : `${copy.allowance(quota.remaining, quota.limit)} — ${copy.allowanceNote}`}
              </span>
            </p>
          ) : null}
          <button
            className={styles.createButton}
            type="button"
            onClick={() => confirmAction({ kind: "create" })}
            disabled={starting || outOfGenerations}
          >
            <Sparkles aria-hidden="true" />
            {video?.status === "failed" ? copy.retry : copy.create}
          </button>
        </div>
      )}

      {confirmation ? (
        <section
          ref={confirmationRef}
          className={styles.confirmationPanel}
          aria-labelledby="video-confirmation-title"
          tabIndex={-1}
        >
          <div className={styles.confirmationIcon}><ShieldCheck aria-hidden="true" /></div>
          <div className={styles.confirmationCopy}>
            <h3 id="video-confirmation-title">{confirmationTitle}</h3>
            <p>{confirmationBody}</p>
          </div>
          <div className={styles.confirmationActions}>
            <button
              className={styles.confirmButton}
              type="button"
              onClick={performConfirmedAction}
            >
              {confirmationAction}
            </button>
            <button
              className={styles.cancelButton}
              type="button"
              onClick={() => setConfirmation(null)}
            >
              {copy.cancel}
            </button>
          </div>
        </section>
      ) : null}

      {(requestError || video?.error) ? (
        <p className={styles.error} role="alert">
          {requestError || video?.error}
        </p>
      ) : null}
    </section>
  );
}
