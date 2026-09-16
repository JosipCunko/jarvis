"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  BookOpen,
  Bot,
  Brain,
  CalendarDays,
  Check,
  CircleAlert,
  Cpu,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Mail,
  MessageSquare,
  Mic,
  Paperclip,
  Play,
  Plus,
  Search,
  Settings,
  Sparkles,
  Wrench,
  Workflow,
  X,
} from "lucide-react";
import { Button } from "@/app/_components/Button";
import JarvisCore from "@/app/_components/JarvisCore";
import { notifyError, notifyInfo, notifySuccess } from "@/app/_components/notify";
import { looksLikeGenUi, readableFromGenUi } from "@/app/_lib/c1";
import { signOut } from "@/app/_lib/auth-client";
import { cn } from "@/app/_lib/cn";
import { useSpeechRecognition } from "@/app/_lib/use-speech-recognition";
import { formatClock, formatDateLabel, formatWhen, startOfToday } from "@/app/_lib/time";
import type {
  ChatAttachment,
  ChatMessage,
  ChatThread,
  FunctionResult,
  MissionSnapshot,
  Task,
} from "@/app/_types/jarvis";

const C1Message = dynamic(() => import("./C1Message"), {
  ssr: false,
  loading: () => <p className="text-sm text-muted">Composing interface…</p>,
});

type ChatSummary = { id: string; title: string; updatedAt: number };

const NAV = [
  { id: "command", label: "Command Center", icon: LayoutDashboard, live: true },
  { id: "core", label: "AI Core", icon: Cpu, live: false },
  { id: "agents", label: "Agents", icon: Bot, live: false, badge: "5" },
  { id: "tasks", label: "Tasks", icon: ListChecks, live: true, prompt: "List my active missions." },
  { id: "calendar", label: "Calendar", icon: CalendarDays, live: true, prompt: "What's on my Google Calendar and mission timeline today and tomorrow?" },
  { id: "memory", label: "Memory", icon: Brain, live: true, prompt: "Recall stored memories." },
  { id: "conversations", label: "Conversations", icon: MessageSquare, live: true },
  { id: "knowledge", label: "Knowledge Base", icon: BookOpen, live: false },
  { id: "tools", label: "Tools & Skills", icon: Wrench, live: false },
  { id: "workflows", label: "Workflows", icon: Workflow, live: false },
] as const;

const AGENTS = [
  { name: "Coding Agent", status: "Standby", tone: "cyan" },
  { name: "Research Agent", status: "Standby", tone: "cyan" },
  { name: "Memory Agent", status: "Ready", tone: "ok" },
  { name: "Browser Agent", status: "Soon", tone: "muted" },
  { name: "Task Agent", status: "Ready", tone: "ok" },
  { name: "System Agent", status: "Local offline", tone: "muted" },
] as const;

const QUICK = [
  { label: "Start New Task", prompt: "Help me create a new task. Ask me for the title and due date if needed." },
  { label: "Open Calendar", prompt: "Summarize my Google Calendar and mission timeline for today and tomorrow." },
  { label: "Start Voice Chat", prompt: "" },
  { label: "Run Workflow", prompt: "Give me today's executive briefing with overdue work." },
] as const;

const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 4.5 * 1024 * 1024;

export default function CommandCenter({
  operatorName,
  initialSnapshot,
  thesysReady,
  googleConfigured,
  googleEmail: initialGoogleEmail,
}: {
  operatorName: string;
  initialSnapshot: MissionSnapshot;
  thesysReady: boolean;
  googleConfigured: boolean;
  googleEmail: string | null;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date());
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState("");
  const [pending, setPending] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ChatSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [googleEmail, setGoogleEmail] = useState(initialGoogleEmail);
  const [voiceChat, setVoiceChat] = useState(false);
  const dictationBaseRef = useRef("");
  const voiceChatRef = useRef(false);
  const pendingRef = useRef(false);
  const submitRef = useRef<(text: string) => void>(() => {});
  const stopSpeechRef = useRef<() => void>(() => {});

  voiceChatRef.current = voiceChat;
  pendingRef.current = pending;

  const {
    supported: speechSupported,
    ready: speechReady,
    listening,
    start: startSpeech,
    stop: stopSpeech,
  } = useSpeechRecognition({
    onInterim(text) {
      const base = dictationBaseRef.current.trim();
      setInput(base ? `${base} ${text}` : text);
    },
    onFinal(text) {
      if (pendingRef.current) return;
      const base = dictationBaseRef.current.trim();
      const content = (base ? `${base} ${text}` : text).trim();
      dictationBaseRef.current = "";
      if (!content) return;
      if (!voiceChatRef.current) stopSpeechRef.current();
      submitRef.current(content);
    },
    onError(message) {
      notifyError(message);
      setVoiceChat(false);
      stopSpeechRef.current();
    },
  });

  stopSpeechRef.current = stopSpeech;

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    void refreshThreads();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const google = params.get("google");
    if (google === "connected") {
      notifySuccess("Google Calendar and Gmail connected");
      window.history.replaceState({}, "", "/");
    } else if (google === "denied") {
      notifyError("Google access was denied");
      window.history.replaceState({}, "", "/");
    } else if (google === "error") {
      notifyError("Could not connect Google. Check the OAuth client and redirect URI");
      window.history.replaceState({}, "", "/");
    }
    void refreshGoogle();
  }, []);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, streaming]);

  const tasks = snapshot.tasks;
  const activeTasks = tasks.filter((task) => task.status !== "done");
  const overdue = activeTasks.filter(
    (task) => task.dueAt != null && task.dueAt < startOfToday(),
  );
  const dueSoon = activeTasks.filter(
    (task) => task.dueAt != null && task.dueAt >= startOfToday(),
  );
  const memoryCount = snapshot.memories.length;
  const systemStatus = overdue.length ? "ATTENTION" : "OPTIMAL";
  const voiceLive = listening || voiceChat;

  async function refreshMissions() {
    const response = await fetch("/api/missions");
    if (!response.ok) return;
    const data = (await response.json()) as { snapshot?: MissionSnapshot };
    if (data.snapshot) setSnapshot(data.snapshot);
  }

  async function refreshThreads() {
    const response = await fetch("/api/ai/thesys");
    if (!response.ok) return [];
    const data = (await response.json()) as { chats?: ChatSummary[] };
    const next = data.chats ?? [];
    setThreads(next);
    return next;
  }

  async function refreshGoogle() {
    const response = await fetch("/api/google/status");
    if (!response.ok) return;
    const data = (await response.json()) as { connected?: boolean; email?: string | null };
    setGoogleEmail(data.connected ? data.email ?? null : null);
  }

  async function disconnectGoogle() {
    const response = await fetch("/api/google/disconnect", { method: "POST" });
    if (!response.ok) {
      notifyError("Could not disconnect Google");
      return;
    }
    setGoogleEmail(null);
    notifySuccess("Google disconnected");
  }

  function readFileAsAttachment(file: File) {
    return new Promise<ChatAttachment>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          name: file.name || "image.png",
          mimeType: file.type || "image/png",
          dataUrl: String(reader.result ?? ""),
        });
      };
      reader.onerror = () => reject(new Error("Could not read that file."));
      reader.readAsDataURL(file);
    });
  }

  async function addFiles(files: File[]) {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) return;
    const remaining = MAX_ATTACHMENTS - attachments.length;
    if (remaining <= 0) {
      notifyError(`You can attach up to ${MAX_ATTACHMENTS} images`);
      return;
    }
    const next: ChatAttachment[] = [];
    for (const file of images.slice(0, remaining)) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        notifyError(`${file.name} is too large (max 4.5 MB)`);
        continue;
      }
      next.push(await readFileAsAttachment(file));
    }
    if (next.length) setAttachments((current) => [...current, ...next]);
  }

  function onPaste(event: React.ClipboardEvent) {
    const files = [...(event.clipboardData?.files ?? [])].filter((file) =>
      file.type.startsWith("image/"),
    );
    if (files.length === 0) return;
    event.preventDefault();
    void addFiles(files);
  }

  async function openThread(id: string) {
    const response = await fetch(`/api/ai/thesys?id=${encodeURIComponent(id)}`);
    if (!response.ok) throw new Error("Could not load that conversation.");
    const data = (await response.json()) as { chat?: ChatThread };
    const chat = data.chat;
    if (!chat) throw new Error("Chat not found.");
    setChatId(chat.id);
    setMessages(
      (chat.messages ?? []).filter(
        (message) => message.role === "user" || message.role === "assistant",
      ),
    );
    setShowHistory(true);
  }

  async function submit(text: string) {
    const content = text.trim();
    const files = attachments;
    if ((!content && files.length === 0) || pending) return;
    const userMessage: ChatMessage = {
      role: "user",
      content:
        content ||
        `Please use the attached image${files.length === 1 ? "" : "s"}.`,
      ...(files.length ? { attachments: files } : {}),
    };
    const nextMessages: ChatMessage[] = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setAttachments([]);
    setPending(true);
    setStreaming("");
    abortRef.current = new AbortController();
    try {
      const response = await fetch("/api/ai/thesys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, chatId }),
        signal: abortRef.current.signal,
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error?.message ?? "AI request failed");
      }
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No response body");
      let accumulated = "";
      let leftover = "";
      let results: FunctionResult[] | undefined;
      while (true) {
        const { done, value } = await reader.read();
        leftover += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const lines = leftover.split("\n");
        leftover = done ? "" : (lines.pop() ?? "");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.type === "content") {
              accumulated += parsed.content;
              setStreaming(accumulated);
            } else if (parsed.type === "content_reset") {
              accumulated = "";
              setStreaming("");
            } else if (parsed.type === "tool_results") {
              results = parsed.results;
            } else if (parsed.type === "done") {
              setChatId(parsed.chatId);
            } else if (parsed.type === "error") {
              throw new Error(parsed.error);
            }
          } catch (error) {
            if (error instanceof SyntaxError) continue;
            throw error;
          }
        }
        if (done) break;
      }
      setMessages([
        ...nextMessages,
        { role: "assistant", content: accumulated, functionResults: results },
      ]);
      setStreaming("");
      void refreshThreads();
      void refreshMissions();
      router.refresh();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      const message =
        error instanceof Error ? error.message : "JARVIS could not reply";
      setMessages([...nextMessages, { role: "assistant", content: message }]);
      notifyError(message);
    } finally {
      setPending(false);
      abortRef.current = null;
    }
  }

  submitRef.current = (text) => {
    void submit(text);
  };

  function endListening() {
    setVoiceChat(false);
    stopSpeech();
  }

  function beginListening(mode: "command" | "chat") {
    dictationBaseRef.current = input;
    setVoiceChat(mode === "chat");
    const started = startSpeech({ continuous: mode === "chat" });
    if (!started) {
      setVoiceChat(false);
      return;
    }
    if (mode === "chat") notifyInfo("Voice chat on. Speak a command");
  }

  function toggleListening(mode: "command" | "chat" = "command") {
    if (listening || voiceChat) {
      endListening();
      return;
    }
    beginListening(mode);
  }

  useEffect(() => {
    if (!voiceChat) return;
    if (pending) {
      stopSpeech();
      return;
    }
    const id = window.setTimeout(() => {
      startSpeech({ continuous: true });
    }, 200);
    return () => window.clearTimeout(id);
  }, [pending, voiceChat, startSpeech, stopSpeech]);

  function onNav(id: string, prompt?: string) {
    if (id === "conversations") {
      setShowHistory(true);
      inputRef.current?.focus();
      return;
    }
    if (prompt) {
      void submit(prompt);
      return;
    }
    notifyInfo("That module comes online in a later phase");
  }

  async function onSignOut() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex h-svh overflow-hidden bg-hud text-ink">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-hud-2/80 lg:flex">
        <div className="flex items-center gap-3 border-b border-line px-5 py-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-cyan/50 text-cyan shadow-[0_0_16px_rgba(0,212,255,0.35)]">
            <Sparkles size={16} />
          </span>
          <div>
            <p className="font-display text-sm tracking-[0.28em] text-cyan hud-glow">
              JARVIS
            </p>
            <p className="font-mono text-[10px] tracking-[0.22em] text-muted">
              COMMAND CENTER
            </p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = item.id === "command";
            return (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  onNav(item.id, "prompt" in item ? item.prompt : undefined)
                }
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition",
                  active
                    ? "bg-cyan/10 text-cyan"
                    : "text-muted hover:bg-panel hover:text-ink",
                )}
              >
                <Icon size={16} />
                <span className="flex-1">{item.label}</span>
                {"badge" in item && item.badge ? (
                  <span className="rounded-full bg-cyan/15 px-1.5 font-mono text-[10px] text-cyan">
                    {item.badge}
                  </span>
                ) : null}
                {item.id === "conversations" && threads.length ? (
                  <span className="rounded-full bg-cyan/15 px-1.5 font-mono text-[10px] text-cyan">
                    {threads.length}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-line p-4">
          <p className="font-mono text-[10px] tracking-[0.28em] text-muted">
            VOICE STATUS
          </p>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-cyan">
            {listening ? "LISTENING" : voiceChat ? "VOICE CHAT" : speechReady && !speechSupported ? "UNAVAILABLE" : "ONLINE"}
          </p>
          <div className="mt-3 flex items-end gap-1">
            {Array.from({ length: 18 }).map((_, index) => (
              <span
                key={index}
                className="wave-bar inline-block w-1 rounded-full bg-cyan/70"
                style={{
                  height: `${8 + ((index * 13) % 18)}px`,
                  animationDelay: `${index * 80}ms`,
                  animationPlayState: voiceLive ? "running" : "paused",
                }}
              />
            ))}
          </div>
          <Button
            shape="pill"
            active={voiceLive}
            aria-pressed={voiceLive}
            title={voiceLive ? "Stop listening" : "Speak a command"}
            onClick={() => toggleListening("command")}
            className="mt-4 w-full"
          >
            <Mic size={14} className={voiceLive ? "animate-[jarvis-pulse_1.2s_ease-in-out_infinite]" : undefined} />
            {listening ? "Listening…" : voiceChat ? "Voice chat on" : "Tap to Speak"}
          </Button>
          <button
            type="button"
            className="mt-3 w-full rounded-lg border border-line py-2 text-xs text-muted hover:text-cyan"
            onClick={() => notifyInfo("Focus mode is a later polish pass")}
          >
            Focus Mode
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-4 border-b border-line bg-hud-2/70 px-4 py-3 lg:px-6">
          <div className="hidden min-w-0 lg:block">
            <p className="font-mono text-[10px] tracking-[0.3em] text-muted">
              SYSTEM STATUS
            </p>
            <p
              className={cn(
                "font-display text-sm tracking-widest",
                overdue.length ? "text-amber" : "text-ok",
              )}
            >
              {systemStatus}
            </p>
          </div>
          <div className="mx-auto text-center">
            <p className="font-mono text-[10px] tracking-[0.24em] text-muted">
              {formatDateLabel(now)}
            </p>
            <p className="font-display text-xl tracking-widest text-cyan hud-glow lg:text-2xl">
              {formatClock(now)}
            </p>
          </div>
          <label className="relative hidden min-w-48 flex-1 md:block">
            <Search
              size={14}
              className="absolute top-1/2 left-3 -translate-y-1/2 text-muted"
            />
            <input
              className="w-full rounded-full border border-line bg-hud py-2 pr-3 pl-9 text-sm outline-none focus:border-cyan"
              placeholder="Search…"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  const value = event.currentTarget.value.trim();
                  if (value) void submit(`Search missions and memory for: ${value}`);
                }
              }}
            />
          </label>
          <div className="flex items-center gap-2 text-muted">
            {googleConfigured ? (
              googleEmail ? (
                <Button
                  shape="pill"
                  size="sm"
                  tone="ok"
                  title={`Disconnect ${googleEmail}`}
                  onClick={() => void disconnectGoogle()}
                  className="hidden hover:border-danger/50 hover:bg-danger/10 hover:text-danger hover:shadow-[0_0_18px_rgba(255,93,115,0.28)] sm:inline-flex"
                >
                  <Mail size={12} />
                  <span className="max-w-28 truncate">{googleEmail}</span>
                </Button>
              ) : (
                <Button
                  href="/api/google/connect"
                  shape="pill"
                  size="sm"
                  className="hidden sm:inline-flex"
                >
                  <Mail size={12} />
                  Connect Google
                </Button>
              )
            ) : null}
            <Button variant="ghost" size="sm" aria-label="Alerts">
              <Bell size={16} />
            </Button>
            <Button variant="ghost" size="sm" aria-label="Settings">
              <Settings size={16} />
            </Button>
            <div className="hidden items-center gap-2 rounded-full border border-line px-3 py-1 sm:flex">
              <span className="h-2 w-2 rounded-full bg-ok" />
              <span className="text-xs">{operatorName}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              tone="danger"
              aria-label="Sign out"
              onClick={() => void onSignOut()}
            >
              <LogOut size={16} />
            </Button>
          </div>
        </header>

        <main className="hud-grid min-h-0 flex-1 overflow-y-auto p-3 lg:p-4">
          <div className="mx-auto grid max-w-[1600px] gap-3 xl:grid-cols-[16rem_minmax(0,1fr)_20rem]">
            <OverviewPanel
              thesysReady={thesysReady}
              memoryCount={memoryCount}
              activeCount={activeTasks.length}
              googleEmail={googleEmail}
              voiceStatus={
                listening
                  ? "Listening"
                  : voiceChat
                    ? "Voice chat"
                    : speechReady && !speechSupported
                      ? "Unavailable"
                      : "Online"
              }
            />
            <AiCore
              messages={messages}
              streaming={streaming}
              pending={pending}
              scrollerRef={scrollerRef}
              onAction={(text) => void submit(text)}
            />
            <IntelligenceFeed
              overdue={overdue}
              dueSoon={dueSoon}
              onViewTasks={() => void submit("List overdue and due-soon missions.")}
            />
          </div>

          <div className="mx-auto mt-3 grid max-w-[1600px] gap-3 xl:grid-cols-[minmax(0,1.4fr)_20rem]">
            <div className="grid gap-3">
              <AgentsPanel />
              <div className="grid gap-3 md:grid-cols-2">
                <SystemMonitor />
                <MemoryPanel memories={snapshot.memories} />
              </div>
            </div>
            <div className="grid gap-3">
              <TimelinePanel tasks={activeTasks} />
              <QuickCommands
                voiceChat={voiceChat}
                onRun={(prompt, label) => {
                  if (label === "Start Voice Chat") {
                    toggleListening("chat");
                    return;
                  }
                  if (label === "Start New Task") notifySuccess("Describe the mission");
                  void submit(prompt);
                }}
              />
              <LlmStatus thesysReady={thesysReady} />
            </div>
          </div>
        </main>

        {showHistory && threads.length > 0 ? (
          <div className="flex shrink-0 gap-2 overflow-x-auto border-t border-line bg-hud-2/80 px-4 py-2">
            <button
              type="button"
              className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:text-cyan"
              onClick={() => {
                abortRef.current?.abort();
                setChatId(null);
                setMessages([]);
                setStreaming("");
              }}
            >
              New conversation
            </button>
            {threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className={cn(
                  "max-w-48 truncate rounded-full border px-3 py-1 text-xs",
                  thread.id === chatId
                    ? "border-cyan text-cyan"
                    : "border-line text-muted hover:text-ink",
                )}
                onClick={() => void openThread(thread.id).catch((error) => {
                  notifyError(error instanceof Error ? error.message : "Could not open chat");
                })}
              >
                {thread.title}
              </button>
            ))}
          </div>
        ) : null}

        <form
          className="shrink-0 border-t border-line bg-hud-2/90 px-4 py-3 lg:px-8"
          onPaste={onPaste}
          onSubmit={(event) => {
            event.preventDefault();
            void submit(input);
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              void addFiles([...(event.target.files ?? [])]);
              event.currentTarget.value = "";
            }}
          />
          <div
            className={cn(
              "mx-auto flex max-w-4xl flex-col gap-2 border border-cyan/40 bg-hud px-2 py-2 shadow-[0_0_28px_rgba(0,212,255,0.18)]",
              attachments.length ? "rounded-3xl" : "rounded-full",
            )}
          >
            {attachments.length ? (
              <div className="flex flex-wrap gap-2 px-3 pt-1">
                {attachments.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="relative">
                    {file.dataUrl ? (
                      <img
                        src={file.dataUrl}
                        alt={file.name}
                        className="h-14 w-14 rounded-lg object-cover"
                      />
                    ) : (
                      <span className="text-xs text-muted">{file.name}</span>
                    )}
                    <button
                      type="button"
                      aria-label={`Remove ${file.name}`}
                      className="absolute -top-1 -right-1 rounded-full bg-hud text-muted hover:text-danger"
                      onClick={() =>
                        setAttachments((current) => current.filter((_, i) => i !== index))
                      }
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="flex items-center gap-3">
            <Button
              title={voiceLive ? "Stop listening" : "Speak a command"}
              aria-label={voiceLive ? "Stop listening" : "Start listening"}
              aria-pressed={voiceLive}
              active={voiceLive}
              onClick={() => toggleListening(voiceChat ? "chat" : "command")}
            >
              <Mic size={18} className={voiceLive ? "animate-[jarvis-pulse_1.2s_ease-in-out_infinite]" : undefined} />
            </Button>
            <div className="min-w-0 flex-1 text-center">
              <p className="font-display text-[11px] tracking-[0.35em] text-cyan">
                {listening ? "LISTENING" : voiceChat ? "VOICE CHAT" : "TALK TO JARVIS"}
              </p>
              <input
                ref={inputRef}
                value={input}
                onChange={(event) => {
                  dictationBaseRef.current = event.target.value;
                  setInput(event.target.value);
                }}
                onPaste={onPaste}
                placeholder={
                  pending
                    ? "Working…"
                    : listening
                      ? "Speak now…"
                      : attachments.length
                        ? "Add a message, then send…"
                        : "I am listening…"
                }
                disabled={pending}
                className="w-full bg-transparent text-center text-sm text-ink outline-none placeholder:text-muted disabled:opacity-60"
              />
            </div>
            <Button
              title="Attach image"
              aria-label="Attach image"
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip size={16} />
            </Button>
            <Button
              type="submit"
              variant="solid"
              disabled={pending}
              aria-label="Send"
              title="Talk to JARVIS"
            >
              <Play size={16} fill="currentColor" />
            </Button>
            </div>
          </div>
        </form>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-4 py-2 font-mono text-[10px] tracking-widest text-muted lg:px-6">
          <span>LOCATION · LOCAL NODE</span>
          <span>NETWORK · {thesysReady ? "THESYS LINKED" : "LOCAL FALLBACK"}</span>
          <span>GOOGLE · {googleEmail ? "GMAIL + CALENDAR" : googleConfigured ? "NOT LINKED" : "UNCONFIGURED"}</span>
          <Button
            shape="pill"
            size="sm"
            onClick={() => void submit("Give me today's executive briefing.")}
          >
            Executive Briefing
          </Button>
        </footer>
      </div>
    </div>
  );
}

function Panel({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("hud-panel rounded-xl p-4", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-mono text-[10px] tracking-[0.28em] text-muted">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function OverviewPanel({
  thesysReady,
  memoryCount,
  activeCount,
  voiceStatus,
  googleEmail,
}: {
  thesysReady: boolean;
  memoryCount: number;
  activeCount: number;
  voiceStatus: string;
  googleEmail: string | null;
}) {
  const rows = [
    { label: "AI Core", value: "Active" },
    { label: "Memory", value: `${memoryCount} stored` },
    { label: "Voice", value: voiceStatus },
    { label: "Google", value: googleEmail ? "Linked" : "Offline" },
    { label: "LLMs", value: thesysReady ? "Thesys linked" : "Local" },
    { label: "Missions", value: `${activeCount} active` },
  ];
  return (
    <Panel title="AI CORE OVERVIEW">
      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            key={row.label}
            className="flex items-center justify-between rounded-lg border border-line/70 bg-hud/40 px-3 py-2"
          >
            <span className="text-sm text-muted">{row.label}</span>
            <span className="font-mono text-xs text-cyan">{row.value}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function AiCore({
  messages,
  streaming,
  pending,
  scrollerRef,
  onAction,
}: {
  messages: ChatMessage[];
  streaming: string;
  pending: boolean;
  scrollerRef: React.RefObject<HTMLDivElement | null>;
  onAction: (text: string) => void;
}) {
  const hasChat = messages.length > 0 || Boolean(streaming);
  return (
    <section className="hud-panel relative min-h-96 overflow-hidden rounded-xl p-4">
      <JarvisCore dimmed={hasChat} scanning={pending} />
      {hasChat ? (
        <div
          ref={scrollerRef}
          className="relative z-10 max-h-[28rem] space-y-3 overflow-y-auto pr-1"
        >
          {messages.map((message, index) => (
            <MessageBubble
              key={`${message.role}-${index}`}
              message={message}
              onAction={onAction}
            />
          ))}
          {streaming ? (
            <MessageBubble
              message={{ role: "assistant", content: streaming }}
              streaming
              onAction={onAction}
            />
          ) : null}
          {pending && !streaming ? (
            <p className="font-mono text-xs tracking-widest text-cyan">
              JARVIS is thinking…
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function IntelligenceFeed({
  overdue,
  dueSoon,
  onViewTasks,
}: {
  overdue: Task[];
  dueSoon: Task[];
  onViewTasks: () => void;
}) {
  const items = [
    ...overdue.slice(0, 3).map((task) => ({
      tone: "danger" as const,
      label: "Overdue",
      text: task.title,
    })),
    ...dueSoon.slice(0, 3).map((task) => ({
      tone: "amber" as const,
      label: "Due",
      text: `${task.title}${task.dueAt ? ` · ${formatWhen(task.dueAt)}` : ""}`,
    })),
  ];
  return (
    <Panel
      title="LIVE INTELLIGENCE FEED"
      action={
        <span className="font-mono text-[10px] text-ok">LIVE</span>
      }
    >
      {items.length === 0 ? (
        <p className="text-sm text-muted">No overdue or upcoming missions.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li
              key={`${item.label}-${index}`}
              className="rounded-lg border border-line/70 bg-hud/40 px-3 py-2"
            >
              <p
                className={cn(
                  "font-mono text-[10px] tracking-widest",
                  item.tone === "danger" && "text-danger",
                  item.tone === "amber" && "text-amber",
                )}
              >
                {item.label}
              </p>
              <p className="mt-1 text-sm">{item.text}</p>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="mt-3 text-xs text-cyan hover:text-cyan-2"
        onClick={onViewTasks}
      >
        View All Intelligence
      </button>
    </Panel>
  );
}

function AgentsPanel() {
  return (
    <Panel title="ACTIVE AGENTS" action={<span className="text-[10px] text-muted">View All</span>}>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {AGENTS.map((agent) => (
          <div
            key={agent.name}
            className="rounded-lg border border-line/70 bg-hud/40 px-3 py-3"
          >
            <p className="text-sm">{agent.name}</p>
            <p
              className={cn(
                "mt-1 font-mono text-[10px] tracking-widest",
                agent.tone === "ok" && "text-ok",
                agent.tone === "cyan" && "text-cyan",
                agent.tone === "muted" && "text-muted",
              )}
            >
              {agent.status}
            </p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function SystemMonitor() {
  return (
    <Panel title="SYSTEM MONITOR">
      <p className="text-sm text-muted">
        Host CPU / RAM / disk stay dark until a local system agent is installed.
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {["CPU", "RAM", "DISK"].map((label) => (
          <div key={label} className="rounded-lg border border-line/70 py-3">
            <p className="font-mono text-[10px] text-muted">{label}</p>
            <p className="mt-1 font-display text-lg text-muted">—</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function MemoryPanel({
  memories,
}: {
  memories: MissionSnapshot["memories"];
}) {
  return (
    <Panel title="MEMORY INSIGHTS">
      {memories.length === 0 ? (
        <p className="text-sm text-muted">No stored notes yet. Ask JARVIS to remember something.</p>
      ) : (
        <ul className="space-y-2">
          {memories.slice(0, 4).map((note) => (
            <li key={note.id} className="text-sm text-ink/90">
              {note.text}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function TimelinePanel({ tasks }: { tasks: Task[] }) {
  return (
    <Panel title="MISSION TIMELINE">
      {tasks.length === 0 ? (
        <p className="text-sm text-muted">No active missions. Tell JARVIS what to track.</p>
      ) : (
        <ol className="space-y-2">
          {tasks.slice(0, 6).map((task) => (
            <li key={task.id} className="flex items-start gap-2 text-sm">
              {task.status === "done" ? (
                <Check size={14} className="mt-0.5 text-ok" />
              ) : task.dueAt && task.dueAt < startOfToday() ? (
                <CircleAlert size={14} className="mt-0.5 text-danger" />
              ) : (
                <span className="mt-1.5 h-2 w-2 rounded-full bg-cyan" />
              )}
              <div>
                <p>{task.title}</p>
                <p className="font-mono text-[10px] tracking-widest text-muted">
                  {task.status.replace("_", " ")}
                  {task.dueAt ? ` · ${formatWhen(task.dueAt)}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function QuickCommands({
  onRun,
  voiceChat,
}: {
  onRun: (prompt: string, label: string) => void;
  voiceChat: boolean;
}) {
  return (
    <Panel title="QUICK COMMANDS">
      <div className="grid gap-2">
        {QUICK.map((item) => {
          const live = item.label === "Start Voice Chat" && voiceChat;
          return (
            <button
              key={item.label}
              type="button"
              aria-pressed={item.label === "Start Voice Chat" ? voiceChat : undefined}
              className={cn(
                "flex items-center gap-2 rounded-lg border bg-hud/40 px-3 py-2 text-left text-sm hover:border-cyan/50",
                live ? "border-cyan/70 text-cyan" : "border-line/70",
              )}
              onClick={() => onRun(item.prompt, item.label)}
            >
              {item.label === "Start Voice Chat" ? (
                <Mic size={14} className="text-cyan" />
              ) : item.label.startsWith("Start New") ? (
                <Plus size={14} className="text-cyan" />
              ) : (
                <Play size={14} className="text-cyan" />
              )}
              {live ? "Stop Voice Chat" : item.label}
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

function LlmStatus({ thesysReady }: { thesysReady: boolean }) {
  return (
    <Panel title="LLM STATUS">
      <div className="flex items-center justify-between rounded-lg border border-line/70 px-3 py-3">
        <div>
          <p className="text-sm">Thesys C1</p>
          <p className="font-mono text-[10px] tracking-widest text-muted">
            Generative UI
          </p>
        </div>
        <span className={cn("font-mono text-xs", thesysReady ? "text-ok" : "text-amber")}>
          {thesysReady ? "Connected" : "Not linked"}
        </span>
      </div>
    </Panel>
  );
}

function MessageBubble({
  message,
  streaming = false,
  onAction,
}: {
  message: ChatMessage;
  streaming?: boolean;
  onAction?: (text: string) => void;
}) {
  const isUser = message.role === "user";
  const genUi = !isUser && looksLikeGenUi(message.content);
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={
          isUser
            ? "max-w-[min(100%,36rem)] rounded-2xl bg-cyan px-4 py-3 text-sm text-hud"
            : genUi
              ? "w-full min-w-0 text-sm"
              : "max-w-[min(100%,36rem)] rounded-2xl border border-line bg-hud/70 px-4 py-3 text-sm"
        }
      >
        {isUser ? (
          <div>
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
            {message.attachments?.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {message.attachments.map((file, index) =>
                  file.dataUrl ? (
                    <img
                      key={`${file.name}-${index}`}
                      src={file.dataUrl}
                      alt={file.name}
                      className="max-h-24 rounded-lg"
                    />
                  ) : (
                    <span key={`${file.name}-${index}`} className="text-xs opacity-80">
                      {file.name}
                    </span>
                  ),
                )}
              </div>
            ) : null}
          </div>
        ) : genUi ? (
          <C1Message
            content={message.content}
            isStreaming={streaming}
            onAction={onAction}
          />
        ) : (
          <p className="whitespace-pre-wrap break-words">
            {looksLikeGenUi(message.content)
              ? readableFromGenUi(message.content)
              : message.content}
          </p>
        )}
      </div>
    </div>
  );
}
