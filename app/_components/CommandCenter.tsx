"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BookOpen,
  Bot,
  Brain,
  CalendarDays,
  Cpu,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Mail,
  Menu,
  MessageSquare,
  Mic,
  Paperclip,
  Play,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Wallet,
  Wrench,
  Workflow,
  X,
} from "lucide-react";
import { Button } from "@/app/_components/Button";
import { ConversationsView, type ChatSummary } from "@/app/_components/ConversationsView";
import JarvisCore from "@/app/_components/JarvisCore";
import JarvisMark from "@/app/_components/JarvisMark";
import { VoiceBars } from "@/app/_components/voice-bars";
import { AccountView } from "@/app/_components/AccountView";
import { MemoryView } from "@/app/_components/MemoryView";
import { TaskGlyph } from "@/app/_components/TaskGlyph";
import { TasksView } from "@/app/_components/TasksView";
import { notifyError, notifyInfo, notifySuccess } from "@/app/_components/notify";
import { looksLikeGenUi, readableFromGenUi, speakableReply } from "@/app/_lib/c1";
import { signOut } from "@/app/_lib/auth-client";
import { cn } from "@/app/_lib/cn";
import { useVoiceSession } from "@/app/_lib/use-voice-session";
import { endOfToday, formatClock, formatDateLabel, formatWhen, startOfToday } from "@/app/_lib/time";
import type { CreditsSnapshot } from "@/app/_types/credits";
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

type ActiveNav = "command" | "memory" | "conversations" | "settings" | "tasks";

const NAV = [
  { id: "command", label: "Command Center", icon: LayoutDashboard, live: true },
  { id: "core", label: "AI Core", icon: Cpu, live: false },
  { id: "agents", label: "Agents", icon: Bot, live: false, badge: "4" },
  { id: "tasks", label: "Tasks", icon: ListChecks, live: true },
  { id: "calendar", label: "Calendar", icon: CalendarDays, live: true, prompt: "Show my Google Calendar events from today through one month from today." },
  { id: "memory", label: "Memory", icon: Brain, live: true },
  { id: "conversations", label: "Conversations", icon: MessageSquare, live: true },
  { id: "knowledge", label: "Knowledge Base", icon: BookOpen, live: false },
  { id: "tools", label: "Tools & Skills", icon: Wrench, live: false },
  { id: "workflows", label: "Workflows", icon: Workflow, live: false },
] as const;

const AGENTS = [
  { name: "Research Agent", status: "Standby", tone: "cyan" },
  { name: "Memory Agent", status: "Ready", tone: "ok" },
  { name: "Task Agent", status: "Ready", tone: "ok" },
  { name: "System Agent", status: "Local offline", tone: "muted" },
] as const;

const QUICK = [
  { label: "Start New Task", prompt: "Help me create a new task. Ask me for the title and due date if needed." },
  { label: "Open Calendar", prompt: "Show my Google Calendar events from today through one month from today." },
  { label: "Start Voice Chat", prompt: "" },
] as const;

const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 4.5 * 1024 * 1024;
const TAP_SILENCE_MS = 4000;

function SidebarPanel({
  animated = false,
  showClose = false,
  activeNav,
  activeTaskCount,
  threadCount,
  listening,
  speaking,
  holding,
  voiceChat,
  speechReady,
  speechSupported,
  voiceLive,
  focusMode,
  analyserRef,
  onClose,
  onNav,
  onToggleListening,
  onToggleFocus,
}: {
  animated?: boolean;
  showClose?: boolean;
  activeNav: string;
  activeTaskCount: number;
  threadCount: number;
  listening: boolean;
  speaking: boolean;
  holding: boolean;
  voiceChat: boolean;
  speechReady: boolean;
  speechSupported: boolean;
  voiceLive: boolean;
  focusMode: boolean;
  analyserRef: RefObject<AnalyserNode | null>;
  onClose?: () => void;
  onNav: (id: string, prompt?: string) => void;
  onToggleListening: () => void;
  onToggleFocus: () => void;
}) {
  const reduceMotion = useReducedMotion();

  function navButton(item: (typeof NAV)[number]) {
    const Icon = item.icon;
    const active = item.id === activeNav;
    return (
      <button
        type="button"
        onClick={() => onNav(item.id, "prompt" in item ? item.prompt : undefined)}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition",
          active ? "bg-cyan/10 text-cyan" : "text-muted hover:bg-panel hover:text-ink",
        )}
      >
        <Icon size={16} />
        <span className="flex-1">{item.label}</span>
        {"badge" in item && item.badge ? (
          <span className="rounded-full bg-cyan/15 px-1.5 font-mono text-[10px] text-cyan">
            {item.badge}
          </span>
        ) : null}
        {item.id === "tasks" && activeTaskCount ? (
          <span className="rounded-full bg-cyan/15 px-1.5 font-mono text-[10px] text-cyan">
            {activeTaskCount}
          </span>
        ) : null}
        {item.id === "conversations" && threadCount ? (
          <span className="rounded-full bg-cyan/15 px-1.5 font-mono text-[10px] text-cyan">
            {threadCount}
          </span>
        ) : null}
      </button>
    );
  }

  const links = NAV.map((item) =>
    animated ? (
      <motion.div
        key={item.id}
        variants={{
          hidden: { opacity: 0, x: -16 },
          show: { opacity: 1, x: 0 },
        }}
      >
        {navButton(item)}
      </motion.div>
    ) : (
      <div key={item.id}>{navButton(item)}</div>
    ),
  );

  const voiceStatus = listening
    ? "LISTENING"
    : speaking
      ? "SPEAKING"
      : voiceChat
        ? "VOICE CHAT"
        : speechReady && !speechSupported
          ? "UNAVAILABLE"
          : "ONLINE";

  const voiceFooter = (
    <>
      <p className="font-mono text-[10px] tracking-[0.28em] text-muted">
        VOICE STATUS
      </p>
      <p className="mt-1 font-mono text-[10px] tracking-widest text-cyan">
        {voiceStatus}
      </p>
      <VoiceBars active={voiceLive} analyserRef={analyserRef} />
      <Button
        shape="pill"
        active={voiceLive}
        aria-pressed={voiceLive}
        title={voiceLive ? "Stop listening" : "Speak a command"}
        onClick={onToggleListening}
        className="mt-4 w-full"
      >
        <Mic size={14} className={voiceLive ? "animate-[jarvis-pulse_1.2s_ease-in-out_infinite]" : undefined} />
        {listening ? (holding ? "Still listening…" : "Listening…") : speaking ? "Speaking…" : voiceChat ? "Voice chat on" : "Tap to Speak"}
      </Button>
      <Button
        shape="pill"
        active={focusMode}
        aria-pressed={focusMode}
        title={focusMode ? "Leave focus mode" : "Hide the dashboard and keep the current mission"}
        onClick={onToggleFocus}
        className="mt-3 w-full"
      >
        {focusMode ? "Exit Focus" : "Focus Mode"}
      </Button>
    </>
  );

  return (
    <>
      <div className="flex items-center gap-3 border-b border-line px-4 py-5">
        <JarvisMark
          alt=""
          sizes="40px"
          className="h-10 w-10 shrink-0 rounded-full shadow-[0_0_16px_rgba(0,212,255,0.45)]"
        />
        <div className="min-w-0">
          <p className="font-display text-sm tracking-[0.28em] text-cyan hud-glow">
            JARVIS
          </p>
          <p className="font-mono text-[10px] tracking-[0.22em] text-nowrap text-muted">
            COMMAND CENTER
          </p>
        </div>
        {showClose ? (
          <Button
            variant="ghost"
            size="sm"
            aria-label="Close sidebar"
            onClick={onClose}
            className="ml-auto"
          >
            <X size={16} />
          </Button>
        ) : null}
      </div>
      {animated ? (
        <motion.nav
          className="flex-1 space-y-1 overflow-y-auto px-3 py-4"
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: {
              transition: reduceMotion
                ? { duration: 0 }
                : { staggerChildren: 0.035, delayChildren: 0.08 },
            },
          }}
        >
          {links}
        </motion.nav>
      ) : (
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">{links}</nav>
      )}
      {animated ? (
        <motion.div
          className="border-t border-line p-4"
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.28, delay: 0.16 }}
        >
          {voiceFooter}
        </motion.div>
      ) : (
        <div className="border-t border-line p-4">{voiceFooter}</div>
      )}
    </>
  );
}

const focusListeners = new Set<() => void>();

function subscribeFocus(listener: () => void) {
  focusListeners.add(listener);
  return () => {
    focusListeners.delete(listener);
  };
}

function focusSnapshot() {
  return window.localStorage.getItem("jarvis-focus") === "1";
}

function setStoredFocus(next: boolean) {
  window.localStorage.setItem("jarvis-focus", next ? "1" : "0");
  focusListeners.forEach((listener) => listener());
}

export default function CommandCenter({
  operatorName,
  initialSnapshot,
  thesysReady,
  googleConfigured,
  googleEmail: initialGoogleEmail,
  speechCloud,
}: {
  operatorName: string;
  initialSnapshot: MissionSnapshot;
  thesysReady: boolean;
  googleConfigured: boolean;
  googleEmail: string | null;
  speechCloud: boolean;
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const headerName = session?.user?.name?.trim() || operatorName;
  const [now, setNow] = useState(() => new Date());
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState("");
  const [pending, setPending] = useState(false);
  const [researching, setResearching] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ChatSummary[]>([]);
  const [activeNav, setActiveNav] = useState<ActiveNav>("command");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const sidebarId = useId();
  const abortRef = useRef<AbortController | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const coreRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [googleEmail, setGoogleEmail] = useState(initialGoogleEmail);
  const [credits, setCredits] = useState<CreditsSnapshot | null>(null);
  const [voiceChat, setVoiceChat] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const focusMode = useSyncExternalStore(subscribeFocus, focusSnapshot, () => false);
  const dictationBaseRef = useRef("");
  const voiceChatRef = useRef(false);
  const pendingRef = useRef(false);
  const speakingRef = useRef(false);
  const playbackRef = useRef<{ audio: HTMLAudioElement; url: string } | null>(null);
  const speakDoneRef = useRef<(() => void) | null>(null);
  const submitRef = useRef<
    (text: string, source?: "voice" | "typed" | "command") => void
  >(() => {});
  const voicePhaseRef = useRef<"idle" | "listening" | "holding" | "transcribing">("idle");

  voiceChatRef.current = voiceChat;
  pendingRef.current = pending;
  speakingRef.current = speaking;

  const stopPlayback = useCallback(() => {
    const current = playbackRef.current;
    playbackRef.current = null;
    if (current) {
      current.audio.pause();
      URL.revokeObjectURL(current.url);
    }
    speakDoneRef.current?.();
    speakDoneRef.current = null;
  }, []);

  const playSpeech = useCallback(async (text: string) => {
    const spoken = speakableReply(text);
    if (!spoken) throw new Error("Nothing to speak.");
    stopPlayback();
    const response = await fetch("/api/speech/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: spoken }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      throw new Error(data?.error?.message ?? "Could not speak that reply.");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    playbackRef.current = { audio, url };
    await new Promise<void>((resolve) => {
      speakDoneRef.current = resolve;
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      void audio.play().catch(() => resolve());
    });
    if (playbackRef.current?.audio === audio) {
      URL.revokeObjectURL(url);
      playbackRef.current = null;
    }
    speakDoneRef.current = null;
  }, [stopPlayback]);

  const {
    supported: speechSupported,
    ready: speechReady,
    phase: voicePhase,
    listening,
    holding,
    captured: heardSpeech,
    analyserRef,
    start: startVoice,
    cancel: cancelVoice,
    commit: commitVoice,
  } = useVoiceSession({
    cloud: speechCloud,
    onInterim(text) {
      const base = dictationBaseRef.current.trim();
      setInput(base ? `${base} ${text}` : text);
    },
    onTranscript(text) {
      if (pendingRef.current) return;
      const base = dictationBaseRef.current.trim();
      dictationBaseRef.current = "";
      const content = (base ? `${base} ${text}` : text).trim();
      if (!content) return;
      setInput(content);
      submitRef.current(content, "voice");
    },
    onError(message) {
      notifyError(message);
      setVoiceChat(false);
    },
    onNotice(message) {
      notifyInfo(message);
    },
    onRejected() {
      setInput(dictationBaseRef.current);
    },
  });

  voicePhaseRef.current = voicePhase;

  useEffect(() => {
    if (voiceChat || !listening || heardSpeech) return;
    const id = window.setTimeout(() => cancelVoice(), TAP_SILENCE_MS);
    return () => window.clearTimeout(id);
  }, [voiceChat, listening, heardSpeech, cancelVoice]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (media.matches) setSidebarOpen(false);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!sidebarOpen && !focusMode && activeNav !== "settings") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (sidebarOpen) {
        event.preventDefault();
        setSidebarOpen(false);
        return;
      }
      if (activeNav === "settings") {
        event.preventDefault();
        setActiveNav("command");
        return;
      }
      event.preventDefault();
      setStoredFocus(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen, focusMode, activeNav]);

  function toggleFocus() {
    setStoredFocus(!focusMode);
  }

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadCredits() {
      const response = await fetch("/api/credits");
      if (!response.ok) return;
      const data = (await response.json()) as CreditsSnapshot;
      if (!cancelled) setCredits(data);
    }
    void loadCredits();
    const id = window.setInterval(() => void loadCredits(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
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
  const dueToday = dueSoon.filter((task) => task.dueAt != null && task.dueAt <= endOfToday());
  const focusMissions = [...overdue, ...dueToday];
  const memoryCount = snapshot.memories.length;
  const systemStatus = overdue.length ? "ATTENTION" : "OPTIMAL";
  const voiceLive = listening || voiceChat || speaking;

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
  }

  async function submit(text: string, source: "voice" | "typed" | "command" = "command") {
    const content = text.trim();
    const files = attachments;
    if ((!content && files.length === 0) || pending) return;
    const speakThis = speechCloud && (source === "voice" || (source === "typed" && voiceChatRef.current));
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
            } else if (parsed.type === "agent" && parsed.name === "research") {
              setResearching(parsed.status === "searching");
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
      if (speakThis && accumulated.trim()) {
        setSpeaking(true);
        try {
          await playSpeech(accumulated);
        } catch (error) {
          notifyError(
            error instanceof Error ? error.message : "JARVIS could not speak that reply.",
          );
        } finally {
          setSpeaking(false);
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      const message =
        error instanceof Error ? error.message : "JARVIS could not reply";
      setMessages([...nextMessages, { role: "assistant", content: message }]);
      notifyError(message);
    } finally {
      setPending(false);
      setResearching(false);
      abortRef.current = null;
    }
  }

  submitRef.current = (text, source) => {
    void submit(text, source);
  };

  function endListening() {
    setVoiceChat(false);
    cancelVoice();
  }

  function toggleListening(mode: "command" | "chat" = "command") {
    stopPlayback();
    if (speakingRef.current) {
      setSpeaking(false);
      return;
    }
    if (listening) {
      if (heardSpeech) commitVoice();
      else endListening();
      return;
    }
    if (voiceChat && mode === "command") {
      endListening();
      return;
    }
    if (mode === "chat") {
      if (!voiceChat) {
        notifyInfo("Voice chat on. Speak a command");
        setVoiceChat(true);
        return;
      }
      void startVoice();
      return;
    }
    dictationBaseRef.current = input;
    void startVoice();
  }

  useEffect(() => {
    if (!voiceChat) return;
    if (pending || speaking) {
      if (voicePhaseRef.current !== "transcribing") cancelVoice();
      return;
    }
    if (listening) return;
    const id = window.setTimeout(() => {
      dictationBaseRef.current = "";
      void startVoice();
    }, 300);
    return () => window.clearTimeout(id);
  }, [pending, speaking, voiceChat, listening, cancelVoice, startVoice]);

  function startNewConversation() {
    abortRef.current?.abort();
    setChatId(null);
    setMessages([]);
    setStreaming("");
    setActiveNav("command");
    inputRef.current?.focus();
  }

  async function renameThread(id: string, title: string) {
    const response = await fetch(`/api/chats/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const data = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    if (!response.ok) {
      const message = data?.error?.message ?? "Could not rename that conversation.";
      notifyError(message);
      throw new Error(message);
    }
    notifySuccess("Conversation renamed");
    await refreshThreads();
  }

  async function deleteThread(id: string) {
    const response = await fetch(`/api/chats/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const data = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    if (!response.ok) {
      const message = data?.error?.message ?? "Could not delete that conversation.";
      notifyError(message);
      throw new Error(message);
    }
    if (chatId === id) {
      abortRef.current?.abort();
      setChatId(null);
      setMessages([]);
      setStreaming("");
    }
    notifySuccess("Conversation deleted");
    await refreshThreads();
  }

  function closeSidebar() {
    setSidebarOpen(false);
  }

  function onNav(id: string, prompt?: string) {
    closeSidebar();
    if (id === "command" || id === "memory" || id === "conversations" || id === "tasks") {
      setActiveNav(id);
      return;
    }
    if (prompt) {
      setActiveNav("command");
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

  const sidebarSpring = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 380, damping: 34 };

  const sidebarProps = {
    activeNav,
    activeTaskCount: activeTasks.length,
    threadCount: threads.length,
    listening,
    speaking,
    holding,
    voiceChat,
    speechReady,
    speechSupported,
    voiceLive,
    focusMode,
    analyserRef,
    onNav,
    onToggleListening: () => toggleListening("command"),
    onToggleFocus: toggleFocus,
  };

  return (
    <div className="flex h-svh overflow-hidden bg-hud text-ink">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-hud-2/80 lg:flex">
        <SidebarPanel {...sidebarProps} />
      </aside>

      <div className="lg:hidden">
        <Button
          size="sm"
          aria-label="Open sidebar"
          aria-expanded={sidebarOpen}
          aria-controls={sidebarId}
          onClick={() => setSidebarOpen(true)}
          className="fixed top-3 left-3 z-40"
        >
          <Menu size={16} />
        </Button>

        <AnimatePresence>
          {sidebarOpen ? (
            <motion.button
              key="sidebar-backdrop"
              type="button"
              aria-label="Close sidebar"
              className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2 }}
              onClick={closeSidebar}
            />
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {sidebarOpen ? (
            <motion.aside
              key="sidebar-drawer"
              id={sidebarId}
              role="dialog"
              aria-modal="true"
              aria-label="Sidebar"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={sidebarSpring}
              className="fixed inset-y-0 left-0 z-50 flex h-svh w-60 flex-col overflow-hidden border-r border-cyan/30 bg-hud-2 shadow-[12px_0_48px_rgba(0,212,255,0.16)]"
            >
              <SidebarPanel {...sidebarProps} animated showClose onClose={closeSidebar} />
            </motion.aside>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center gap-4 border-b border-line bg-hud-2/70 py-3 pr-4 pl-16 lg:px-6">
          <div className="hidden min-w-0 xl:block">
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
            <p
              suppressHydrationWarning
              className="font-mono text-[10px] tracking-[0.24em] text-muted"
            >
              {formatDateLabel(now)}
            </p>
            <p
              suppressHydrationWarning
              className="font-display text-xl tracking-widest text-cyan hud-glow lg:text-2xl"
            >
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
            <Button
              variant="ghost"
              size="sm"
              aria-label="Settings"
              aria-pressed={activeNav === "settings"}
              active={activeNav === "settings"}
              onClick={() =>
                setActiveNav((nav) => (nav === "settings" ? "command" : "settings"))
              }
            >
              <Settings size={16} />
            </Button>
            <div className="hidden items-center gap-2 rounded-full border border-line px-3 py-1 sm:flex">
              <span className="h-2 w-2 rounded-full bg-ok" />
              <span className="text-xs">{headerName}</span>
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

        <main
          className={cn(
            "hud-grid min-h-0 flex-1 p-3 lg:p-4",
            focusMode &&
            activeNav !== "settings" &&
            activeNav !== "tasks" &&
            activeNav !== "memory" &&
            activeNav !== "conversations"
              ? "flex flex-col overflow-hidden pb-0 lg:pb-0"
              : "overflow-y-auto",
          )}
        >
          {activeNav === "memory" ? (
            <MemoryView
              memories={snapshot.memories}
              onChanged={() => void refreshMissions()}
              onAskJarvis={() => {
                setActiveNav("command");
                void submit("Recall stored memories.");
              }}
            />
          ) : activeNav === "settings" ? (
            <AccountView
              displayName={headerName}
              email={session?.user?.email || snapshot.user.email}
              provider={
                session?.user?.provider === "firebase" || snapshot.user.provider === "firebase"
                  ? "firebase"
                  : "demo"
              }
              createdAt={session?.user?.createdAt || snapshot.user.createdAt}
              googleConfigured={googleConfigured}
              googleEmail={googleEmail}
              onDisconnectGoogle={() => void disconnectGoogle()}
              onNameSaved={(displayName) =>
                setSnapshot((current) => ({
                  ...current,
                  user: { ...current.user, displayName },
                }))
              }
            />
          ) : activeNav === "tasks" ? (
            <TasksView
              tasks={snapshot.tasks}
              onChanged={() => void refreshMissions()}
              onAskJarvis={(prompt) => {
                setActiveNav("command");
                void submit(prompt);
              }}
            />
          ) : activeNav === "conversations" ? (
            <ConversationsView
              threads={threads}
              activeId={chatId}
              onNew={startNewConversation}
              onOpen={(id) => {
                void openThread(id)
                  .then(() => setActiveNav("command"))
                  .catch((error) => {
                    notifyError(
                      error instanceof Error ? error.message : "Could not open chat",
                    );
                  });
              }}
              onRename={renameThread}
              onDelete={deleteThread}
              onCleaned={(ids) => {
                if (chatId && ids.includes(chatId)) {
                  abortRef.current?.abort();
                  setChatId(null);
                  setMessages([]);
                  setStreaming("");
                }
                void refreshThreads();
              }}
            />
          ) : (
          <>
          <div
            className={cn(
              "mx-auto grid w-full max-w-[1600px] gap-3",
              focusMode
                ? "min-h-0 flex-1 grid-cols-1 grid-rows-1"
                : "xl:grid-cols-[16rem_minmax(0,1fr)_20rem]",
            )}
          >
            {focusMode ? null : (
            <OverviewPanel
              thesysReady={thesysReady}
              credits={credits}
              memoryCount={memoryCount}
              activeCount={activeTasks.length}
              googleEmail={googleEmail}
              voiceStatus={
                listening
                  ? "Listening"
                  : speaking
                    ? "Speaking"
                  : voiceChat
                    ? "Voice chat"
                    : speechReady && !speechSupported
                      ? "Unavailable"
                      : "Online"
              }
            />
            )}
            <AiCore
              coreRef={coreRef}
              messages={messages}
              streaming={streaming}
              pending={pending}
              scrollerRef={scrollerRef}
              focus={focusMode}
              onAction={(text) => void submit(text)}
            />
            {focusMode ? null : (
            <IntelligenceFeed
              overdue={overdue}
              dueSoon={dueSoon}
              onViewTasks={() => setActiveNav("tasks")}
            />
            )}
          </div>

          {focusMode ? null : (
          <div className="mx-auto mt-3 grid max-w-[1600px] gap-3 xl:grid-cols-[minmax(0,1.4fr)_20rem]">
            <div className="grid gap-3">
              <AgentsPanel searching={researching} />
              <div className="grid gap-3 md:grid-cols-2">
                <SystemMonitor />
                <MemoryPanel memories={snapshot.memories} />
              </div>
            </div>
            <div className="grid gap-3">
              <TimelinePanel
                tasks={tasks}
                onOpen={() => setActiveNav("tasks")}
                onDeleted={() => void refreshMissions()}
              />
              <QuickCommands
                voiceChat={voiceChat}
                onRun={(prompt, label) => {
                  coreRef.current?.scrollIntoView({
                    behavior: reduceMotion ? "auto" : "smooth",
                    block: "start",
                  });
                  if (label === "Start Voice Chat") {
                    toggleListening("chat");
                    return;
                  }
                  void submit(prompt);
                }}
              />
              <LinkStatus
                thesysReady={thesysReady}
                credits={credits}
                googleConfigured={googleConfigured}
                googleEmail={googleEmail}
                onDisconnectGoogle={() => void disconnectGoogle()}
              />
            </div>
          </div>
          )}
          </>
          )}
        </main>

        {focusMode ? (
          <FocusMissions overdue={overdue} dueToday={dueToday} missions={focusMissions} />
        ) : null}

        <form
          className="shrink-0 border-t border-line bg-hud-2/90 px-4 py-3 lg:px-8"
          onPaste={onPaste}
          onSubmit={(event) => {
            event.preventDefault();
            if (listening) {
              if (heardSpeech) {
                commitVoice();
                return;
              }
              cancelVoice();
            }
            void submit(input, "typed");
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
                {listening ? "LISTENING" : speaking ? "SPEAKING" : voiceChat ? "VOICE CHAT" : "TALK TO JARVIS"}
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
                  pending || voicePhase === "transcribing"
                    ? "Working…"
                    : holding
                      ? "Still listening…"
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
  credits,
  memoryCount,
  activeCount,
  voiceStatus,
  googleEmail,
}: {
  thesysReady: boolean;
  credits: CreditsSnapshot | null;
  memoryCount: number;
  activeCount: number;
  voiceStatus: string;
  googleEmail: string | null;
}) {
  const rows = [
    { label: "Memory", value: `${memoryCount} stored`, low: false },
    { label: "Voice", value: voiceStatus, low: false },
    { label: "LLMs", value: thesysReady ? "Thesys linked" : "Thesys offline", low: false },
    {
      label: "Credits",
      value: credits?.overview ?? "Checking…",
      low: Boolean(credits?.low),
    },
    { label: "Missions", value: `${activeCount} active`, low: false },
  ];
  return (
    <Panel title="AI CORE OVERVIEW">
      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            key={row.label}
            className="flex items-center justify-between gap-3 rounded-lg border border-line/70 bg-hud/40 px-3 py-2"
          >
            <span className="text-sm text-muted">{row.label}</span>
            <span
              className={cn(
                "text-right font-mono text-xs",
                row.low ? "text-amber" : "text-cyan",
              )}
            >
              {row.value}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function AiCore({
  coreRef,
  messages,
  streaming,
  pending,
  scrollerRef,
  focus = false,
  onAction,
}: {
  coreRef?: React.RefObject<HTMLElement | null>;
  messages: ChatMessage[];
  streaming: string;
  pending: boolean;
  scrollerRef: React.RefObject<HTMLDivElement | null>;
  focus?: boolean;
  onAction: (text: string) => void;
}) {
  const hasChat = messages.length > 0 || Boolean(streaming);
  return (
    <section
      ref={coreRef}
      className={cn(
        "relative overflow-hidden p-4",
        focus
          ? "h-full min-h-0 rounded-none border-0 bg-[linear-gradient(180deg,rgba(7,21,37,0.92),rgba(4,14,26,0.88))] shadow-none"
          : "hud-panel min-h-96 rounded-xl",
      )}
    >
      <JarvisCore dimmed={hasChat} scanning={pending} />
      {hasChat ? (
        <div
          ref={scrollerRef}
          className={cn(
            "relative z-10 space-y-3 overflow-y-auto pr-1",
            focus ? "h-full" : "max-h-112",
          )}
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
        Open mission board
      </button>
    </Panel>
  );
}

function AgentsPanel({ searching }: { searching: boolean }) {
  const agents = AGENTS.map((agent) =>
    agent.name === "Research Agent"
      ? {
          ...agent,
          status: searching ? "Searching" : "Standby",
          tone: searching ? ("ok" as const) : ("cyan" as const),
        }
      : agent,
  );
  return (
    <Panel title="ACTIVE AGENTS" action={<span className="text-[10px] text-muted">View All</span>}>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => (
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

function FocusMissions({
  overdue,
  dueToday,
  missions,
}: {
  overdue: Task[];
  dueToday: Task[];
  missions: Task[];
}) {
  return (
    <div className="shrink-0 border-t border-line bg-hud-2/80 px-4 py-2 text-center">
      <p className="font-mono text-[10px] tracking-[0.28em] text-muted">CURRENT MISSIONS</p>
      {missions.length === 0 ? (
        <p className="text-sm text-cyan">No active missions.</p>
      ) : (
        <ul className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          {missions.map((task) => {
            const late = overdue.some((item) => item.id === task.id);
            const today = dueToday.some((item) => item.id === task.id);
            return (
              <li key={task.id} className="text-sm text-cyan">
                {task.title}
                <span className={cn("font-mono text-[10px] tracking-widest", late ? "text-danger" : "text-muted")}>
                  {late ? " · overdue" : today ? " · due today" : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TimelinePanel({
  tasks,
  onOpen,
  onDeleted,
}: {
  tasks: Task[];
  onOpen: () => void;
  onDeleted: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

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
      onDeleted();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Could not delete that mission.");
    } finally {
      setBusyId(null);
    }
  }
  const active = tasks.filter((task) => task.status !== "done");
  const completed = tasks
    .filter((task) => task.status === "done")
    .sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt));
  return (
    <Panel
      title="MISSION TIMELINE"
      action={
        <button type="button" className="text-[10px] text-cyan hover:text-cyan-2" onClick={onOpen}>
          Board
        </button>
      }
    >
      {tasks.length === 0 ? (
        <p className="text-sm text-muted">No missions yet. Tell JARVIS what to track.</p>
      ) : (
        <div className="space-y-3">
          {active.length === 0 ? (
            <p className="text-sm text-muted">No pending missions.</p>
          ) : (
            <ol className="space-y-2">
              {active.slice(0, 6).map((task) => (
                <TimelineItem
                  key={task.id}
                  task={task}
                  busy={busyId === task.id}
                  onDelete={() => void removeTask(task)}
                />
              ))}
            </ol>
          )}
          {completed.length > 0 ? (
            <div>
              <p className="font-mono text-[10px] tracking-[0.22em] text-muted">COMPLETED</p>
              <ol className="mt-2 space-y-2">
                {completed.slice(0, 3).map((task) => (
                  <TimelineItem
                    key={task.id}
                    task={task}
                    busy={busyId === task.id}
                    onDelete={() => void removeTask(task)}
                  />
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

function TimelineItem({
  task,
  busy,
  onDelete,
}: {
  task: Task;
  busy: boolean;
  onDelete: () => void;
}) {
  const overdue = task.status !== "done" && task.dueAt != null && task.dueAt < startOfToday();
  return (
    <li className="flex items-start gap-2 text-sm">
      <TaskGlyph title={task.title} icon={task.icon} color={task.color} size={14} />
      <div className="min-w-0 flex-1">
        <p className={task.status === "done" ? "text-muted line-through decoration-ok/40" : undefined}>
          {task.title}
        </p>
        <p
          className={cn(
            "font-mono text-[10px] tracking-widest",
            overdue ? "text-danger" : "text-muted",
          )}
        >
          {task.status === "done" ? "complete" : task.status.replace("_", " ")}
          {task.dueAt ? ` · ${formatWhen(task.dueAt)}` : ""}
        </p>
      </div>
      <button
        type="button"
        aria-label={`Delete ${task.title}`}
        title="Delete mission"
        disabled={busy}
        onClick={onDelete}
        className="shrink-0 rounded-full p-1 text-danger hover:bg-danger/10 disabled:opacity-50"
      >
        <Trash2 size={14} />
      </button>
    </li>
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

type LinkTone = "connected" | "not_linked" | "unconfigured";

type LinkItem = {
  id: string;
  name: string;
  detail: string;
  status: LinkTone;
  low?: boolean;
  statusLabel?: string;
  icon: typeof Sparkles;
  connectHref?: string;
  onDisconnect?: () => void;
};

function googleLinkStatus(configured: boolean, email: string | null): LinkTone {
  if (!configured) return "unconfigured";
  return email ? "connected" : "not_linked";
}

function linkStatusLabel(status: LinkTone) {
  if (status === "connected") return "Connected";
  if (status === "unconfigured") return "Unconfigured";
  return "Not linked";
}

function openRouterLinkStatus(credits: CreditsSnapshot | null): LinkTone {
  if (!credits) return "unconfigured";
  if (!credits.openrouter.configured || credits.openrouter.kind === "unavailable") {
    return "unconfigured";
  }
  return "connected";
}

function LinkStatus({
  thesysReady,
  credits,
  googleConfigured,
  googleEmail,
  onDisconnectGoogle,
}: {
  thesysReady: boolean;
  credits: CreditsSnapshot | null;
  googleConfigured: boolean;
  googleEmail: string | null;
  onDisconnectGoogle: () => void;
}) {
  const google = googleLinkStatus(googleConfigured, googleEmail);
  const googleDetail =
    googleEmail ?? (googleConfigured ? "Click Connect to link" : "Set GOOGLE_CLIENT_ID");
  const googleAction =
    google === "connected"
      ? { onDisconnect: onDisconnectGoogle }
      : google === "not_linked"
        ? { connectHref: "/api/google/connect" }
        : {};
  const openRouter = openRouterLinkStatus(credits);
  const links: LinkItem[] = [
    {
      id: "thesys",
      name: "Thesys C1",
      detail: thesysReady
        ? (credits?.thesys.label ?? "Generative UI")
        : "Generative UI",
      status: thesysReady ? "connected" : "not_linked",
      low: Boolean(thesysReady && credits?.thesys.low),
      icon: Sparkles,
    },
    {
      id: "openrouter",
      name: "OpenRouter",
      detail: credits?.openrouter.label ?? "Checking…",
      status: openRouter,
      statusLabel: !credits
        ? "Checking"
        : credits.openrouter.kind === "unavailable"
          ? "Unavailable"
          : undefined,
      low: Boolean(credits?.openrouter.low),
      icon: Wallet,
    },
    {
      id: "gcal",
      name: "Google Calendar",
      detail: google === "connected" ? googleDetail : "Events & reminders",
      status: google,
      icon: CalendarDays,
      ...googleAction,
    },
    {
      id: "gmail",
      name: "Google Gmail",
      detail: google === "connected" ? googleDetail : "Send & read mail",
      status: google,
      icon: Mail,
      ...googleAction,
    },
  ];

  return (
    <Panel title="LINK STATUS">
      <ul className="space-y-2">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <li
              key={link.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-line/70 px-3 py-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Icon size={14} className="text-cyan" />
                <div className="min-w-0">
                  <p className="text-sm">{link.name}</p>
                  <p
                    title={link.detail}
                    className={cn(
                      "truncate font-mono text-[10px] tracking-widest",
                      link.low ? "text-amber" : "text-muted",
                    )}
                  >
                    {link.detail}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
               
                {link.connectHref ? (
                  <Button href={link.connectHref} shape="pill" size="sm">
                    Connect
                  </Button>
                ) : null}
                {link.onDisconnect ? (
                  <Button
                    shape="pill"
                    size="sm"
                    tone="danger"
                    onClick={link.onDisconnect}
                  >
                    Disconnect
                  </Button>
                ) : null}
                 <span
                className={cn(
                  "font-mono text-xs",
                  link.status === "connected" && "text-ok",
                  link.status === "not_linked" && "text-amber",
                  link.status === "unconfigured" && "text-muted",
                  link.low && "text-amber",
                )}
                >
                  {link.statusLabel ?? linkStatusLabel(link.status)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
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
