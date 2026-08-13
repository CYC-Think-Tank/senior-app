"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Mic,
  MicOff,
  PhoneOff,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import {
  InterviewClient,
  type InterviewPhase,
  type InterviewResume,
} from "@/lib/realtime/interview-client";
import {
  detectBackdrop,
  type BackdropGroup,
  type BackdropKey,
} from "@/lib/realtime/icebreaker-backdrop";
import type { TurnDraft } from "@/lib/types";
import { formatTimestamp } from "@/components/ui";
import { InterviewShell } from "@/components/interview-shell";
import { GradientOrb } from "@/components/ui/gradient-orb";
import theme from "@/components/interview-theme.module.css";
import { useI18n } from "@/components/i18n-provider";

/**
 * Only the opening exchanges are scanned for an icebreaker answer, so a season
 * mentioned later inside a story cannot repaint the room mid-memory.
 */
const ICEBREAKER_GUEST_TURNS = 8;

/** Long enough that a brisk reply from Rosie still leaves the image readable. */
const BACKDROP_MIN_VISIBLE_MS = 3500;

type Props = {
  token: string;
  guestName: string;
  topic: string | null;
  initialShareToken: string | null;
  alreadyRecorded: boolean;
  isLoggedIn: boolean;
  homeHref: "/" | "/admin" | "/dashboard";
  /** Set when this conversation ended early and is being picked back up. */
  resume?: InterviewResume;
  recordingConsentRequired: boolean;
};

export default function InterviewRoom({
  token,
  guestName,
  topic,
  initialShareToken,
  alreadyRecorded,
  isLoggedIn,
  homeHref,
  resume,
  recordingConsentRequired,
}: Props) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<InterviewPhase>("idle");
  const [showWelcome, setShowWelcome] = useState(true);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [turns, setTurns] = useState<TurnDraft[]>(resume?.turns ?? []);
  const [elapsedMs, setElapsedMs] = useState(resume?.offsetMs ?? 0);
  const [liveAiText, setLiveAiText] = useState("");
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [wrappingUp, setWrappingUp] = useState(false);
  const [muted, setMuted] = useState(false);
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [backdrop, setBackdrop] = useState<BackdropKey | null>(null);
  const backdropGroupsRef = useRef(new Set<BackdropGroup>());
  const backdropScannedAtRef = useRef(-1);
  const backdropShownAtRef = useRef(0);
  const backdropAiRepliedRef = useRef(false);
  const [shareToken, setShareToken] = useState(initialShareToken);
  const [recordingConsentSaved, setRecordingConsentSaved] = useState(!recordingConsentRequired);
  const clientRef = useRef<InterviewClient | null>(null);
  const micLevelRef = useRef(0);
  const aiLevelRef = useRef(0);
  const userSpeakingRef = useRef(false);
  const userSpeakingTimeoutRef = useRef<number | null>(null);

  const begin = useCallback(async () => {
    // React state updates after the click handler returns. The ref closes the
    // brief window where a double-click could otherwise start two calls.
    if (clientRef.current) return;

    setErrorDetail(null);
    if (!recordingConsentSaved) {
      const response = await fetch(`/api/sessions/${token}/consent`, {
        method: "POST",
      });
      if (!response.ok) {
        setErrorDetail(t("interviewErrorBody"));
        setPhase("error");
        return;
      }
      setRecordingConsentSaved(true);
    }

    document.documentElement.dataset.interviewLive = "true";
    const client = new InterviewClient(token, {
      onPhase: (p, detail) => {
        setPhase(p);
        if (detail) setErrorDetail(detail);
        if (p === "error") {
          clientRef.current = null;
        }
      },
      onComplete: setShareToken,
      onTurns: setTurns,
      onLiveAiText: setLiveAiText,
      onAiSpeaking: setAiSpeaking,
      onWrapUpStarted: () => setWrappingUp(true),
      onAiMeter: (level) => {
        // Keep this in a ref so the orb can follow every audio frame without
        // forcing the entire interview screen to re-render at 60fps.
        aiLevelRef.current = level;
      },
      onMeter: (level, elapsed, voiceActivity) => {
        micLevelRef.current = level;
        setElapsedMs(elapsed);
        const isSpeaking =
          voiceActivity === undefined ? level > 0.06 : voiceActivity > 0.5;
        if (isSpeaking) {
          if (userSpeakingTimeoutRef.current !== null) {
            window.clearTimeout(userSpeakingTimeoutRef.current);
            userSpeakingTimeoutRef.current = null;
          }
          if (!userSpeakingRef.current) {
            userSpeakingRef.current = true;
            setUserSpeaking(true);
          }
        } else if (
          userSpeakingRef.current &&
          userSpeakingTimeoutRef.current === null
        ) {
          userSpeakingTimeoutRef.current = window.setTimeout(() => {
            userSpeakingRef.current = false;
            userSpeakingTimeoutRef.current = null;
            setUserSpeaking(false);
          }, 180);
        }
      },
    }, resume);
    clientRef.current = client;
    void client.start();
  }, [token, resume, recordingConsentSaved, t]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    // The client refuses once wrap-up has cut the microphone; leave the
    // button showing what is actually true rather than what was asked for.
    if (clientRef.current?.setMuted(next)) setMuted(next);
  }, [muted]);

  const endCall = useCallback(() => {
    if (!confirmingEnd) {
      setConfirmingEnd(true);
      return;
    }
    setConfirmingEnd(false);
    void clientRef.current?.stop();
  }, [confirmingEnd]);

  // A confirm that waits forever would eventually be tapped by accident, which
  // is the thing it exists to prevent.
  useEffect(() => {
    if (!confirmingEnd) return;
    const timeout = window.setTimeout(() => setConfirmingEnd(false), 4000);
    return () => window.clearTimeout(timeout);
  }, [confirmingEnd]);

  // Raise the matching backdrop once the guest answers an icebreaker. Each
  // icebreaker fires at most once, so a second mention cannot repaint the room.
  useEffect(() => {
    if (phase !== "live") return;
    const guestTurns = turns.filter((turn) => turn.speaker === "guest");
    if (guestTurns.length > ICEBREAKER_GUEST_TURNS) return;
    const latest = guestTurns[guestTurns.length - 1];
    if (!latest || latest.startMs === backdropScannedAtRef.current) return;
    backdropScannedAtRef.current = latest.startMs;

    const match = detectBackdrop(latest.text);
    if (!match || backdropGroupsRef.current.has(match.group)) return;
    backdropGroupsRef.current.add(match.group);
    backdropAiRepliedRef.current = false;
    backdropShownAtRef.current = Date.now();
    setBackdrop(match.key);
  }, [turns, phase]);

  // "The question is finished" is Rosie having answered and fallen silent. The
  // floor keeps a quick acknowledgement from flashing the image and losing it.
  useEffect(() => {
    if (!backdrop) return;
    if (aiSpeaking) {
      backdropAiRepliedRef.current = true;
      return;
    }
    if (!backdropAiRepliedRef.current) return;

    const held = Date.now() - backdropShownAtRef.current;
    if (held >= BACKDROP_MIN_VISIBLE_MS) {
      backdropAiRepliedRef.current = false;
      setBackdrop(null);
      return;
    }
    const timeout = window.setTimeout(() => {
      backdropAiRepliedRef.current = false;
      setBackdrop(null);
    }, BACKDROP_MIN_VISIBLE_MS - held);
    return () => window.clearTimeout(timeout);
  }, [aiSpeaking, backdrop]);

  // The atmosphere lives in the root layout, so the room asks for a backdrop
  // the same way it asks for the lights to go down: an attribute on <html>.
  useEffect(() => {
    const root = document.documentElement;
    // Derived rather than cleared on phase change: saving and the closing
    // screens belong to the plain dark room, whatever was raised during it.
    const active = phase === "live" ? backdrop : null;
    if (active) {
      root.dataset.interviewBackdrop = active;
    } else {
      delete root.dataset.interviewBackdrop;
    }
    return () => {
      delete root.dataset.interviewBackdrop;
    };
  }, [backdrop, phase]);

  useEffect(() => {
    return () => {
      clientRef.current?.dispose();
      clientRef.current = null;
      if (userSpeakingTimeoutRef.current !== null) {
        window.clearTimeout(userSpeakingTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (alreadyRecorded) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setShowWelcome(false);
    }, 2200);

    return () => window.clearTimeout(timeout);
  }, [alreadyRecorded]);

  useEffect(() => {
    const shouldDim =
      phase !== "idle" && phase !== "done" && phase !== "error";

    if (shouldDim) {
      document.documentElement.dataset.interviewLive = "true";
    } else {
      document.documentElement.removeAttribute("data-interview-live");
    }

    return () => {
      document.documentElement.removeAttribute("data-interview-live");
    };
  }, [phase]);

  const lastGuestTurn = [...turns].reverse().find((t) => t.speaker === "guest");
  const lastAiTurn = [...turns].reverse().find((t) => t.speaker === "ai");
  const captionText =
    liveAiText ||
    (aiSpeaking ? "" : lastAiTurn?.text ?? "") ||
    lastGuestTurn?.text ||
    "";

  if (alreadyRecorded && phase === "idle") {
    return (
      <InterviewShell homeHref={homeHref}>
        <Sparkles className={`${theme.accentIcon} mx-auto mb-6 h-12 w-12`} />
        <h1 className={`${theme.heading} text-4xl sm:text-5xl`}>
          {t("interviewAlreadyTitle")}
        </h1>
        <p className={`${theme.body} mx-auto mt-4 max-w-xl text-xl leading-relaxed`}>
          {t("interviewAlreadyBody", { guestName })}
        </p>
        {shareToken && <CompletionShareLink shareToken={shareToken} />}
      </InterviewShell>
    );
  }

  return (
    <InterviewShell homeHref={homeHref}>
      <>
        <AnimatePresence mode="wait">
          {showWelcome && (
            <IntroScreen key="welcome">
              <GreetingText guestName={guestName} />
            </IntroScreen>
          )}

          {!showWelcome && phase === "idle" && (
            <IntroScreen key="idle">
              <p className={theme.eyebrow}>
                {resume
                  ? t("interviewWelcomeBack", { guestName })
                  : t("interviewHello", { guestName })}
              </p>
              <h1 className={`${theme.heading} mt-3 text-4xl sm:text-6xl`}>
                {resume
                  ? t("interviewCarryOn")
                  : `${t("interviewReady")} ${t("interviewSomeStories")}`}
              </h1>
              {/* The subject was announced when the conversation began. */}
              {topic && !resume && (
                <p className={theme.topic}>
                  {t("interviewTopic", { topic })}
                </p>
              )}
              <p className={`${theme.body} mx-auto mt-6 max-w-xl text-lg leading-relaxed`}>
                {t(resume ? "interviewResumeIntro" : "interviewIntro")}
              </p>
              {!recordingConsentSaved && (
                <>
                  <p className={theme.consentNotice}>{t("interviewConsentNotice")}</p>
                  <p className={theme.consentLinks}>
                    <Link href="/privacy">{t("legalPrivacy")}</Link>
                    <span aria-hidden="true"> · </span>
                    <Link href="/terms">{t("legalTerms")}</Link>
                  </p>
                </>
              )}
              <button
                onClick={begin}
                className={theme.beginButton}
              >
                <Mic />
                <span>
                  {recordingConsentSaved
                    ? t(resume ? "interviewContinue" : "interviewBegin")
                    : t("interviewBeginConsent")}
                </span>
              </button>
            </IntroScreen>
          )}
        {(phase === "mic" || phase === "connecting") && (
          <Screen key="connecting">
            <BreathingCircle
              aiSpeaking={false}
              userSpeaking={false}
              levelRef={micLevelRef}
              aiLevelRef={aiLevelRef}
            />
            <h1 className={`${theme.heading} mt-10 text-3xl sm:text-4xl`}>
              {phase === "mic"
                ? t("interviewAllowMic")
                : t("interviewFinding")}
            </h1>
            <p className={`${theme.body} mt-3 text-lg`}>
              {t("interviewMoment")}
            </p>
          </Screen>
        )}

        {phase === "live" && (
          <Screen key="live">
            <div className={theme.statusLine}>
              {formatTimestamp(elapsedMs)}
            </div>

            <div className="my-10">
              <BreathingCircle
                aiSpeaking={aiSpeaking}
                userSpeaking={userSpeaking}
                levelRef={micLevelRef}
                aiLevelRef={aiLevelRef}
              />
            </div>

            {/* Rosie still starts her own wrap-up when the guest says they are
                done, so the state needs to stay visible now that the button
                that used to announce it is gone. */}
            <p className={theme.liveLabel}>
              {wrappingUp
                ? t("interviewWrapBusy")
                : aiSpeaking
                  ? t("interviewAiSpeaking")
                  : t("interviewListening")}
            </p>

            <div className={`${theme.caption} mx-auto mt-6 min-h-24 max-w-2xl`}>
              {captionText && (
                <p>
                  {captionText.length > 220
                    ? `…${captionText.slice(-220)}`
                    : captionText}
                </p>
              )}
            </div>

            <div className={theme.actions}>
              <button
                type="button"
                onClick={toggleMute}
                disabled={wrappingUp}
                aria-pressed={muted}
                className={theme.ghostAction}
              >
                {muted ? (
                  <MicOff className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Mic className="h-5 w-5" aria-hidden="true" />
                )}
                {t(muted ? "interviewUnmute" : "interviewMute")}
              </button>

              {/* Stays enabled through wrap-up: someone who wants out now
                  should not have to sit through Rosie's closing. */}
              <button
                type="button"
                onClick={endCall}
                data-confirming={confirmingEnd}
                className={theme.endAction}
              >
                <PhoneOff className="h-5 w-5" aria-hidden="true" />
                {t(confirmingEnd ? "interviewEndConfirm" : "interviewEndSave")}
              </button>
            </div>

            {muted && (
              <p className={theme.mutedNotice} role="status">
                {t("interviewMutedNotice")}
              </p>
            )}
          </Screen>
        )}

        {phase === "uploading" && (
          <Screen key="uploading">
            <motion.div
              className={theme.spinner}
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            />
            <h1 className={`${theme.heading} mt-8 text-3xl sm:text-4xl`}>
              {t("interviewSaving")}
            </h1>
            <p className={`${theme.body} mt-3 text-lg`}>
              {t("interviewKeepOpen")}
            </p>
          </Screen>
        )}

        {phase === "done" && (
          <Screen key="done">
            <div className={theme.successMark}>
              <Check className="h-11 w-11" />
            </div>
            <h1 className={`${theme.heading} mt-8 text-4xl sm:text-5xl`}>
              {t("interviewThanks", { guestName })}
            </h1>
            <p className={`${theme.body} mx-auto mt-4 max-w-xl text-xl leading-relaxed`}>
              {t(isLoggedIn ? "interviewDone" : "interviewDoneAnonymous")}
            </p>
            {shareToken && <CompletionShareLink shareToken={shareToken} />}
            {!isLoggedIn && (
              <Link href="/login" className={`${theme.primaryAction} mt-6`}>
                {t("interviewLogInToSave")}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
          </Screen>
        )}

        {phase === "error" && (
          <Screen key="error">
            <h1 className={`${theme.heading} text-3xl sm:text-4xl`}>
              {t("interviewErrorTitle")}
            </h1>
            <p className={`${theme.body} mx-auto mt-4 max-w-xl text-lg leading-relaxed`}>
              {errorDetail ?? t("interviewErrorBody")}
            </p>
            <button
              onClick={() => {
                setShowWelcome(false);
                setPhase("idle");
                setTurns(resume?.turns ?? []);
                setWrappingUp(false);
              }}
              className={`${theme.retryButton} mx-auto mt-8`}
            >
              {t("commonTryAgain")}
            </button>
          </Screen>
        )}
        </AnimatePresence>
      </>
    </InterviewShell>
  );
}

function CompletionShareLink({ shareToken }: { shareToken: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const sharePath = `/share/${shareToken}`;

  async function copyShareLink() {
    await navigator.clipboard.writeText(
      new URL(sharePath, window.location.origin).toString(),
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={theme.completionShare}>
      <h2 className={theme.completionShareTitle}>
        {t("interviewShareTitle")}
      </h2>
      <p className={theme.completionShareBody}>
        {t("interviewShareBody")}
      </p>
      <div className={theme.completionShareActions}>
        <Link
          href={sharePath}
          target="_blank"
          rel="noreferrer"
          className={theme.primaryAction}
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          {t("interviewOpenShareLink")}
        </Link>
        <button
          type="button"
          onClick={copyShareLink}
          className={theme.secondaryAction}
        >
          {copied ? (
            <Check className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4" aria-hidden="true" />
          )}
          {t(copied ? "commonCopied" : "interviewCopyShareLink")}
        </button>
      </div>
    </div>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className={theme.screen}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.65, ease: [0.45, 0, 0.55, 1] }}
    >
      {children}
    </motion.div>
  );
}

function IntroScreen({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <motion.div
      className={theme.introScreen}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.85, ease: [0.45, 0, 0.55, 1] }}
    >
      {children}
    </motion.div>
  );
}

function GreetingText({ guestName }: { guestName: string }) {
  const { t } = useI18n();
  const text = t("interviewHello", { guestName });

  return (
    <h1
      className={`${theme.heading} text-4xl sm:text-6xl`}
      aria-label={text}
    >
      <span aria-hidden="true">
        {Array.from(text).map((character, index) => (
          <motion.span
            key={`${character}-${index}`}
            className={theme.greetingCharacter}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.42,
              delay: index * 0.055,
              ease: [0.45, 0, 0.55, 1],
            }}
          >
            {character === " " ? "\u00a0" : character}
          </motion.span>
        ))}
      </span>
    </h1>
  );
}

/**
 * Rosie becomes a five-bar microphone visualizer while the guest is speaking.
 * During her turn, the fluid orb follows the realtime speaking callback.
 */
function BreathingCircle({
  aiSpeaking,
  userSpeaking,
  levelRef,
  aiLevelRef,
}: {
  aiSpeaking: boolean;
  userSpeaking: boolean;
  levelRef: React.RefObject<number>;
  aiLevelRef: React.RefObject<number>;
}) {
  const showMicVisualizer = userSpeaking && !aiSpeaking;

  return (
    <div className={theme.orbStage}>
      <motion.div
        className={theme.rosieOrb}
        initial={{ opacity: 0 }}
        animate={{ opacity: showMicVisualizer ? 0 : 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <GradientOrb
          activity={aiSpeaking ? 0.15 : 0}
          activityRef={aiLevelRef}
        />
      </motion.div>

      <AnimatePresence initial={false}>
        {showMicVisualizer ? (
          <MicVisualizer key="visualizer" levelRef={levelRef} />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function MicVisualizer({ levelRef }: { levelRef: React.RefObject<number> }) {
  const barsRef = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    let frame = 0;
    let smoothed = 0;
    const factors = [0.55, 0.8, 1, 0.8, 0.55];

    const tick = () => {
      smoothed += ((levelRef.current ?? 0) - smoothed) * 0.22;
      const strength = Math.min(1, smoothed * 3.2);
      const now = performance.now();
      barsRef.current.forEach((bar, index) => {
        if (!bar) return;
        const pulse = 0.78 + Math.sin(now / 125 + index * 0.8) * 0.22;
        const scale = 0.2 + strength * factors[index] * pulse;
        bar.style.transform = `scaleY(${scale})`;
      });
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [levelRef]);

  return (
    <motion.div
      className={theme.micVisualizer}
      initial={{ opacity: 0, scaleX: 0.35 }}
      animate={{ opacity: 1, scaleX: 1 }}
      exit={{ opacity: 0, scaleX: 0.35 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      {Array.from({ length: 5 }, (_, index) => (
        <span
          key={index}
          ref={(bar) => {
            barsRef.current[index] = bar;
          }}
          className={theme.micBar}
        />
      ))}
    </motion.div>
  );
}
