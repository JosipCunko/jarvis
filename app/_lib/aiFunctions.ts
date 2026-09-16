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
import { formatWhen, parseWhen, startOfToday, endOfToday } from "./time";
import type { ChatAttachment, FunctionResult, Task } from "@/app/_types/jarvis";

export const AI_FUNCTIONS = [
  {
    name: "get_briefing",
    description:
      "Get today's mission briefing: overdue tasks, due today, and in-progress work.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "list_tasks",
    description: "List missions/tasks. Defaults to active (not done) tasks.",
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
    name: "create_task",
    description: "Create a new mission/task for the operator.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        due_at: { type: "string", description: "ISO datetime or natural date." },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        tags: { type: "array", items: { type: "string" } },
        notes: { type: "string" },
      },
      required: ["title"],
    },
  },
  {
    name: "complete_task",
    description: "Mark a task done. Prefer task_id; otherwise match by title.",
    parameters: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        title: { type: "string" },
      },
      required: [],
    },
  },
  {
    name: "reschedule_task",
    description: "Move a task due date. Prefer task_id; otherwise match by title.",
    parameters: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        title: { type: "string" },
        due_at: { type: "string", description: "ISO datetime." },
      },
      required: ["due_at"],
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
        days: { type: "number", description: "How many days ahead to look. Default 7." },
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
];

export type FunctionContext = {
  attachments?: ChatAttachment[];
};

function serializeTask(task: Task) {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    due: task.dueAt ? formatWhen(task.dueAt) : "unscheduled",
    tags: task.tags,
    notes: task.notes ?? "",
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
      if (call.name === "get_briefing") {
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
      } else if (call.name === "list_tasks") {
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
      } else if (call.name === "create_task") {
        const task = await store.upsertTask(userId, {
          title: String(args.title ?? ""),
          dueAt: typeof args.due_at === "string" ? args.due_at : undefined,
          priority:
            args.priority === "low" || args.priority === "high" ? args.priority : "medium",
          tags: Array.isArray(args.tags) ? args.tags.map(String) : [],
          notes: typeof args.notes === "string" ? args.notes : undefined,
        });
        results.push({ name: call.name, result: { ok: true, task: serializeTask(task) } });
      } else if (call.name === "complete_task") {
        const found = await findTask(
          userId,
          typeof args.task_id === "string" ? args.task_id : undefined,
          typeof args.title === "string" ? args.title : undefined,
        );
        if (!found) {
          results.push({ name: call.name, result: { error: "Task not found" } });
          continue;
        }
        const task = await store.completeTask(userId, found.id);
        results.push({ name: call.name, result: { ok: true, task: serializeTask(task) } });
      } else if (call.name === "reschedule_task") {
        const dueAt = parseWhen(typeof args.due_at === "string" ? args.due_at : undefined);
        if (!dueAt) {
          results.push({ name: call.name, result: { error: "Invalid due_at" } });
          continue;
        }
        const found = await findTask(
          userId,
          typeof args.task_id === "string" ? args.task_id : undefined,
          typeof args.title === "string" ? args.title : undefined,
        );
        if (!found) {
          results.push({ name: call.name, result: { error: "Task not found" } });
          continue;
        }
        const task = await store.rescheduleTask(userId, found.id, dueAt);
        results.push({ name: call.name, result: { ok: true, task: serializeTask(task) } });
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
