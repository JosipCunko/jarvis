import type { MemoryKind, MemoryNote } from "@/app/_types/jarvis";

export const MEMORY_KINDS = ["fact", "preference", "instruction"] as const;

export const PROMPT_MEMORY_CHAR_CAP = 1500;

const STALE_MONTHS = 3;

export function parseMemoryKind(value: unknown): MemoryKind | undefined {
  if (value === "fact" || value === "preference" || value === "instruction") return value;
  return undefined;
}

export function memoryKind(note: Pick<MemoryNote, "kind">): MemoryKind {
  return note.kind ?? "fact";
}

export function normalizeMemoryText(text: string) {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export function staleMemoryCutoff(now = Date.now()) {
  const date = new Date(now);
  date.setMonth(date.getMonth() - STALE_MONTHS);
  return date.getTime();
}

export function isCleanupCandidate(note: MemoryNote, now = Date.now()) {
  return !note.pinned && note.createdAt < staleMemoryCutoff(now);
}

function memoryLine(note: MemoryNote) {
  const pin = note.pinned ? "pinned " : "";
  return `- ${note.id} [${pin}${memoryKind(note)}] ${note.text}`;
}

export function formatPromptMemories(notes: MemoryNote[]) {
  if (notes.length === 0) return "Nothing stored yet.";
  const pinned = notes.filter((note) => note.pinned);
  const rest = notes.filter((note) => !note.pinned);
  const chosen: MemoryNote[] = [];
  let chars = 0;
  for (const note of pinned) {
    const line = memoryLine(note);
    chosen.push(note);
    chars += line.length + 1;
  }
  let omitted = 0;
  for (const note of rest) {
    const line = memoryLine(note);
    const next = chars + line.length + 1;
    if (next > PROMPT_MEMORY_CHAR_CAP) {
      omitted += 1;
      continue;
    }
    chosen.push(note);
    chars = next;
  }
  const lines = chosen.map(memoryLine);
  if (omitted > 0) {
    lines.push(
      `${omitted} more notes are stored. Call recall to search them.`,
    );
  }
  return lines.join("\n");
}
