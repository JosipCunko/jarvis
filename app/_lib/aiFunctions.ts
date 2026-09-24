import "server-only";
import { getMissionStore } from "./mission-store";
import { getApiUserId } from "./session";
import {
  createCalendarEvent,
  listCalendarEvents,
  listEmails,
  readEmail,
  sendEmail,
} from "./google-services";
import { readWhatsAppContacts, readWhatsAppMessages, sendWhatsAppMessage } from "./whatsapp";
import { getProviderCredits } from "./credits";
import { researchWeb } from "./web-research";
import {
  MISSION_KINDS,
  missionKindLabel,
  parseMissionKind,
  parseRepeatArg,
  repeatLabel,
} from "./mission-repeat";
import { resolveTaskAppearance, TASK_COLOR_IDS, TASK_ICON_IDS, taskAppearanceGuide } from "./task-appearance";
import { formatWhen, parseWhen, startOfToday, endOfToday } from "./time";
import type { ChatAttachment, FunctionResult, Task, TaskPriority } from "@/app/_types/jarvis";

function repeatParameters() {
  return {
    type: "object",
    description:
      "Omit for a one-off. frequency none stops repeating. weekdays is only for weekly: 0 is Sunday through 6 Saturday.",
    properties: {
      frequency: { type: "string", enum: ["daily", "weekly", "weekdays", "none"] },
      interval: { type: "number", description: "Every N days or weeks. Default 1." },
      weekdays: { type: "array", items: { type: "number" } },
      until: { type: "string", description: "Last date this repeat may occur. YYYY-MM-DD or ISO datetime." },
    },
  };
}

export const AI_FUNCTIONS = [
  {
    name: "get_briefing",
    description:
      "Get today's mission briefing: overdue missions, due today, and in-progress work.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_credits",
    description:
      "Read remaining OpenRouter and Thesys credit. Use when the operator asks about balance, credits, spend, or how much is left. Say the spoken field aloud.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "list_missions",
    description: "List missions. Defaults to active (not done) missions. Read-only.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["open", "in_progress", "done", "active"],
          description: "Filter by status. active means not done.",
        },
        query: { type: "string", description: "Optional search string." },
      },
      required: [],
    },
  },
  {
    name: "create_mission",
    description: `Create a new mission. Only you can create missions. Always choose icon and color from the library so the card matches the work. Set kind and course when you know them. Omit repeat for a one-off. ${taskAppearanceGuide()}`,
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        kind: { type: "string", enum: [...MISSION_KINDS] },
        course: { type: "string", description: "Subject or class name." },
        due_at: { type: "string", description: "ISO datetime or natural date." },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        tags: { type: "array", items: { type: "string" } },
        notes: { type: "string" },
        repeat: repeatParameters(),
        icon: {
          type: "string",
          enum: [...TASK_ICON_IDS],
          description: "Icon id from the mission library. Pick the closest match for the work.",
        },
        color: {
          type: "string",
          enum: [...TASK_COLOR_IDS],
          description: "Color id from the mission library. Pick an accent that fits the work.",
        },
      },
      required: ["title", "icon", "color"],
    },
  },
  {
    name: "update_mission",
    description:
      "Update an existing mission's title, course, kind, due date, priority, notes, tags, icon, color, or repeat. Use this to reschedule. Pass repeat.frequency none to stop repeating. You cannot delete a mission and you cannot mark it complete with this tool.",
    parameters: {
      type: "object",
      properties: {
        mission_id: { type: "string" },
        title: { type: "string", description: "Current title to find it, or the new title when mission_id is set." },
        kind: { type: "string", enum: [...MISSION_KINDS] },
        course: { type: "string" },
        due_at: { type: "string", description: "ISO datetime or natural date." },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        tags: { type: "array", items: { type: "string" } },
        notes: { type: "string" },
        repeat: repeatParameters(),
        icon: { type: "string", enum: [...TASK_ICON_IDS] },
        color: { type: "string", enum: [...TASK_COLOR_IDS] },
      },
      required: [],
    },
  },
  {
    name: "complete_mission",
    description:
      "Mark a mission done only when the operator explicitly says it is finished. Prefer mission_id; otherwise match by title. If it repeats, the next occurrence is created automatically.",
    parameters: {
      type: "object",
      properties: {
        mission_id: { type: "string" },
        title: { type: "string" },
      },
      required: [],
    },
  },
  {
    name: "remember",
    description: "Store a short memory note JARVIS should recall later.",
    parameters: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
  },
  {
    name: "recall",
    description: "Search stored memories.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: [],
    },
  },
  {
    name: "list_calendar_events",
    description:
      "List upcoming Google Calendar events. Use for 'what's on my calendar', reminders, or appointments.",
    parameters: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description:
            "How many days ahead to look, starting today. Use 31 for the next month. Maximum 31.",
        },
        query: { type: "string", description: "Optional search text." },
      },
      required: [],
    },
  },
  {
    name: "create_calendar_event",
    description:
      "Create a Google Calendar event. Use when the operator says remind me, add an appointment, dentist, meeting, etc. start must be local ISO datetime YYYY-MM-DDTHH:mm:ss or YYYY-MM-DD for all-day.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        start: {
          type: "string",
          description: "Local ISO datetime such as 2026-09-17T10:50:00",
        },
        end: { type: "string" },
        duration_minutes: { type: "number", description: "Default 60 if end is omitted." },
        description: { type: "string" },
        location: { type: "string" },
        reminder_minutes: { type: "number", description: "Popup reminder. Default 30." },
      },
      required: ["title", "start"],
    },
  },
  {
    name: "list_emails",
    description: "List recent Gmail messages. Supports Gmail search queries like is:unread or from:alice@x.com.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        max_results: { type: "number" },
      },
      required: [],
    },
  },
  {
    name: "read_email",
    description: "Read one Gmail message by id from list_emails.",
    parameters: {
      type: "object",
      properties: { message_id: { type: "string" } },
      required: ["message_id"],
    },
  },
  {
    name: "send_email",
    description:
      "Send an email from the operator's Gmail. Use to: me or myself for their own address. If they pasted or attached images, set attach_chat_images true.",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient. Use me for the connected Gmail account." },
        subject: { type: "string" },
        body: { type: "string" },
        attach_chat_images: {
          type: "boolean",
          description: "Attach images pasted in this chat message. Default true if images are present.",
        },
      },
      required: ["subject"],
    },
  },
  {
    name: "read_whatsapp_messages",
    description:
      "Read WhatsApp messages. Use for unread WhatsApp, a contact's chat, or one message id. Returns sender, text, and time. Photos on those messages are attached for you to describe.",
    parameters: {
      type: "object",
      properties: {
        contact: { type: "string", description: "Optional contact name or phone." },
        unread_only: { type: "boolean", description: "Only unread messages." },
        message_id: { type: "string", description: "One message id, when the operator names it." },
        max_results: { type: "number" },
      },
      required: [],
    },
  },
  {
    name: "read_whatsapp_contacts",
    description: "Search the operator's WhatsApp contacts by name or phone.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Name or phone. Omit to list recent contacts." },
      },
      required: [],
    },
  },
  {
    name: "send_whatsapp_message",
    description:
      "Send a WhatsApp message to a contact name or phone number. If they pasted or attached images, set attach_chat_images true so those images are sent with the message.",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Contact name or phone number." },
        text: { type: "string" },
        attach_chat_images: {
          type: "boolean",
          description: "Send images pasted in this chat message. Default true if images are present.",
        },
      },
      required: ["to"],
    },
  },
  {
    name: "research_web",
    description:
      "Search the web once and return source titles, urls, and snippets. Use only when the operator asks to research the web, look it up, go on Google, double-check, verify, or fact-check. Croatian: istraži, provjeri na netu, idi na google, jesi siguran. Do not use for missions, calendar, Gmail, memories, or credits.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Short web search query written by you, not the operator's raw sentence.",
        },
      },
      required: ["query"],
    },
  },
];

export type FunctionContext = {
  attachments?: ChatAttachment[];
};

function serializeTask(task: Task) {
  const look = resolveTaskAppearance(task);
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    kind: task.kind ? missionKindLabel(task.kind) : "",
    course: task.course ?? "",
    due: task.dueAt ? formatWhen(task.dueAt) : "unscheduled",
    repeat: repeatLabel(task.repeat) || "none",
    tags: task.tags,
    notes: task.notes ?? "",
    icon: look.icon,
    color: look.color,
  };
}

function asPriority(value: unknown): TaskPriority {
  return value === "low" || value === "high" ? value : "medium";
}

function missionFields(args: Record<string, unknown>) {
  const kind = parseMissionKind(args.kind);
  const repeat = parseRepeatArg(args.repeat);
  return {
    kind,
    course: typeof args.course === "string" ? args.course : undefined,
    repeat,
    notes: typeof args.notes === "string" ? args.notes : undefined,
    tags: Array.isArray(args.tags) ? args.tags.map(String) : undefined,
    icon: typeof args.icon === "string" ? args.icon : undefined,
    color: typeof args.color === "string" ? args.color : undefined,
    priority: args.priority === "low" || args.priority === "medium" || args.priority === "high"
      ? asPriority(args.priority)
      : undefined,
    dueAt: typeof args.due_at === "string" ? args.due_at : undefined,
  };
}

async function findTask(userId: string, taskId?: string, title?: string) {
  const store = getMissionStore();
  if (taskId) {
    const tasks = await store.listTasks(userId);
    return tasks.find((task) => task.id === taskId) ?? null;
  }
  if (!title) return null;
  const lower = title.toLowerCase();
  const tasks = await store.listTasks(userId, { status: "active" });
  return (
    tasks.find((task) => task.title.toLowerCase() === lower) ??
    tasks.find((task) => task.title.toLowerCase().includes(lower)) ??
    null
  );
}

export async function executeFunctions(
  functionCalls: { name: string; arguments: Record<string, unknown> }[],
  context: FunctionContext = {},
): Promise<FunctionResult[]> {
  const userId = await getApiUserId();
  if (!userId) {
    return [{ name: "error", result: { error: "Not authenticated" } }];
  }
  const store = getMissionStore();
  const results: FunctionResult[] = [];
  const attachments = context.attachments ?? [];

  for (const call of functionCalls) {
    const args = call.arguments ?? {};
    try {
      if (call.name === "get_credits") {
        const credits = await getProviderCredits();
        results.push({ name: call.name, result: credits });
      } else if (call.name === "get_briefing") {
        const snapshot = await store.loadSnapshot(userId);
        const now = Date.now();
        const overdue = snapshot.tasks.filter(
          (task) => task.status !== "done" && task.dueAt != null && task.dueAt < startOfToday(),
        );
        const dueToday = snapshot.tasks.filter(
          (task) =>
            task.status !== "done" &&
            task.dueAt != null &&
            task.dueAt >= startOfToday() &&
            task.dueAt <= endOfToday(),
        );
        const inProgress = snapshot.tasks.filter((task) => task.status === "in_progress");
        let calendarToday: unknown[] = [];
        try {
          calendarToday = await listCalendarEvents(userId, { days: 1 });
        } catch {
          calendarToday = [];
        }
        results.push({
          name: call.name,
          result: {
            operator: snapshot.user.displayName,
            overdue: overdue.map(serializeTask),
            dueToday: dueToday.map(serializeTask),
            inProgress: inProgress.map(serializeTask),
            calendarToday,
            generatedAt: formatWhen(now),
          },
        });
      } else if (call.name === "list_missions") {
        const status =
          args.status === "open" ||
          args.status === "in_progress" ||
          args.status === "done" ||
          args.status === "active"
            ? args.status
            : "active";
        const tasks = await store.listTasks(userId, {
          status,
          query: typeof args.query === "string" ? args.query : undefined,
        });
        results.push({
          name: call.name,
          result: { count: tasks.length, tasks: tasks.map(serializeTask) },
        });
      } else if (call.name === "create_mission") {
        const fields = missionFields(args);
        const dueAt = typeof args.due_at === "string" ? parseWhen(args.due_at) : undefined;
        if (typeof args.due_at === "string" && args.due_at.trim() && dueAt == null) {
          results.push({ name: call.name, result: { error: "Invalid due_at" } });
          continue;
        }
        const task = await store.upsertTask(userId, {
          title: String(args.title ?? ""),
          dueAt: fields.dueAt,
          priority: fields.priority ?? "medium",
          tags: fields.tags ?? [],
          notes: fields.notes,
          icon: fields.icon,
          color: fields.color,
          kind: fields.kind,
          course: fields.course,
          repeat: fields.repeat,
        });
        results.push({ name: call.name, result: { ok: true, task: serializeTask(task) } });
      } else if (call.name === "update_mission") {
        const found = await findTask(
          userId,
          typeof args.mission_id === "string" ? args.mission_id : undefined,
          typeof args.title === "string" ? args.title : undefined,
        );
        if (!found) {
          results.push({ name: call.name, result: { error: "Mission not found" } });
          continue;
        }
        const fields = missionFields(args);
        if (typeof args.due_at === "string" && args.due_at.trim() && parseWhen(args.due_at) == null) {
          results.push({ name: call.name, result: { error: "Invalid due_at" } });
          continue;
        }
        const nextTitle =
          typeof args.mission_id === "string" && typeof args.title === "string" && args.title.trim()
            ? args.title
            : found.title;
        const task = await store.upsertTask(userId, {
          id: found.id,
          title: nextTitle,
          dueAt: fields.dueAt,
          priority: fields.priority,
          tags: fields.tags,
          notes: fields.notes,
          icon: fields.icon,
          color: fields.color,
          kind: fields.kind,
          course: fields.course,
          repeat: fields.repeat,
        });
        results.push({ name: call.name, result: { ok: true, task: serializeTask(task) } });
      } else if (call.name === "complete_mission") {
        const found = await findTask(
          userId,
          typeof args.mission_id === "string" ? args.mission_id : undefined,
          typeof args.title === "string" ? args.title : undefined,
        );
        if (!found) {
          results.push({ name: call.name, result: { error: "Mission not found" } });
          continue;
        }
        const completed = await store.completeTask(userId, found.id);
        results.push({
          name: call.name,
          result: {
            ok: true,
            task: serializeTask(completed.task),
            next: completed.next ? serializeTask(completed.next) : null,
          },
        });
      } else if (call.name === "remember") {
        const note = await store.remember(userId, String(args.text ?? ""));
        results.push({ name: call.name, result: { ok: true, note } });
      } else if (call.name === "recall") {
        const notes = await store.recall(
          userId,
          typeof args.query === "string" ? args.query : undefined,
        );
        results.push({ name: call.name, result: { notes } });
      } else if (call.name === "list_calendar_events") {
        const events = await listCalendarEvents(userId, {
          days: typeof args.days === "number" ? args.days : undefined,
          query: typeof args.query === "string" ? args.query : undefined,
        });
        results.push({ name: call.name, result: { count: events.length, events } });
      } else if (call.name === "create_calendar_event") {
        const event = await createCalendarEvent(userId, {
          title: String(args.title ?? ""),
          start: String(args.start ?? ""),
          end: typeof args.end === "string" ? args.end : undefined,
          duration_minutes:
            typeof args.duration_minutes === "number" ? args.duration_minutes : undefined,
          description: typeof args.description === "string" ? args.description : undefined,
          location: typeof args.location === "string" ? args.location : undefined,
          reminder_minutes:
            typeof args.reminder_minutes === "number" ? args.reminder_minutes : undefined,
        });
        results.push({ name: call.name, result: { ok: true, event } });
      } else if (call.name === "list_emails") {
        const emails = await listEmails(userId, {
          query: typeof args.query === "string" ? args.query : undefined,
          max_results: typeof args.max_results === "number" ? args.max_results : undefined,
        });
        results.push({ name: call.name, result: { count: emails.length, emails } });
      } else if (call.name === "read_email") {
        const email = await readEmail(
          userId,
          typeof args.message_id === "string" ? args.message_id : "",
        );
        results.push({ name: call.name, result: { email } });
      } else if (call.name === "send_email") {
        const sent = await sendEmail(
          userId,
          {
            to: typeof args.to === "string" ? args.to : "me",
            subject: String(args.subject ?? ""),
            body: typeof args.body === "string" ? args.body : undefined,
            attach_chat_images:
              args.attach_chat_images === false ? false : true,
          },
          attachments,
        );
        results.push({ name: call.name, result: sent });
      } else if (call.name === "read_whatsapp_messages") {
        const messages = await readWhatsAppMessages(userId, {
          contact: typeof args.contact === "string" ? args.contact : undefined,
          unread_only: args.unread_only === true,
          message_id: typeof args.message_id === "string" ? args.message_id : undefined,
          max_results: typeof args.max_results === "number" ? args.max_results : undefined,
        });
        results.push({ name: call.name, result: messages });
      } else if (call.name === "read_whatsapp_contacts") {
        const contacts = await readWhatsAppContacts(
          userId,
          typeof args.query === "string" ? args.query : undefined,
        );
        results.push({ name: call.name, result: contacts });
      } else if (call.name === "send_whatsapp_message") {
        const sent = await sendWhatsAppMessage(
          userId,
          {
            to: typeof args.to === "string" ? args.to : "",
            text: typeof args.text === "string" ? args.text : undefined,
            attach_chat_images: args.attach_chat_images === false ? false : true,
          },
          attachments,
        );
        results.push({ name: call.name, result: sent });
      } else if (call.name === "research_web") {
        const research = await researchWeb(typeof args.query === "string" ? args.query : "");
        results.push({
          name: call.name,
          result: research.error
            ? { error: research.error, query: research.query, sources: research.sources }
            : { query: research.query, sources: research.sources },
        });
      } else {
        results.push({ name: call.name, result: { error: "Unknown function" } });
      }
    } catch (error) {
      results.push({
        name: call.name,
        result: {
          error: error instanceof Error ? error.message : "Function failed",
        },
      });
    }
  }

  return results;
}
