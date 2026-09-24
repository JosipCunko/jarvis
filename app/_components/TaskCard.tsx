"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Check, Play, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/app/_components/Button";
import { TaskGlyph } from "@/app/_components/TaskGlyph";
import { cn } from "@/app/_lib/cn";
import { missionKindLabel, repeatLabel } from "@/app/_lib/mission-repeat";
import { resolveTaskAppearance, taskSwatch } from "@/app/_lib/task-appearance";
import { endOfToday, formatWhen, startOfToday } from "@/app/_lib/time";
import type { Task, TaskPriority, TaskStatus } from "@/app/_types/jarvis";

const STATUS_LABEL: Record<TaskStatus, string> = {
  open: "Standby",
  in_progress: "In flight",
  done: "Complete",
};

export function TaskCard({
  task,
  busy,
  onStatus,
  onDelete,
}: {
  task: Task;
  busy: boolean;
  onStatus: (status: TaskStatus) => void;
  onDelete: () => void;
}) {
  const look = resolveTaskAppearance(task);
  const swatch = taskSwatch(look.color);
  const done = task.status === "done";
  const overdue = !done && task.dueAt != null && task.dueAt < startOfToday();
  const dueToday = !done && task.dueAt != null && task.dueAt <= endOfToday() && !overdue;
  const dueText = task.dueAt
    ? done
      ? `Closed ${formatWhen(task.completedAt ?? task.updatedAt)}`
      : formatWhen(task.dueAt)
    : "No due date";
  const cadence = repeatLabel(task.repeat);
  const kindCourse = [missionKindLabel(task.kind), task.course].filter(Boolean).join(" · ");
  const [notesOpen, setNotesOpen] = useState(false);

  return (
    <article
      className={cn(
        "relative rounded-xl border bg-hud/70 p-4",
        done && "opacity-80",
        notesOpen && "z-30",
      )}
      style={{
        borderColor: `${swatch.hex}66`,
        boxShadow: `inset 0 1px 0 ${swatch.hex}33, 0 0 22px ${swatch.hex}14`,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl"
        style={{
          background: `linear-gradient(145deg, ${swatch.hex}24, transparent 52%)`,
        }}
      />
      <CornerTicks hex={swatch.hex} />
      <div className="relative flex gap-3">
        <TaskGlyph title={task.title} icon={look.icon} color={look.color} size={18} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3
              className={cn(
                "text-sm leading-5",
                done && "text-muted line-through decoration-ok/50",
              )}
            >
              {task.title}
            </h3>
            <PriorityMeter priority={task.priority} hex={swatch.hex} />
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] tracking-[0.22em] uppercase">
            <span style={{ color: done ? "var(--ok)" : swatch.hex }}>{STATUS_LABEL[task.status]}</span>
            {kindCourse ? <span className="text-muted">{kindCourse}</span> : null}
            {overdue ? <span className="text-danger">Overdue</span> : null}
            {dueToday ? <span className="text-amber">Due today</span> : null}
          </p>
          {task.notes ? (
            <TaskNotes
              notes={task.notes}
              hex={swatch.hex}
              open={notesOpen}
              onOpenChange={setNotesOpen}
            />
          ) : null}
          {task.tags.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {task.tags.map((tag) => (
                <li
                  key={tag}
                  className="rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wider text-muted"
                  style={{ borderColor: `${swatch.hex}44` }}
                >
                  {tag}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p
              className={cn(
                "font-mono text-[10px] tracking-widest",
                overdue ? "text-danger" : dueToday ? "text-amber" : "text-muted",
              )}
            >
              {dueText}
              {cadence ? ` · ${cadence}` : ""}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={`Delete ${task.title}`}
                title="Delete mission"
                disabled={busy}
                onClick={onDelete}
                className="rounded-full p-1.5 text-danger hover:bg-danger/10 disabled:opacity-50"
              >
                <Trash2 size={14} />
              </button>
              {task.status === "open" ? (
                <Button
                  shape="pill"
                  size="sm"
                  disabled={busy}
                  onClick={() => onStatus("in_progress")}
                >
                  <Play size={12} />
                  Start
                </Button>
              ) : null}
              {done ? (
                <Button
                  shape="pill"
                  size="sm"
                  disabled={busy}
                  onClick={() => onStatus("open")}
                >
                  <RotateCcw size={12} />
                  Reopen
                </Button>
              ) : (
                <Button
                  shape="pill"
                  size="sm"
                  tone="ok"
                  disabled={busy}
                  onClick={() => onStatus("done")}
                >
                  <Check size={12} />
                  Complete
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function TaskNotes({
  notes,
  hex,
  open,
  onOpenChange,
}: {
  notes: string;
  hex: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const node = textRef.current;
    if (!node) return;
    const measure = () => setOverflows(node.scrollHeight > node.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [notes]);

  useLayoutEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open, onOpenChange]);

  return (
    <div ref={rootRef} className="relative mt-2">
      <p ref={textRef} className="line-clamp-2 text-sm leading-5 text-ink/80">
        {notes}
      </p>
      {overflows ? (
        <button
          type="button"
          className="mt-1 font-mono text-[10px] tracking-[0.18em] text-cyan uppercase hover:text-cyan-2"
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
        >
          {open ? "See less" : "See more"}
        </button>
      ) : null}
      {open ? (
        <div
          className="absolute top-full right-0 left-0 z-20 mt-1 max-h-40 overflow-y-auto rounded-lg border bg-hud px-3 py-2 text-sm leading-5 text-ink/90 shadow-[0_16px_36px_rgba(0,0,0,0.55)]"
          style={{ borderColor: `${hex}66` }}
        >
          {notes}
        </div>
      ) : null}
    </div>
  );
}

function CornerTicks({ hex }: { hex: string }) {
  const tick = "pointer-events-none absolute h-2.5 w-2.5";
  return (
    <>
      <span className={`${tick} top-2 left-2 border-t border-l`} style={{ borderColor: hex }} />
      <span className={`${tick} top-2 right-2 border-t border-r`} style={{ borderColor: hex }} />
      <span className={`${tick} bottom-2 left-2 border-b border-l`} style={{ borderColor: hex }} />
      <span className={`${tick} right-2 bottom-2 border-r border-b`} style={{ borderColor: hex }} />
    </>
  );
}

function PriorityMeter({ priority, hex }: { priority: TaskPriority; hex: string }) {
  const filled = priority === "high" ? 3 : priority === "medium" ? 2 : 1;
  return (
    <span className="mt-0.5 flex items-end gap-0.5" title={`${priority} priority`}>
      {[1, 2, 3].map((level) => (
        <span
          key={level}
          className="w-1 rounded-sm"
          style={{
            height: 4 + level * 3,
            background: level <= filled ? hex : "rgba(122,164,184,0.28)",
          }}
        />
      ))}
    </span>
  );
}
