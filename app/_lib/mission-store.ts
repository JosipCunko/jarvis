import "server-only";
import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { differenceInCalendarDays } from "date-fns";
import { adminDb } from "./admin";
import { isFirebaseAdminConfigured } from "./config";
import { parseWhen, startOfToday } from "./time";
import type {
  AppUser,
  ChatMessage,
  ChatThread,
  GoogleAccount,
  MemoryNote,
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
    const hay = `${task.title} ${task.notes ?? ""} ${task.tags.join(" ")}`.toLowerCase();
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
    const task: Task = {
      id: existing?.id ?? input.id ?? randomUUID(),
      userId,
      title: input.title.trim() || existing?.title || "Untitled mission",
      status: asTaskStatus(input.status ?? existing?.status),
      priority: asPriority(input.priority ?? existing?.priority),
      dueAt: parseWhen(input.dueAt) ?? existing?.dueAt,
      tags: input.tags ?? existing?.tags ?? [],
      notes: input.notes ?? existing?.notes,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      completedAt:
        asTaskStatus(input.status ?? existing?.status) === "done"
          ? existing?.completedAt ?? now
          : undefined,
    };
    await setCollectionDoc("tasks", task);
    return task;
  }

  async completeTask(userId: string, id: string) {
    const existing = await getCollectionDoc("tasks", userId, id);
    if (!existing) throw new Error("Task not found.");
    const task: Task = {
      ...existing,
      status: "done",
      completedAt: Date.now(),
      updatedAt: Date.now(),
    };
    await setCollectionDoc("tasks", task);
    return task;
  }

  async rescheduleTask(userId: string, id: string, dueAt: number) {
    const existing = await getCollectionDoc("tasks", userId, id);
    if (!existing) throw new Error("Task not found.");
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

  async recall(userId: string, query?: string) {
    const notes = (await listCollection("memories", userId)).sort(
      (a, b) => b.createdAt - a.createdAt,
    );
    if (!query?.trim()) return notes.slice(0, 8);
    const q = query.toLowerCase();
    return notes.filter((note) => note.text.toLowerCase().includes(q)).slice(0, 8);
  }

  async listChats(userId: string) {
    const chats = await listCollection("chats", userId);
    return chats
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((chat) => ({
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

  async loadSnapshot(userId: string): Promise<MissionSnapshot> {
    const [user, tasks, memories] = await Promise.all([
      this.getUser(userId),
      this.listTasks(userId),
      this.recall(userId),
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
    });
    await this.upsertTask(userId, {
      title: "Finalize HUD panel spacing",
      status: "in_progress",
      priority: "high",
      dueAt: today + 12 * 60 * 60 * 1000,
      tags: ["jarvis", "ui"],
    });
    await this.upsertTask(userId, {
      title: "Deep-work block: voice pipeline",
      status: "open",
      priority: "high",
      dueAt: today + 16 * 60 * 60 * 1000,
      tags: ["speech"],
      notes: "Phase 2 — Web Speech API into the Talk bar.",
    });
    await this.upsertTask(userId, {
      title: "Design review — Command Center v1",
      status: "open",
      priority: "medium",
      dueAt: today + 26 * 60 * 60 * 1000,
      tags: ["review"],
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
