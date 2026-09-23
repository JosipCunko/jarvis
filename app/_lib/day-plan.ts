import { localDateTimeInZone } from "@/app/_lib/time";
import type { SpeechLanguage } from "@/app/_lib/speech-lang";

export type DayPlan = {
  language: SpeechLanguage;
  dayOffset: number;
  titles: string[];
};

const QUESTION =
  /\?\s*$|\b(?:moram|trebam)\s+li\b|\b(?:do i have to|do i need to|should i|must i)\b/i;

function cleanClause(value: string) {
  return value
    .replace(/^(?:danas|sutra|today|tomorrow)\b[\s,]*/i, "")
    .replace(/\b(?:danas|sutra|today|tomorrow)\b[.?!]*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function capitalize(value: string) {
  const text = cleanClause(value).replace(/[.?!]+$/g, "").trim();
  if (text.length < 3) return "";
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

function splitClauses(body: string, language: SpeechLanguage) {
  const pattern = language === "hr" ? /\s+i\s+|,\s*/i : /\s+and\s+|,\s*/i;
  return body
    .split(pattern)
    .map(capitalize)
    .filter((title) => title.length >= 3);
}

export function parseDayPlan(text: string): DayPlan | null {
  const raw = text.replace(/\s+/g, " ").trim();
  if (!raw || QUESTION.test(raw)) return null;
  if (!/\b(?:danas|sutra|today|tomorrow)\b/i.test(raw)) return null;

  const dayOffset = /\b(?:sutra|tomorrow)\b/i.test(raw) ? 1 : 0;

  const croatian = raw.match(/\b(?:moram|trebam)\s+(.+)$/i);
  if (croatian) {
    const titles = splitClauses(croatian[1], "hr");
    if (titles.length > 0) return { language: "hr", dayOffset, titles };
  }

  const english = raw.match(/\bI\s+(?:have to|need to|must)\s+(.+)$/i);
  if (english) {
    const titles = splitClauses(english[1], "en");
    if (titles.length > 0) return { language: "en", dayOffset, titles };
  }

  return null;
}

export function dueStampForPlan(timeZone: string, dayOffset: number) {
  return localDateTimeInZone(timeZone, dayOffset, 23, 59);
}

export function confirmDayPlan(plan: DayPlan) {
  const when =
    plan.dayOffset === 1
      ? plan.language === "hr"
        ? "sutra"
        : "tomorrow"
      : plan.language === "hr"
        ? "danas"
        : "today";
  const list =
    plan.language === "hr" ? plan.titles.join(". ") : plan.titles.join(". ");
  if (plan.language === "hr") {
    return `Zabilježeno za ${when}: ${list}.`;
  }
  return `Logged for ${when}: ${list}.`;
}
