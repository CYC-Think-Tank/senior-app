"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { RAW_BUCKET } from "@/lib/constants";
import type { TurnDraft } from "@/lib/types";

export type InterviewPhase =
  | "idle"
  | "mic"
  | "connecting"
  | "live"
  | "uploading"
  | "done"
  | "error";

export type InterviewCallbacks = {
  onPhase: (phase: InterviewPhase, detail?: string) => void;
  /** All completed turns so far, sorted by start time. */
  onTurns: (turns: TurnDraft[]) => void;
  /** Streaming text of the AI's in-progress reply ("" when none). */
  onLiveAiText: (text: string) => void;
  onAiSpeaking: (speaking: boolean) => void;
  /** ~60fps: mic input level (0..1) and elapsed recording ms. */
  onMeter: (level: number, elapsedMs: number) => void;
};

// Wall-clock corrections for the realtime session's semantic VAD: events lag
// slightly behind the actual speech they describe.
const SPEECH_START_LEAD_MS = 400; // VAD detection + network lag behind true onset
const SPEECH_END_TRIM_MS = 250; // speech_stopped fires shortly after true end

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
];

type PendingAi = { start?: number; end?: number; text?: string; live: string };

export class InterviewClient {
  private cb: InterviewCallbacks;
  private token: string;

  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private micStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private remoteAudioEl: HTMLAudioElement | null = null;

  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mimeType = "";
  private recStartPerf: number | null = null;
  private recStopPerf: number | null = null;

  private turns: TurnDraft[] = [];
  private guestTimings = new Map<string, { start: number; end?: number }>();
  private pendingAi = new Map<string, PendingAi>();
  private rafId: number | null = null;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(token: string, callbacks: InterviewCallbacks) {
    this.token = token;
    this.cb = callbacks;
  }

  /** ms since recording started */
  private now(): number {
    if (this.recStartPerf === null) return 0;
    return (this.recStopPerf ?? performance.now()) - this.recStartPerf;
  }

  async start() {
    try {
      this.cb.onPhase("mic");
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.cb.onPhase("connecting");
      const res = await fetch("/api/realtime/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: this.token }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not start the interview session.");
      }
      const { clientSecret } = await res.json();

      // Mix mic + AI into one stream for recording.
      this.audioCtx = new AudioContext();
      await this.audioCtx.resume();
      const dest = this.audioCtx.createMediaStreamDestination();
      const micSource = this.audioCtx.createMediaStreamSource(this.micStream);
      micSource.connect(dest);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      micSource.connect(this.analyser);

      this.pc = new RTCPeerConnection();
      this.pc.addTrack(this.micStream.getAudioTracks()[0], this.micStream);

      this.pc.ontrack = (event) => {
        const remote = new MediaStream([event.track]);
        // Play the AI aloud…
        this.remoteAudioEl = new Audio();
        this.remoteAudioEl.srcObject = remote;
        this.remoteAudioEl.autoplay = true;
        // …and mix it into the recording.
        this.audioCtx!.createMediaStreamSource(remote).connect(dest);
      };

      this.pc.onconnectionstatechange = () => {
        const state = this.pc?.connectionState;
        console.info("Interview WebRTC state:", state);
        if (this.stopped || this.recStartPerf === null) return;
        if (state === "failed") {
          // Unrecoverable: save what we have.
          void this.stop();
        } else if (state === "disconnected") {
          // Usually a transient network blip — only save if it doesn't
          // recover within the grace period.
          this.disconnectTimer ??= setTimeout(() => {
            this.disconnectTimer = null;
            if (!this.stopped && this.pc?.connectionState !== "connected") {
              void this.stop();
            }
          }, 10_000);
        } else if (state === "connected" && this.disconnectTimer) {
          clearTimeout(this.disconnectTimer);
          this.disconnectTimer = null;
        }
      };

      this.dc = this.pc.createDataChannel("oai-events");
      this.dc.onmessage = (e) => this.handleEvent(e.data);
      this.dc.onopen = () => {
        this.startRecorder(dest.stream);
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
      const sdpRes = await fetch(
        "https://api.openai.com/v1/realtime/calls",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${clientSecret}`,
            "Content-Type": "application/sdp",
          },
          body: offer.sdp,
        }
      );
      if (!sdpRes.ok) {
        let apiMessage = "";
        try {
          const body = JSON.parse(await sdpRes.text());
          apiMessage = body?.error?.message ?? "";
        } catch {
          // Non-JSON error body; fall through to the generic message.
        }
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
    }
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
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(5000);
    this.recStartPerf = performance.now();
  }

  private startMeter() {
    const data = new Uint8Array(this.analyser!.fftSize);
    const tick = () => {
      if (!this.analyser || this.stopped) return;
      this.analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      this.cb.onMeter(Math.min(1, rms * 4), this.now());
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
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
      case "output_audio_buffer.started": {
        const p = this.getPendingAi(e.response_id as string);
        p.start = this.now();
        this.cb.onAiSpeaking(true);
        break;
      }
      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared": {
        const p = this.getPendingAi(e.response_id as string);
        p.end = this.now();
        this.cb.onAiSpeaking(false);
        this.tryFinalizeAi(e.response_id as string);
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
  }

  /** Ask the AI to deliver its warm closing; the user ends after it finishes. */
  requestWrapUp() {
    this.dc?.send(
      JSON.stringify({
        type: "response.create",
        response: {
          instructions:
            "The conversation is ending now. Deliver your warm closing: reflect back one or two highlights from today in the guest's own words, thank them by name, and say goodbye. Keep it under 45 seconds.",
        },
      })
    );
  }

  /** Stop the interview, upload the recording, and finalize the session. */
  async stop() {
    if (this.stopped) return;
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

      if (this.chunks.length === 0) {
        throw new Error("No audio was recorded.");
      }
      const blob = new Blob(this.chunks, { type: this.mimeType });

      const urlRes = await fetch(`/api/sessions/${this.token}/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: this.mimeType }),
      });
      if (!urlRes.ok) throw new Error("Could not prepare the upload.");
      const { path, uploadToken } = await urlRes.json();

      const supabase = createSupabaseBrowserClient();
      const { error: uploadError } = await supabase.storage
        .from(RAW_BUCKET)
        .uploadToSignedUrl(path, uploadToken, blob, {
          contentType: this.mimeType,
        });
      if (uploadError) throw new Error("Uploading the recording failed.");

      const finRes = await fetch(`/api/sessions/${this.token}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioPath: path,
          durationMs,
          turns: this.turns,
        }),
      });
      if (!finRes.ok) throw new Error("Saving the transcript failed.");

      this.cb.onPhase("done");
    } catch (err) {
      this.cb.onPhase(
        "error",
        err instanceof Error ? err.message : "Saving the recording failed."
      );
    }
  }

  private cleanup() {
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
    this.dc?.close();
    this.pc?.close();
    this.micStream?.getTracks().forEach((t) => t.stop());
    if (this.remoteAudioEl) this.remoteAudioEl.srcObject = null;
    void this.audioCtx?.close().catch(() => {});
    this.dc = null;
    this.pc = null;
    this.micStream = null;
    this.audioCtx = null;
    this.analyser = null;
  }
}
