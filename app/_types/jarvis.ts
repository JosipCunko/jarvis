export type TaskStatus = "open" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";
export type AuthProvider = "firebase" | "demo";

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  createdAt: number;
  lastLoginAt: number;
  provider: AuthProvider;
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt?: number;
  tags: string[];
  notes?: string;
  icon?: string;
  color?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface TaskInput {
  id?: string;
  title: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueAt?: number | string;
  tags?: string[];
  notes?: string;
  icon?: string;
  color?: string;
}

export interface TaskFilter {
  status?: TaskStatus | "active";
  dueBefore?: number;
  dueAfter?: number;
  query?: string;
}

export interface MemoryNote {
  id: string;
  userId: string;
  text: string;
  createdAt: number;
}

export interface FunctionResult {
  name: string;
  result: Record<string, unknown>;
}

export interface ChatAttachment {
  name: string;
  mimeType: string;
  dataUrl?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  attachments?: ChatAttachment[];
  functionResults?: FunctionResult[];
}

export interface GoogleAccount {
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  expiry: number;
  scopes: string;
  updatedAt: number;
}

export interface ChatThread {
  id: string;
  userId: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}

export interface MissionSnapshot {
  user: AppUser;
  tasks: Task[];
  memories: MemoryNote[];
}

export interface MissionStore {
  upsertUser(user: AppUser): Promise<void>;
  getUser(userId: string): Promise<AppUser | null>;
  listTasks(userId: string, filter?: TaskFilter): Promise<Task[]>;
  upsertTask(userId: string, task: TaskInput): Promise<Task>;
  completeTask(userId: string, id: string): Promise<Task>;
  deleteTask(userId: string, id: string): Promise<void>;
  rescheduleTask(userId: string, id: string, dueAt: number): Promise<Task>;
  remember(userId: string, text: string): Promise<MemoryNote>;
  recall(userId: string, query?: string): Promise<MemoryNote[]>;
  listMemories(userId: string): Promise<MemoryNote[]>;
  forgetMemory(userId: string, id: string): Promise<void>;
  listChats(userId: string): Promise<Pick<ChatThread, "id" | "title" | "updatedAt">[]>;
  listChatThreads(userId: string): Promise<ChatThread[]>;
  listAllChatThreads(): Promise<ChatThread[]>;
  getChat(userId: string, id: string): Promise<ChatThread | null>;
  saveChat(
    userId: string,
    chatId: string | undefined,
    messages: ChatMessage[],
    title?: string,
  ): Promise<ChatThread>;
  renameChat(userId: string, id: string, title: string): Promise<ChatThread>;
  deleteChat(userId: string, id: string): Promise<void>;
  loadSnapshot(userId: string): Promise<MissionSnapshot>;
  ensureSeedData(userId: string): Promise<void>;
  getGoogleAccount(userId: string): Promise<GoogleAccount | null>;
  saveGoogleAccount(account: GoogleAccount): Promise<void>;
  deleteGoogleAccount(userId: string): Promise<void>;
}
