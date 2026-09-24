"use client";

/// <reference path="../_types/speech-recognition.d.ts" />

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

export const END_OF_TURN_SILENCE_MS = 1000;

export type SpeechStartOptions = {
  continuous?: boolean;
  lang?: string;
};

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

type SpeechSupport = "pending" | "yes" | "no";

function subscribeSpeechSupport() {
  return () => {};
}

function speechSupportSnapshot(): SpeechSupport {
  return getSpeechRecognitionCtor() ? "yes" : "no";
}

function speechSupportServerSnapshot(): SpeechSupport {
  return "pending";
}

function resolveLang(lang?: string) {
  if (lang) return lang;
  if (typeof navigator !== "undefined" && navigator.language) return navigator.language;
  return "en-US";
}

function errorMessage(code: SpeechRecognitionErrorEvent["error"]) {
  if (code === "not-allowed" || code === "service-not-allowed") {
    return "Microphone access was blocked. Allow the mic for this site and try again.";
  }
  if (code === "audio-capture") return "No microphone was found.";
  if (code === "network") {
    return "Speech service could not be reached. Check your connection.";
  }
  if (code === "language-not-supported") {
    return "That speech language is not supported in this browser.";
  }
  return "Speech recognition failed.";
}

/**
 * Browser speech-to-text. A short pause does not end the turn:
 * phrase finals are buffered until about 2 seconds of silence.
 */
export function useSpeechRecognition({
  onInterim,
  onUtterance,
  onError,
}: {
  onInterim?: (text: string) => void;
  onUtterance?: (text: string) => void;
  onError?: (message: string) => void;
} = {}) {
  const support = useSyncExternalStore(
    subscribeSpeechSupport,
    speechSupportSnapshot,
    speechSupportServerSnapshot,
  );
  const supported = support === "yes";
  const ready = support !== "pending";
  const [listening, setListening] = useState(false);
  const [holding, setHolding] = useState(false);
  const [captured, setCaptured] = useState(false);

  const recRef = useRef<SpeechRecognition | null>(null);
  const wantListenRef = useRef(false);
  const continuousRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const holdingTimerRef = useRef<number | null>(null);
  const bufferRef = useRef("");
  const interimRef = useRef("");
  const callbacksRef = useRef({ onInterim, onUtterance, onError });

  callbacksRef.current = { onInterim, onUtterance, onError };

  const clearRestart = useCallback(() => {
    if (restartTimerRef.current == null) return;
    window.clearTimeout(restartTimerRef.current);
    restartTimerRef.current = null;
  }, []);

  const clearSilence = useCallback(() => {
    if (silenceTimerRef.current != null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (holdingTimerRef.current != null) {
      window.clearTimeout(holdingTimerRef.current);
      holdingTimerRef.current = null;
    }
  }, []);

  const liveText = useCallback(() => {
    return `${bufferRef.current} ${interimRef.current}`.replace(/\s+/g, " ").trim();
  }, []);

  const emitUtterance = useCallback(() => {
    clearSilence();
    const text = liveText();
    bufferRef.current = "";
    interimRef.current = "";
    setHolding(false);
    setCaptured(false);
    if (text) callbacksRef.current.onUtterance?.(text);
  }, [clearSilence, liveText]);

  const scheduleCommit = useCallback(() => {
    clearSilence();
    holdingTimerRef.current = window.setTimeout(() => setHolding(true), 400);
    silenceTimerRef.current = window.setTimeout(() => {
      if (!wantListenRef.current) return;
      emitUtterance();
    }, END_OF_TURN_SILENCE_MS);
  }, [clearSilence, emitUtterance]);

  const ensureEngine = useCallback(
    (lang?: string) => {
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) return null;
      if (recRef.current) {
        recRef.current.lang = resolveLang(lang);
        return recRef.current;
      }

      const rec = new Ctor();
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.lang = resolveLang(lang);

      rec.onstart = () => setListening(true);

      rec.onresult = (event) => {
        let interim = "";
        let finals = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const piece = event.results[i]?.[0]?.transcript ?? "";
          if (event.results[i]?.isFinal) finals += piece;
          else interim += piece;
        }
        if (finals.trim()) {
          bufferRef.current = `${bufferRef.current} ${finals}`.replace(/\s+/g, " ").trim();
          interimRef.current = "";
        } else {
          interimRef.current = interim.trim();
        }
        const live = liveText();
        setCaptured(Boolean(live));
        setHolding(false);
        if (live) callbacksRef.current.onInterim?.(live);
        if (live) scheduleCommit();
      };

      rec.onerror = (event) => {
        if (event.error === "aborted" || event.error === "no-speech") return;
        wantListenRef.current = false;
        continuousRef.current = false;
        clearRestart();
        clearSilence();
        setListening(false);
        setHolding(false);
        callbacksRef.current.onError?.(errorMessage(event.error));
      };

      rec.onend = () => {
        if (wantListenRef.current && continuousRef.current) {
          clearRestart();
          restartTimerRef.current = window.setTimeout(() => {
            if (!wantListenRef.current || !continuousRef.current) return;
            try {
              rec.start();
            } catch {
              /* already running */
            }
          }, 160);
          return;
        }
        wantListenRef.current = false;
        setListening(false);
        setHolding(false);
      };

      recRef.current = rec;
      return rec;
    },
    [clearRestart, clearSilence, liveText, scheduleCommit],
  );

  const stop = useCallback(() => {
    wantListenRef.current = false;
    continuousRef.current = false;
    bufferRef.current = "";
    interimRef.current = "";
    clearRestart();
    clearSilence();
    setCaptured(false);
    setHolding(false);
    const rec = recRef.current;
    if (!rec) {
      setListening(false);
      return;
    }
    try {
      rec.abort();
    } catch {
      /* already stopped */
    }
    setListening(false);
  }, [clearRestart, clearSilence]);

  const flush = useCallback(() => {
    const text = liveText();
    wantListenRef.current = false;
    continuousRef.current = false;
    clearRestart();
    clearSilence();
    bufferRef.current = "";
    interimRef.current = "";
    setCaptured(false);
    setHolding(false);
    try {
      recRef.current?.abort();
    } catch {
      /* already stopped */
    }
    setListening(false);
    if (text) callbacksRef.current.onUtterance?.(text);
  }, [clearRestart, clearSilence, liveText]);

  const start = useCallback(
    (options: SpeechStartOptions = {}) => {
      const rec = ensureEngine(options.lang);
      if (!rec) {
        callbacksRef.current.onError?.(
          "Speech recognition needs Chrome or Edge on this device.",
        );
        return false;
      }
      continuousRef.current = true;
      rec.continuous = true;
      rec.lang = resolveLang(options.lang);
      wantListenRef.current = true;
      try {
        rec.start();
        return true;
      } catch (error) {
        if (error instanceof DOMException && error.name === "InvalidStateError") {
          setListening(true);
          return true;
        }
        wantListenRef.current = false;
        setListening(false);
        callbacksRef.current.onError?.("Could not start the microphone.");
        return false;
      }
    },
    [ensureEngine],
  );

  useEffect(() => {
    return () => {
      wantListenRef.current = false;
      continuousRef.current = false;
      clearRestart();
      clearSilence();
      recRef.current?.abort();
      recRef.current = null;
    };
  }, [clearRestart, clearSilence]);

  return { supported, ready, listening, holding, captured, start, stop, flush };
}
