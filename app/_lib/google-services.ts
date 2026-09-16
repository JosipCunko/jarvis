import "server-only";
import { getJarvisTimezone } from "@/app/_lib/config";
import { googleApi } from "./google-oauth";
import { getMissionStore } from "@/app/_lib/mission-store";
import type { ChatAttachment } from "@/app/_types/jarvis";

type CalendarEvent = {
  id?: string;
  summary?: string;
  htmlLink?: string;
  hangoutLink?: string;
  location?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
};

type GmailList = { messages?: { id: string }[] };
type GmailMessage = {
  id?: string;
  snippet?: string;
  payload?: {
    mimeType?: string;
    headers?: { name: string; value: string }[];
    body?: { data?: string };
    parts?: GmailMessage["payload"][];
  };
};

function addMinutesToLocal(start: string, minutes: number) {
  const match = start.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (!match) return start;
  const date = new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6] ?? 0),
    ),
  );
  date.setUTCMinutes(date.getUTCMinutes() + minutes);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

function addDaysToDate(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

function eventStamp(event: CalendarEvent) {
  return event.start?.dateTime || event.start?.date || "";
}

export async function listCalendarEvents(
  userId: string,
  options: { days?: number; query?: string } = {},
) {
  const timeZone = getJarvisTimezone();
  const days = Math.min(Math.max(options.days ?? 7, 1), 31);
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("maxResults", "20");
  url.searchParams.set("timeZone", timeZone);
  if (options.query) url.searchParams.set("q", options.query);
  const data = (await googleApi<{ items?: CalendarEvent[] }>(userId, url.toString())) ?? {
    items: [],
  };
  return (data.items ?? []).map((event: CalendarEvent) => ({
    id: event.id,
    title: event.summary || "(no title)",
    start: eventStamp(event),
    end: event.end?.dateTime || event.end?.date || "",
    location: event.location || "",
    link: event.htmlLink || "",
  }));
}

export async function createCalendarEvent(
  userId: string,
  input: {
    title: string;
    start: string;
    end?: string;
    duration_minutes?: number;
    description?: string;
    location?: string;
    reminder_minutes?: number;
  },
) {
  const timeZone = getJarvisTimezone();
  const title = input.title.trim();
  if (!title) throw new Error("Event title is required.");
  const start = input.start.trim();
  if (!start) throw new Error("Event start is required.");
  const reminder = input.reminder_minutes ?? 30;
  const isAllDay = /^\d{4}-\d{2}-\d{2}$/.test(start);
  const body = isAllDay
    ? {
        summary: title,
        description: input.description,
        location: input.location,
        start: { date: start },
        end: { date: input.end || addDaysToDate(start, 1) },
        reminders: {
          useDefault: false,
          overrides: [{ method: "popup", minutes: reminder }],
        },
      }
    : {
        summary: title,
        description: input.description,
        location: input.location,
        start: { dateTime: start, timeZone },
        end: {
          dateTime: input.end || addMinutesToLocal(start, input.duration_minutes ?? 60),
          timeZone,
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: "popup", minutes: reminder },
            { method: "email", minutes: Math.max(reminder, 60) },
          ],
        },
      };
  const event = await googleApi<CalendarEvent>(
    userId,
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    { method: "POST", body: JSON.stringify(body) },
  );
  return {
    id: event.id,
    title: event.summary || title,
    start: eventStamp(event),
    end: event.end?.dateTime || event.end?.date || "",
    link: event.htmlLink || "",
    timeZone,
  };
}

function headerValue(message: GmailMessage, name: string) {
  return (
    message.payload?.headers?.find(
      (item) => item.name.toLowerCase() === name.toLowerCase(),
    )?.value ?? ""
  );
}

function decodeGmailData(data?: string) {
  if (!data) return "";
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function extractBody(payload?: GmailMessage["payload"]): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeGmailData(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractBody(part);
      if (text) return text;
    }
  }
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return decodeGmailData(payload.body.data)
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return "";
}

export async function listEmails(
  userId: string,
  options: { query?: string; max_results?: number } = {},
) {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("maxResults", String(Math.min(Math.max(options.max_results ?? 8, 1), 20)));
  if (options.query) url.searchParams.set("q", options.query);
  const list =
    (await googleApi<GmailList>(userId, url.toString())) ?? { messages: [] };
  const messages = await Promise.all(
    (list.messages ?? []).slice(0, 8).map(async (item: { id: string }) => {
      const message = await googleApi<GmailMessage>(
        userId,
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      );
      return {
        id: message.id || item.id,
        from: headerValue(message, "From"),
        subject: headerValue(message, "Subject") || "(no subject)",
        date: headerValue(message, "Date"),
        snippet: message.snippet || "",
      };
    }),
  );
  return messages;
}

export async function readEmail(userId: string, messageId: string) {
  if (!messageId) throw new Error("message_id is required.");
  const message = await googleApi<GmailMessage>(
    userId,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`,
  );
  return {
    id: message.id,
    from: headerValue(message, "From"),
    to: headerValue(message, "To"),
    subject: headerValue(message, "Subject") || "(no subject)",
    date: headerValue(message, "Date"),
    snippet: message.snippet || "",
    body: extractBody(message.payload).slice(0, 4000),
  };
}

function parseDataUrl(attachment: ChatAttachment) {
  const dataUrl = attachment.dataUrl || "";
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1] || attachment.mimeType, data: match[2] };
}

function mimeFilename(name: string) {
  return name.replace(/[^\w.\-]+/g, "_") || "attachment";
}

function wrapBase64(value: string) {
  return value.replace(/(.{76})/g, "$1\r\n").trim();
}

function encodeSubject(subject: string) {
  if (/^[\x20-\x7E]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

export async function sendEmail(
  userId: string,
  input: {
    to?: string;
    subject: string;
    body?: string;
    attach_chat_images?: boolean;
  },
  attachments: ChatAttachment[] = [],
) {
  const account = await getMissionStore().getGoogleAccount(userId);
  const toRaw = (input.to || "me").trim();
  const to =
    !toRaw || /^(me|myself|self)$/i.test(toRaw) ? account?.email : toRaw;
  if (!to) throw new Error("No recipient. Connect Google or pass an email address.");
  const subject = input.subject.trim();
  if (!subject) throw new Error("Email subject is required.");
  const files =
    input.attach_chat_images === false
      ? []
      : attachments
          .map((item) => {
            const parsed = parseDataUrl(item);
            if (!parsed) return null;
            return { name: mimeFilename(item.name), ...parsed };
          })
          .filter((item): item is { name: string; mimeType: string; data: string } => Boolean(item));
  const bodyText = input.body?.trim() || "";
  const boundary = `jarvis_${Date.now()}`;
  const lines = [
    `From: ${account?.email || "me"}`,
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    "MIME-Version: 1.0",
  ];
  if (files.length === 0) {
    lines.push('Content-Type: text/plain; charset="UTF-8"', "", bodyText);
  } else {
    lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`, "");
    lines.push(
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      bodyText,
    );
    for (const file of files) {
      lines.push(
        `--${boundary}`,
        `Content-Type: ${file.mimeType}; name="${file.name}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${file.name}"`,
        "",
        wrapBase64(file.data),
      );
    }
    lines.push(`--${boundary}--`);
  }
  const raw = Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
  const sent = await googleApi<{ id?: string }>(
    userId,
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    { method: "POST", body: JSON.stringify({ raw }) },
  );
  return {
    ok: true,
    id: sent.id,
    to,
    subject,
    attached: files.map((file) => file.name),
  };
}
