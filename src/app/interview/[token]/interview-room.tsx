"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Mic, Sparkles } from "lucide-react";
import Link from "next/link";
import {
  InterviewClient,
  type InterviewPhase,
  type InterviewResume,
} from "@/lib/realtime/interview-client";
import type { TurnDraft } from "@/lib/types";
import { formatTimestamp } from "@/components/ui";
import { InterviewShell } from "@/components/interview-shell";
import theme from "@/components/interview-theme.module.css";
import { useI18n } from "@/components/i18n-provider";

type Props = {
  token: string;
  guestName: string;
  topic: string | null;
  alreadyRecorded: boolean;
  isLoggedIn: boolean;
  /** Set when this conversation ended early and is being picked back up. */
  resume?: InterviewResume;
};

export default function InterviewRoom({
  token,
  guestName,
  topic,
  alreadyRecorded,
  isLoggedIn,
  resume,
}: Props) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<InterviewPhase>("idle");
  const [showWelcome, setShowWelcome] = useState(true);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [turns, setTurns] = useState<TurnDraft[]>(resume?.turns ?? []);
  const [elapsedMs, setElapsedMs] = useState(resume?.offsetMs ?? 0);
  const [liveAiText, setLiveAiText] = useState("");
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [greetingStarted, setGreetingStarted] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [wrappingUp, setWrappingUp] = useState(false);
  const clientRef = useRef<InterviewClient | null>(null);
  const micLevelRef = useRef(0);
  const userSpeakingRef = useRef(false);
  const userSpeakingTimeoutRef = useRef<number | null>(null);

  const begin = useCallback(() => {
    setErrorDetail(null);
    setGreetingStarted(false);
    document.documentElement.dataset.interviewLive = "true";
    const client = new InterviewClient(token, {
      onPhase: (p, detail) => {
        setPhase(p);
        if (detail) setErrorDetail(detail);
      },
      onTurns: (nextTurns) => {
        setTurns(nextTurns);
        if (nextTurns.some((turn) => turn.speaker === "ai")) {
          setGreetingStarted(true);
        }
      },
      onLiveAiText: (text) => {
        setLiveAiText(text);
        if (text) setGreetingStarted(true);
      },
      onAiSpeaking: (speaking) => {
        setAiSpeaking(speaking);
        if (speaking) setGreetingStarted(true);
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
  }, [token, resume]);

  useEffect(() => {
    return () => {
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
      <InterviewShell>
        <Sparkles className={`${theme.accentIcon} mx-auto mb-6 h-12 w-12`} />
        <h1 className={`${theme.heading} text-4xl sm:text-5xl`}>
          {t("interviewAlreadyTitle")}
        </h1>
        <p className={`${theme.body} mx-auto mt-4 max-w-xl text-xl leading-relaxed`}>
          {t("interviewAlreadyBody", { guestName })}
        </p>
      </InterviewShell>
    );
  }

  return (
    <InterviewShell>
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
              <button
                onClick={begin}
                className={theme.beginButton}
              >
                <Mic />
                <span>{t(resume ? "interviewContinue" : "interviewBegin")}</span>
              </button>
            </IntroScreen>
          )}
        {(phase === "mic" || phase === "connecting") && (
          <Screen key="connecting">
            <BreathingCircle
              aiSpeaking={false}
              userSpeaking={false}
              levelRef={micLevelRef}
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
                // When Rosie is quiet, the guest owns the turn—even during
                // the short pause before RNNoise has classified new speech.
                userSpeaking={!aiSpeaking}
                levelRef={micLevelRef}
              />
            </div>

            <p className={theme.liveLabel}>
              {aiSpeaking ? t("interviewAiSpeaking") : t("interviewListening")}
            </p>

            <AnimatePresence initial={false} mode="wait">
              {greetingStarted && !userSpeaking ? (
                <RotatingCaption
                  key="caption"
                  text={captionText}
                  speaking={aiSpeaking}
                />
              ) : null}
            </AnimatePresence>

            <div className={theme.actions}>
              <button
                onClick={() => {
                  setWrappingUp(true);
                  clientRef.current?.requestWrapUp();
                }}
                disabled={wrappingUp}
                className={theme.secondaryAction}
              >
                <Sparkles className="h-5 w-5" />
                {t("interviewWrap")}
              </button>
            </div>
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
                setGreetingStarted(false);
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
  const text = `Hi ${guestName}!`;

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

// The AI's transcript streams over the data channel far ahead of her voice, so
// the caption paces itself: text is wrapped to the lines that actually fit the
// container, and a window of them rotates forward with the estimated spoken
// position instead of dumping the whole reply at once.
const CAPTION_LINES = 2;
const CAPTION_CHARS_PER_SECOND = 15.5; // ~150 wpm TTS incl. spaces; tune by ear
const CAPTION_TICK_MS = 250;
const CAPTION_HEIGHT_REM = CAPTION_LINES * 1.5 * 1.45;

let measureCtx: CanvasRenderingContext2D | null = null;

/** Greedy word-wrap using real text metrics for the container's font. */
function wrapToLines(text: string, maxWidth: number, font: string): string[] {
  if (!text || maxWidth <= 0) return [];
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return [text];
  measureCtx.font = font;
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    const candidate = line ? `${line} ${word}` : word;
    if (line && measureCtx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function RotatingCaption({
  text,
  speaking,
}: {
  text: string;
  speaking: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<{
    width: number;
    font: string;
  } | null>(null);
  const [bottomLine, setBottomLine] = useState(0);
  const linesRef = useRef<string[]>([]);
  const prevLenRef = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const style = getComputedStyle(el);
      setMetrics({
        width: el.clientWidth,
        font: `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const lines = useMemo(
    () => (metrics ? wrapToLines(text, metrics.width, metrics.font) : []),
    [text, metrics]
  );
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  // The text was cleared or replaced (new response) — rewind to its start.
  useEffect(() => {
    if (text.length < prevLenRef.current) setBottomLine(0);
    prevLenRef.current = text.length;
  }, [text]);

  useEffect(() => {
    if (!speaking) return;
    const startedAt = performance.now();
    const tick = () => {
      const spokenChars =
        ((performance.now() - startedAt) / 1000) * CAPTION_CHARS_PER_SECOND;
      const wrapped = linesRef.current;
      let consumed = 0;
      let idx = 0;
      while (
        idx < wrapped.length - 1 &&
        consumed + wrapped[idx].length + 1 <= spokenChars
      ) {
        consumed += wrapped[idx].length + 1;
        idx++;
      }
      // Only ever advance, so the window never jumps backward.
      setBottomLine((prev) => Math.max(prev, idx));
    };
    tick();
    const id = setInterval(tick, CAPTION_TICK_MS);
    return () => clearInterval(id);
  }, [speaking]);

  const bottom = speaking
    ? Math.min(bottomLine, Math.max(0, lines.length - 1))
    : Math.max(0, lines.length - 1);
  const start = Math.max(0, bottom - CAPTION_LINES + 1);
  const visible = lines.slice(start, bottom + 1);

  return (
    <motion.div
      ref={containerRef}
      className={`${theme.caption} mx-auto mt-6 max-w-2xl overflow-hidden`}
      style={{ height: `${CAPTION_HEIGHT_REM}rem` }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: [0.45, 0, 0.55, 1] }}
    >
      {visible.map((line, i) => {
        const words = line.split(" ");
        return (
          <motion.p
            key={start + i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {words.map((word, wordIndex) => (
              <Fragment key={`${start + i}-${wordIndex}-${word}`}>
                <motion.span
                  className={theme.captionWord}
                  initial={{ opacity: 0, y: 5, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{
                    duration: 0.5,
                    delay: Math.min(wordIndex, 14) * 0.08,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  {word}
                </motion.span>
                {wordIndex < words.length - 1 ? " " : null}
              </Fragment>
            ))}
          </motion.p>
        );
      })}
    </motion.div>
  );
}

/**
 * Rosie becomes a five-bar microphone visualizer while the guest is speaking.
 */
function BreathingCircle({
  aiSpeaking,
  userSpeaking,
  levelRef,
}: {
  aiSpeaking: boolean;
  userSpeaking: boolean;
  levelRef: React.RefObject<number>;
}) {
  return (
    <div className={theme.orbStage}>
      <AnimatePresence initial={false} mode="wait">
        {userSpeaking ? (
          <MicVisualizer key="visualizer" levelRef={levelRef} />
        ) : (
          <motion.div
            key="orb"
            initial={{ opacity: 0, scale: 0.72 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scaleX: 0.3, scaleY: 1.12 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className={`${theme.orbCore} ${aiSpeaking ? theme.orbSpeaking : ""}`} />
          </motion.div>
        )}
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
