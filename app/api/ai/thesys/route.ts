import { NextRequest } from "next/server";
import { AI_FUNCTIONS, executeFunctions } from "@/app/_lib/aiFunctions";
import { getProviderCredits } from "@/app/_lib/credits";
import { confirmDayPlan, dueStampForPlan, parseDayPlan } from "@/app/_lib/day-plan";
import { getJarvisTimezone, isThesysConfigured } from "@/app/_lib/config";
import { getMissionStore } from "@/app/_lib/mission-store";
import { getApiUserId } from "@/app/_lib/session";
import { formatZonedStamp, resolveRelativeDateTime } from "@/app/_lib/time";
import { isWebResearchRequest } from "@/app/_lib/web-research";
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
You run this Command Center. Missions (tasks), memories, Google Calendar, Gmail, and the web live in tools. Call tools instead of inventing data.
Operator local time is ${opts.nowLabel} (${opts.timezone}).
${googleLine}
When they say remind me, dentist, appointment, meeting, or put something on the calendar, call create_calendar_event with a local ISO start (YYYY-MM-DDTHH:mm:ss) in ${opts.timezone}. Do not only create a mission unless they clearly asked for a JARVIS task.
When they ask to email myself/me, call send_email with to "me". If they pasted or attached images, set attach_chat_images true.
When the operator asks what to do, call get_briefing. When they mention a new piece of work that is not a calendar reminder, call create_task. Always set icon and color on create_task to the closest library ids so the mission card matches the work.
When they ask about credit, balance, spend, or how much is left on Thesys or OpenRouter, call get_credits. Say the spoken field as complete sentences in TextContent so it is read aloud. Do not put the only copy of the dollar amounts in a CardHeader.
When they ask to research the web, look something up, go on Google, double-check, verify, or fact-check (also istraži, provjeri na netu, idi na google, jesi siguran), call research_web once with a short search query. Do not use research_web for missions, calendar, Gmail, memories, or credits. Answer only from the sources it returns. Put the finding in TextContent as complete sentences with no URLs, because that text is read aloud. Put each source title in a CardHeader subtitle, and add a Button with an open_url action and that source url so the operator can open the page. If research_web returns an error, say that aloud.
If one sentence lists several obligations joined by "i" or "and", call create_task once per obligation. "danas" and "today" mean due today. "sutra" and "tomorrow" mean due tomorrow.
Croatian dates use ordinals: "drugog desetog" is the 2nd of the 10th month. Croatian clock times use "i" for minutes past the hour and "do" for minutes to the hour: "devet i dvadeset" is 9:20, "dvadeset do deset" is 9:40.
Reply only in Croatian (Latin script) or English. Use Croatian when the operator's latest message is Croatian, and English when it is English, unless they explicitly ask for the other, for example "answer in English" or "odgovori na hrvatskom". Never use Cyrillic or any other language.
Put the full explanation in TextContent components as complete sentences. That text is what JARVIS reads aloud, and it may be more than one sentence. CardHeader titles and subtitles are short screen labels and are not spoken. List item text is spoken, so put the actual facts there in words a person would say, not only in a heading. A short lead-in with no markup may come before the UI, but do not put the only copy of an explanation in a CardHeader title.
Prefer generative UI: cards, lists, and timelines over long paragraphs. If you generate UI, use well-formed openui-lang with quoted strings and CardHeader/ListItem components.
When you show code, use CodeBlock(language, codeString). Put each statement on its own line with \\n inside the string and two-space indentation. Never minify a sample onto one line, and never put code in a list item title, subtitle, or action label.
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
  if (/google calendar|what.?s on my calendar|calendar events/i.test(text)) {
    const days = /month/i.test(text) ? 31 : 2;
    return { name: "list_calendar_events", arguments: { days } };
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

async function runToolCalls(
  calls: { name: string; arguments: Record<string, unknown> }[],
  attachments: ChatAttachment[],
  alreadyResearched: () => boolean,
  markResearched: () => void,
) {
  const results: FunctionResult[] = new Array(calls.length);
  const pending: { index: number; call: (typeof calls)[number] }[] = [];
  calls.forEach((call, index) => {
    if (call.name === "research_web" && alreadyResearched()) {
      results[index] = {
        name: "research_web",
        result: {
          error: "Already searched once this turn. Answer from the sources you have.",
        },
      };
      return;
    }
    if (call.name === "research_web") markResearched();
    pending.push({ index, call });
  });
  if (pending.length === 0) return results;
  const executed = await executeFunctions(
    pending.map((item) => item.call),
    { attachments },
  );
  pending.forEach((item, index) => {
    results[item.index] = executed[index];
  });
  return results;
}

async function localBriefingFallback(
  messages: ChatMessage[],
  onResearch?: (status: "searching" | "standby") => void,
) {
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
  if (
    /\b(credits?|balance)\b/i.test(text) ||
    (/\b(openrouter|thesys)\b/i.test(text) && /\b(left|spend|remaining|how much)\b/i.test(text))
  ) {
    const credits = await getProviderCredits();
    return {
      content: credits.spoken,
      results: [{ name: "get_credits", result: credits }],
    };
  }
  if (isWebResearchRequest(text)) {
    onResearch?.("searching");
    try {
      const results = await executeFunctions([
        { name: "research_web", arguments: { query: text } },
      ]);
      return { content: formatLocalResearch(results[0]?.result ?? {}), results };
    } finally {
      onResearch?.("standby");
    }
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

function formatLocalResearch(result: Record<string, unknown>) {
  const sources = Array.isArray(result.sources) ? result.sources : [];
  const lines = sources.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const source = item as { title?: unknown; url?: unknown; snippet?: unknown };
    const title = typeof source.title === "string" ? source.title : "Source";
    const url = typeof source.url === "string" ? source.url : "";
    const snippet = typeof source.snippet === "string" ? source.snippet : "";
    return [`${title}${snippet ? `: ${snippet}` : ""}${url ? `\n${url}` : ""}`];
  });
  if (lines.length > 0) return lines.join("\n\n");
  return typeof result.error === "string" ? result.error : "The web search returned no sources.";
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
  const lastUserText =
    [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const dayPlan = parseDayPlan(lastUserText);
  const dueAt = dayPlan ? dueStampForPlan(timezone, dayPlan.dayOffset) : "";
  const created = dayPlan
    ? await executeFunctions(
        dayPlan.titles.map((title) => ({
          name: "create_task",
          arguments: { title, due_at: dueAt, priority: "medium" },
        })),
      )
    : [];
  const dayPlanNote = dayPlan
    ? `\nThese missions are already created. Do not call create_task for them:\n${dayPlan.titles
        .map((title) => `- ${title} (due ${dueAt})`)
        .join("\n")}\nConfirm them in Croatian if the operator's message is Croatian, otherwise in English. Latin script only. Name each mission in the spoken body, in a TextContent or ListItem, not only in a CardHeader title.`
    : "";
  const systemPrompt =
    buildSystemPrompt({
      timezone,
      nowLabel: formatZonedStamp(timezone),
      googleEmail: googleAccount?.email ?? null,
    }) + dayPlanNote;
  const roundTools = dayPlan
    ? tools.filter((tool) => tool.function.name !== "create_task")
    : tools;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (!isThesysConfigured()) {
          const fallback = dayPlan
            ? { content: confirmDayPlan(dayPlan), results: created }
            : await localBriefingFallback(messages, (status) => {
                controller.enqueue(encode("agent", { name: "research", status }));
              });
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
        let didResearch = false;
        const executed: FunctionResult[] = [...created];

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
                tools: roundTools,
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
          const researching = calls.some((call) => call.name === "research_web");
          const searchNow = researching && !didResearch;
          if (searchNow) {
            controller.enqueue(encode("agent", { name: "research", status: "searching" }));
          }
          let results: FunctionResult[];
          try {
            results = await runToolCalls(calls, attachments, () => didResearch, () => {
              didResearch = true;
            });
          } finally {
            if (searchNow) {
              controller.enqueue(encode("agent", { name: "research", status: "standby" }));
            }
          }
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

        if (!fullContent.trim() && dayPlan) {
          fullContent = confirmDayPlan(dayPlan);
          controller.enqueue(encode("content", { content: fullContent }));
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
