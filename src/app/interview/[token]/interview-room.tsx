"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Mic, PhoneOff, Sparkles } from "lucide-react";
import {
  InterviewClient,
  type InterviewPhase,
} from "@/lib/realtime/interview-client";
import { HOST_NAME } from "@/lib/realtime/interviewer-prompt";
import type { TurnDraft } from "@/lib/types";
import { formatTimestamp } from "@/components/ui";

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
  const [phase, setPhase] = useState<InterviewPhase>("idle");
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

  const lastGuestTurn = [...turns].reverse().find((t) => t.speaker === "guest");
  const lastAiTurn = [...turns].reverse().find((t) => t.speaker === "ai");
  const captionText =
    liveAiText ||
    (aiSpeaking ? "" : lastAiTurn?.text ?? "") ||
    lastGuestTurn?.text ||
    "";

  if (alreadyRecorded && phase === "idle") {
    return (
      <Shell>
        <Sparkles className="mx-auto mb-6 h-12 w-12 text-ember" />
        <h1 className="font-serif text-4xl font-semibold sm:text-5xl">
          This chat is already saved
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-2xl leading-relaxed text-ink-soft">
          Thank you, {guestName}. Your stories from this conversation are safe
          with us.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <AnimatePresence mode="wait">
        {phase === "idle" && (
          <Screen key="idle">
            <p className="text-2xl text-ink-soft">Hello, {guestName}.</p>
            <h1 className="mt-3 font-serif text-4xl font-semibold leading-tight sm:text-6xl">
              Ready to share
              <br />
              some stories?
            </h1>
            {topic && (
              <p className="mx-auto mt-6 inline-block rounded-full bg-ember-soft px-6 py-2 text-xl text-ember-deep">
                Today we&apos;ll talk about {topic}
              </p>
            )}
            <p className="mx-auto mt-6 max-w-xl text-xl leading-relaxed text-ink-soft">
              {HOST_NAME}, your host, will ask the questions. Just speak
              naturally — there&apos;s nothing to read and nothing to type.
            </p>
            <button
              onClick={begin}
              className="mx-auto mt-10 flex h-40 w-40 flex-col items-center justify-center gap-2 rounded-full bg-ember text-cream shadow-lg shadow-ember/30 transition-transform hover:scale-105 hover:bg-ember-deep sm:h-48 sm:w-48"
            >
              <Mic className="h-12 w-12" />
              <span className="text-xl font-semibold">Begin</span>
            </button>
          </Screen>
        )}

        {(phase === "mic" || phase === "connecting") && (
          <Screen key="connecting">
            <BreathingCircle levelRef={levelRef} aiSpeaking={false} idlePulse />
            <h1 className="mt-10 font-serif text-3xl font-semibold sm:text-4xl">
              {phase === "mic"
                ? "Please allow the microphone…"
                : `Finding ${HOST_NAME}…`}
            </h1>
            <p className="mt-3 text-xl text-ink-soft">Just a moment.</p>
          </Screen>
        )}

        {phase === "live" && (
          <Screen key="live">
            <div className="flex items-center justify-center gap-3 text-lg text-ink-soft">
              <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-ember" />
              Recording · {formatTimestamp(elapsedMs)}
            </div>

            <div className="my-10">
              <BreathingCircle levelRef={levelRef} aiSpeaking={aiSpeaking} />
            </div>

            <p className="text-2xl font-medium text-ink">
              {aiSpeaking ? `${HOST_NAME} is speaking…` : "We're listening."}
            </p>

            <RotatingCaption text={captionText} speaking={aiSpeaking} />

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <button
                onClick={() => {
                  setWrappingUp(true);
                  clientRef.current?.requestWrapUp();
                }}
                disabled={wrappingUp}
                className="inline-flex items-center gap-3 rounded-2xl border-2 border-line bg-cream px-8 py-4 text-xl font-semibold text-ink transition-colors hover:bg-paper-deep disabled:opacity-50"
              >
                <Sparkles className="h-6 w-6 text-ember" />
                {wrappingUp ? `${HOST_NAME} is wrapping up…` : "Time to finish"}
              </button>
              <button
                onClick={() => void clientRef.current?.stop()}
                className="inline-flex items-center gap-3 rounded-2xl bg-ink px-8 py-4 text-xl font-semibold text-cream transition-colors hover:bg-ink/80"
              >
                <PhoneOff className="h-6 w-6" />
                End &amp; save
              </button>
            </div>
          </Screen>
        )}

        {phase === "uploading" && (
          <Screen key="uploading">
            <motion.div
              className="mx-auto h-16 w-16 rounded-full border-4 border-line border-t-ember"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            />
            <h1 className="mt-8 font-serif text-3xl font-semibold sm:text-4xl">
              Saving your stories…
            </h1>
            <p className="mt-3 text-xl text-ink-soft">
              Please keep this page open.
            </p>
          </Screen>
        )}

        {phase === "done" && (
          <Screen key="done">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-sage-soft">
              <Check className="h-12 w-12 text-sage" />
            </div>
            <h1 className="mt-8 font-serif text-4xl font-semibold sm:text-5xl">
              Thank you, {guestName}.
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-2xl leading-relaxed text-ink-soft">
              Your stories are saved. Your family is going to love this. You
              can close this page now.
            </p>
          </Screen>
        )}

        {phase === "error" && (
          <Screen key="error">
            <h1 className="font-serif text-3xl font-semibold sm:text-4xl">
              Something went wrong
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-xl leading-relaxed text-ink-soft">
              {errorDetail ?? "We couldn't connect. It's not your fault."}
            </p>
            <button
              onClick={() => {
                setPhase("idle");
                setTurns([]);
                setWrappingUp(false);
              }}
              className="mx-auto mt-8 rounded-2xl bg-ember px-8 py-4 text-xl font-semibold text-cream hover:bg-ember-deep"
            >
              Try again
            </button>
          </Screen>
        )}
      </AnimatePresence>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-3xl text-center">{children}</div>
    </main>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.35 }}
    >
      {children}
    </motion.div>
  );
}

// The AI's transcript streams over the data channel far ahead of her voice, so
// the caption paces itself: text is wrapped to the lines that actually fit the
// container, and a window of them rotates forward with the estimated spoken
// position instead of dumping the whole reply at once.
const CAPTION_LINES = 4;
const CAPTION_CHARS_PER_SECOND = 17; // ~150 wpm TTS incl. spaces; tune by ear
const CAPTION_TICK_MS = 250;

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
    <div
      ref={containerRef}
      className="mx-auto mt-6 min-h-24 max-w-2xl text-xl leading-relaxed text-ink-soft"
    >
      {visible.map((line, i) => (
        <motion.p
          key={start + i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {line}
        </motion.p>
      ))}
    </div>
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
    <div className="relative mx-auto flex h-44 w-44 items-center justify-center sm:h-52 sm:w-52">
      {aiSpeaking && (
        <motion.div
          className="absolute inset-0 rounded-full bg-ember/20"
          animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0.15, 0.6] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        />
      )}
      {idlePulse && (
        <motion.div
          className="absolute inset-0 rounded-full bg-paper-deep"
          animate={{ scale: [1, 1.12, 1] }}
          transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
        />
      )}
      <div
        ref={innerRef}
        className={`h-28 w-28 rounded-full transition-colors duration-500 sm:h-32 sm:w-32 ${
          aiSpeaking ? "bg-ember" : "bg-ember/70"
        }`}
        style={{ willChange: "transform" }}
      />
    </div>
  );
}
