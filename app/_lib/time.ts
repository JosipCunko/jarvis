import { addDays, format, isToday, startOfDay, subDays } from "date-fns";

export function formatClock(now = new Date()) {
  return format(now, "HH:mm:ss");
}

export function formatDateLabel(now = new Date()) {
  return format(now, "EEEE, d MMMM");
}

export function formatWhen(at: number) {
  const date = new Date(at);
  if (isToday(date)) return format(date, "'Today' h:mm a");
  return format(date, "EEE d MMM, h:mm a");
}

export function startOfToday() {
  return startOfDay(new Date()).getTime();
}

export function endOfToday() {
  return addDays(startOfDay(new Date()), 1).getTime() - 1;
}

export function daysAgo(n: number) {
  return subDays(new Date(), n).getTime();
}

export function parseWhen(value?: number | string) {
  if (value == null || value === "") return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? undefined : parsed;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function zonedDateParts(timeZone: string, at = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
    hour: Number(read("hour")),
    minute: Number(read("minute")),
  };
}

export function formatZonedStamp(timeZone: string, at = new Date()) {
  const parts = zonedDateParts(timeZone, at);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)} ${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

function wallClockUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
) {
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let utc = desired;
  for (let pass = 0; pass < 3; pass += 1) {
    const parts = zonedDateParts(timeZone, new Date(utc));
    const shown = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    const delta = desired - shown;
    if (delta === 0) break;
    utc += delta;
  }
  return new Date(utc);
}

export function zonedDayRangeIso(timeZone: string, at = new Date()) {
  const today = zonedDateParts(timeZone, at);
  const next = addDaysToYmd(today.year, today.month, today.day, 1);
  return {
    timeMin: wallClockUtc(timeZone, today.year, today.month, today.day, 0, 0).toISOString(),
    timeMax: wallClockUtc(timeZone, next.year, next.month, next.day, 0, 0).toISOString(),
  };
}

function addDaysToYmd(year: number, month: number, day: number, days: number) {
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export function localDateTimeInZone(
  timeZone: string,
  dayOffset: number,
  hour: number,
  minute: number,
) {
  const now = zonedDateParts(timeZone);
  const date = addDaysToYmd(now.year, now.month, now.day, dayOffset);
  return `${date.year}-${pad2(date.month)}-${pad2(date.day)}T${pad2(hour)}:${pad2(minute)}:00`;
}

export function resolveRelativeDateTime(text: string, timeZone: string) {
  const timeMatch = text.match(/\b(\d{1,2})[:.](\d{2})\b/);
  const hour = timeMatch ? Number(timeMatch[1]) : 9;
  const minute = timeMatch ? Number(timeMatch[2]) : 0;
  if (/tomorrow/i.test(text)) return localDateTimeInZone(timeZone, 1, hour, minute);
  if (/today/i.test(text)) return localDateTimeInZone(timeZone, 0, hour, minute);
  return undefined;
}
