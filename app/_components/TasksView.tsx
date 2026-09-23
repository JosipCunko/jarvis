"use client";

import { useMemo, useState } from "react";
import { ListChecks, Plus, Search } from "lucide-react";
import { Button } from "@/app/_components/Button";
import { TaskCard } from "@/app/_components/TaskCard";
import { notifyError, notifySuccess } from "@/app/_components/notify";
import { cn } from "@/app/_lib/cn";
import { startOfToday } from "@/app/_lib/time";
import type { Task, TaskStatus } from "@/app/_types/jarvis";

type BoardFilter = "all" | "active" | "done";

export function TasksView({
  tasks,
  onChanged,
  onAskJarvis,
}: {
  tasks: Task[];
  onChanged: () => void;
  onAskJarvis: (prompt: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<BoardFilter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? tasks.filter((task) =>
          `${task.title} ${task.notes ?? ""} ${task.tags.join(" ")}`.toLowerCase().includes(q),
        )
      : tasks;
    const active = matched
      .filter((task) => task.status !== "done")
      .sort(compareActive);
    const done = matched
      .filter((task) => task.status === "done")
      .sort(
        (a, b) =>
          (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt),
      );
    return { active, done };
  }, [query, tasks]);

  const overdue = tasks.filter(
    (task) => task.status !== "done" && task.dueAt != null && task.dueAt < startOfToday(),
  ).length;
  const activeCount = tasks.filter((task) => task.status !== "done").length;
  const doneCount = tasks.length - activeCount;

  async function updateStatus(task: Task, status: TaskStatus) {
    setBusyId(task.id);
    try {
      const response = await fetch("/api/missions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, status }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        throw new Error(data?.error?.message ?? "Could not update that mission.");
      }
      notifySuccess(status === "done" ? "Mission complete" : "Mission updated");
      onChanged();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Could not update that mission.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeTask(task: Task) {
    setBusyId(task.id);
    try {
      const response = await fetch(`/api/missions/${task.id}`, { method: "DELETE" });
      const data = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        throw new Error(data?.error?.message ?? "Could not delete that mission.");
      }
      notifySuccess("Mission deleted");
      onChanged();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Could not delete that mission.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto grid max-w-[1600px] gap-3">
      <section className="hud-panel rounded-xl p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-mono text-[10px] tracking-[0.28em] text-muted">MISSION BOARD</h2>
            <p className="mt-1 text-sm text-ink/90">
              Pending and completed missions. The command center timeline keeps the active ones in view.
            </p>
          </div>
          <Button
            shape="pill"
            size="sm"
            variant="solid"
            onClick={() =>
              onAskJarvis(
                "Help me create a new task. Ask me for the title and due date if needed.",
              )
            }
          >
            <Plus size={14} />
            New mission
          </Button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Stat label="Active" value={activeCount} tone="cyan" />
          <Stat label="Overdue" value={overdue} tone={overdue ? "danger" : "muted"} />
          <Stat label="Completed" value={doneCount} tone="ok" />
        </div>

        <div className="mt-4 flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="flex rounded-full border border-line bg-hud p-1">
            {(
              [
                ["all", "All"],
                ["active", "Pending"],
                ["done", "Completed"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs transition",
                  filter === id ? "bg-cyan/15 text-cyan" : "text-muted hover:text-ink",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="relative block min-w-0 flex-1">
            <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search missions…"
              className="w-full rounded-full border border-line bg-hud py-2 pr-3 pl-9 text-sm outline-none focus:border-cyan"
            />
          </label>
        </div>
      </section>

      {tasks.length === 0 ? (
        <section className="hud-panel rounded-xl p-8 text-center">
          <ListChecks className="mx-auto text-cyan" size={22} />
          <p className="mt-3 text-sm text-muted">
            No missions yet. Tell JARVIS what to track, or start one here.
          </p>
        </section>
      ) : filter === "all" ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <MissionColumn
            title="PENDING"
            count={filtered.active.length}
            empty={query ? "No pending missions match that search." : "Nothing pending."}
            tasks={filtered.active}
            busyId={busyId}
            onStatus={updateStatus}
            onDelete={removeTask}
          />
          <MissionColumn
            title="COMPLETED"
            count={filtered.done.length}
            empty={query ? "No completed missions match that search." : "Completed missions land here."}
            tasks={filtered.done}
            busyId={busyId}
            onStatus={updateStatus}
            onDelete={removeTask}
          />
        </div>
      ) : (
        <MissionColumn
          title={filter === "done" ? "COMPLETED" : "PENDING"}
          count={filter === "done" ? filtered.done.length : filtered.active.length}
          empty={
            query
              ? "No missions match that search."
              : filter === "done"
                ? "Completed missions land here."
                : "Nothing pending."
          }
          tasks={filter === "done" ? filtered.done : filtered.active}
          busyId={busyId}
          onStatus={updateStatus}
          onDelete={removeTask}
          spread
        />
      )}
    </div>
  );
}

function MissionColumn({
  title,
  count,
  empty,
  tasks,
  busyId,
  onStatus,
  onDelete,
  spread = false,
}: {
  title: string;
  count: number;
  empty: string;
  tasks: Task[];
  busyId: string | null;
  onStatus: (task: Task, status: TaskStatus) => void;
  onDelete: (task: Task) => void;
  spread?: boolean;
}) {
  return (
    <section className="hud-panel rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-mono text-[10px] tracking-[0.28em] text-muted">{title}</h2>
        <span className="font-mono text-[10px] text-cyan">{count}</span>
      </div>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <div className={cn("grid items-start gap-3", spread && "md:grid-cols-2")}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              busy={busyId === task.id}
              onStatus={(status) => onStatus(task, status)}
              onDelete={() => onDelete(task)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "cyan" | "danger" | "ok" | "muted";
}) {
  return (
    <div className="rounded-lg border border-line/70 bg-hud/40 px-3 py-3">
      <p className="font-mono text-[10px] tracking-[0.22em] text-muted">{label}</p>
      <p
        className={cn(
          "mt-1 font-display text-2xl tracking-widest",
          tone === "cyan" && "text-cyan",
          tone === "danger" && "text-danger",
          tone === "ok" && "text-ok",
          tone === "muted" && "text-muted",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function compareActive(a: Task, b: Task) {
  const overdueA = a.dueAt != null && a.dueAt < startOfToday();
  const overdueB = b.dueAt != null && b.dueAt < startOfToday();
  if (overdueA !== overdueB) return overdueA ? -1 : 1;
  const dueA = a.dueAt ?? Number.MAX_SAFE_INTEGER;
  const dueB = b.dueAt ?? Number.MAX_SAFE_INTEGER;
  if (dueA !== dueB) return dueA - dueB;
  return b.updatedAt - a.updatedAt;
}
