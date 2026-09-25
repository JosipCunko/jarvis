"use client";

import { useMemo, useState } from "react";
import { Brain, Pencil, Pin, Search, Trash2 } from "lucide-react";
import { Button } from "@/app/_components/Button";
import { notifyError, notifySuccess } from "@/app/_components/notify";
import { isCleanupCandidate, MEMORY_KINDS, memoryKind } from "@/app/_lib/memory";
import { formatWhen } from "@/app/_lib/time";
import type { MemoryKind, MemoryNote } from "@/app/_types/jarvis";

const KIND_LABEL: Record<MemoryKind, string> = {
  fact: "Fact",
  preference: "Preference",
  instruction: "Instruction",
};

export function MemoryView({
  memories,
  onChanged,
  onAskJarvis,
}: {
  memories: MemoryNote[];
  onChanged: () => void;
  onAskJarvis: () => void;
}) {
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<MemoryKind | "all">("all");
  const [draft, setDraft] = useState("");
  const [draftKind, setDraftKind] = useState<MemoryKind>("fact");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editKind, setEditKind] = useState<MemoryKind>("fact");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const staleCount = useMemo(
    () => memories.filter((note) => isCleanupCandidate(note)).length,
    [memories],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = memories.filter((note) => {
      if (kindFilter !== "all" && memoryKind(note) !== kindFilter) return false;
      if (!q) return true;
      return note.text.toLowerCase().includes(q);
    });
    return [...matched.filter((note) => note.pinned), ...matched.filter((note) => !note.pinned)];
  }, [memories, query, kindFilter]);

  async function addNote() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, kind: draftKind }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        throw new Error(data?.error?.message ?? "Could not store that note.");
      }
      setDraft("");
      notifySuccess("Memory stored");
      onChanged();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Could not store that note.");
    } finally {
      setBusy(false);
    }
  }

  async function patchNote(id: string, body: { text?: string; kind?: MemoryKind; pinned?: boolean }) {
    const response = await fetch(`/api/memories/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    if (!response.ok) {
      throw new Error(data?.error?.message ?? "Could not update that note.");
    }
  }

  async function saveEdit(id: string) {
    const text = editText.trim();
    if (!text || savingId) return;
    setSavingId(id);
    try {
      await patchNote(id, { text, kind: editKind });
      setEditingId(null);
      notifySuccess("Memory updated");
      onChanged();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Could not update that note.");
    } finally {
      setSavingId(null);
    }
  }

  async function togglePin(note: MemoryNote) {
    setPinningId(note.id);
    try {
      await patchNote(note.id, { pinned: !note.pinned });
      notifySuccess(note.pinned ? "Memory unpinned" : "Memory pinned");
      onChanged();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Could not update that note.");
    } finally {
      setPinningId(null);
    }
  }

  async function removeNote(id: string) {
    setDeletingId(id);
    try {
      const response = await fetch(`/api/memories/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        throw new Error(data?.error?.message ?? "Could not delete that note.");
      }
      if (editingId === id) setEditingId(null);
      notifySuccess("Memory removed");
      onChanged();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Could not delete that note.");
    } finally {
      setDeletingId(null);
    }
  }

  async function clearStale() {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setClearing(true);
    try {
      const response = await fetch("/api/memories/cleanup", { method: "POST" });
      const data = (await response.json().catch(() => null)) as {
        removed?: number;
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        throw new Error(data?.error?.message ?? "Could not clear old notes.");
      }
      notifySuccess(
        data?.removed ? `Removed ${data.removed} old notes` : "No old notes to remove",
      );
      onChanged();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Could not clear old notes.");
    } finally {
      setClearing(false);
      setConfirmClear(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-[1600px] gap-3">
      <section className="hud-panel rounded-xl p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-mono text-[10px] tracking-[0.28em] text-muted">MEMORY</h2>
            <p className="mt-1 text-sm text-ink/90">
              {memories.length === 0 ? "No stored notes yet." : `${memories.length} stored`}
            </p>
            <p className="mt-1 text-sm text-muted">
              Pinned notes are included in every reply. Other notes are searched when you ask.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              shape="pill"
              size="sm"
              tone="danger"
              title="Removes unpinned notes older than 3 months. Pinned notes stay."
              disabled={clearing || staleCount === 0}
              onClick={() => void clearStale()}
            >
              {confirmClear && staleCount > 0
                ? `Remove ${staleCount} old notes`
                : "Clear notes older than 3 months"}
            </Button>
            <Button
              shape="pill"
              size="sm"
              onClick={onAskJarvis}
              disabled={memories.length === 0}
            >
              <Brain size={14} />
              Ask JARVIS
            </Button>
          </div>
        </div>

        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            void addNote();
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Store a note JARVIS should remember…"
            maxLength={500}
            className="min-w-0 flex-1 rounded-full border border-line bg-hud px-4 py-2 text-sm outline-none focus:border-cyan"
          />
          <select
            value={draftKind}
            onChange={(event) => setDraftKind(event.target.value as MemoryKind)}
            aria-label="Note kind"
            className="rounded-full border border-line bg-hud px-3 py-2 text-sm outline-none focus:border-cyan"
          >
            {MEMORY_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABEL[kind]}
              </option>
            ))}
          </select>
          <Button
            type="submit"
            shape="pill"
            size="sm"
            variant="solid"
            disabled={busy || !draft.trim()}
          >
            Remember
          </Button>
        </form>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative block min-w-0 flex-1">
            <Search
              size={14}
              className="absolute top-1/2 left-3 -translate-y-1/2 text-muted"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search memories…"
              className="w-full rounded-full border border-line bg-hud py-2 pr-3 pl-9 text-sm outline-none focus:border-cyan"
            />
          </label>
          <div className="flex flex-wrap gap-1">
            {(["all", ...MEMORY_KINDS] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setKindFilter(kind)}
                className={`rounded-full border px-3 py-1 font-mono text-[10px] tracking-widest ${
                  kindFilter === kind
                    ? "border-cyan text-cyan"
                    : "border-line text-muted hover:text-ink"
                }`}
              >
                {kind === "all" ? "ALL" : KIND_LABEL[kind].toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="hud-panel rounded-xl p-4">
        {memories.length === 0 ? (
          <p className="text-sm text-muted">
            No stored notes yet. Tell JARVIS to remember something, or add one here.
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted">No notes match.</p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((note) => {
              const kind = memoryKind(note);
              const editing = editingId === note.id;
              return (
                <li
                  key={note.id}
                  className="flex items-start gap-3 rounded-lg border border-line/70 bg-hud/40 px-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    {editing ? (
                      <form
                        className="flex flex-col gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void saveEdit(note.id);
                        }}
                      >
                        <textarea
                          value={editText}
                          onChange={(event) => setEditText(event.target.value)}
                          maxLength={500}
                          rows={3}
                          className="w-full rounded-lg border border-line bg-hud px-3 py-2 text-sm outline-none focus:border-cyan"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={editKind}
                            onChange={(event) => setEditKind(event.target.value as MemoryKind)}
                            aria-label="Note kind"
                            className="rounded-full border border-line bg-hud px-3 py-1 text-sm outline-none focus:border-cyan"
                          >
                            {MEMORY_KINDS.map((item) => (
                              <option key={item} value={item}>
                                {KIND_LABEL[item]}
                              </option>
                            ))}
                          </select>
                          <Button
                            type="submit"
                            shape="pill"
                            size="sm"
                            variant="solid"
                            disabled={savingId === note.id || !editText.trim()}
                          >
                            Save
                          </Button>
                          <Button
                            type="button"
                            shape="pill"
                            size="sm"
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <p className="text-sm wrap-break-word whitespace-pre-wrap text-ink/90">
                        {note.text}
                      </p>
                    )}
                    <p className="mt-1 font-mono text-[10px] tracking-widest text-muted">
                      {note.pinned ? "PINNED · " : ""}
                      {KIND_LABEL[kind].toUpperCase()} · {formatWhen(note.updatedAt ?? note.createdAt)}
                      {note.pinned ? " · IN EVERY REPLY" : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      className={`rounded-full p-2 disabled:opacity-50 ${
                        note.pinned ? "text-cyan" : "text-muted hover:text-ink"
                      }`}
                      aria-label={note.pinned ? "Unpin memory" : "Pin memory"}
                      disabled={pinningId === note.id}
                      onClick={() => void togglePin(note)}
                    >
                      <Pin size={14} />
                    </button>
                    <button
                      type="button"
                      className="rounded-full p-2 text-muted hover:text-ink disabled:opacity-50"
                      aria-label="Edit memory"
                      disabled={editing}
                      onClick={() => {
                        setEditingId(note.id);
                        setEditText(note.text);
                        setEditKind(kind);
                        setConfirmClear(false);
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="rounded-full p-2 text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                      aria-label="Delete memory"
                      disabled={deletingId === note.id}
                      onClick={() => void removeNote(note.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
