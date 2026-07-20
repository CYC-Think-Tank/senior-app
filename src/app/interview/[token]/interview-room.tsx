"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Mic, PhoneOff, Sparkles } from "lucide-react";
import {
  InterviewClient,
  type InterviewPhase,
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
};

export default function InterviewRoom({
  token,
  guestName,
  topic,
  alreadyRecorded,
}: Props) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<InterviewPhase>("idle");
  const [showWelcome, setShowWelcome] = useState(true);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [turns, setTurns] = useState<TurnDraft[]>([]);
  const [liveAiText, setLiveAiText] = useState("");
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [wrappingUp, setWrappingUp] = useState(false);
  const levelRef = useRef(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const clientRef = useRef<InterviewClient | null>(null);

  const begin = useCallback(() => {
    setErrorDetail(null);
    const client = new InterviewClient(token, {
      onPhase: (p, detail) => {
        setPhase(p);
        if (detail) setErrorDetail(detail);
      },
      onTurns: setTurns,
      onLiveAiText: setLiveAiText,
      onAiSpeaking: setAiSpeaking,
      onMeter: (level, elapsed) => {
        levelRef.current = level;
        setElapsedMs(elapsed);
      },
    });
    clientRef.current = client;
    void client.start();
  }, [token]);

  useEffect(() => {
    return () => {
      clientRef.current = null;
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
                {t("interviewHello", { guestName })}
              </p>
              <h1 className={`${theme.heading} mt-3 text-4xl sm:text-6xl`}>
                {t("interviewReady")} {t("interviewSomeStories")}
              </h1>
              {topic && (
                <p className={theme.topic}>
                  {t("interviewTopic", { topic })}
                </p>
              )}
              <p className={`${theme.body} mx-auto mt-6 max-w-xl text-lg leading-relaxed`}>
                {t("interviewIntro")}
              </p>
              <button
                onClick={begin}
                className={theme.beginButton}
              >
                <Mic />
                <span>{t("interviewBegin")}</span>
              </button>
            </IntroScreen>
          )}
        </AnimatePresence>

        {(phase === "mic" || phase === "connecting") && (
          <Screen key="connecting">
            <BreathingCircle levelRef={levelRef} aiSpeaking={false} idlePulse />
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
              <span className={`${theme.recordingDot} animate-pulse`} />
              {t("interviewRecording")} · {formatTimestamp(elapsedMs)}
            </div>

            <div className="my-10">
              <BreathingCircle levelRef={levelRef} aiSpeaking={aiSpeaking} />
            </div>

            <p className={theme.liveLabel}>
              {aiSpeaking ? t("interviewAiSpeaking") : t("interviewListening")}
            </p>

            <div className="mx-auto mt-6 min-h-24 max-w-2xl">
              {captionText && (
                <p className={theme.caption}>
                  {captionText.length > 220
                    ? `…${captionText.slice(-220)}`
                    : captionText}
                </p>
              )}
            </div>

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
                {wrappingUp ? t("interviewWrapBusy") : t("interviewWrap")}
              </button>
              <button
                onClick={() => void clientRef.current?.stop()}
                className={theme.primaryAction}
              >
                <PhoneOff className="h-5 w-5" />
                {t("interviewEndSave")}
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
              {t("interviewDone")}
            </p>
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
                setTurns([]);
                setWrappingUp(false);
              }}
              className={`${theme.retryButton} mx-auto mt-8`}
            >
              {t("commonTryAgain")}
            </button>
          </Screen>
        )}
      </>
    </InterviewShell>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return <div className={theme.screen}>{children}</div>;
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

/**
 * A soft breathing circle: swells with the guest's voice, glows ember while
 * the AI host is speaking.
 */
function BreathingCircle({
  levelRef,
  aiSpeaking,
  idlePulse = false,
}: {
  levelRef: React.RefObject<number>;
  aiSpeaking: boolean;
  idlePulse?: boolean;
}) {
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf: number;
    let smoothed = 0;
    const tick = () => {
      smoothed += ((levelRef.current ?? 0) - smoothed) * 0.2;
      if (innerRef.current) {
        const scale = 1 + Math.min(0.45, smoothed * 1.4);
        innerRef.current.style.transform = `scale(${scale})`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [levelRef]);

  return (
    <div className={theme.orbStage}>
      {aiSpeaking && (
        <motion.div
          className={theme.orbHalo}
          animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0.15, 0.6] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        />
      )}
      {idlePulse && (
        <motion.div
          className={theme.orbIdleHalo}
          animate={{ scale: [1, 1.12, 1] }}
          transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
        />
      )}
      <div
        ref={innerRef}
        className={`${theme.orbCore} ${
          aiSpeaking ? theme.orbSpeaking : ""
        }`}
        style={{ willChange: "transform" }}
      />
    </div>
  );
}
