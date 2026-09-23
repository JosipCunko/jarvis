"use client";

import { useEffect, useRef, type RefObject } from "react";

const BAR_COUNT = 10;
const SMOOTHING = 0.35;
const MIN_HEIGHT = 0.08;
const VOICE_MIN_HZ = 110;
const VOICE_MAX_HZ = 3200;
const NOISE_FLOOR = 26;

function bandEdges(sampleRate: number, binCount: number) {
  const fftSize = binCount * 2;
  const edges: number[] = [];
  for (let i = 0; i <= BAR_COUNT; i += 1) {
    const hz = VOICE_MIN_HZ * (VOICE_MAX_HZ / VOICE_MIN_HZ) ** (i / BAR_COUNT);
    const bin = Math.round((hz * fftSize) / sampleRate);
    edges.push(Math.min(binCount - 1, Math.max(1, bin)));
  }
  for (let i = 1; i < edges.length; i += 1) {
    if (edges[i] <= edges[i - 1]) edges[i] = Math.min(binCount - 1, edges[i - 1] + 1);
  }
  return edges;
}

export function VoiceBars({
  active,
  analyserRef,
}: {
  active: boolean;
  analyserRef?: RefObject<AnalyserNode | null>;
}) {
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);
  const levelsRef = useRef<number[]>(new Array(BAR_COUNT).fill(0));
  const rafRef = useRef<number | null>(null);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const edgesRef = useRef<number[] | null>(null);
  const edgesKeyRef = useRef("");

  useEffect(() => {
    if (!active) {
      levelsRef.current = levelsRef.current.map(() => 0);
      barRefs.current.forEach((el) => el?.style.setProperty("transform", `scaleY(${MIN_HEIGHT})`));
      return;
    }

    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const analyser = analyserRef?.current;

      if (analyser) {
        if (!dataRef.current || dataRef.current.length !== analyser.frequencyBinCount) {
          dataRef.current = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
          edgesRef.current = null;
        }
        const data = dataRef.current;
        analyser.getByteFrequencyData(data);

        const sampleRate = analyser.context.sampleRate;
        const edgesKey = `${sampleRate}:${data.length}`;
        if (!edgesRef.current || edgesKeyRef.current !== edgesKey) {
          edgesRef.current = bandEdges(sampleRate, data.length);
          edgesKeyRef.current = edgesKey;
        }
        const edges = edgesRef.current;
        const hzPerBin = sampleRate / (data.length * 2);

        for (let bar = 0; bar < BAR_COUNT; bar += 1) {
          const start = edges[bar] ?? 1;
          const end = Math.max(start + 1, edges[bar + 1] ?? start + 1);
          let peak = 0;
          let sum = 0;
          for (let i = start; i < end; i += 1) {
            const value = data[i] ?? 0;
            sum += value;
            if (value > peak) peak = value;
          }
          const blended = peak * 0.7 + sum / (end - start) * 0.3;
          const centerHz = ((start + end) / 2) * hzPerBin;
          const octaves = Math.max(0, Math.log2(centerHz / VOICE_MIN_HZ));
          const lifted = Math.max(0, blended - NOISE_FLOOR) * (1 + octaves * 0.45);
          const target = Math.min(1, lifted / 105);
          const prev = levelsRef.current[bar] ?? 0;
          levelsRef.current[bar] = prev + (target - prev) * SMOOTHING;
        }
      } else {
        const t = Date.now() / 260;
        for (let bar = 0; bar < BAR_COUNT; bar += 1) {
          const target = 0.25 + 0.25 * Math.abs(Math.sin(t + bar * 0.55));
          const prev = levelsRef.current[bar] ?? 0;
          levelsRef.current[bar] = prev + (target - prev) * 0.15;
        }
      }

      barRefs.current.forEach((el, i) => {
        if (!el) return;
        const height = MIN_HEIGHT + (levelsRef.current[i] ?? 0) * (1 - MIN_HEIGHT);
        el.style.transform = `scaleY(${height})`;
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [active, analyserRef]);

  return (
    <div className="mt-3 flex h-8 items-end" aria-hidden>
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <div key={i} className="flex h-full flex-1 items-end justify-center">
          <div
            ref={(el) => {
              barRefs.current[i] = el;
            }}
            className="h-full w-0.5 origin-bottom rounded-full bg-cyan/80"
            style={{ height: "100%", transform: `scaleY(${MIN_HEIGHT})` }}
          />
        </div>
      ))}
    </div>
  );
}
