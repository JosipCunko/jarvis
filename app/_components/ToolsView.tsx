"use client";

import {
  Brain,
  CalendarDays,
  CalendarPlus,
  Check,
  Globe,
  Inbox,
  ListChecks,
  MailOpen,
  MessageCircle,
  PenLine,
  Plus,
  Search,
  Send,
  Users,
  Sun,
  Wallet,
  type LucideIcon,
} from "lucide-react";

const TOOLS: { name: string; detail: string; icon: LucideIcon }[] = [
  {
    name: "Briefing",
    detail: "Reads what is overdue, what is due today, and which missions are already in progress.",
    icon: Sun,
  },
  {
    name: "Credits",
    detail: "Checks how much OpenRouter and Thesys credit is left.",
    icon: Wallet,
  },
  {
    name: "List missions",
    detail: "Looks up missions. Unless you ask for finished ones, it shows the ones still open.",
    icon: ListChecks,
  },
  {
    name: "Create mission",
    detail:
      "Adds a mission with a title, due date, priority, notes, icon, and color. It can also set the course, the kind of work, and a repeat.",
    icon: Plus,
  },
  {
    name: "Update mission",
    detail:
      "Changes a mission's title, course, due date, priority, notes, tags, look, or repeat. This is also how a mission is rescheduled. It does not delete a mission or mark it done.",
    icon: PenLine,
  },
  {
    name: "Complete mission",
    detail:
      "Marks a mission finished when you say it is done. If the mission repeats, the next occurrence is created.",
    icon: Check,
  },
  {
    name: "Remember",
    detail: "Stores a short note JARVIS can bring back later.",
    icon: Brain,
  },
  {
    name: "Recall",
    detail: "Searches the notes JARVIS has stored.",
    icon: Search,
  },
  {
    name: "Calendar",
    detail: "Lists upcoming Google Calendar events, from today through as far as a month ahead.",
    icon: CalendarDays,
  },
  {
    name: "New event",
    detail: "Adds an appointment or reminder to Google Calendar.",
    icon: CalendarPlus,
  },
  {
    name: "Inbox",
    detail: "Lists recent Gmail messages, including unread mail or mail from one person.",
    icon: Inbox,
  },
  {
    name: "Read email",
    detail: "Opens one Gmail message so JARVIS can explain what it says and what it asks of you.",
    icon: MailOpen,
  },
  {
    name: "Send email",
    detail: "Sends mail from the connected Gmail account, including images attached in the chat.",
    icon: Send,
  },
  {
    name: "WhatsApp messages",
    detail: "Reads recent WhatsApp messages, including unread chats or one contact.",
    icon: MessageCircle,
  },
  {
    name: "WhatsApp contacts",
    detail: "Looks up WhatsApp contacts by name or phone number.",
    icon: Users,
  },
  {
    name: "Send WhatsApp",
    detail: "Sends a message to a contact, including images attached in the chat.",
    icon: Send,
  },
  {
    name: "Web research",
    detail: "Searches the web once and answers from the sources it finds.",
    icon: Globe,
  },
];

export function ToolsView() {
  return (
    <div className="mx-auto grid max-w-[1600px] gap-3">
      <h1 className="font-display text-2xl tracking-[0.18em] text-cyan hud-glow sm:tracking-[0.22em]">
        Tools & Skills
      </h1>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <article key={tool.name} className="hud-panel rounded-xl p-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-cyan/40 bg-cyan/10 text-cyan">
                <Icon size={20} aria-hidden />
              </span>
              <h2 className="mt-4 font-display text-sm tracking-[0.18em]">{tool.name}</h2>
              <p className="mt-2 text-sm text-muted">{tool.detail}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
