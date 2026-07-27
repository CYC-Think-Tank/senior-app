"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { RAW_BUCKET } from "@/lib/constants";
import type { TurnDraft } from "@/lib/types";
import type { DenoiseState } from "@shiguredo/rnnoise-wasm";
import {
  findGuestFinishToolCall,
  getInterviewClosingInstructions,
  type GuestFinishToolCall,
  type InterviewClosingStyle,
} from "@/lib/realtime/interview-ending";

export type InterviewPhase =
  | "idle"
  | "mic"
  | "connecting"
  | "live"
  | "uploading"
  | "done"
  | "error";

/**
 * A conversation being picked back up: everything said in the earlier
 * sitting(s), and how long they ran for.
 */
export type InterviewResume = {
  turns: TurnDraft[];
  /**
   * Where this sitting sits on the conversation's timeline. The new audio is
   * appended to the earlier recording, so every timestamp from here on is
   * measured from the very beginning of the conversation.
   */
  offsetMs: number;
};

export type InterviewCallbacks = {
  onPhase: (phase: InterviewPhase, detail?: string) => void;
  onComplete: (shareToken: string) => void;
  /** All completed turns so far, sorted by start time. */
  onTurns: (turns: TurnDraft[]) => void;
  /** Streaming text of the AI's in-progress reply ("" when none). */
  onLiveAiText: (text: string) => void;
  onAiSpeaking: (speaking: boolean) => void;
  onWrapUpStarted: () => void;
  /** ~60fps: mic input level (0..1), elapsed recording ms, and RNNoise VAD. */
  onMeter: (level: number, elapsedMs: number, voiceActivity?: number) => void;
  /** ~60fps: the RMS level of Rosie's output audio (0..1). */
  onAiMeter: (level: number) => void;
};

// Wall-clock corrections for the realtime session's semantic VAD: events lag
// slightly behind the actual speech they describe.
const SPEECH_START_LEAD_MS = 400; // VAD detection + network lag behind true onset
const SPEECH_END_TRIM_MS = 250; // speech_stopped fires shortly after true end
const WRAP_UP_SILENCE_RMS = 0.003;
const WRAP_UP_SILENCE_MS = 3_000;
const WRAP_UP_PLAYBACK_TIMEOUT_MS = 60_000;
const WRAP_UP_WATCHDOG_POLL_MS = 200;

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
];

// The recording is uploaded in chunks while the interview runs, so a closed
// tab costs at most one chunk instead of the whole conversation. Ten seconds
// keeps the object count sane for an hour-long interview (~360 parts) while
// staying well inside what anyone would notice losing.
const PART_INTERVAL_MS = 10_000;
const PART_UPLOAD_RETRIES = 3;

// The transcript is checkpointed shortly after each new turn rather than on a
// fixed timer: turns land every 10-30s, so a timer would mostly send nothing.
const CHECKPOINT_DEBOUNCE_MS = 2_000;
// Heartbeat in between, so an abandoned session is distinguishable from a
// live one by how stale its last checkpoint is. The duration it carries is
// where a resumed sitting picks up the timeline, so a staler heartbeat means a
// wronger offset — kept well inside the staleness threshold (ABANDONED_AFTER_MS).
const CHECKPOINT_HEARTBEAT_MS = 15_000;

const KRISP_SDK_URL = "/krisp/krispsdk.mjs";
const KRISP_MODEL_BVC_URL = "/krisp/models/model_bvc.kef";
const KRISP_MODEL_8_URL = "/krisp/models/model_8.kef";
const KRISP_MODEL_NC_URL = "/krisp/models/model_nc.kef";
const KRISP_BVC_ALLOWED_DEVICES_URL = "/krisp/assets/bvc-allowed.txt";

type PendingAi = { start?: number; end?: number; text?: string; live: string };
type KrispFilterNode = AudioNode & {
  enable?: () => void;
  dispose?: () => void;
};
type KrispSdkInstance = {
  init: () => Promise<void>;
  dispose?: () => void;
  createNoiseFilter: (
    args: { audioContext: AudioContext; stream: MediaStream },
    onReady?: () => void,
    onDispose?: () => void
  ) => Promise<KrispFilterNode>;
};
type KrispSdkConstructor = {
  new (options: {
    params: {
      debugLogs: boolean;
      logProcessStats: boolean;
      useSharedArrayBuffer: boolean;
      useBVC: boolean;
      bufferOverflowMS: number;
      bufferDropMS: number;
      models: {
        modelBVC: { url: string; preload: boolean };
        model8: string;
        modelNC: string;
      };
      bvc: { allowedDevices: string };
    };
  }): KrispSdkInstance;
  isSupported?: () => boolean;
};

export class InterviewClient {
  private cb: InterviewCallbacks;
  private token: string;

  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private micStream: MediaStream | null = null;
  private processedMicStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private meterAnalyser: AnalyserNode | null = null;
  private aiMeterAnalyser: AnalyserNode | null = null;
  private rnnoiseState: DenoiseState | null = null;
  private krispSdk: KrispSdkInstance | null = null;
  private krispFilterNode: KrispFilterNode | null = null;
  private remoteAudioEl: HTMLAudioElement | null = null;

  private recorder: MediaRecorder | null = null;
  private mimeType = "";
  private recStartPerf: number | null = null;
  private recStopPerf: number | null = null;

  private partIndex = 0;
  /** Assigned by the server on the first chunk; groups this run's chunks. */
  private attemptId: number | null = null;
  /** Serialised so parts land in order and never race the live audio stream. */
  private uploadChain: Promise<void> = Promise.resolve();
  /** Chunks whose upload exhausted its retries; retried again before finalize. */
  private failedParts = new Map<number, Blob>();

  private checkpointTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private checkpointInFlight = false;
  private savedTurnCount = -1;
  private flushOnHide: (() => void) | null = null;

  private turns: TurnDraft[] = [];
  /**
   * How much conversation happened before this sitting. Taken from the last
   * checkpoint of the earlier one, so it can trail the true length of that
   * audio by up to a heartbeat plus the chunk that never made it up (~10-40s).
   * That shifts this sitting's timestamps uniformly, which only shows up in
   * admin cut-editing; measuring it exactly would mean stitching the earlier
   * recording before the guest is allowed to speak.
   */
  private offsetMs = 0;
  private guestTimings = new Map<string, { start: number; end?: number }>();
  private pendingAi = new Map<string, PendingAi>();
  private rafId: number | null = null;
  private starting = false;
  private stopped = false;
  private wrapUpRequested = false;
  private wrapUpResponseSent = false;
  private wrapUpResponseId: string | null = null;
  private wrapUpStopTimer: number | null = null;
  private wrapUpPlaybackWatchdogTimer: number | null = null;
  private wrapUpAudioStarted = false;
  private wrapUpStyle: InterviewClosingStyle = "warm_summary";
  private handledFinishCallIds = new Set<string>();
  private aiOutputPlaying = false;
  private activeResponseIds = new Set<string>();

  constructor(
    token: string,
    callbacks: InterviewCallbacks,
    resume?: InterviewResume
  ) {
    this.token = token;
    this.cb = callbacks;
    this.turns = resume ? [...resume.turns] : [];
    this.offsetMs = resume?.offsetMs ?? 0;
  }

  /** ms since the conversation started, earlier sittings included */
  private now(): number {
    if (this.recStartPerf === null) return this.offsetMs;
    return (
      this.offsetMs + (this.recStopPerf ?? performance.now()) - this.recStartPerf
    );
  }

  async start() {
    if (this.starting || this.pc || this.stopped) return;
    this.starting = true;

    try {
      this.cb.onPhase("mic");
      const KrispSDK = await this.loadKrispSDK();
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: KrispSDK
          ? {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
              channelCount: 1,
            }
          : {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: false,
              channelCount: 1,
            },
      });

      this.cb.onPhase("connecting");
      let clientSecret = await this.createClientSecret();

      // Mix mic + AI into one stream for recording.
      // RNNoise processes 10ms frames at 48kHz, so keep the analyser source
      // in the model's native sample rate where the browser supports it.
      this.audioCtx = new AudioContext({ sampleRate: 48_000 });
      await this.audioCtx.resume();
      const recordingDest = this.audioCtx.createMediaStreamDestination();
      const micSource = this.audioCtx.createMediaStreamSource(this.micStream);
      this.processedMicStream = await this.createProcessedMicStream({
        KrispSDK,
        micSource,
        recordingDest,
      });

      this.pc = new RTCPeerConnection();
      this.pc.addTrack(
        this.processedMicStream.getAudioTracks()[0],
        this.processedMicStream
      );

      this.pc.ontrack = (event) => {
        const remote = new MediaStream([event.track]);
        // Play the AI aloud…
        this.remoteAudioEl = new Audio();
        this.remoteAudioEl.srcObject = remote;
        this.remoteAudioEl.autoplay = true;
        // …and mix it into the recording.
        const remoteSource = this.audioCtx!.createMediaStreamSource(remote);
        remoteSource.connect(recordingDest);
        this.aiMeterAnalyser = this.audioCtx!.createAnalyser();
        this.aiMeterAnalyser.fftSize = 512;
        remoteSource.connect(this.aiMeterAnalyser);
      };

      this.pc.onconnectionstatechange = () => {
        const state = this.pc?.connectionState;
        console.info("Interview WebRTC state:", state);
        if (this.stopped) return;
        if (state === "failed" || state === "disconnected") {
          console.warn(
            "Interview WebRTC connection changed, but the app will not auto-end the interview:",
            state
          );
        }
      };

      this.dc = this.pc.createDataChannel("oai-events");
      this.dc.onmessage = (e) => this.handleEvent(e.data);
      this.dc.onclose = () => {
        if (!this.stopped) {
          console.warn("Interview data channel closed before the user ended.");
        }
      };
      this.dc.onerror = (event) => {
        console.warn("Interview data channel error:", event);
      };
      this.dc.onopen = () => {
        this.startRecorder(recordingDest.stream);
        this.cb.onPhase("live");
        // Config (persona, VAD, voice) is baked into the ephemeral session
        // server-side; we only need to ask the AI to open the conversation.
        this.dc!.send(JSON.stringify({ type: "response.create" }));
        this.startMeter();
      };

      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      // Model + session config are baked into the ephemeral secret; no
      // query params needed (and none that a stale page could get wrong).
      let sdpRes = await this.exchangeSdp(offer.sdp, clientSecret);

      // A Realtime client secret is tied to its session/call and cannot be
      // reused once a live call exists. If a duplicate or replayed request
      // consumes it first, mint one fresh secret and retry exactly once.
      if (sdpRes.status === 409) {
        console.warn(
          "Realtime client secret was already consumed; retrying with a fresh secret.",
        );
        clientSecret = await this.createClientSecret();
        sdpRes = await this.exchangeSdp(offer.sdp, clientSecret);
      }

      if (!sdpRes.ok) {
        const apiMessage = await this.readApiError(sdpRes);
        console.error("Realtime SDP exchange failed:", sdpRes.status, apiMessage);
        throw new Error(
          apiMessage ||
            `Could not reach the voice service (HTTP ${sdpRes.status}). Please try again.`
        );
      }
      await this.pc.setRemoteDescription({
        type: "answer",
        sdp: await sdpRes.text(),
      });
    } catch (err) {
      this.cleanup();
      this.cb.onPhase(
        "error",
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      this.starting = false;
    }
  }

  /** Every WebRTC attempt gets a newly minted, uncached ephemeral secret. */
  private async createClientSecret() {
    const res = await fetch("/api/realtime/session", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: this.token }),
    });
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(
        body?.error ?? "Could not start the interview session.",
      );
    }
    if (typeof body?.clientSecret !== "string" || !body.clientSecret) {
      throw new Error("The voice service returned an invalid session.");
    }

    return body.clientSecret;
  }

  private exchangeSdp(sdp: string | undefined, clientSecret: string) {
    return fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${clientSecret}`,
        "Content-Type": "application/sdp",
      },
      body: sdp,
    });
  }

  private async readApiError(response: Response) {
    try {
      const body = JSON.parse(await response.text());
      return (body?.error?.message as string | undefined) ?? "";
    } catch {
      return "";
    }
  }

  /** Close an unfinished connection without uploading a partial interview. */
  dispose() {
    if (this.stopped) return;
    this.stopped = true;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.cleanup();
  }

  private startRecorder(stream: MediaStream) {
    this.mimeType =
      MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    this.recorder = new MediaRecorder(stream, {
      ...(this.mimeType ? { mimeType: this.mimeType } : {}),
      audioBitsPerSecond: 128_000,
    });
    this.mimeType = this.recorder.mimeType || this.mimeType || "audio/webm";
    this.recorder.ondataavailable = (e) => {
      // Chunks go straight to storage — holding an hour of audio in memory is
      // both wasteful and exactly what a closed tab would throw away.
      if (e.data.size > 0) this.enqueuePart(e.data);
    };
    this.recorder.start(PART_INTERVAL_MS);
    this.recStartPerf = performance.now();
    this.startCheckpoints();
  }

  private enqueuePart(blob: Blob) {
    const index = this.partIndex++;
    this.uploadChain = this.uploadChain.then(() => this.uploadPart(index, blob));
  }

  /**
   * Uploads one chunk, retrying with backoff. A permanent failure is stashed
   * rather than thrown: a gap in the middle of the recording is recoverable,
   * a rejected upload chain that abandons every later chunk is not.
   */
  private async uploadPart(index: number, blob: Blob): Promise<void> {
    for (let retry = 0; retry <= PART_UPLOAD_RETRIES; retry++) {
      if (retry > 0) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** retry));
      }
      try {
        const res = await fetch(`/api/sessions/${this.token}/upload-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentType: this.mimeType,
            part: index,
            attempt: this.attemptId,
          }),
        });
        if (!res.ok) throw new Error(`upload-url returned ${res.status}`);
        const { path, uploadToken, attempt } = await res.json();
        // Remembered even if the upload below fails, so a chunk that never
        // lands cannot split the recording across two attempts.
        this.attemptId ??= attempt;

        const supabase = createSupabaseBrowserClient();
        const { error } = await supabase.storage
          .from(RAW_BUCKET)
          .uploadToSignedUrl(path, uploadToken, blob, {
            contentType: this.mimeType,
          });
        if (error) throw error;

        this.failedParts.delete(index);
        return;
      } catch (err) {
        if (retry === PART_UPLOAD_RETRIES) {
          console.warn(`Recording part ${index} failed to upload:`, err);
          this.failedParts.set(index, blob);
        }
      }
    }
  }

  /** Last chance for chunks that never made it up during the interview. */
  private async retryFailedParts() {
    const pending = [...this.failedParts.entries()];
    for (const [index, blob] of pending) {
      await this.uploadPart(index, blob);
    }
  }

  private async startMeter() {
    let rnnoiseFrameSize = 480;
    try {
      const { Rnnoise } = await import("@shiguredo/rnnoise-wasm");
      const rnnoise = await Rnnoise.load();
      if (this.stopped || !this.meterAnalyser) {
        return;
      }
      this.rnnoiseState = rnnoise.createDenoiseState();
      rnnoiseFrameSize = rnnoise.frameSize;
    } catch (error) {
      console.info("RNNoise VAD unavailable; using the browser mic meter.", error);
    }

    const meterData = new Float32Array(this.meterAnalyser!.fftSize);
    const aiMeterData = new Float32Array(512);
    const rnnoiseFrame = new Float32Array(rnnoiseFrameSize);
    let lastVoiceActivity = 0;
    let lastProcessedAt = 0;
    const tick = () => {
      if (!this.meterAnalyser || this.stopped) {
        return;
      }

      this.meterAnalyser.getFloatTimeDomainData(meterData);
      const rms = this.calculateRms(meterData);
      const level = Math.min(1, rms * 4);
      if (this.aiMeterAnalyser) {
        this.aiMeterAnalyser.getFloatTimeDomainData(aiMeterData);
        this.cb.onAiMeter(Math.min(1, this.calculateRms(aiMeterData) * 6));
      }
      const now = performance.now();

      // RNNoise expects one 10ms, 48kHz mono frame in 16-bit PCM units.
      // The returned value is a voice-activity probability from 0 to 1.
      if (this.rnnoiseState && now - lastProcessedAt >= 20) {
        for (let i = 0; i < rnnoiseFrame.length; i++) {
          rnnoiseFrame[i] = meterData[i] * 32768;
        }
        lastVoiceActivity = this.rnnoiseState.processFrame(rnnoiseFrame);
        lastProcessedAt = now;
      }

      this.cb.onMeter(
        level,
        this.now(),
        this.rnnoiseState ? lastVoiceActivity : undefined
      );
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private calculateRms(data: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      sum += v * v;
    }
    return Math.sqrt(sum / data.length);
  }

  private async loadKrispSDK(): Promise<KrispSdkConstructor | null> {
    try {
      const mod = (await import(
        /* webpackIgnore: true */ KRISP_SDK_URL
      )) as { default?: KrispSdkConstructor };
      const KrispSDK = mod.default;
      if (!KrispSDK) return null;
      if (KrispSDK.isSupported && !KrispSDK.isSupported()) {
        console.warn("Krisp SDK is not supported in this browser.");
        return null;
      }
      return KrispSDK;
    } catch (error) {
      console.info(
        "Krisp SDK not loaded; using browser microphone processing instead.",
        error
      );
      return null;
    }
  }

  private async createProcessedMicStream({
    KrispSDK,
    micSource,
    recordingDest,
  }: {
    KrispSDK: KrispSdkConstructor | null;
    micSource: MediaStreamAudioSourceNode;
    recordingDest: MediaStreamAudioDestinationNode;
  }): Promise<MediaStream> {
    const processedMicDest = this.audioCtx!.createMediaStreamDestination();
    this.meterAnalyser = this.audioCtx!.createAnalyser();
    this.meterAnalyser.fftSize = 512;

    if (!KrispSDK || !this.micStream) {
      micSource.connect(processedMicDest);
      micSource.connect(recordingDest);
      micSource.connect(this.meterAnalyser);
      return processedMicDest.stream;
    }

    try {
      this.krispSdk = new KrispSDK({
        params: {
          debugLogs: false,
          logProcessStats: false,
          useSharedArrayBuffer: false,
          useBVC: true,
          bufferOverflowMS: 200,
          bufferDropMS: 400,
          models: {
            modelBVC: { url: KRISP_MODEL_BVC_URL, preload: true },
            model8: KRISP_MODEL_8_URL,
            modelNC: KRISP_MODEL_NC_URL,
          },
          bvc: {
            allowedDevices: KRISP_BVC_ALLOWED_DEVICES_URL,
          },
        },
      });
      await this.krispSdk.init();
      this.krispFilterNode = await this.krispSdk.createNoiseFilter(
        {
          audioContext: this.audioCtx!,
          stream: this.micStream,
        },
        () => {
          this.krispFilterNode?.enable?.();
          console.info("Krisp BVC noise filter is ready.");
        },
        () => console.info("Krisp BVC noise filter disposed.")
      );
      this.krispFilterNode.addEventListener("error", (event) => {
        console.warn("Krisp filter error:", event);
      });
      this.krispFilterNode.addEventListener("buffer_overflow", (event) => {
        console.warn("Krisp filter buffer overflow:", event);
      });

      micSource.connect(this.krispFilterNode);
      this.krispFilterNode.connect(processedMicDest);
      this.krispFilterNode.connect(recordingDest);
      this.krispFilterNode.connect(this.meterAnalyser);
      return processedMicDest.stream;
    } catch (error) {
      console.warn(
        "Krisp filter failed to initialize; using unfiltered microphone stream.",
        error
      );
      micSource.connect(processedMicDest);
      micSource.connect(recordingDest);
      micSource.connect(this.meterAnalyser);
      return processedMicDest.stream;
    }
  }

  private handleEvent(raw: string) {
    let e: Record<string, unknown>;
    try {
      e = JSON.parse(raw);
    } catch {
      return;
    }
    const type = e.type as string;

    switch (type) {
      case "input_audio_buffer.speech_started": {
        const itemId = e.item_id as string;
        this.guestTimings.set(itemId, {
          start: Math.max(0, this.now() - SPEECH_START_LEAD_MS),
        });
        break;
      }
      case "input_audio_buffer.speech_stopped": {
        const t = this.guestTimings.get(e.item_id as string);
        if (t) t.end = Math.max(t.start + 300, this.now() - SPEECH_END_TRIM_MS);
        break;
      }
      case "conversation.item.input_audio_transcription.completed": {
        const text = ((e.transcript as string) ?? "").trim();
        if (!text) break;
        const t = this.guestTimings.get(e.item_id as string);
        const end = t?.end ?? this.now();
        const start = t?.start ?? Math.max(0, end - 3000);
        this.pushTurn({ speaker: "guest", text, startMs: start, endMs: end });
        break;
      }
      case "response.created": {
        const response = e.response as
          | { id?: string; metadata?: Record<string, string> | null }
          | undefined;
        const responseId = response?.id;
        if (responseId) {
          this.activeResponseIds.add(responseId);
          if (response.metadata?.purpose === "interview_wrap_up") {
            this.wrapUpResponseId = responseId;
          }
        }
        break;
      }
      case "output_audio_buffer.started": {
        const responseId = e.response_id as string;
        const p = this.getPendingAi(responseId);
        p.start = this.now();
        if (responseId === this.wrapUpResponseId) {
          this.wrapUpAudioStarted = true;
        }
        this.aiOutputPlaying = true;
        this.cb.onAiSpeaking(true);
        break;
      }
      case "output_audio_buffer.stopped": {
        const responseId = e.response_id as string;
        const p = this.getPendingAi(responseId);
        p.end = this.now();
        this.aiOutputPlaying = false;
        this.cb.onAiSpeaking(false);
        this.tryFinalizeAi(responseId);

        if (responseId === this.wrapUpResponseId) {
          // This is the authoritative WebRTC silence signal: the tagged
          // closing response has fully drained and no more audio is coming.
          this.clearWrapUpPlaybackWatchdog();
          this.scheduleWrapUpStop(900);
        } else {
          this.maybeSendWrapUpResponse();
        }
        break;
      }
      case "output_audio_buffer.cleared": {
        const responseId = e.response_id as string;
        const p = this.getPendingAi(responseId);
        p.end = this.now();
        this.aiOutputPlaying = false;
        this.cb.onAiSpeaking(false);
        this.tryFinalizeAi(responseId);
        // A cleared buffer was interrupted, not completed. Never treat it as
        // a successful closing; queue a fresh closing response instead.
        if (responseId === this.wrapUpResponseId) {
          this.clearWrapUpPlaybackWatchdog();
          this.wrapUpResponseId = null;
          this.wrapUpResponseSent = false;
          this.wrapUpAudioStarted = false;
        }
        this.maybeSendWrapUpResponse();
        break;
      }
      // GA event name, with the beta name kept as a fallback.
      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta": {
        const p = this.getPendingAi(e.response_id as string);
        p.live += (e.delta as string) ?? "";
        this.cb.onLiveAiText(p.live);
        break;
      }
      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done": {
        const p = this.getPendingAi(e.response_id as string);
        const transcript = ((e.transcript as string) ?? "").trim();
        p.text = p.text ? `${p.text} ${transcript}` : transcript;
        this.tryFinalizeAi(e.response_id as string);
        break;
      }
      case "response.done": {
        const response = e.response as
          | {
              id?: string;
              status?: string;
              metadata?: Record<string, string> | null;
              output?: unknown[];
            }
          | undefined;
        const responseId = response?.id;
        if (responseId) {
          this.activeResponseIds.delete(responseId);
          if (
            response.metadata?.purpose === "interview_wrap_up" &&
            !this.wrapUpResponseId
          ) {
            this.wrapUpResponseId = responseId;
          }
          if (
            responseId === this.wrapUpResponseId &&
            response.status === "completed"
          ) {
            // `output_audio_buffer.stopped` is the primary completion event.
            // Keep an analyser-based fallback because losing that one event
            // would otherwise leave the interview live forever.
            this.startWrapUpPlaybackWatchdog();
          }
        }
        if (response?.status === "completed") {
          const finishCall = findGuestFinishToolCall(response);
          if (finishCall) this.handleGuestFinishToolCall(finishCall);
        }
        // response.done precedes WebRTC playback completion. It may allow a
        // queued closing to start, but it must never end the interview.
        this.maybeSendWrapUpResponse();
        break;
      }
      case "response.output_audio.done":
      case "response.audio.done": {
        // Audio generation is complete, but the browser may still be playing
        // buffered speech. Wait for output_audio_buffer.stopped instead.
        break;
      }
      case "error": {
        console.warn("Realtime error event:", e);
        break;
      }
    }
  }

  private getPendingAi(responseId: string): PendingAi {
    let p = this.pendingAi.get(responseId);
    if (!p) {
      p = { live: "" };
      this.pendingAi.set(responseId, p);
    }
    return p;
  }

  private tryFinalizeAi(responseId: string) {
    const p = this.pendingAi.get(responseId);
    if (!p || !p.text || p.end === undefined) return;
    this.pendingAi.delete(responseId);
    this.cb.onLiveAiText("");
    this.pushTurn({
      speaker: "ai",
      text: p.text,
      startMs: p.start ?? Math.max(0, p.end - 2000),
      endMs: p.end,
    });
  }

  private pushTurn(turn: TurnDraft) {
    this.turns.push(turn);
    this.turns.sort((a, b) => a.startMs - b.startMs);
    this.cb.onTurns([...this.turns]);
    this.scheduleCheckpoint();
  }

  private startCheckpoints() {
    this.heartbeatTimer = window.setInterval(() => {
      void this.checkpoint();
    }, CHECKPOINT_HEARTBEAT_MS);

    // Tab close, navigation, backgrounding on iOS: the last window in which
    // anything can still be sent. `pagehide` is the one Safari reliably fires.
    this.flushOnHide = ((event: Event) => {
      if (event.type === "pagehide" || document.visibilityState === "hidden") {
        this.checkpointBeacon();
      }
    }) as () => void;
    window.addEventListener("pagehide", this.flushOnHide);
    document.addEventListener("visibilitychange", this.flushOnHide);
  }

  private scheduleCheckpoint() {
    if (this.stopped || this.checkpointTimer !== null) return;
    this.checkpointTimer = window.setTimeout(() => {
      this.checkpointTimer = null;
      void this.checkpoint();
    }, CHECKPOINT_DEBOUNCE_MS);
  }

  /**
   * Saves the transcript so far. Turns are re-sent whole (the sort in
   * `pushTurn` can renumber earlier ones), but only when the count changed —
   * otherwise this is a bare heartbeat. Never sends an empty transcript: on a
   * conversation nobody has spoken in yet there is nothing to save, and the
   * count only ever grows from here.
   */
  private async checkpoint() {
    if (this.checkpointInFlight) return;
    const count = this.turns.length;
    this.checkpointInFlight = true;
    try {
      const res = await fetch(`/api/sessions/${this.token}/checkpoint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: this.checkpointBody(count > 0 && count > this.savedTurnCount),
      });
      if (res.ok) this.savedTurnCount = count;
    } catch (err) {
      // Offline or the tab is going away; the next checkpoint will catch up.
      console.info("Interview checkpoint failed:", err);
    } finally {
      this.checkpointInFlight = false;
    }
  }

  /** Fire-and-forget flush that survives the page being torn down. */
  private checkpointBeacon() {
    if (this.stopped || this.turns.length === 0) return;
    const url = `/api/sessions/${this.token}/checkpoint`;
    const body = this.checkpointBody(true);
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon?.(url, blob)) return;
    try {
      // `keepalive` caps the body at 64KB; a transcript that long has already
      // been checkpointed repeatedly, so losing this last flush is survivable.
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    } catch {
      // Nothing left to try.
    }
  }

  private checkpointBody(includeTurns: boolean): string {
    return JSON.stringify({
      durationMs: Math.round(this.now()),
      ...(includeTurns ? { turns: this.turns } : {}),
    });
  }

  private stopCheckpoints() {
    if (this.checkpointTimer !== null) {
      window.clearTimeout(this.checkpointTimer);
      this.checkpointTimer = null;
    }
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.flushOnHide) {
      window.removeEventListener("pagehide", this.flushOnHide);
      document.removeEventListener("visibilitychange", this.flushOnHide);
      this.flushOnHide = null;
    }
  }

  /** The guest pressed the finish button; deliver a warm closing, then end. */
  requestWrapUp() {
    this.beginWrapUp("warm_summary");
  }

  private beginWrapUp(style: InterviewClosingStyle) {
    if (this.stopped || this.wrapUpRequested) return false;
    this.wrapUpRequested = true;
    this.wrapUpAudioStarted = false;
    this.wrapUpStyle = style;
    this.cb.onWrapUpStarted();

    // Prevent a new guest turn from interrupting or racing Rosie's closing.
    this.processedMicStream?.getAudioTracks().forEach((track) => {
      track.enabled = false;
    });
    this.maybeSendWrapUpResponse();
    return true;
  }

  private handleGuestFinishToolCall(call: GuestFinishToolCall) {
    if (
      this.stopped ||
      this.handledFinishCallIds.has(call.callId) ||
      this.dc?.readyState !== "open"
    ) {
      return;
    }

    this.handledFinishCallIds.add(call.callId);
    const accepted = call.reason !== null && !this.wrapUpRequested;
    this.dc.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: call.callId,
          output: JSON.stringify({
            accepted,
            ...(accepted
              ? { reason: call.reason }
              : {
                  error: call.reason
                    ? "The interview is already ending."
                    : "The finish reason was invalid.",
                }),
          }),
        },
      })
    );

    if (accepted) {
      this.beginWrapUp("brief_goodbye");
      return;
    }

    // A malformed call would otherwise leave the model waiting for a new
    // response forever. Recover without ending or suggesting that it ended.
    if (!this.wrapUpRequested && call.reason === null) {
      this.dc.send(
        JSON.stringify({
          type: "response.create",
          response: {
            tool_choice: "none",
            instructions:
              "The application did not accept the finish request. Continue the interview naturally from the guest's last turn. Do not say goodbye or imply that the conversation is ending.",
          },
        })
      );
    }
  }

  private maybeSendWrapUpResponse() {
    if (
      !this.wrapUpRequested ||
      this.wrapUpResponseSent ||
      this.stopped ||
      this.aiOutputPlaying ||
      this.activeResponseIds.size > 0 ||
      this.dc?.readyState !== "open"
    ) {
      return;
    }

    this.wrapUpResponseSent = true;
    this.dc?.send(
      JSON.stringify({
        type: "response.create",
        response: {
          metadata: {
            purpose: "interview_wrap_up",
            style: this.wrapUpStyle,
          },
          tool_choice: "none",
          instructions: getInterviewClosingInstructions(this.wrapUpStyle),
        },
      })
    );
  }

  /** Stop the interview, upload the recording, and finalize the session. */
  async stop() {
    if (this.stopped) return;
    this.clearWrapUpStopTimer();
    this.clearWrapUpPlaybackWatchdog();
    this.stopped = true;
    this.cb.onPhase("uploading");
    this.cb.onAiSpeaking(false);
    this.cb.onLiveAiText("");
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);

    try {
      // Flush the recorder before tearing the connection down.
      if (this.recorder && this.recorder.state !== "inactive") {
        await new Promise<void>((resolve) => {
          this.recorder!.onstop = () => resolve();
          this.recorder!.stop();
        });
      }
      this.recStopPerf = performance.now();
      const durationMs = Math.round(this.now());
      this.cleanup();

      if (this.partIndex === 0) {
        throw new Error("No audio was recorded.");
      }

      // Most of the recording is already in storage; this waits for the tail.
      await this.uploadChain;
      await this.retryFailedParts();
      if (this.failedParts.size > 0) {
        console.warn(
          `${this.failedParts.size} recording part(s) could not be uploaded.`
        );
      }

      const finRes = await fetch(`/api/sessions/${this.token}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          durationMs,
          turns: this.turns,
        }),
      });
      const result = await finRes.json().catch(() => null);
      if (!finRes.ok) {
        throw new Error(result?.error ?? "Saving the transcript failed.");
      }
      if (typeof result?.shareToken !== "string" || !result.shareToken) {
        throw new Error("The conversation was saved without a share link.");
      }

      this.cb.onComplete(result.shareToken);
      this.cb.onPhase("done");
    } catch (err) {
      this.cb.onPhase(
        "error",
        err instanceof Error ? err.message : "Saving the recording failed."
      );
    }
  }

  private cleanup() {
    this.clearWrapUpStopTimer();
    this.stopCheckpoints();
    this.clearWrapUpPlaybackWatchdog();
    this.dc?.close();
    this.pc?.close();
    this.krispFilterNode?.dispose?.();
    this.krispSdk?.dispose?.();
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.processedMicStream?.getTracks().forEach((t) => t.stop());
    if (this.remoteAudioEl) this.remoteAudioEl.srcObject = null;
    void this.audioCtx?.close().catch(() => {});
    this.dc = null;
    this.pc = null;
    this.micStream = null;
    this.processedMicStream = null;
    this.audioCtx = null;
    this.meterAnalyser = null;
    this.aiMeterAnalyser = null;
    this.rnnoiseState?.destroy();
    this.rnnoiseState = null;
    this.krispFilterNode = null;
    this.krispSdk = null;
  }

  private clearWrapUpStopTimer() {
    if (this.wrapUpStopTimer !== null) {
      window.clearTimeout(this.wrapUpStopTimer);
      this.wrapUpStopTimer = null;
    }
  }

  private clearWrapUpPlaybackWatchdog() {
    if (this.wrapUpPlaybackWatchdogTimer !== null) {
      window.clearTimeout(this.wrapUpPlaybackWatchdogTimer);
      this.wrapUpPlaybackWatchdogTimer = null;
    }
  }

  private startWrapUpPlaybackWatchdog() {
    if (this.wrapUpPlaybackWatchdogTimer !== null || this.stopped) return;

    const startedAt = performance.now();
    let silentSince: number | null = null;
    const samples = new Float32Array(512);

    const poll = () => {
      if (this.stopped || !this.wrapUpResponseId) {
        this.wrapUpPlaybackWatchdogTimer = null;
        return;
      }

      const now = performance.now();
      if (now - startedAt >= WRAP_UP_PLAYBACK_TIMEOUT_MS) {
        this.wrapUpPlaybackWatchdogTimer = null;
        this.scheduleWrapUpStop(0);
        return;
      }

      if (this.aiMeterAnalyser && this.wrapUpAudioStarted) {
        this.aiMeterAnalyser.getFloatTimeDomainData(samples);
        if (this.calculateRms(samples) > WRAP_UP_SILENCE_RMS) {
          silentSince = null;
        } else {
          silentSince ??= now;
          if (now - silentSince >= WRAP_UP_SILENCE_MS) {
            this.wrapUpPlaybackWatchdogTimer = null;
            this.scheduleWrapUpStop(300);
            return;
          }
        }
      }

      this.wrapUpPlaybackWatchdogTimer = window.setTimeout(
        poll,
        WRAP_UP_WATCHDOG_POLL_MS
      );
    };

    this.wrapUpPlaybackWatchdogTimer = window.setTimeout(
      poll,
      WRAP_UP_WATCHDOG_POLL_MS
    );
  }

  private scheduleWrapUpStop(delayMs: number) {
    this.clearWrapUpStopTimer();
    this.wrapUpStopTimer = window.setTimeout(() => {
      void this.stop();
    }, delayMs);
  }
}
