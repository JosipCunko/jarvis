import "server-only";

const SPEAK_INSTRUCTIONS = "Speak calmly and clearly, in the language of the text.";

/** Steers the transcriber toward Latin Croatian and digit dates and times. */
export const TRANSCRIBE_PROMPT =
  "The speaker uses Croatian or English. Write Croatian in Latin letters, never Cyrillic. When they say a date or a clock time, write it with digits.";

export type SpeechBackend = {
  provider: "openrouter" | "openai";
  apiKey: string;
  transcribeUrl: string;
  speakUrl: string;
  transcribeModel: string;
  speakModel: string;
};

export function getSpeechBackend(): SpeechBackend | null {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey) {
    return {
      provider: "openrouter",
      apiKey: openRouterKey,
      transcribeUrl: "https://openrouter.ai/api/v1/audio/transcriptions",
      speakUrl: "https://openrouter.ai/api/v1/audio/speech",
      transcribeModel: "openai/gpt-4o-mini-transcribe",
      speakModel: "x-ai/grok-voice-tts-1.0",
    };
  }

  const openAiKey = process.env.OPENAI_API_KEY;
  if (openAiKey) {
    return {
      provider: "openai",
      apiKey: openAiKey,
      transcribeUrl: "https://api.openai.com/v1/audio/transcriptions",
      speakUrl: "https://api.openai.com/v1/audio/speech",
      transcribeModel: "gpt-4o-mini-transcribe",
      speakModel: "gpt-4o-mini-tts",
    };
  }

  return null;
}

export function audioFormat(name: string, type: string) {
  const source = `${name} ${type}`.toLowerCase();
  if (source.includes("mp4") || source.includes("m4a")) return "m4a";
  if (source.includes("mpeg") || source.includes("mp3")) return "mp3";
  if (source.includes("wav")) return "wav";
  if (source.includes("ogg")) return "ogg";
  if (source.includes("flac")) return "flac";
  return "webm";
}

export function speakRequestBody(backend: SpeechBackend, text: string) {
  if (backend.provider === "openrouter") {
    return {
      model: backend.speakModel,
      voice: "rex",
      input: text,
      response_format: "mp3",
    };
  }
  return {
    model: backend.speakModel,
    voice: "onyx",
    input: text,
    instructions: SPEAK_INSTRUCTIONS,
    response_format: "mp3",
  };
}
