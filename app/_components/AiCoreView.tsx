"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Brain, ListChecks, Mic, Wallet, type LucideIcon } from "lucide-react";
import { Button } from "@/app/_components/Button";
import JarvisMark from "@/app/_components/JarvisMark";
import { notifyError } from "@/app/_components/notify";
import { VoiceBars } from "@/app/_components/voice-bars";
import { cn } from "@/app/_lib/cn";
import { endOfToday, formatWhen, startOfToday } from "@/app/_lib/time";
import type { CreditsSnapshot } from "@/app/_types/credits";
import type { MemoryNote, Task } from "@/app/_types/jarvis";

type Tone = "ok" | "cyan" | "amber" | "muted" | "danger";

function money(amount: number) {
  return `$${amount.toFixed(2)}`;
}

function Frame({
  children,
  className,
  tone = "cyan",
}: {
  children: ReactNode;
  className?: string;
  tone?: Tone;
}) {
  const edge =
    tone === "amber"
      ? "border-amber/70"
      : tone === "ok"
        ? "border-ok/70"
        : tone === "danger"
          ? "border-danger/70"
          : "border-cyan/70";
  return (
    <section className={cn("hud-panel relative overflow-hidden rounded-xl p-4", className)}>
      <span className={cn("pointer-events-none absolute top-2.5 left-2.5 h-3 w-3 border-t border-l", edge)} />
      <span className={cn("pointer-events-none absolute top-2.5 right-2.5 h-3 w-3 border-t border-r", edge)} />
      <span className={cn("pointer-events-none absolute bottom-2.5 left-2.5 h-3 w-3 border-b border-l", edge)} />
      <span className={cn("pointer-events-none absolute right-2.5 bottom-2.5 h-3 w-3 border-r border-b", edge)} />
      {children}
    </section>
  );
}

function Glyph({ icon: Icon, tone = "cyan" }: { icon: LucideIcon; tone?: Tone }) {
  return (
    <span
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border",
        tone === "ok" && "border-ok/40 bg-ok/10 text-ok",
        tone === "amber" && "border-amber/40 bg-amber/10 text-amber",
        tone === "danger" && "border-danger/40 bg-danger/10 text-danger",
        tone === "muted" && "border-line bg-hud/60 text-muted",
        tone === "cyan" && "border-cyan/40 bg-cyan/10 text-cyan",
      )}
    >
      <Icon size={20} aria-hidden />
    </span>
  );
}

function creditHeadline(credits: CreditsSnapshot | null) {
  if (!credits) return { value: "—", caption: "Reading ledgers" };
  const thesys = credits.thesys;
  if (thesys.kind === "balance" && thesys.remaining != null) {
    return { value: money(thesys.remaining), caption: "Thesys remaining" };
  }
  const openrouter = credits.openrouter;
  if (openrouter.kind === "wallet" && openrouter.remaining != null) {
    return { value: money(openrouter.remaining), caption: "OpenRouter wallet" };
  }
  if (!thesys.configured && !openrouter.configured) {
    return { value: "OFF", caption: "Providers unconfigured" };
  }
  return { value: credits.low ? "LOW" : "LINKED", caption: "Provider link" };
}

function providerRows(credits: CreditsSnapshot | null) {
  if (!credits) {
    return [
      { label: "OpenRouter", value: "Checking…" },
      { label: "Thesys", value: "Checking…" },
    ];
  }
  const openrouter = credits.openrouter;
  let orValue = "Unavailable";
  if (!openrouter.configured) orValue = "Offline";
  else if (openrouter.kind === "wallet" && openrouter.remaining != null) orValue = money(openrouter.remaining);
  else if (openrouter.kind === "key" && openrouter.usageDaily != null) {
    orValue = `${money(openrouter.usageDaily)} today`;
  }

  const thesys = credits.thesys;
  let thesysValue = "Unavailable";
  if (!thesys.configured) thesysValue = "Offline";
  else if (thesys.kind === "balance" && thesys.paid != null && thesys.free != null) {
    thesysValue = `${money(thesys.paid)} + ${money(thesys.free)} free`;
  } else if (thesys.kind === "balance" && thesys.remaining != null) {
    thesysValue = money(thesys.remaining);
  }

  return [
    { label: "OpenRouter", value: orValue },
    { label: "Thesys", value: thesysValue },
  ];
}

export function AiCoreView({
  credits,
  memories,
  tasks,
  listening,
  speaking,
  holding,
  voiceChat,
  speechReady,
  speechSupported,
  voiceLive,
  analyserRef,
  onOpenMemory,
  onOpenTasks,
}: {
  credits: CreditsSnapshot | null;
  memories: MemoryNote[];
  tasks: Task[];
  listening: boolean;
  speaking: boolean;
  holding: boolean;
  voiceChat: boolean;
  speechReady: boolean;
  speechSupported: boolean;
  voiceLive: boolean;
  analyserRef: RefObject<AnalyserNode | null>;
  onOpenMemory: () => void;
  onOpenTasks: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const [testing, setTesting] = useState(false);
  const [hearing, setHearing] = useState(false);
  const testAnalyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (!testing) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;

    async function openMic() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("This browser cannot open the microphone.");
        }
        const next = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
        });
        if (cancelled) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = next;
        context = new AudioContext();
        if (context.state === "suspended") await context.resume();
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.5;
        analyser.minDecibels = -95;
        analyser.maxDecibels = -30;
        source.connect(analyser);
        testAnalyserRef.current = analyser;
        setHearing(true);
      } catch (error) {
        if (cancelled) return;
        const denied =
          error instanceof DOMException &&
          (error.name === "NotAllowedError" || error.name === "SecurityError");
        notifyError(
          denied
            ? "Microphone access was blocked."
            : error instanceof Error
              ? error.message
              : "Could not open the microphone.",
        );
        setTesting(false);
      }
    }

    void openMic();
    return () => {
      cancelled = true;
      testAnalyserRef.current = null;
      setHearing(false);
      stream?.getTracks().forEach((track) => track.stop());
      if (context && context.state !== "closed") void context.close();
    };
  }, [testing]);
  const active = tasks.filter((task) => task.status !== "done");
  const overdue = active.filter((task) => task.dueAt != null && task.dueAt < startOfToday());
  const dueToday = active.filter(
    (task) => task.dueAt != null && task.dueAt >= startOfToday() && task.dueAt <= endOfToday(),
  );
  const inProgress = active.filter((task) => task.status === "in_progress");
  const done = tasks.length - active.length;
  const attention = overdue.length > 0 || Boolean(credits?.low);
  const voiceLabel = testing
    ? "Testing"
    : listening
      ? "Listening"
      : speaking
        ? "Speaking"
        : voiceChat
          ? "Voice chat"
          : speechReady && !speechSupported
            ? "Unavailable"
            : "Online";
  const voiceDetail = testing
    ? "Microphone check. Nothing is sent to JARVIS."
    : listening
      ? holding
        ? "Holding the channel open"
        : "Microphone is live"
      : speaking
        ? "Playing a spoken reply"
        : voiceChat
          ? "Conversation mode is armed"
          : speechReady && !speechSupported
            ? "This browser cannot capture speech"
            : "Ready for a spoken command";
  const creditsView = creditHeadline(credits);
  const recentNotes = memories.slice(0, 2);
  const nextMission = [...overdue, ...dueToday, ...active][0];

  const fade = reduceMotion
    ? { duration: 0 }
    : { duration: 0.35, ease: "easeOut" as const };

  return (
    <motion.div
      className="mx-auto grid max-w-[1600px] gap-3"
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={fade}
    >
      <Frame className="p-5">
        <div className="pointer-events-none absolute -top-16 right-8 h-48 w-48 rounded-full border border-cyan/15" />
        <div className="pointer-events-none absolute -top-8 right-16 h-32 w-32 rounded-full border border-cyan/25" />
        <div className="flex items-start gap-4">
          <JarvisMark
            alt=""
            sizes="56px"
            className="h-14 w-14 shrink-0 rounded-full shadow-[0_0_24px_rgba(0,212,255,0.45)]"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="shrink-0">
                <p className="font-mono text-[10px] tracking-[0.32em] text-muted">NEURAL INTERFACE</p>
                <h1 className="font-display text-2xl tracking-[0.18em] whitespace-nowrap text-cyan hud-glow sm:tracking-[0.22em]">
                  AI CORE
                </h1>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-line bg-hud/50 px-3 py-1.5">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    attention ? "bg-amber" : "bg-ok",
                    !reduceMotion && "animate-[jarvis-pulse_1.6s_ease-in-out_infinite]",
                  )}
                />
                <span
                  className={cn(
                    "font-mono text-[10px] tracking-[0.22em]",
                    attention ? "text-amber" : "text-ok",
                  )}
                >
                  {attention ? "ATTENTION" : "CORE ONLINE"}
                </span>
              </div>
            </div>
            <p className="mt-2 text-sm text-muted">
              Balance, memory, voice, and missions
            </p>
          </div>
        </div>
      </Frame>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Frame tone={credits?.low ? "amber" : "cyan"}>
          <div className="flex items-start justify-between gap-3">
            <Glyph icon={Wallet} tone={credits?.low ? "amber" : "cyan"} />
            <p className="font-mono text-[10px] tracking-[0.28em] text-muted">CREDITS</p>
          </div>
          <p
            className={cn(
              "mt-4 font-display text-3xl tracking-widest",
              credits?.low ? "text-amber" : "text-cyan",
            )}
          >
            {creditsView.value}
          </p>
          <p className="mt-1 text-sm text-muted">{creditsView.caption}</p>
          <ul className="mt-4 space-y-2">
            {providerRows(credits).map((row) => (
              <li key={row.label} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted">{row.label}</span>
                <span className="text-right font-mono text-xs text-ink">{row.value}</span>
              </li>
            ))}
          </ul>
        </Frame>

        <Frame>
          <div className="flex items-start justify-between gap-3">
            <Glyph icon={Brain} />
            <button
              type="button"
              onClick={onOpenMemory}
              className="font-mono text-[10px] tracking-[0.28em] text-cyan hover:text-cyan-2"
            >
              MEMORY
            </button>
          </div>
          <p className="mt-4 font-display text-3xl tracking-widest text-cyan">{memories.length}</p>
          <p className="mt-1 text-sm text-muted">
            {memories.length === 1 ? "Stored note" : "Stored notes"}
          </p>
          {recentNotes.length === 0 ? (
            <p className="mt-4 text-sm text-muted">The archive is empty.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {recentNotes.map((note) => (
                <li
                  key={note.id}
                  className="line-clamp-2 rounded-lg border border-line/70 bg-hud/40 px-3 py-2 text-sm text-ink/90"
                >
                  {note.text}
                </li>
              ))}
            </ul>
          )}
        </Frame>

        <Frame tone={testing ? "ok" : speechReady && !speechSupported ? "amber" : "cyan"}>
          <div className="flex items-start justify-between gap-3">
            <Glyph
              icon={Mic}
              tone={testing ? "ok" : speechReady && !speechSupported ? "amber" : "cyan"}
            />
            <p className="font-mono text-[10px] tracking-[0.28em] text-muted">VOICE</p>
          </div>
          <p className={cn("mt-4 font-display text-3xl tracking-widest", testing ? "text-ok" : "text-cyan")}>
            {voiceLabel}
          </p>
          <p className="mt-1 text-sm text-muted">{voiceDetail}</p>
          <VoiceBars
            active={hearing || (!testing && voiceLive)}
            analyserRef={testing ? testAnalyserRef : analyserRef}
          />
          <Button
            shape="pill"
            size="sm"
            active={testing}
            aria-pressed={testing}
            title={testing ? "Stop the microphone check" : "Check the microphone without sending a command"}
            onClick={() => setTesting((current) => !current)}
            className="mt-4"
          >
            <Mic size={14} />
            {testing ? "Stop test" : "Test mic"}
          </Button>
        </Frame>

        <Frame tone={overdue.length ? "danger" : "cyan"}>
          <div className="flex items-start justify-between gap-3">
            <Glyph icon={ListChecks} tone={overdue.length ? "danger" : "cyan"} />
            <button
              type="button"
              onClick={onOpenTasks}
              className="font-mono text-[10px] tracking-[0.28em] text-cyan hover:text-cyan-2"
            >
              MISSIONS
            </button>
          </div>
          <p className={cn("mt-4 font-display text-3xl tracking-widest", overdue.length ? "text-danger" : "text-cyan")}>
            {active.length}
          </p>
          <p className="mt-1 text-sm text-muted">Active missions</p>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              { label: "Late", value: overdue.length, tone: overdue.length ? "text-danger" : "text-ink" },
              { label: "Today", value: dueToday.length, tone: "text-ink" },
              { label: "Live", value: inProgress.length, tone: "text-ink" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border border-line/70 bg-hud/40 py-2">
                <dt className="font-mono text-[10px] tracking-widest text-muted">{stat.label}</dt>
                <dd className={cn("mt-1 font-display text-lg", stat.tone)}>{stat.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 line-clamp-2 font-mono text-[10px] tracking-widest text-muted">
            {done} complete
            {nextMission
              ? ` · next ${nextMission.title}${nextMission.dueAt ? ` · ${formatWhen(nextMission.dueAt)}` : ""}`
              : ""}
          </p>
        </Frame>
      </div>
    </motion.div>
  );
}
