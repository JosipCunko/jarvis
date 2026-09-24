"use client";

import { Mail, Sparkles } from "lucide-react";
import { Button } from "@/app/_components/Button";

function formatMailDate(value: string) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(parsed);
}

export function MailCard({
  from,
  subject,
  date,
  snippet,
  onExplain,
}: {
  from: string;
  subject: string;
  date: string;
  snippet: string;
  onExplain: () => void;
}) {
  return (
    <article className="flex items-center gap-3 rounded-xl border border-line bg-hud/70 p-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan/40 bg-cyan/10 text-cyan">
        <Mail size={18} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] tracking-[0.22em] text-cyan">{formatMailDate(date)}</p>
        <h3 className="mt-1 truncate text-sm leading-5">{subject}</h3>
        <p className="truncate text-xs text-muted">{from}</p>
        {snippet ? <p className="mt-1 line-clamp-2 text-xs text-ink/80">{snippet}</p> : null}
      </div>
      <Button
        shape="pill"
        size="sm"
        className="shrink-0"
        title="Ask JARVIS to explain this mail"
        aria-label={`Explain ${subject}`}
        onClick={onExplain}
      >
        <Sparkles size={14} />
        Explain
      </Button>
    </article>
  );
}
