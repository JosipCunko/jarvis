"use client";

import { useMemo, useState } from "react";
import { Brain, Search, Trash2 } from "lucide-react";
import { Button } from "@/app/_components/Button";
import { notifyError, notifySuccess } from "@/app/_components/notify";
import { formatWhen } from "@/app/_lib/time";
import type { MemoryNote } from "@/app/_types/jarvis";

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
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return memories;
    return memories.filter((note) => note.text.toLowerCase().includes(q));
  }, [memories, query]);

  async function addNote() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
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
      notifySuccess("Memory removed");
      onChanged();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Could not delete that note.");
    } finally {
      setDeletingId(null);
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
          </div>
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

        <label className="relative mt-3 block">
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
      </section>

      <section className="hud-panel rounded-xl p-4">
        {memories.length === 0 ? (
          <p className="text-sm text-muted">
            No stored notes yet. Tell JARVIS to remember something, or add one here.
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted">No notes match that search.</p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((note) => (
              <li
                key={note.id}
                className="flex items-start gap-3 rounded-lg border border-line/70 bg-hud/40 px-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm wrap-break-word whitespace-pre-wrap text-ink/90">
                    {note.text}
                  </p>
                  <p className="mt-1 font-mono text-[10px] tracking-widest text-muted">
                    {formatWhen(note.createdAt)}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-full p-2 text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                  aria-label="Delete memory"
                  disabled={deletingId === note.id}
                  onClick={() => void removeNote(note.id)}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
