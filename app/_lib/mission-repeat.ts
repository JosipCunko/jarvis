import { addDays, differenceInCalendarWeeks, startOfDay } from "date-fns";
import { parseWhen } from "@/app/_lib/time";
import type { MissionKind, MissionRepeat, RepeatFrequency } from "@/app/_types/jarvis";

export const MISSION_KINDS = [
  "assignment",
  "exam",
  "class",
  "study",
  "reading",
  "project",
  "errand",
] as const satisfies readonly MissionKind[];

export const NEW_MISSION_PROMPT =
  "I want to create a new mission. Show me the ways I can add one. Do not create anything yet.";

const KIND_LABEL: Record<MissionKind, string> = {
  assignment: "Assignment",
  exam: "Exam",
  class: "Class",
  study: "Study",
  reading: "Reading",
  project: "Project",
  errand: "Errand",
};

const WEEKDAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEKDAY_SET = new Set([1, 2, 3, 4, 5]);

export function missionKindLabel(kind?: MissionKind) {
  return kind ? KIND_LABEL[kind] : "";
}

export function parseMissionKind(value: unknown): MissionKind | undefined {
  return MISSION_KINDS.find((kind) => kind === value);
}

export function repeatLabel(repeat?: MissionRepeat) {
  if (!repeat) return "";
  const interval = Math.max(1, Math.floor(repeat.interval || 1));
  if (repeat.frequency === "daily") {
    return interval === 1 ? "Daily" : `Every ${interval} days`;
  }
  if (repeat.frequency === "weekdays") {
    return interval === 1 ? "Weekdays" : `Weekdays, every ${interval} weeks`;
  }
  const days = (repeat.weekdays?.length ? repeat.weekdays : [])
    .filter((day) => day >= 0 && day <= 6)
    .map((day) => WEEKDAY_LABEL[day]);
  if (days.length === 1) {
    return interval === 1 ? `Every ${days[0]}` : `Every ${interval} weeks on ${days[0]}`;
  }
  if (days.length > 1) {
    const list = days.join(", ");
    return interval === 1 ? `Every ${list}` : `Every ${interval} weeks on ${list}`;
  }
  return interval === 1 ? "Weekly" : `Every ${interval} weeks`;
}

export function parseRepeatArg(value: unknown): MissionRepeat | null | undefined {
  if (value == null) return undefined;
  if (value === "none" || value === false) return null;
  if (typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  if (raw.frequency === "none") return null;
  if (raw.frequency !== "daily" && raw.frequency !== "weekly" && raw.frequency !== "weekdays") {
    return undefined;
  }
  return normalizeRepeat({
    frequency: raw.frequency,
    interval: typeof raw.interval === "number" ? raw.interval : 1,
    weekdays: Array.isArray(raw.weekdays) ? raw.weekdays.map(Number) : undefined,
    until: parseUntil(raw.until),
  });
}

export function normalizeRepeat(repeat: MissionRepeat): MissionRepeat {
  const frequency: RepeatFrequency =
    repeat.frequency === "daily" || repeat.frequency === "weekdays" ? repeat.frequency : "weekly";
  const interval = Math.max(1, Math.floor(repeat.interval || 1));
  const weekdays = [...new Set((repeat.weekdays ?? []).filter((day) => day >= 0 && day <= 6))];
  const next: MissionRepeat = { frequency, interval };
  if (frequency === "weekly" && weekdays.length > 0) next.weekdays = weekdays;
  if (repeat.until != null && Number.isFinite(repeat.until)) next.until = repeat.until;
  return next;
}

export function nextRepeatDue(
  dueAt: number | undefined,
  repeat: MissionRepeat,
  now = Date.now(),
) {
  const rule = normalizeRepeat(repeat);
  const origin = startOfDay(new Date(dueAt ?? now));
  const clock = new Date(dueAt ?? now);
  const earliest = Math.max(endOfDay(now), dueAt ?? 0) + 1;
  const stampOn = (day: Date) => {
    const next = new Date(day);
    next.setHours(clock.getHours(), clock.getMinutes(), clock.getSeconds(), clock.getMilliseconds());
    return next.getTime();
  };
  const accept = (at: number) => at >= earliest && (rule.until == null || at <= rule.until);

  if (rule.frequency === "daily") {
    let day = addDays(origin, rule.interval);
    for (let step = 0; step < 800; step += 1) {
      const at = stampOn(day);
      if (accept(at)) return at;
      day = addDays(day, rule.interval);
    }
    return undefined;
  }

  const allowed =
    rule.frequency === "weekdays"
      ? WEEKDAY_SET
      : new Set(rule.weekdays?.length ? rule.weekdays : [origin.getDay()]);
  let day = startOfDay(new Date(earliest));
  for (let step = 0; step < 800; step += 1) {
    if (allowed.has(day.getDay())) {
      const weeks = differenceInCalendarWeeks(day, origin, { weekStartsOn: 1 });
      if (weeks >= 0 && weeks % rule.interval === 0) {
        const at = stampOn(day);
        if (accept(at)) return at;
      }
    }
    day = addDays(day, 1);
  }
  return undefined;
}

function endOfDay(at: number) {
  return startOfDay(addDays(new Date(at), 1)).getTime() - 1;
}

function parseUntil(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
  }
  return parseWhen(value);
}
