import { countUnreadInbox, listEmails, listTodayCalendarEvents } from "@/app/_lib/google-services";
import { getMissionStore } from "@/app/_lib/mission-store";
import { getApiUserId } from "@/app/_lib/session";
import { countUnreadWhatsApp } from "@/app/_lib/whatsapp";
import type { MailLimit, WorkflowBriefing, WorkflowEvent, WorkflowMail } from "@/app/_types/workflows";

function mailLimit(value: string | null): MailLimit {
  if (value === "10" || value === "20") return Number(value) as MailLimit;
  return 5;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function GET(request: Request) {
  const userId = await getApiUserId();
  if (!userId) {
    return Response.json({ error: { message: "Sign in first." } }, { status: 401 });
  }

  const limit = mailLimit(new URL(request.url).searchParams.get("limit"));
  const account = await getMissionStore().getGoogleAccount(userId);
  const [eventsResult, unreadResult, mailsResult, whatsappResult] = await Promise.allSettled([
    account ? listTodayCalendarEvents(userId) : Promise.resolve([] as WorkflowEvent[]),
    account ? countUnreadInbox(userId) : Promise.resolve(null),
    account ? listEmails(userId, { max_results: limit }) : Promise.resolve([] as WorkflowMail[]),
    countUnreadWhatsApp(userId),
  ]);
  const whatsapp =
    whatsappResult.status === "fulfilled"
      ? whatsappResult.value
      : { connected: false, unread: null, error: errorMessage(whatsappResult.reason, "Could not read unread WhatsApp.") };

  const briefing: WorkflowBriefing = {
    connected: Boolean(account),
    events: eventsResult.status === "fulfilled" ? eventsResult.value : [],
    unread: unreadResult.status === "fulfilled" ? unreadResult.value : null,
    mails: mailsResult.status === "fulfilled" ? mailsResult.value : [],
    eventsError:
      eventsResult.status === "rejected"
        ? errorMessage(eventsResult.reason, "Could not read today's calendar.")
        : null,
    unreadError:
      unreadResult.status === "rejected"
        ? errorMessage(unreadResult.reason, "Could not read unread mail.")
        : null,
    mailsError:
      mailsResult.status === "rejected"
        ? errorMessage(mailsResult.reason, "Could not read recent mail.")
        : null,
    whatsappConnected: whatsapp.connected,
    whatsappUnread: whatsapp.connected ? whatsapp.unread : null,
    whatsappUnreadError: whatsapp.error,
  };

  return Response.json(briefing);
}
