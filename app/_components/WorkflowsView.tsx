"use client";

import { useEffect, useState } from "react";
import { Inbox, Mail, MessageCircle } from "lucide-react";
import { Button } from "@/app/_components/Button";
import { EventCard } from "@/app/_components/EventCard";
import { MailCard } from "@/app/_components/MailCard";
import { WeatherGlyph } from "@/app/_components/WeatherGlyph";
import { cn } from "@/app/_lib/cn";
import type { LocalWeather, MailLimit, WorkflowBriefing, WorkflowMail } from "@/app/_types/workflows";

const MAIL_LIMITS = [5, 10, 20] as const;

export function WorkflowsView({
  googleConfigured,
  weather,
  weatherMessage,
  onAskJarvis,
}: {
  googleConfigured: boolean;
  weather: LocalWeather | null;
  weatherMessage: string;
  onAskJarvis: (prompt: string) => void;
}) {
  const [briefing, setBriefing] = useState<WorkflowBriefing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mailLimit, setMailLimit] = useState<MailLimit>(5);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch(`/api/workflows?limit=${mailLimit}`);
      const data = (await response.json().catch(() => null)) as
        | (WorkflowBriefing & { error?: { message?: string } })
        | null;
      if (cancelled) return;
      if (!response.ok || !data || data.error) {
        setError(data?.error?.message ?? "Could not load workflows.");
        return;
      }
      setError(null);
      setBriefing(data);
    }
    void load();
    const id = window.setInterval(() => void load(), 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [mailLimit]);

  const unread = briefing?.unread;
  const unreadLabel =
    unread == null
      ? "Unread mail"
      : unread === 1
        ? "1 unread message"
        : `${unread} unread messages`;
  const whatsappUnread = briefing?.whatsappUnread;
  const whatsappLabel =
    whatsappUnread == null
      ? "Unread messages"
      : whatsappUnread === 1
        ? "1 unread message"
        : `${whatsappUnread} unread messages`;

  return (
    <div className="mx-auto grid max-w-[1600px] gap-3">
      {error ? (
        <section className="hud-panel rounded-xl p-4 text-sm text-danger">{error}</section>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 md:items-start">
        <section className="hud-panel rounded-xl p-4">
          <h2 className="truncate font-mono text-[10px] tracking-[0.28em] text-muted">
            {weather?.place || "WEATHER"}
          </h2>
          {weather ? (
            <div className="mt-4 flex items-center gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-cyan/40 bg-cyan/10 text-cyan">
                <WeatherGlyph code={weather.code} isDay={weather.isDay} size={28} />
              </span>
              <div className="min-w-0">
                <p className="font-display text-3xl tracking-widest text-cyan">
                  {weather.temperature}°
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-ink/90">
                  <WeatherGlyph code={weather.code} isDay={weather.isDay} size={14} />
                  {weather.label}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">{weatherMessage || "Locating…"}</p>
          )}
          {weather ? (
            <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] tracking-widest text-muted">
              <span>HIGH {weather.high ?? "—"}°</span>
              <span>LOW {weather.low ?? "—"}°</span>
              <span>WIND {weather.wind} KM/H</span>
            </p>
          ) : null}
        </section>

        <div className="grid gap-3">
        <section className="hud-panel rounded-xl p-4">
          <h2 className="flex items-center gap-2 font-mono text-[10px] tracking-[0.28em] text-muted">
            <Mail size={12} aria-hidden />
            GMAIL
          </h2>
          {briefing?.connected && unread != null ? (
            <div className="mt-4 flex items-center gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-cyan/40 bg-cyan/10 text-cyan">
                <Inbox size={28} aria-hidden />
              </span>
              <div>
                <p className="font-display text-3xl tracking-widest text-cyan">{unread}</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-ink/90">
                  <Mail size={14} aria-hidden />
                  {unread === 0 ? "Inbox clear" : unreadLabel}
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <p className="flex items-center gap-2 text-sm text-muted">
                <Inbox size={16} aria-hidden />
                {briefing?.unreadError ??
                  (briefing && !briefing.connected
                    ? googleConfigured
                      ? "Connect Google to count unread mail."
                      : "Google is not configured."
                    : "Reading unread mail…")}
              </p>
              {briefing && !briefing.connected && googleConfigured ? (
                <Button href="/api/google/connect" shape="pill" size="sm" className="mt-3">
                  <Mail size={14} />
                  Connect Google
                </Button>
              ) : null}
            </div>
          )}
        </section>

        </div>
      </div>

    <section className="hud-panel rounded-xl p-4">
        <h2 className="flex items-center gap-2 font-mono text-[10px] tracking-[0.28em] text-muted">
          <MessageCircle size={12} aria-hidden />
          WHATSAPP
        </h2>
        {briefing?.whatsappConnected && whatsappUnread != null ? (
          <div className="mt-4 flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-cyan/40 bg-cyan/10 text-cyan">
              <MessageCircle size={28} aria-hidden />
            </span>
            <div>
              <p className="font-display text-3xl tracking-widest text-cyan">{whatsappUnread}</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-ink/90">
                <MessageCircle size={14} aria-hidden />
                {whatsappUnread === 0 ? "Inbox clear" : whatsappLabel}
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <p className="flex items-center gap-2 text-sm text-muted">
              <MessageCircle size={16} aria-hidden />
              {briefing?.whatsappUnreadError ??
                (briefing && !briefing.whatsappConnected
                  ? "Connect WhatsApp in Link status."
                  : "Reading unread WhatsApp…")}
            </p>
          </div>
        )}
      </section>

      <section className="hud-panel rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-mono text-[10px] tracking-[0.28em] text-muted">RECENT MAIL</h2>
          <div className="flex rounded-full border border-line bg-hud p-1">
            {MAIL_LIMITS.map((limit) => (
              <button
                key={limit}
                type="button"
                aria-pressed={mailLimit === limit}
                onClick={() => setMailLimit(limit)}
                className={cn(
                  "rounded-full px-3 py-1 font-mono text-[10px] tracking-widest transition",
                  mailLimit === limit ? "bg-cyan/15 text-cyan" : "text-muted hover:text-ink",
                )}
              >
                {limit}
              </button>
            ))}
          </div>
        </div>
        {briefing?.mailsError ? (
          <p className="mt-3 text-sm text-danger">{briefing.mailsError}</p>
        ) : null}
        {briefing && !briefing.connected ? (
          <p className="mt-3 text-sm text-muted">Connect Google to list recent mail.</p>
        ) : null}
        {briefing?.connected && !briefing.mailsError && briefing.mails.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No recent mail.</p>
        ) : null}
        {briefing?.mails.length ? (
          <div className="mt-3 max-h-[36rem] space-y-2 overflow-y-auto overscroll-contain pr-1">
            {briefing.mails.map((mail) => (
              <MailCard
                key={mail.id}
                from={mail.from}
                subject={mail.subject}
                date={mail.date}
                snippet={mail.snippet}
                onExplain={() => onAskJarvis(explainMailPrompt(mail))}
              />
            ))}
          </div>
        ) : !briefing ? (
          <p className="mt-3 text-sm text-muted">Reading recent mail…</p>
        ) : null}
      </section>

      <section className="hud-panel rounded-xl p-4">
        <h2 className="font-mono text-[10px] tracking-[0.28em] text-muted">TODAY</h2>
        {briefing?.eventsError ? (
          <p className="mt-3 text-sm text-danger">{briefing.eventsError}</p>
        ) : null}
        {briefing && !briefing.connected ? (
          <p className="mt-3 text-sm text-muted">Connect Google to list today&apos;s events.</p>
        ) : null}
        {briefing?.connected && !briefing.eventsError && briefing.events.length === 0 ? (
          <div className="mt-3">
            <EventCard title="No events today" when="Calendar clear" />
          </div>
        ) : null}
        {briefing?.events.length ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {briefing.events.map((event) => (
              <EventCard
                key={event.id}
                title={event.title}
                when={event.when}
                location={event.location}
                link={event.link}
              />
            ))}
          </div>
        ) : !briefing ? (
          <p className="mt-3 text-sm text-muted">Reading today&apos;s events…</p>
        ) : null}
      </section>
    </div>
  );
}

function explainMailPrompt(mail: WorkflowMail) {
  return `Read Gmail message id: ${mail.id} with read_email. Subject: ${mail.subject}. From: ${mail.from}. Summarize the message. Explain what the sender wants from me, and what the content actually means. Use only what is in the message.`;
}
