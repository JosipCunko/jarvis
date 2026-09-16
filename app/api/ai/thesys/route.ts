import { NextRequest } from "next/server";
import { AI_FUNCTIONS, executeFunctions } from "@/app/_lib/aiFunctions";
import { getJarvisTimezone, isThesysConfigured } from "@/app/_lib/config";
import { getMissionStore } from "@/app/_lib/mission-store";
import { getApiUserId } from "@/app/_lib/session";
import { formatZonedStamp, resolveRelativeDateTime } from "@/app/_lib/time";
import type { ChatAttachment, ChatMessage, FunctionResult } from "@/app/_types/jarvis";

const DEFAULT_MODEL = "c1/google/gemini-3.1-flash-lite-free/v-20260331";

function buildSystemPrompt(opts: {
  timezone: string;
  nowLabel: string;
  googleEmail: string | null;
}) {
  const googleLine = opts.googleEmail
    ? `Google is connected as ${opts.googleEmail}. Use list_calendar_events / create_calendar_event for calendar and reminders, and list_emails / read_email / send_email for Gmail.`
    : "Google is not connected. If they need Calendar or Gmail, tell them to click Connect Google in the header.";
  return `You are JARVIS, Tony Stark's operator — calm, precise, slightly dry, never sycophantic.
You run this Command Center. Missions (tasks), memories, Google Calendar, and Gmail live in tools. Call tools instead of inventing data.
Operator local time is ${opts.nowLabel} (${opts.timezone}).
${googleLine}
When they say remind me, dentist, appointment, meeting, or put something on the calendar, call create_calendar_event with a local ISO start (YYYY-MM-DDTHH:mm:ss) in ${opts.timezone}. Do not only create a mission unless they clearly asked for a JARVIS task.
When they ask to email myself/me, call send_email with to "me". If they pasted or attached images, set attach_chat_images true.
When the operator asks what to do, call get_briefing. When they mention a new piece of work that is not a calendar reminder, call create_task.
Prefer generative UI: cards, lists, and timelines over long paragraphs. If you generate UI, use well-formed openui-lang with quoted strings and CardHeader/ListItem components.
Keep replies short. Address the operator as sir only sparingly.`;
}

function lastUserAttachments(messages: ChatMessage[]) {
  const last = [...messages].reverse().find((item) => item.role === "user");
  return (last?.attachments ?? []).filter((item) => Boolean(item.dataUrl));
}

function toThesysContent(message: ChatMessage) {
  const attachments = (message.attachments ?? []).filter((item) => item.dataUrl);
  if (message.role !== "user" || attachments.length === 0) {
    return { role: message.role, content: message.content };
  }
  const names = attachments.map((item) => item.name).join(", ");
  const text = message.content
    ? `${message.content}\n\n(${attachments.length} image(s) attached: ${names})`
    : `The operator attached ${attachments.length} image(s): ${names}`;
  return {
    role: "user" as const,
    content: [
      { type: "text", text },
      ...attachments.map((item) => ({
        type: "image_url",
        image_url: { url: item.dataUrl as string },
      })),
    ],
  };
}

function localGoogleIntent(text: string, attachments: ChatAttachment[]) {
  const timezone = getJarvisTimezone();
  if (/send (an )?email|email (to )?(me|myself)|email me/i.test(text)) {
    const subject =
      text.match(/subject\s*[:\-]?\s*([^,\n.]+)/i)?.[1]?.trim() || "Message from JARVIS";
    return {
      name: "send_email",
      arguments: {
        to: "me",
        subject,
        body: text,
        attach_chat_images: attachments.length > 0,
      },
    };
  }
  if (/remind me|add .*calendar|on my calendar|appointment|dentist/i.test(text)) {
    const start =
      resolveRelativeDateTime(text, timezone) ||
      `${formatZonedStamp(timezone).slice(0, 10)}T09:00:00`;
    const title =
      text
        .replace(/remind me (that )?/i, "")
        .replace(/\b(tomorrow|today)\b/gi, "")
        .replace(/\bat\s+\d{1,2}[:.]\d{2}\b/i, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80) || "Reminder";
    return {
      name: "create_calendar_event",
      arguments: { title, start, duration_minutes: 60 },
    };
  }
  if (/(inbox|gmail|emails?)/i.test(text) && /(list|check|read|show|what)/i.test(text)) {
    return { name: "list_emails", arguments: {} };
  }
  if (/google calendar|what.?s on my calendar/i.test(text)) {
    return { name: "list_calendar_events", arguments: { days: 2 } };
  }
  return null;
}

const tools = AI_FUNCTIONS.map((func) => ({
  type: "function" as const,
  function: func,
}));

interface ToolCall {
  id: string;
  type: string;
  function: { name: string; arguments: string };
}

function encode(type: string, data: Record<string, unknown> = {}) {
  return new TextEncoder().encode(
    `data: ${JSON.stringify({ type, ...data })}\n\n`,
  );
}

function parseToolArguments(raw: string) {
  try {
    return JSON.parse(raw || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function localBriefingFallback(messages: ChatMessage[]) {
  const last = [...messages].reverse().find((item) => item.role === "user");
  const text = last?.content ?? "";
  const attachments = lastUserAttachments(messages);
  const googleCall = localGoogleIntent(text, attachments);
  if (googleCall) {
    const results = await executeFunctions([googleCall], { attachments });
    const result = results[0]?.result ?? {};
    const content =
      typeof result.error === "string"
        ? result.error
        : googleCall.name === "send_email"
          ? `Email sent${result.to ? ` to ${result.to}` : ""}.`
          : googleCall.name === "create_calendar_event"
            ? "Calendar event created."
            : "Done.";
    return { content, results };
  }
  if (/remember|note|memory/i.test(text)) {
    const results = await executeFunctions([{ name: "recall", arguments: {} }]);
    return {
      content: "Recalled stored notes. Add THESYS_API_KEY for generative UI.",
      results,
    };
  }
  const results = await executeFunctions([{ name: "get_briefing", arguments: {} }]);
  const briefing = results[0]?.result as {
    overdue?: { title: string; due: string }[];
    dueToday?: { title: string; due: string }[];
    inProgress?: { title: string }[];
  };
  const lines = [
    "Standing by. Local briefing (Thesys is not configured):",
    briefing?.inProgress?.length
      ? `In progress: ${briefing.inProgress.map((item) => item.title).join(", ")}`
      : "Nothing in progress.",
    briefing?.dueToday?.length
      ? `Due today: ${briefing.dueToday.map((item) => `${item.title} (${item.due})`).join("; ")}`
      : "Nothing due today.",
    briefing?.overdue?.length
      ? `Overdue: ${briefing.overdue.map((item) => item.title).join(", ")}`
      : "No overdue missions.",
  ];
  return { content: lines.join("\n"), results };
}

export async function POST(request: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) {
    return Response.json({ error: { message: "Sign in first." } }, { status: 401 });
  }

  const body = await request.json();
  const messages = (body.messages ?? []) as ChatMessage[];
  const model = body.modelId || DEFAULT_MODEL;
  const existingChatId = body.chatId as string | undefined;
  const store = getMissionStore();
  const attachments = lastUserAttachments(messages);
  const googleAccount = await store.getGoogleAccount(userId);
  const timezone = getJarvisTimezone();
  const systemPrompt = buildSystemPrompt({
    timezone,
    nowLabel: formatZonedStamp(timezone),
    googleEmail: googleAccount?.email ?? null,
  });

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (!isThesysConfigured()) {
          const fallback = await localBriefingFallback(messages);
          controller.enqueue(encode("content", { content: fallback.content }));
          controller.enqueue(encode("tool_results", { results: fallback.results }));
          const chat = await store.saveChat(
            userId,
            existingChatId,
            [
              ...messages,
              {
                role: "assistant",
                content: fallback.content,
                functionResults: fallback.results,
              },
            ],
          );
          controller.enqueue(encode("done", { chatId: chat.id, duration: 0 }));
          controller.close();
          return;
        }

        const apiKey = process.env.THESYS_API_KEY as string;
        let conversation: Array<Record<string, unknown>> = [
          { role: "system", content: systemPrompt },
          ...messages.map((message) => toThesysContent(message)),
        ];
        let fullContent = "";
        let toolCalls: ToolCall[] = [];
        const executed: FunctionResult[] = [];

        for (let round = 0; round < 4; round++) {
          const response = await fetch(
            "https://api.thesys.dev/v1/embed/chat/completions",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model,
                messages: conversation,
                tools,
                tool_choice: "auto",
                temperature: 0.4,
                stream: true,
              }),
            },
          );
          if (!response.ok) {
            const errorText = await response.text();
            controller.enqueue(
              encode("error", { error: errorText.slice(0, 400) }),
            );
            break;
          }
          const parsed = await readThesysStream(response, (delta) => {
            controller.enqueue(encode("content", { content: delta }));
          });
          fullContent = parsed.content;
          toolCalls = parsed.toolCalls;
          if (toolCalls.length === 0) break;

          controller.enqueue(encode("content_reset", {}));
          const calls = toolCalls.map((call) => ({
            name: call.function.name,
            arguments: parseToolArguments(call.function.arguments),
          }));
          const results = await executeFunctions(calls, { attachments });
          executed.push(...results);
          conversation = [
            ...conversation,
            { role: "assistant", content: fullContent, tool_calls: toolCalls },
            ...results.map((result, index) => ({
              role: "tool",
              tool_call_id: toolCalls[index]?.id,
              content: JSON.stringify(result.result),
            })),
          ];
          fullContent = "";
        }

        if (executed.length) {
          controller.enqueue(encode("tool_results", { results: executed }));
        }
        const chat = await store.saveChat(
          userId,
          existingChatId,
          [
            ...messages,
            {
              role: "assistant" as const,
              content: fullContent,
              ...(executed.length ? { functionResults: executed } : {}),
            },
          ],
        );
        controller.enqueue(encode("done", { chatId: chat.id, duration: 0 }));
      } catch (error) {
        controller.enqueue(
          encode("error", {
            error: error instanceof Error ? error.message : "AI failed",
          }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}

async function readThesysStream(
  response: Response,
  onContent?: (delta: string) => void,
) {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let content = "";
  let leftover = "";
  const toolCalls: ToolCall[] = [];
  const partial = new Map<number, ToolCall>();
  if (!reader) return { content, toolCalls };

  while (true) {
    const { done, value } = await reader.read();
    leftover += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = leftover.split("\n");
    leftover = done ? "" : (lines.pop() ?? "");
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") continue;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta;
        if (delta?.content) {
          content += delta.content;
          onContent?.(delta.content);
        }
        if (delta?.tool_calls) {
          for (const call of delta.tool_calls) {
            const index = call.index ?? 0;
            const current = partial.get(index) ?? {
              id: call.id ?? `call-${index}`,
              type: "function",
              function: { name: "", arguments: "" },
            };
            if (call.id) current.id = call.id;
            if (call.function?.name) current.function.name += call.function.name;
            if (call.function?.arguments) {
              current.function.arguments += call.function.arguments;
            }
            partial.set(index, current);
          }
        }
      } catch {
        // ignore malformed SSE leftovers
      }
    }
    if (done) break;
  }
  return { content, toolCalls: [...partial.values()] };
}

export async function GET(request: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) {
    return Response.json({ chats: [] }, { status: 401 });
  }
  const store = getMissionStore();
  const chatId = request.nextUrl.searchParams.get("id");
  if (chatId) {
    const chat = await store.getChat(userId, chatId);
    if (!chat) {
      return Response.json({ error: { message: "Chat not found." } }, { status: 404 });
    }
    return Response.json({ chat });
  }
  const chats = await store.listChats(userId);
  return Response.json({ chats });
}
