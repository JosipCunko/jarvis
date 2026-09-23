"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { acceptSpeech, browserSpeechLang, type SpeechLanguage } from "@/app/_lib/speech-lang";
import { useSpeechRecognition } from "@/app/_lib/use-speech-recognition";

const SILENCE_MS = 2000;
const HOLDING_MS = 400;
const MAX_UTTERANCE_MS = 45_000;
const POLL_MS = 50;
const MIN_SPEECH_MS = 160;

export type VoicePhase = "idle" | "listening" | "holding" | "transcribing";

function rms(analyser: AnalyserNode, buffer: Uint8Array<ArrayBuffer>) {
  analyser.getByteTimeDomainData(buffer);
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    const sample = (buffer[i] - 128) / 128;
    sum += sample * sample;
  }
  return Math.sqrt(sum / buffer.length);
}

function tuneAnalyser(analyser: AnalyserNode) {
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.5;
  analyser.minDecibels = -95;
  analyser.maxDecibels = -30;
}

function recorderMime() {
  if (typeof MediaRecorder === "undefined") return "";
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  return "";
}

export function useVoiceSession({
  cloud,
  onTranscript,
  onInterim,
  onError,
  onNotice,
  onRejected,
}: {
  cloud: boolean;
  onTranscript: (text: string, language: SpeechLanguage) => void;
  onInterim?: (text: string) => void;
  onError?: (message: string) => void;
  onNotice?: (message: string) => void;
  onRejected?: () => void;
}) {
  const cloudRef = useRef(cloud);
  const warnedRef = useRef(false);
  const startingRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  const onInterimRef = useRef(onInterim);
  const onErrorRef = useRef(onError);
  const onNoticeRef = useRef(onNotice);
  const onRejectedRef = useRef(onRejected);
  cloudRef.current = cloud;
  onTranscriptRef.current = onTranscript;
  onInterimRef.current = onInterim;
  onErrorRef.current = onError;
  onNoticeRef.current = onNotice;
  onRejectedRef.current = onRejected;

  const deliverTranscript = (text: string) => {
    const accepted = acceptSpeech(text);
    if (!accepted) {
      onRejectedRef.current?.();
      onNoticeRef.current?.("Croatian or English wasn't recognized.");
      return;
    }
    onTranscriptRef.current(accepted.text, accepted.language);
  };

  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [heardSpeech, setHeardSpeech] = useState(false);
  const phaseRef = useRef<VoicePhase>("idle");
  const heardRef = useRef(false);
  const commitLockRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const pollRef = useRef<number | null>(null);
  const speechStartedAtRef = useRef(0);

  const setPhaseSafe = useCallback((next: VoicePhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, [setPhase]);

  const speech = useSpeechRecognition({
    onInterim(text) {
      if (cloudRef.current) return;
      onInterimRef.current?.(text);
    },
    onUtterance(text) {
      if (cloudRef.current) return;
      speechStopRef.current();
      deliverTranscript(text);
    },
    onError(message) {
      if (cloudRef.current) return;
      onErrorRef.current?.(message);
    },
  });

  const speechStopRef = useRef(speech.stop);
  const speechFlushRef = useRef(speech.flush);
  const speechStartRef = useRef(speech.start);
  speechStopRef.current = speech.stop;
  speechFlushRef.current = speech.flush;
  speechStartRef.current = speech.start;

  const releaseCloud = useCallback(() => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.onstop = null;
        recorder.stop();
      } catch {
        /* already stopped */
      }
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const context = contextRef.current;
    contextRef.current = null;
    analyserRef.current = null;
    if (context && context.state !== "closed") void context.close();
    chunksRef.current = [];
    heardRef.current = false;
    setHeardSpeech(false);
    speechStartedAtRef.current = 0;
  }, [setHeardSpeech]);

  const cancelCloud = useCallback(() => {
    if (commitLockRef.current) return;
    releaseCloud();
    setPhaseSafe("idle");
  }, [releaseCloud, setPhaseSafe]);

  const commitCloud = useCallback(async () => {
    if (commitLockRef.current) return;
    if (!heardRef.current) {
      cancelCloud();
      return;
    }
    commitLockRef.current = true;
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setPhaseSafe("transcribing");

    const recorder = recorderRef.current;
    const chunks = chunksRef.current;
    let blob = new Blob(chunks, { type: recorder?.mimeType || "audio/webm" });
    if (recorder && recorder.state !== "inactive") {
      blob = await new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          resolve(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
        };
        try {
          recorder.stop();
        } catch {
          resolve(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
        }
      });
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const context = contextRef.current;
    contextRef.current = null;
    analyserRef.current = null;
    if (context && context.state !== "closed") void context.close();

    try {
      if (blob.size < 800) return;
      const ext = blob.type.includes("mp4") ? "m4a" : "webm";
      const body = new FormData();
      body.append(
        "audio",
        new File([blob], `speech.${ext}`, { type: blob.type || "audio/webm" }),
      );
      const response = await fetch("/api/speech/transcribe", { method: "POST", body });
      const data = (await response.json().catch(() => null)) as {
        text?: string;
        language?: string | null;
        rejected?: string;
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        throw new Error(data?.error?.message ?? "Speech transcription failed.");
      }
      if (data?.rejected === "language") {
        onRejectedRef.current?.();
        onNoticeRef.current?.("Croatian or English wasn't recognized.");
        return;
      }
      const text = data?.text?.trim() ?? "";
      if (!text) {
        onNoticeRef.current?.("I didn't catch that. Try again.");
        return;
      }
      deliverTranscript(text);
    } catch (error) {
      onErrorRef.current?.(
        error instanceof Error ? error.message : "Speech transcription failed.",
      );
    } finally {
      chunksRef.current = [];
      heardRef.current = false;
      setHeardSpeech(false);
      speechStartedAtRef.current = 0;
      commitLockRef.current = false;
      setPhaseSafe("idle");
    }
  }, [cancelCloud, setHeardSpeech, setPhaseSafe]);

  const startCloud = useCallback(async () => {
    if (phaseRef.current !== "idle" || commitLockRef.current || startingRef.current) {
      return phaseRef.current !== "idle";
    }
    startingRef.current = true;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      startingRef.current = false;
      onErrorRef.current?.("Speech recognition needs Chrome or Edge on this device.");
      return false;
    }
    const mime = recorderMime();
    if (!mime || typeof MediaRecorder === "undefined") {
      startingRef.current = false;
      onErrorRef.current?.("Speech recognition needs Chrome or Edge on this device.");
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      if (phaseRef.current !== "idle") {
        stream.getTracks().forEach((track) => track.stop());
        return true;
      }
      const context = new AudioContext();
      if (context.state === "suspended") await context.resume();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      tuneAnalyser(analyser);
      source.connect(analyser);
      analyserRef.current = analyser;
      const samples = new Uint8Array(analyser.fftSize) as Uint8Array<ArrayBuffer>;
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.start(250);
      streamRef.current = stream;
      contextRef.current = context;
      recorderRef.current = recorder;
      heardRef.current = false;
      setHeardSpeech(false);
      speechStartedAtRef.current = 0;
      setPhaseSafe("listening");

      let noise = 0.008;
      let speechRun = 0;
      let silenceRun = 0;
      pollRef.current = window.setInterval(() => {
        if (commitLockRef.current || phaseRef.current === "idle") return;
        const level = rms(analyser, samples);
        const threshold = Math.min(0.08, Math.max(0.012, noise * 3));
        if (level < threshold) noise = noise * 0.95 + level * 0.05;
        if (level > threshold) {
          speechRun += POLL_MS;
          silenceRun = 0;
          if (speechRun >= MIN_SPEECH_MS && !heardRef.current) {
            heardRef.current = true;
            setHeardSpeech(true);
            speechStartedAtRef.current = Date.now();
          }
          if (phaseRef.current === "holding") setPhaseSafe("listening");
        } else if (heardRef.current) {
          speechRun = 0;
          silenceRun += POLL_MS;
          if (silenceRun >= HOLDING_MS && phaseRef.current === "listening") {
            setPhaseSafe("holding");
          }
          if (silenceRun >= SILENCE_MS) void commitCloud();
        } else {
          speechRun = 0;
        }
        if (
          heardRef.current &&
          speechStartedAtRef.current &&
          Date.now() - speechStartedAtRef.current >= MAX_UTTERANCE_MS
        ) {
          void commitCloud();
        }
      }, POLL_MS);
      return true;
    } catch (error) {
      releaseCloud();
      setPhaseSafe("idle");
      const denied =
        error instanceof DOMException &&
        (error.name === "NotAllowedError" || error.name === "SecurityError");
      onErrorRef.current?.(
        denied
          ? "Microphone access was blocked. Allow the mic for this site and try again."
          : "Could not start the microphone.",
      );
      return false;
    } finally {
      startingRef.current = false;
    }
  }, [commitCloud, releaseCloud, setHeardSpeech, setPhaseSafe]);

  const start = useCallback(async () => {
    if (cloudRef.current) return startCloud();
    if (!warnedRef.current) {
      warnedRef.current = true;
      onNoticeRef.current?.(
        "Auto-detect is unavailable without an OpenRouter or OpenAI key. Listening in your browser language.",
      );
    }
    return speechStartRef.current({ lang: browserSpeechLang(), continuous: true });
  }, [startCloud]);

  const cancel = useCallback(() => {
    if (cloudRef.current) {
      cancelCloud();
      return;
    }
    speechStopRef.current();
  }, [cancelCloud]);

  const commit = useCallback(() => {
    if (cloudRef.current) {
      void commitCloud();
      return;
    }
    speechFlushRef.current();
  }, [commitCloud]);

  useEffect(() => {
    return () => {
      releaseCloud();
    };
  }, [releaseCloud]);

  const listening = cloud
    ? phase === "listening" || phase === "holding" || phase === "transcribing"
    : speech.listening || phase === "transcribing";
  const holding = cloud ? phase === "holding" : speech.holding;
  const captured = cloud ? heardSpeech : speech.captured;

  return {
    supported: cloud ? true : speech.supported,
    ready: speech.ready,
    cloud,
    phase,
    listening,
    holding,
    captured,
    analyserRef,
    start,
    cancel,
    commit,
  };
}
