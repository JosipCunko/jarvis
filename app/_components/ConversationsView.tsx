"use client";

import { useState } from "react";
import { Check, Eraser, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/app/_components/Button";
import { notifyError, notifyInfo, notifySuccess } from "@/app/_components/notify";
import { NOISE_REASON_LABEL, type NoiseReason } from "@/app/_lib/chat-noise";
import { cn } from "@/app/_lib/cn";
import { formatWhen } from "@/app/_lib/time";

export type ChatSummary = { id: string; title: string; updatedAt: number };

type CleanupHit = {
  id: string;
  title: string;
  reason: NoiseReason;
  updatedAt: number;
};

export function ConversationsView({
  threads,
  activeId,
  onNew,
  onOpen,
  onRename,
  onDelete,
  onCleaned,
}: {
  threads: ChatSummary[];
  activeId: string | null;
  onNew: () => void;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onCleaned: (ids: string[]) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<CleanupHit[] | null>(null);
  const [cleaning, setCleaning] = useState(false);

  function startRename(thread: ChatSummary) {
    setConfirmId(null);
    setEditingId(thread.id);
    setDraft(thread.title);
  }

  async function saveRename(id: string) {
    const title = draft.trim();
    if (!title || busyId) return;
    setBusyId(id);
    try {
      await onRename(id, title);
      setEditingId(null);
    } finally {
      setBusyId(null);
    }
  }

  async function scanCleanup() {
    if (cleaning) return;
    setCleaning(true);
    try {
      const response = await fetch("/api/chats/cleanup");
      const data = (await response.json().catch(() => null)) as {
        removed?: CleanupHit[];
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        throw new Error(data?.error?.message ?? "Could not scan conversations.");
      }
      const hits = data?.removed ?? [];
      if (hits.length === 0) {
        setPreview(null);
        notifyInfo("Nothing to clean up");
        return;
      }
      setPreview(hits);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Could not scan conversations.");
    } finally {
      setCleaning(false);
    }
  }

  async function applyCleanup() {
    if (cleaning || !preview?.length) return;
    setCleaning(true);
    try {
      const response = await fetch("/api/chats/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: true }),
      });
      const data = (await response.json().catch(() => null)) as {
        removed?: CleanupHit[];
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        throw new Error(data?.error?.message ?? "Could not clean up conversations.");
      }
      const removed = data?.removed ?? [];
      setPreview(null);
      notifySuccess(
        removed.length === 1 ? "Removed 1 conversation" : `Removed ${removed.length} conversations`,
      );
      onCleaned(removed.map((hit) => hit.id));
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Could not clean up conversations.");
    } finally {
      setCleaning(false);
    }
  }

  async function confirmDelete(id: string) {
    if (busyId) return;
    setBusyId(id);
    try {
      await onDelete(id);
      setConfirmId(null);
      if (editingId === id) setEditingId(null);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto grid max-w-[1600px] gap-3">
      <section className="hud-panel rounded-xl p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-mono text-[10px] tracking-[0.28em] text-muted">
              CONVERSATIONS
            </h2>
            <p className="mt-1 text-sm text-ink/90">
              {threads.length === 0 ? "No threads yet." : `${threads.length} saved`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              shape="pill"
              size="sm"
              variant="ghost"
              disabled={cleaning || threads.length === 0}
              onClick={() => void scanCleanup()}
            >
              <Eraser size={14} />
              Clean up
            </Button>
            <Button shape="pill" size="sm" variant="solid" onClick={onNew}>
              <Plus size={14} />
              New conversation
            </Button>
          </div>
        </div>

        {preview ? (
          <div className="mb-4 rounded-lg border border-amber/40 bg-amber/10 px-3 py-3">
            <p className="text-sm">
              {preview.length === 1
                ? "1 conversation looks unused."
                : `${preview.length} conversations look unused.`}
            </p>
            <p className="mt-1 text-xs text-muted">
              Greetings, gibberish, and test prompts. Threads that ask for something stay.
            </p>
            <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto pr-1">
              {preview.map((hit) => (
                <li key={hit.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{hit.title}</span>
                  <span className="shrink-0 font-mono text-[10px] tracking-widest text-muted">
                    {NOISE_REASON_LABEL[hit.reason] ?? "Unused"}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <Button
                shape="pill"
                size="sm"
                tone="danger"
                variant="solid"
                disabled={cleaning}
                onClick={() => void applyCleanup()}
              >
                Remove them
              </Button>
              <Button
                shape="pill"
                size="sm"
                variant="ghost"
                disabled={cleaning}
                onClick={() => setPreview(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {threads.length === 0 ? (
          <p className="text-sm text-muted">
            No conversations yet. Start one from the Talk bar, or begin a new thread.
          </p>
        ) : (
          <ul className="space-y-2">
            {threads.map((thread) => {
              const active = thread.id === activeId;
              const editing = editingId === thread.id;
              const confirming = confirmId === thread.id;
              return (
                <li
                  key={thread.id}
                  className={cn(
                    "rounded-lg border bg-hud/40 px-3 py-3",
                    active ? "border-cyan/70" : "border-line/70",
                  )}
                >
                  {editing ? (
                    <form
                      className="flex items-center gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void saveRename(thread.id);
                      }}
                    >
                      <input
                        value={draft}
                        autoFocus
                        maxLength={80}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") setEditingId(null);
                        }}
                        className="min-w-0 flex-1 rounded-full border border-line bg-hud px-3 py-1.5 text-sm outline-none focus:border-cyan"
                      />
                      <button
                        type="submit"
                        className="rounded-full p-2 text-cyan hover:bg-cyan/10 disabled:opacity-50"
                        aria-label="Save title"
                        disabled={busyId === thread.id || !draft.trim()}
                      >
                        <Check size={14} />
                      </button>
                      <button
                        type="button"
                        className="rounded-full p-2 text-muted hover:text-ink"
                        aria-label="Cancel rename"
                        onClick={() => setEditingId(null)}
                      >
                        <X size={14} />
                      </button>
                    </form>
                  ) : confirming ? (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm">Delete this conversation?</p>
                      <div className="flex gap-2">
                        <Button
                          shape="pill"
                          size="sm"
                          tone="danger"
                          variant="solid"
                          disabled={busyId === thread.id}
                          onClick={() => void confirmDelete(thread.id)}
                        >
                          Delete
                        </Button>
                        <Button
                          shape="pill"
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => onOpen(thread.id)}
                      >
                        <p className={cn("truncate text-sm", active && "text-cyan")}>
                          {thread.title}
                        </p>
                        <p className="mt-1 font-mono text-[10px] tracking-widest text-muted">
                          {formatWhen(thread.updatedAt)}
                          {active ? " · Open" : ""}
                        </p>
                      </button>
                      <button
                        type="button"
                        className="rounded-full p-2 text-muted hover:bg-cyan/10 hover:text-cyan"
                        aria-label="Rename conversation"
                        onClick={() => startRename(thread)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className="rounded-full p-2 text-muted hover:bg-danger/10 hover:text-danger"
                        aria-label="Delete conversation"
                        onClick={() => {
                          setEditingId(null);
                          setConfirmId(thread.id);
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
