"use client";

import { Brain, Cpu, ListChecks, Search, type LucideIcon } from "lucide-react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/app/_lib/cn";
import { startOfToday } from "@/app/_lib/time";
import type { MemoryNote, Task } from "@/app/_types/jarvis";

type Tone = "ok" | "cyan" | "amber" | "muted" | "danger";

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

export function AgentsView({
  memories,
  tasks,
  researching,
  onOpenMemory,
  onOpenTasks,
}: {
  memories: MemoryNote[];
  tasks: Task[];
  researching: boolean;
  onOpenMemory: () => void;
  onOpenTasks: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const active = tasks.filter((task) => task.status !== "done");
  const overdue = active.filter((task) => task.dueAt != null && task.dueAt < startOfToday());

  const agents: {
    name: string;
    status: string;
    tone: Tone;
    detail: string;
    icon: LucideIcon;
    action?: { label: string; onClick: () => void };
  }[] = [
    {
      name: "Research",
      status: researching ? "Searching" : "Standby",
      tone: researching ? "ok" : "cyan",
      detail: researching ? "A web query is in flight" : "Waiting for a research request",
      icon: Search,
    },
    {
      name: "Memory",
      status: memories.length ? "Ready" : "Empty",
      tone: memories.length ? "ok" : "cyan",
      detail: memories.length
        ? `${memories.length} note${memories.length === 1 ? "" : "s"} indexed`
        : "Ask JARVIS to remember something",
      icon: Brain,
      action: { label: "Open", onClick: onOpenMemory },
    },
    {
      name: "Missions",
      status: active.length ? "Tracking" : "Clear",
      tone: overdue.length ? "amber" : active.length ? "ok" : "cyan",
      detail: active.length
        ? `${active.length} open mission${active.length === 1 ? "" : "s"}`
        : "No open missions",
      icon: ListChecks,
      action: { label: "Board", onClick: onOpenTasks },
    },
    {
      name: "System",
      status: "Local offline",
      tone: "muted",
      detail: "Host CPU, memory, and disk stay dark until a local agent is installed",
      icon: Cpu,
    },
  ];

  return (
    <div className="mx-auto grid max-w-[1600px] gap-3">
      <h1 className="font-display text-2xl tracking-[0.18em] text-cyan hud-glow sm:tracking-[0.22em]">
        Agents
      </h1>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {agents.map((agent) => {
          const Icon = agent.icon;
          return (
            <article key={agent.name} className="hud-panel rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <Glyph icon={Icon} tone={agent.tone} />
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 font-mono text-[10px] tracking-widest",
                    agent.tone === "ok" && "text-ok",
                    agent.tone === "cyan" && "text-cyan",
                    agent.tone === "amber" && "text-amber",
                    agent.tone === "muted" && "text-muted",
                    agent.tone === "danger" && "text-danger",
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      agent.tone === "ok" && "bg-ok",
                      agent.tone === "cyan" && "bg-cyan",
                      agent.tone === "amber" && "bg-amber",
                      agent.tone === "muted" && "bg-muted",
                      agent.tone === "danger" && "bg-danger",
                      agent.tone === "ok" &&
                        !reduceMotion &&
                        "animate-[jarvis-pulse_1.6s_ease-in-out_infinite]",
                    )}
                  />
                  {agent.status}
                </span>
              </div>
              <h2 className="mt-4 font-display text-sm tracking-[0.18em]">{agent.name}</h2>
              <p className="mt-1 min-h-10 text-sm text-muted">{agent.detail}</p>
              {agent.action ? (
                <button
                  type="button"
                  onClick={agent.action.onClick}
                  className="mt-3 font-mono text-[10px] tracking-widest text-cyan hover:text-cyan-2"
                >
                  {agent.action.label}
                </button>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
