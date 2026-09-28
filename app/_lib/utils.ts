import type { MissionKind } from "@/app/_types/jarvis";

export const ADMIN_EMAIL = "ultrabrzitranzijent@gmail.com";
export const DEMO_USER_ID = "demo-operator";

export const SITE_NAME = "JARVIS";
export const SITE_TITLE = "JARVIS Command Center";
export const SITE_DESCRIPTION =
  "Personal operator dashboard with missions, generative UI, and function calling.";
export const SITE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

export const DEFAULT_MODEL = "c1/google/gemini-3.1-flash-lite-free/v-20260331";
export const MODEL = "google/gemini-2.5-flash-lite";
export const COMPLETIONS = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_ORIGIN = "https://openrouter.ai/api/v1";
export const THESYS_PROBES = [
  "https://api.thesys.dev/v1/credits",
  "https://api.thesys.dev/v1/billing",
  "https://api.thesys.dev/v1/usage",
];

export const GOOGLE_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
] as const;
export const GOOGLE_OAUTH_COOKIE = "jarvis.google.oauth";
export const POST_AUTH_CALLBACK_URL = "/";

export const MISSION_KINDS = [
  "assignment",
  "exam",
  "class",
  "study",
  "reading",
  "project",
  "errand",
] as const satisfies readonly MissionKind[];

const KIND_LABEL: Record<MissionKind, string> = {
  assignment: "Assignment",
  exam: "Exam",
  class: "Class",
  study: "Study",
  reading: "Reading",
  project: "Project",
  errand: "Errand",
};

export function missionKindLabel(kind?: MissionKind) {
  return kind ? KIND_LABEL[kind] : "";
}

export function parseMissionKind(value: unknown): MissionKind | undefined {
  return MISSION_KINDS.find((kind) => kind === value);
}
export const NEW_MISSION_PROMPT =
  "I want to create a new mission. Show me the ways I can add one. Do not create anything yet.";

export const MEMORY_KINDS = ["fact", "preference", "instruction"] as const;
export const PROMPT_MEMORY_CHAR_CAP = 1500;
export const STALE_MONTHS = 3;
export const MAIL_LIMITS = [5, 10, 20] as const;

export const CACHE_MS = 60_000;
export const LOW_USD = 1;
export const REFRESH_MS = 10 * 60 * 1000;

export const MAX_ATTACHMENTS = 3;
export const MAX_ATTACHMENT_BYTES = 4.5 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
export const MAX_MESSAGES = 400;
export const MAX_RAW_IMAGES = 40;
export const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024;
export const SPEECH_LIMIT = 4000;

export const END_OF_TURN_SILENCE_MS = 1000;
export const SILENCE_MS = 2000;
export const HOLDING_MS = 400;
export const MAX_UTTERANCE_MS = 45_000;
export const POLL_MS = 50;
export const MIN_SPEECH_MS = 160;
export const TAP_SILENCE_MS = 4000;

export const NOT_LINKED = "WhatsApp is not linked. Connect it in Link status.";
export const SPEAK_INSTRUCTIONS = "Speak calmly and clearly, in the language of the text.";
export const TRANSCRIBE_PROMPT =
  "The speaker uses Croatian or English. Write Croatian in Latin letters, never Cyrillic. When they say a date or a clock time, write it with digits.";

export const BAR_COUNT = 10;
export const SMOOTHING = 0.35;
export const MIN_HEIGHT = 0.08;
export const VOICE_MIN_HZ = 110;
export const VOICE_MAX_HZ = 3200;
export const NOISE_FLOOR = 26;
export const CX = 200;
export const CY = 200;


export const DAILY_PROMPT_LIMIT = 10;
export const PROMPT_LIMIT_MESSAGE = `You have reached the limit of ${DAILY_PROMPT_LIMIT} prompts per day.`;

export function isAdminEmail(email: string | null | undefined) {
  return (email ?? "").trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

export function isDailyPromptBlocked(
  user: { email?: string | null; promptDay?: string | null; promptCount?: number | null },
  day: string,
) {
  if (isAdminEmail(user.email)) return false;
  if (user.promptDay !== day) return false;
  return (user.promptCount ?? 0) >= DAILY_PROMPT_LIMIT;
}
