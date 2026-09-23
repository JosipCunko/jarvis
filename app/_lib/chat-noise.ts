import type { ChatMessage, ChatThread } from "@/app/_types/jarvis";

export type NoiseReason = "empty" | "greeting" | "gibberish" | "test-prompt";

export const NOISE_REASON_LABEL: Record<NoiseReason, string> = {
  empty: "Empty thread",
  greeting: "Just a greeting",
  gibberish: "Nothing to keep",
  "test-prompt": "Test prompt",
};

const GREETINGS = new Set([
  "hi",
  "hey",
  "hello",
  "yo",
  "sup",
  "hiya",
  "howdy",
  "jarvis",
  "morning",
  "afternoon",
  "evening",
  "bok",
  "zdravo",
  "cao",
  "hej",
  "ej",
  "pozdrav",
]);

const FILLERS = new Set([
  "how",
  "are",
  "you",
  "u",
  "ya",
  "whats",
  "what",
  "up",
  "is",
  "it",
  "going",
  "there",
  "good",
  "kako",
  "si",
  "sta",
  "radis",
  "imas",
  "thanks",
  "thank",
  "thx",
  "ty",
  "ok",
  "okay",
  "k",
  "kk",
  "cool",
  "nice",
  "bye",
  "goodbye",
  "cya",
  "later",
  "please",
  "pls",
  "hvala",
  "fala",
  "yes",
  "no",
  "yep",
  "nope",
  "yeah",
  "nah",
  "da",
  "ne",
  "lol",
  "lmao",
  "haha",
  "hahaha",
  "wow",
  "hm",
  "hmm",
  "uh",
  "um",
  "ah",
]);

const STOP = new Set([
  "a",
  "an",
  "the",
  "to",
  "at",
  "for",
  "of",
  "and",
  "or",
  "i",
  "me",
  "my",
  "im",
  "ja",
  "mi",
  "na",
  "se",
  "je",
  "su",
  "li",
]);

const NONSENSE = new Set([
  "bla",
  "blah",
  "blu",
  "bli",
  "ble",
  "blo",
  "asdf",
  "asd",
  "qwe",
  "qwer",
  "zxc",
  "zxcv",
  "foo",
  "bar",
  "baz",
  "lorem",
  "ipsum",
  "test",
  "testing",
  "xxx",
  "abc",
]);

const TEST_PATTERNS = [
  /without any more prompts/i,
  /just one reply/i,
  /only one reply/i,
  /ask me for the title and due date/i,
  /one reply from thesys/i,
];

type UtteranceKind = NoiseReason | "substance";

function fold(token: string) {
  return token.normalize("NFD").replace(/\p{M}/gu, "");
}

function isTestPrompt(raw: string) {
  return TEST_PATTERNS.some((pattern) => pattern.test(raw));
}

function isGibberishToken(token: string) {
  if (NONSENSE.has(token)) return true;
  if (/^(.)\1{2,}$/.test(token)) return true;
  if (/^([a-z]{2,4})\1+$/.test(token)) return true;
  if (/(.)\1{3,}/.test(token)) return true;
  if (/asdf|qwer|zxcv|hjkl|uiop/.test(token) && token.length <= 12) return true;
  const vowels = token.match(/[aeiouy]/g)?.length ?? 0;
  if (token.length >= 5 && vowels / token.length < 0.2) return true;
  return false;
}

function classifyUtterance(raw: string): UtteranceKind {
  if (isTestPrompt(raw)) return "test-prompt";
  const text = raw
    .toLowerCase()
    .normalize("NFKC")
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "empty";
  if (text.length > 280) return "substance";

  const tokens = text.split(" ").filter(Boolean);
  let sawGibberish = false;
  for (const token of tokens) {
    const word = fold(token);
    if (/^\d{1,4}$/.test(word)) continue;
    if (GREETINGS.has(word) || FILLERS.has(word) || STOP.has(word)) continue;
    if (isGibberishToken(word)) {
      sawGibberish = true;
      continue;
    }
    return "substance";
  }
  return sawGibberish ? "gibberish" : "greeting";
}

function userMessages(thread: Pick<ChatThread, "messages">) {
  const messages = Array.isArray(thread.messages) ? thread.messages : [];
  return messages.filter((message): message is ChatMessage => message?.role === "user");
}

/** Threads that are greetings, gibberish, empty, or model-test prompts. */
export function disposableChatReason(thread: Pick<ChatThread, "messages">): NoiseReason | null {
  const users = userMessages(thread);
  if (users.some((message) => (message.attachments?.length ?? 0) > 0)) return null;

  const didWork = (Array.isArray(thread.messages) ? thread.messages : []).some(
    (message) => (message?.functionResults?.length ?? 0) > 0,
  );
  const texts = users.map((message) => message.content ?? "");
  if (texts.length === 0 || texts.every((text) => !text.trim())) {
    return didWork ? null : "empty";
  }

  const kinds = texts.map((text) => classifyUtterance(text));
  if (kinds.some((kind) => kind === "substance")) return null;
  if (kinds.some((kind) => kind === "test-prompt")) return "test-prompt";
  if (didWork) return null;

  if (kinds.some((kind) => kind === "gibberish")) return "gibberish";
  return "greeting";
}
