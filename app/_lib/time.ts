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

export function formatMissionDue(at: number) {
  const date = new Date(at);
  if (date.getHours() === 23 && date.getMinutes() === 59) {
    if (isToday(date)) return "Today";
    return format(date, "EEE d MMM");
  }
  return formatWhen(at);
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

export function parseDueAt(value?: number | string) {
  if (typeof value === "string") {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (dateOnly) {
      return new Date(
        Number(dateOnly[1]),
        Number(dateOnly[2]) - 1,
        Number(dateOnly[3]),
        23,
        59,
        0,
        0,
      ).getTime();
    }
  }
  return parseWhen(value);
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

export function promptDayKey(timeZone: string, at = new Date()) {
  const parts = zonedDateParts(timeZone, at);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
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

export function zonedAheadRangeIso(timeZone: string, days: number, at = new Date()) {
  const span = Math.max(1, Math.floor(days));
  const today = zonedDateParts(timeZone, at);
  const end = addDaysToYmd(today.year, today.month, today.day, span + 1);
  return {
    timeMin: at.toISOString(),
    timeMax: wallClockUtc(timeZone, end.year, end.month, end.day, 0, 0).toISOString(),
  };
}

export function zonedYmdRangeIso(timeZone: string, ymd: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return zonedDayRangeIso(timeZone);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const next = addDaysToYmd(year, month, day, 1);
  return {
    timeMin: wallClockUtc(timeZone, year, month, day, 0, 0).toISOString(),
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

export function localDateInZone(timeZone: string, dayOffset: number) {
  const now = zonedDateParts(timeZone);
  const date = addDaysToYmd(now.year, now.month, now.day, dayOffset);
  return `${date.year}-${pad2(date.month)}-${pad2(date.day)}`;
}

export function localDateTimeInZone(
  timeZone: string,
  dayOffset: number,
  hour: number,
  minute: number,
) {
  const date = localDateInZone(timeZone, dayOffset);
  return `${date}T${pad2(hour)}:${pad2(minute)}:00`;
}

const HOUR_WORD =
  "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|noon|midnight|jedan|dva|tri|cetiri|pet|sest|sedam|osam|devet|deset|jedanaest|dvanaest|podne|ponoc";

function foldClockText(text: string) {
  return text
    .toLowerCase()
    .replace(/[čć]/g, "c")
    .replace(/[š]/g, "s")
    .replace(/[ž]/g, "z")
    .replace(/[đ]/g, "d");
}

export function clockFromText(text: string) {
  const folded = foldClockText(text);
  const digital = folded.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b(?!\.\d)/);
  if (digital) return { hour: Number(digital[1]), minute: Number(digital[2]) };
  const ampm = folded.match(/\b([01]?\d|2[0-3])\s*(am|pm)\b/);
  if (ampm) {
    let hour = Number(ampm[1]) % 12;
    if (ampm[2] === "pm") hour += 12;
    return { hour, minute: 0 };
  }
  const named = folded.match(new RegExp(`\\b(?:at|from|u|od)\\s+(${HOUR_WORD}|[01]?\\d|2[0-3])\\b`));
  if (named) {
    const after = folded.slice(folded.indexOf(named[0]) + named[0].length);
    const duration = /^\s*(?:dana|dan|days|day|weeks|week|tjedna|tjedan|mjesec|months|month)\b/.test(after);
    if (!duration) {
      const hour = hourFromWord(named[1]);
      if (hour != null) return { hour, minute: 0 };
    }
  }
  const past = folded.match(new RegExp(`\\b(${HOUR_WORD})\\s+i\\s+(\\d{1,2}|\\w+)\\b`));
  if (past) {
    const hour = hourFromWord(past[1]);
    if (hour != null) return { hour, minute: minuteFromWord(past[2]) };
  }
  return null;
}

function hourFromWord(word: string) {
  if (/^\d+$/.test(word)) {
    const hour = Number(word);
    return hour >= 0 && hour <= 23 ? hour : null;
  }
  const hours: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    noon: 12,
    midnight: 0,
    jedan: 1,
    dva: 2,
    tri: 3,
    cetiri: 4,
    pet: 5,
    sest: 6,
    sedam: 7,
    osam: 8,
    devet: 9,
    deset: 10,
    jedanaest: 11,
    dvanaest: 12,
    podne: 12,
    ponoc: 0,
  };
  return hours[word] ?? null;
}

function minuteFromWord(word: string) {
  if (/^\d+$/.test(word)) return Math.min(59, Number(word));
  const minutes: Record<string, number> = {
    pet: 5,
    deset: 10,
    petnaest: 15,
    dvadeset: 20,
    trideset: 30,
    fourty: 40,
    forty: 40,
    cetrdeset: 40,
    pedeset: 50,
  };
  return minutes[word] ?? 0;
}

export function specifiesStartHour(text: string) {
  return clockFromText(text) != null;
}

export function resolveRelativeDateTime(text: string, timeZone: string) {
  const clock = clockFromText(text);
  const dayOffset = /tomorrow/i.test(text) ? 1 : /today/i.test(text) ? 0 : null;
  if (dayOffset == null) return undefined;
  if (!clock) return localDateInZone(timeZone, dayOffset);
  return localDateTimeInZone(timeZone, dayOffset, clock.hour, clock.minute);
}
