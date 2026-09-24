"use client";

import { CalendarDays, MapPin } from "lucide-react";

export function EventCard({
  title,
  when,
  location,
  link,
}: {
  title: string;
  when: string;
  location?: string;
  link?: string;
}) {
  return (
    <article className="relative rounded-xl border border-line bg-hud/70 p-4">
      <div className="flex gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan/40 bg-cyan/10 text-cyan">
          <CalendarDays size={18} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] tracking-[0.22em] text-cyan">{when}</p>
          <h3 className="mt-1 text-sm leading-5">{title}</h3>
          {location ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
              <MapPin size={12} aria-hidden />
              <span className="truncate">{location}</span>
            </p>
          ) : null}
        </div>
      </div>
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${title}`}
          className="absolute inset-0 rounded-xl"
        />
      ) : null}
    </article>
  );
}
