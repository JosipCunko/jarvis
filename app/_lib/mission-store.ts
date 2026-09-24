import "server-only";
import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { differenceInCalendarDays } from "date-fns";
import { adminDb } from "./admin";
import { isFirebaseAdminConfigured } from "./config";
import { nextRepeatDue, normalizeRepeat } from "./mission-repeat";
import { resolveTaskAppearance } from "./task-appearance";
import { parseWhen, startOfToday } from "./time";
import type {
  AppUser,
  ChatMessage,
  ChatThread,
  GoogleAccount,
  MemoryNote,
  MissionCompletion,
  MissionKind,
  MissionRepeat,
  MissionSnapshot,
  MissionStore,
  Task,
  TaskFilter,
  TaskInput,
  TaskPriority,
  TaskStatus,
} from "@/app/_types/jarvis";

type CollectionName = "tasks" | "memories" | "chats";

type EntityMap = {
  tasks: Task;
  memories: MemoryNote;
  chats: ChatThread;
};

type MemoryState = {
  users: Map<string, AppUser>;
  googleAccounts: Map<string, GoogleAccount>;
} & {
  [K in CollectionName]: Map<string, EntityMap[K]>;
};

const globalForStore = globalThis as unknown as {
  __jarvisMemory?: MemoryState;
  __jarvisHydrated?: Promise<void>;
};

const DATA_PATH = path.join(process.cwd(), ".data", "jarvis-memory.json");

function emptyMemory(): MemoryState {
  return {
    users: new Map(),
    googleAccounts: new Map(),
    tasks: new Map(),
    memories: new Map(),
    chats: new Map(),
  };
}

function memory(): MemoryState {
  if (!globalForStore.__jarvisMemory) {
    globalForStore.__jarvisMemory = emptyMemory();
  }
  return globalForStore.__jarvisMemory;
}

function firestoreEnabled() {
  return isFirebaseAdminConfigured();
}

async function ensureMemory() {
  if (firestoreEnabled()) return;
  if (!globalForStore.__jarvisHydrated) {
    globalForStore.__jarvisHydrated = (async () => {
      try {
        const raw = await readFile(DATA_PATH, "utf8");
        const json = JSON.parse(raw) as Record<string, Record<string, unknown>>;
        const state = emptyMemory();
        const mutable = state as unknown as Record<string, Map<string, unknown>>;
        for (const key of Object.keys(state)) {
          if (json[key]) {
            mutable[key] = new Map(Object.entries(json[key]));
          }
        }
        globalForStore.__jarvisMemory = state;
      } catch {
        globalForStore.__jarvisMemory = emptyMemory();
      }
    })();
  }
  await globalForStore.__jarvisHydrated;
}

async function persistMemory() {
  if (firestoreEnabled()) return;
  const state = memory();
  const json: Record<string, Record<string, unknown>> = {};
  (Object.keys(state) as (keyof MemoryState)[]).forEach((key) => {
    json[key] = Object.fromEntries(state[key]);
  });
  await mkdir(path.dirname(DATA_PATH), { recursive: true });
  await writeFile(DATA_PATH, JSON.stringify(json));
}

function userCol(userId: string, collection: CollectionName) {
  return adminDb.collection("users").doc(userId).collection(collection);
}

function resolveKind(input: MissionKind | null | undefined, existing?: MissionKind) {
  if (input === null) return undefined;
  return input ?? existing;
}

function resolveRepeat(input: MissionRepeat | null | undefined, existing?: MissionRepeat) {
  if (input === null) return undefined;
  if (input) return normalizeRepeat(input);
  return existing ? normalizeRepeat(existing) : undefined;
}

function blankToUndefined(value?: string) {
  const text = value?.trim();
  return text ? text : undefined;
}

function compactTask(task: Task) {
  const copy = { ...task };
  (Object.keys(copy) as (keyof Task)[]).forEach((key) => {
    if (copy[key] === undefined) delete copy[key];
  });
  return copy;
}

function asTaskStatus(value: unknown): TaskStatus {
  return value === "in_progress" || value === "done" ? value : "open";
}

function asPriority(value: unknown): TaskPriority {
  return value === "low" || value === "high" ? value : "medium";
}

function matchesFilter(task: Task, filter?: TaskFilter) {
  if (!filter) return true;
  if (filter.status === "active" && task.status === "done") return false;
  if (filter.status && filter.status !== "active" && task.status !== filter.status) {
    return false;
  }
  if (filter.dueBefore && (task.dueAt == null || task.dueAt > filter.dueBefore)) {
    return false;
  }
  if (filter.dueAfter && (task.dueAt == null || task.dueAt < filter.dueAfter)) {
    return false;
  }
  if (filter.query) {
    const q = filter.query.toLowerCase();
    const hay = `${task.title} ${task.course ?? ""} ${task.kind ?? ""} ${task.notes ?? ""} ${task.tags.join(" ")}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function sortTasks(tasks: Task[]) {
  return [...tasks].sort((a, b) => {
    const statusRank = Number(a.status === "done") - Number(b.status === "done");
    if (statusRank !== 0) return statusRank;
    const dueA = a.dueAt ?? Number.MAX_SAFE_INTEGER;
    const dueB = b.dueAt ?? Number.MAX_SAFE_INTEGER;
    if (dueA !== dueB) return dueA - dueB;
    return b.updatedAt - a.updatedAt;
  });
}

async function listCollection<K extends CollectionName>(
  collection: K,
  userId: string,
): Promise<EntityMap[K][]> {
  await ensureMemory();
  if (firestoreEnabled()) {
    const snap = await userCol(userId, collection).get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as EntityMap[K][];
  }
  return [...memory()[collection].values()].filter(
    (item) => item.userId === userId,
  ) as EntityMap[K][];
}

async function getCollectionDoc<K extends CollectionName>(
  collection: K,
  userId: string,
  id: string,
): Promise<EntityMap[K] | null> {
  await ensureMemory();
  if (firestoreEnabled()) {
    const snap = await userCol(userId, collection).doc(id).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...snap.data() } as EntityMap[K];
  }
  const existing = memory()[collection].get(id);
  if (!existing || existing.userId !== userId) return null;
  return existing as EntityMap[K];
}

async function setCollectionDoc<K extends CollectionName>(
  collection: K,
  doc: EntityMap[K],
) {
  await ensureMemory();
  if (firestoreEnabled()) {
    const payload = { ...(doc as EntityMap[K] & { id: string }) };
    await userCol(doc.userId, collection).doc(doc.id).set(payload);
    return;
  }
  (memory()[collection] as Map<string, EntityMap[K]>).set(doc.id, doc);
  await persistMemory();
}

async function deleteCollectionDoc<K extends CollectionName>(
  collection: K,
  userId: string,
  id: string,
) {
  await ensureMemory();
  if (firestoreEnabled()) {
    const ref = userCol(userId, collection).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return false;
    await ref.delete();
    return true;
  }
  const bucket = memory()[collection] as Map<string, EntityMap[K]>;
  const existing = bucket.get(id);
  if (!existing || existing.userId !== userId) return false;
  bucket.delete(id);
  await persistMemory();
  return true;
}

class FirestoreMissionStore implements MissionStore {
  async upsertUser(user: AppUser) {
    await ensureMemory();
    if (firestoreEnabled()) {
      await adminDb.collection("users").doc(user.uid).set(user, { merge: true });
      return;
    }
    memory().users.set(user.uid, user);
    await persistMemory();
  }

  async getUser(userId: string) {
    await ensureMemory();
    if (firestoreEnabled()) {
      const snap = await adminDb.collection("users").doc(userId).get();
      return snap.exists ? (snap.data() as AppUser) : null;
    }
    return memory().users.get(userId) ?? null;
  }

  async listTasks(userId: string, filter?: TaskFilter) {
    const tasks = await listCollection("tasks", userId);
    return sortTasks(tasks.filter((task) => matchesFilter(task, filter)));
  }

  async upsertTask(userId: string, input: TaskInput) {
    const now = Date.now();
    const existing = input.id ? await getCollectionDoc("tasks", userId, input.id) : null;
    const title = input.title.trim() || existing?.title || "Untitled mission";
    const appearance = resolveTaskAppearance({
      title,
      icon: input.icon ?? existing?.icon,
      color: input.color ?? existing?.color,
    });
    const status = asTaskStatus(input.status ?? existing?.status);
    const id = existing?.id ?? input.id ?? randomUUID();
    const repeat = resolveRepeat(input.repeat, existing?.repeat);
    const seriesId = repeat ? existing?.seriesId ?? input.seriesId ?? id : existing?.seriesId;
    const task = compactTask({
      id,
      userId,
      title,
      status,
      priority: asPriority(input.priority ?? existing?.priority),
      dueAt: parseWhen(input.dueAt) ?? existing?.dueAt,
      tags: input.tags ?? existing?.tags ?? [],
      notes: input.notes === null ? undefined : input.notes ?? existing?.notes,
      icon: appearance.icon,
      color: appearance.color,
      kind: resolveKind(input.kind, existing?.kind),
      course: input.course === null ? undefined : blankToUndefined(input.course ?? existing?.course),
      repeat,
      seriesId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      completedAt: status === "done" ? existing?.completedAt ?? now : undefined,
    });
    await setCollectionDoc("tasks", task);
    return task;
  }

  async deleteTask(userId: string, id: string) {
    const removed = await deleteCollectionDoc("tasks", userId, id);
    if (!removed) throw new Error("Mission not found.");
  }

  async completeTask(userId: string, id: string): Promise<MissionCompletion> {
    const existing = await getCollectionDoc("tasks", userId, id);
    if (!existing) throw new Error("Mission not found.");
    if (existing.status === "done") return { task: existing, next: null };
    const now = Date.now();
    const seriesId = existing.repeat ? existing.seriesId ?? existing.id : existing.seriesId;
    const task = compactTask({
      ...existing,
      seriesId,
      status: "done",
      completedAt: now,
      updatedAt: now,
    });
    await setCollectionDoc("tasks", task);
    const nextAt = existing.repeat ? nextRepeatDue(existing.dueAt, existing.repeat, now) : undefined;
    if (nextAt == null || !seriesId) return { task, next: null };
    const peers = await listCollection("tasks", userId);
    const hasOpen = peers.some(
      (item) => item.id !== existing.id && item.seriesId === seriesId && item.status !== "done",
    );
    if (hasOpen) return { task, next: null };
    const next = compactTask({
      ...existing,
      id: randomUUID(),
      seriesId: seriesId ?? existing.id,
      status: "open",
      dueAt: nextAt,
      createdAt: now,
      updatedAt: now,
      completedAt: undefined,
    });
    await setCollectionDoc("tasks", next);
    return { task, next };
  }

  async rescheduleTask(userId: string, id: string, dueAt: number) {
    const existing = await getCollectionDoc("tasks", userId, id);
    if (!existing) throw new Error("Mission not found.");
    const task: Task = { ...existing, dueAt, updatedAt: Date.now() };
    await setCollectionDoc("tasks", task);
    return task;
  }

  async remember(userId: string, text: string) {
    const note: MemoryNote = {
      id: randomUUID(),
      userId,
      text: text.trim(),
      createdAt: Date.now(),
    };
    await setCollectionDoc("memories", note);
    return note;
  }

  async listMemories(userId: string) {
    const notes = await listCollection("memories", userId);
    return notes.sort((a, b) => b.createdAt - a.createdAt);
  }

  async recall(userId: string, query?: string) {
    const notes = await this.listMemories(userId);
    if (!query?.trim()) return notes.slice(0, 8);
    const q = query.toLowerCase();
    return notes.filter((note) => note.text.toLowerCase().includes(q)).slice(0, 8);
  }

  async forgetMemory(userId: string, id: string) {
    const removed = await deleteCollectionDoc("memories", userId, id);
    if (!removed) throw new Error("Memory not found.");
  }

  async listChatThreads(userId: string) {
    const chats = await listCollection("chats", userId);
    return chats.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async listAllChatThreads() {
    await ensureMemory();
    if (firestoreEnabled()) {
      const snap = await adminDb.collectionGroup("chats").get();
      const threads: ChatThread[] = [];
      for (const doc of snap.docs) {
        const data = doc.data() as Partial<ChatThread>;
        const userId = data.userId || doc.ref.parent.parent?.id;
        if (!userId) continue;
        threads.push({
          id: doc.id,
          userId,
          title: data.title || "Conversation",
          messages: Array.isArray(data.messages) ? data.messages : [],
          updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : 0,
        });
      }
      return threads.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    return [...memory().chats.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async listChats(userId: string) {
    const chats = await this.listChatThreads(userId);
    return chats.map((chat) => ({
      id: chat.id,
      title: chat.title || "Conversation",
      updatedAt: chat.updatedAt,
    }));
  }

  async getChat(userId: string, id: string) {
    return getCollectionDoc("chats", userId, id);
  }

  async saveChat(
    userId: string,
    chatId: string | undefined,
    messages: ChatMessage[],
    title?: string,
  ) {
    const existing = chatId ? await this.getChat(userId, chatId) : null;
    const firstUser = messages.find((item) => item.role === "user");
    const thread: ChatThread = {
      id: existing?.id ?? randomUUID(),
      userId,
      title:
        title ||
        existing?.title ||
        firstUser?.content.slice(0, 60) ||
        firstUser?.attachments?.[0]?.name ||
        "Conversation",
      messages: messages.map((message) => ({
        ...message,
        attachments: message.attachments?.map((item) => ({
          name: item.name,
          mimeType: item.mimeType,
        })),
      })),
      updatedAt: Date.now(),
    };
    await setCollectionDoc("chats", thread);
    return thread;
  }

  async renameChat(userId: string, id: string, title: string) {
    const existing = await this.getChat(userId, id);
    if (!existing) throw new Error("Conversation not found.");
    const trimmed = title.trim().slice(0, 80);
    if (!trimmed) throw new Error("Title is required.");
    const thread: ChatThread = { ...existing, title: trimmed };
    await setCollectionDoc("chats", thread);
    return thread;
  }

  async deleteChat(userId: string, id: string) {
    const removed = await deleteCollectionDoc("chats", userId, id);
    if (!removed) throw new Error("Conversation not found.");
  }

  async loadSnapshot(userId: string): Promise<MissionSnapshot> {
    const [user, tasks, memories] = await Promise.all([
      this.getUser(userId),
      this.listTasks(userId),
      this.listMemories(userId),
    ]);
    return {
      user: user ?? {
        uid: userId,
        displayName: "Operator",
        email: "",
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
        provider: "demo",
      },
      tasks,
      memories,
    };
  }

  async ensureSeedData(userId: string) {
    const existing = await this.listTasks(userId);
    if (existing.length > 0) return;
    const today = startOfToday();
    await this.upsertTask(userId, {
      title: "Daily standup",
      status: "done",
      priority: "medium",
      dueAt: today + 8 * 60 * 60 * 1000,
      tags: ["work"],
      icon: "users",
      color: "amber",
    });
    await this.upsertTask(userId, {
      title: "Finalize HUD panel spacing",
      status: "in_progress",
      priority: "high",
      dueAt: today + 12 * 60 * 60 * 1000,
      tags: ["jarvis", "ui"],
      icon: "code",
      color: "cyan",
    });
    await this.upsertTask(userId, {
      title: "Deep-work block: voice pipeline",
      status: "open",
      priority: "high",
      dueAt: today + 16 * 60 * 60 * 1000,
      tags: ["speech"],
      notes: "Phase 2 — Web Speech API into the Talk bar.",
      icon: "mic",
      color: "violet",
    });
    await this.upsertTask(userId, {
      title: "Design review — Command Center v1",
      status: "open",
      priority: "medium",
      dueAt: today + 26 * 60 * 60 * 1000,
      tags: ["review"],
      icon: "pen",
      color: "gold",
    });
    await this.remember(
      userId,
      "Prefer generative UI cards over long text. Keep the cyan HUD language terse.",
    );
  }

  async getGoogleAccount(userId: string) {
    await ensureMemory();
    if (firestoreEnabled()) {
      const snap = await adminDb
        .collection("users")
        .doc(userId)
        .collection("secrets")
        .doc("google")
        .get();
      return snap.exists ? (snap.data() as GoogleAccount) : null;
    }
    return memory().googleAccounts.get(userId) ?? null;
  }

  async saveGoogleAccount(account: GoogleAccount) {
    await ensureMemory();
    if (firestoreEnabled()) {
      await adminDb
        .collection("users")
        .doc(account.userId)
        .collection("secrets")
        .doc("google")
        .set(account);
      return;
    }
    memory().googleAccounts.set(account.userId, account);
    await persistMemory();
  }

  async deleteGoogleAccount(userId: string) {
    await ensureMemory();
    if (firestoreEnabled()) {
      await adminDb
        .collection("users")
        .doc(userId)
        .collection("secrets")
        .doc("google")
        .delete();
      return;
    }
    memory().googleAccounts.delete(userId);
    await persistMemory();
  }
}

let store: MissionStore | null = null;

export function getMissionStore(): MissionStore {
  if (!store) store = new FirestoreMissionStore();
  return store;
}

export function daysUntilDue(task: Task) {
  if (!task.dueAt) return null;
  return differenceInCalendarDays(task.dueAt, Date.now());
}
