import { NextRequest } from "next/server";
import { AI_FUNCTIONS, executeFunctions } from "@/app/_lib/aiFunctions";
import { getProviderCredits } from "@/app/_lib/credits";
import { confirmDayPlan, dueStampForPlan, parseDayPlan } from "@/app/_lib/day-plan";
import { getJarvisTimezone, isThesysConfigured } from "@/app/_lib/config";
import { getWhatsAppStatus } from "@/app/_lib/whatsapp";
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
  whatsappPhone: string | null;
}) {
  const googleLine = opts.googleEmail
    ? `Google is connected as ${opts.googleEmail}. Use list_calendar_events / create_calendar_event for calendar and reminders, and list_emails / read_email / send_email for Gmail.`
    : "Google is not connected. If they need Calendar or Gmail, tell them to click Connect Google in the header.";
  const whatsappLine = opts.whatsappPhone
    ? `WhatsApp is connected as ${opts.whatsappPhone}. Use read_whatsapp_messages, read_whatsapp_contacts, and send_whatsapp_message. Do not invent chats or contacts.`
    : "WhatsApp is not connected. If they need WhatsApp, tell them to click Connect on WhatsApp in Link status and scan the QR code.";
  return `You are JARVIS, Tony Stark's operator — calm, precise, slightly dry, never sycophantic.
You run this Command Center. Missions, memories, Google Calendar, Gmail, WhatsApp, and the web live in tools. Call tools instead of inventing data.
Operator local time is ${opts.nowLabel} (${opts.timezone}).
${googleLine}
${whatsappLine}
When the operator's message includes images, look at each image and describe what you see in TextContent before you act on it. That description is read aloud.
When they have something to attend, call create_calendar_event with a local ISO start (YYYY-MM-DDTHH:mm:ss) in ${opts.timezone}. That includes lecture, class, lab, seminar, the sitting of an exam, appointment, meeting, dentist, remind me, and putting something on the calendar. In Croatian the same events are predavanje, vježbe, laboratorij, kolegij, and ispit when they mean the sitting. Do not also call create_mission. A date on that event is not a mission. If Google is not connected, tell them to click Connect Google. Do not create a mission in its place. A class or lab is a mission only when they explicitly ask for a mission, or they picked Recurring class or lab on the new-mission card.
When they ask to summarize a Gmail message and the text includes "message id:", call read_email with that id. Explain what the sender wants from the operator and what the message actually says. Do not use research_web for that.
When they ask to email myself/me, call send_email with to "me". If they pasted or attached images, set attach_chat_images true.
When they ask to read WhatsApp, unread WhatsApp, or a WhatsApp message id, call read_whatsapp_messages. When they ask who is in their WhatsApp contacts, call read_whatsapp_contacts. When they ask to message or reply to someone on WhatsApp, call send_whatsapp_message. If they pasted or attached images, set attach_chat_images true. A photo returned by read_whatsapp_messages is attached after the tool result: describe what is in it.
When the operator asks what to do, call get_briefing.
Only you can create or update a mission, with create_mission and update_mission. The operator completes a mission from the board, or by explicitly telling you it is done. You cannot delete a mission.
Call complete_mission only when they explicitly say a mission is finished (done, finished, completed, gotovo). Do not complete one just because they mentioned it. If the tool returns next, say that next due date aloud.
Use update_mission to change title, course, kind, due date, priority, notes, tags, icon, color, or repeat. That includes rescheduling. Pass repeat.frequency none to stop a repeat.
Always set icon and color from the library on create_mission. Set kind and course when you know them.
Create a mission in one of three ways:
1. They already named work they have to finish and when it is due. Call create_mission immediately. This is an assignment, homework, reading, study block, project, or errand. A lecture, class, lab, seminar, or exam sitting is a calendar event, not this path. One mission per obligation. If one sentence lists several obligations joined by "i" or "and", call create_mission once per obligation. "danas" and "today" mean due today. "sutra" and "tomorrow" mean due tomorrow.
2. They only ask for a new mission, or the request does not say what the work is. Do not call create_mission yet. Show a card of ways to add one, with one short spoken sentence and a Button for each option. Each button continues the conversation and must not open a URL. Put the follow-up sentence in the button humanFriendlyMessage:
- Assignment: "Create an assignment mission. Ask me for the course, title, and due date."
- Exam and study plan: "Plan an exam. Ask me for the course and exam date, then propose the exam mission and repeating study sessions."
- Recurring class or lab: "Create a recurring class or lab mission. Ask me for the course, weekday, and time."
- Study block: "Create a study mission. Ask me for the subject, when, and whether it repeats."
- Reading: "Create a reading mission. Ask me for the title and when it is due."
- Project: "Create a project mission. Ask me for the name, due date, and notes."
- Today or tomorrow list: "I will list what I have to do today or tomorrow. Split that into separate missions."
- Errand: "Create an errand mission. Ask me what it is and whether it is due today or tomorrow."
On the following turn, ask only for what is still missing, then call create_mission.
3. They ask you to plan a week or prepare for an exam or deadline that is still ahead. Put the exam sitting on the calendar with create_calendar_event. Do not create the study missions yet. Propose those in a card: the study sessions, and which ones repeat. End with one Button whose humanFriendlyMessage starts with "Create this plan:" and then one line per mission with title, kind, course, due date, and repeat. On the next turn, call create_mission once per line. Do not write the study set before they confirm.
repeat.frequency is daily, weekly, weekdays, or none. For weekly on specific days, set weekdays to numbers 0-6 where 0 is Sunday. until is the last date the repeat may occur.
When they ask about credit, balance, spend, or how much is left on Thesys or OpenRouter, call get_credits. Say the spoken field as complete sentences in TextContent so it is read aloud. Do not put the only copy of the dollar amounts in a CardHeader.
When they ask to research the web, look something up, go on Google, double-check, verify, or fact-check (also istraži, provjeri na netu, idi na google, jesi siguran), call research_web once with a short search query. Do not use research_web for missions, calendar, Gmail, memories, or credits. Answer only from the sources it returns. Put the finding in TextContent as complete sentences with no URLs, because that text is read aloud. Put each source title in a CardHeader subtitle, and add a Button with an open_url action and that source url so the operator can open the page. If research_web returns an error, say that aloud.
Croatian dates use ordinals: "drugog desetog" is the 2nd of the 10th month. Croatian clock times use "i" for minutes past the hour and "do" for minutes to the hour: "devet i dvadeset" is 9:20, "dvadeset do deset" is 9:40.
Reply only in Croatian (Latin script) or English. Use Croatian when the operator's latest message is Croatian, and English when it is English, unless they explicitly ask for the other, for example "answer in English" or "odgovori na hrvatskom". Never use Cyrillic or any other language.
Put the full explanation in TextContent components as complete sentences. That text is what JARVIS reads aloud, and it may be more than one sentence. CardHeader titles and subtitles are short screen labels and are not spoken. List item text is spoken, so put the actual facts there in words a person would say, not only in a heading. A short lead-in with no markup may come before the UI, but do not put the only copy of an explanation in a CardHeader title.
Prefer generative UI: cards, lists, and timelines over long paragraphs. If you generate UI, use well-formed openui-lang with quoted strings and CardHeader/ListItem components.
When you show code, put a markdown fence in TextContent, as its own card child. Open it with three backticks and the language, put each statement on its own line with two-space indentation, then close it with three backticks. Never minify a sample onto one line. Never put code in SnippetCardItem, Text, a list item title, subtitle, or action label.
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

function explainWhatsAppLocally(result: Record<string, unknown>) {
  const messages = Array.isArray(result.messages) ? result.messages : [];
  const contacts = Array.isArray(result.contacts) ? result.contacts : [];
  if (messages.length > 0) {
    return messages
      .slice(0, 5)
      .map((item) => {
        const row = item as { sender?: string; text?: string };
        return `${row.sender || "Someone"}: ${row.text || ""}`;
      })
      .join("\n");
  }
  if (contacts.length > 0) {
    return contacts
      .slice(0, 8)
      .map((item) => {
        const row = item as { name?: string; phone?: string };
        return [row.name, row.phone].filter(Boolean).join(" ");
      })
      .join("\n");
  }
  return "No WhatsApp messages.";
}

function whatsappImagesFrom(results: FunctionResult[]) {
  const images: { name: string; dataUrl: string }[] = [];
  for (const result of results) {
    const raw = result.result.images;
    if (!Array.isArray(raw)) continue;
    const found: { name: string; dataUrl: string }[] = [];
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const dataUrl = "dataUrl" in item && typeof item.dataUrl === "string" ? item.dataUrl : "";
      if (!dataUrl.startsWith("data:image/")) continue;
      const name = "name" in item && typeof item.name === "string" ? item.name : "whatsapp.jpg";
      found.push({ name, dataUrl });
    }
    delete result.result.images;
    if (found.length) result.result.photoCount = found.length;
    images.push(...found);
  }
  return images;
}

function explainEmailLocally(result: Record<string, unknown>) {
  const email = result.email;
  if (!email || typeof email !== "object") return "Could not read that message.";
  const message = email as { from?: string; subject?: string; snippet?: string; body?: string };
  const text = (message.body || message.snippet || "").replace(/\s+/g, " ").trim().slice(0, 900);
  return `From ${message.from || "unknown"}. Subject: ${message.subject || "(no subject)"}. ${text || "The message has no readable body."}`;
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
  if (
    /remind me|add .*calendar|on my calendar|appointment|dentist|meeting|\b(?:lecture|class|lab|seminar)s?\b|\b(?:predavanje|vježbe|laboratorij|kolegij|ispit)\b/i.test(
      text,
    ) &&
    !/\bmission\b|\bmisij/i.test(text)
  ) {
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
  if (/whatsapp/i.test(text) && /(contact|contacts|imenik)/i.test(text)) {
    return { name: "read_whatsapp_contacts", arguments: {} };
  }
  const whatsappId = text.match(/\bwhatsapp message id:\s*([A-Za-z0-9]+)/)?.[1];
  if (whatsappId || (/whatsapp/i.test(text) && /(unread|messages|inbox|poruke|read|check|show)/i.test(text))) {
    return {
      name: "read_whatsapp_messages",
      arguments: {
        ...(whatsappId ? { message_id: whatsappId } : {}),
        unread_only: /unread|nepročitan/i.test(text),
      },
    };
  }
  const messageId = text.match(/\bmessage id:\s*([A-Za-z0-9_-]+)/)?.[1];
  if (messageId && !/whatsapp/i.test(text)) {
    return { name: "read_email", arguments: { message_id: messageId } };
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
    whatsappImagesFrom(results);
    const result = results[0]?.result ?? {};
    const content =
      typeof result.error === "string"
        ? result.error
        : googleCall.name === "send_email"
          ? `Email sent${result.to ? ` to ${result.to}` : ""}.`
          : googleCall.name === "create_calendar_event"
            ? "Calendar event created."
            : googleCall.name === "read_email"
              ? explainEmailLocally(result)
              : googleCall.name.startsWith("read_whatsapp")
                ? explainWhatsAppLocally(result)
                : googleCall.name === "send_whatsapp_message"
                  ? `WhatsApp message sent${result.to ? ` to ${result.to}` : ""}.`
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
  if (isVagueNewMission(text)) {
    return {
      content: [
        "I can add a mission in a few ways. Tell me which one, and I will ask only for what is still missing.",
        "Assignment. Course, title, and due date.",
        "Exam and a study plan. Course, exam date, then the exam plus repeating study sessions.",
        "Recurring class or lab. Course, weekday, and time.",
        "Study block. Subject, when, and whether it repeats.",
        "Reading. Title and when it is due.",
        "Project. Name, due date, and notes.",
        "Today or tomorrow list. Say what you have to do and I will split it into missions.",
        "Errand. What it is, and whether it is due today or tomorrow.",
      ].join("\n"),
      results: [],
    };
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

function isVagueNewMission(text: string) {
  if (/\b(assignment|exam|class|lab|study|reading|project|errand)\b/i.test(text)) return false;
  return /ways i can add one|\bnew mission\b/i.test(text);
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
  const whatsapp = await getWhatsAppStatus(userId, 1200);
  const timezone = getJarvisTimezone();
  const lastUserText =
    [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const dayPlan = parseDayPlan(lastUserText);
  const dueAt = dayPlan ? dueStampForPlan(timezone, dayPlan.dayOffset) : "";
  const created = dayPlan
    ? await executeFunctions(
        dayPlan.titles.map((title) => ({
          name: "create_mission",
          arguments: { title, due_at: dueAt, priority: "medium" },
        })),
      )
    : [];
  const dayPlanNote = dayPlan
    ? `\nThese missions are already created. Do not call create_mission for them:\n${dayPlan.titles
        .map((title) => `- ${title} (due ${dueAt})`)
        .join("\n")}\nConfirm them in Croatian if the operator's message is Croatian, otherwise in English. Latin script only. Name each mission in the spoken body, in a TextContent or ListItem, not only in a CardHeader title.`
    : "";
  const systemPrompt =
    buildSystemPrompt({
      timezone,
      nowLabel: formatZonedStamp(timezone),
      googleEmail: googleAccount?.email ?? null,
      whatsappPhone: whatsapp.connected ? whatsapp.phone : null,
    }) + dayPlanNote;
  const roundTools = dayPlan
    ? tools.filter((tool) => tool.function.name !== "create_mission")
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
          const photos = whatsappImagesFrom(results);
          conversation = [
            ...conversation,
            { role: "assistant", content: fullContent, tool_calls: toolCalls },
            ...results.map((result, index) => ({
              role: "tool",
              tool_call_id: toolCalls[index]?.id,
              content: JSON.stringify(result.result),
            })),
          ];
          if (photos.length) {
            conversation.push({
              role: "user",
              content: [
                {
                  type: "text",
                  text: `WhatsApp attached ${photos.length} photo(s): ${photos.map((photo) => photo.name).join(", ")}. Describe what is in each photo in the spoken reply.`,
                },
                ...photos.map((photo) => ({
                  type: "image_url",
                  image_url: { url: photo.dataUrl },
                })),
              ],
            });
          }
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
