"use client";

/// <reference path="../_types/speech-recognition.d.ts" />

import { useCallback, useEffect, useRef, useState } from "react";

export type SpeechStartOptions = {
  continuous?: boolean;
  lang?: string;
};

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
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
 * Browser speech-to-text via the Web Speech API.
 * Chrome/Edge use Google's recognizer — the same path as
 * `speech_recognition.recognize_google` in SpeechRecognition/transcription.ipynb.
 */
export function useSpeechRecognition({
  onInterim,
  onFinal,
  onError,
}: {
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
} = {}) {
  const [supported, setSupported] = useState(false);
  const [ready, setReady] = useState(false);
  const [listening, setListening] = useState(false);

  const recRef = useRef<SpeechRecognition | null>(null);
  const wantListenRef = useRef(false);
  const continuousRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);
  const callbacksRef = useRef({ onInterim, onFinal, onError });

  callbacksRef.current = { onInterim, onFinal, onError };

  const clearRestart = useCallback(() => {
    if (restartTimerRef.current == null) return;
    window.clearTimeout(restartTimerRef.current);
    restartTimerRef.current = null;
  }, []);

  const ensureEngine = useCallback((lang?: string) => {
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
      const live = (finals || interim).trim();
      if (live) callbacksRef.current.onInterim?.(live);
      const done = finals.trim();
      if (done) callbacksRef.current.onFinal?.(done);
    };

    rec.onerror = (event) => {
      if (event.error === "aborted" || event.error === "no-speech") return;
      wantListenRef.current = false;
      continuousRef.current = false;
      clearRestart();
      setListening(false);
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
    };

    recRef.current = rec;
    return rec;
  }, [clearRestart]);

  const stop = useCallback(() => {
    wantListenRef.current = false;
    continuousRef.current = false;
    clearRestart();
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
  }, [clearRestart]);

  const start = useCallback(
    (options: SpeechStartOptions = {}) => {
      const rec = ensureEngine(options.lang);
      if (!rec) {
        callbacksRef.current.onError?.(
          "Speech recognition needs Chrome or Edge on this device.",
        );
        return false;
      }
      continuousRef.current = Boolean(options.continuous);
      rec.continuous = continuousRef.current;
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
    setSupported(Boolean(getSpeechRecognitionCtor()));
    setReady(true);
    return () => {
      wantListenRef.current = false;
      continuousRef.current = false;
      clearRestart();
      recRef.current?.abort();
      recRef.current = null;
    };
  }, [clearRestart]);

  return { supported, ready, listening, start, stop };
}
