import { audioFormat, getSpeechBackend, TRANSCRIBE_PROMPT } from "@/app/_lib/speech-provider";
import { getApiUserId } from "@/app/_lib/session";
import { acceptSpeech, type SpeechLanguage } from "@/app/_lib/speech-lang";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

function languageFromPayload(text: string): { text: string; language: SpeechLanguage } | null {
  return acceptSpeech(text);
}

function providerError(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const error = (payload as { error?: unknown }).error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : "";
  }
  return "";
}

export async function POST(request: Request) {
  const userId = await getApiUserId();
  if (!userId) {
    return Response.json({ error: { message: "Sign in first." } }, { status: 401 });
  }
  const backend = getSpeechBackend();
  if (!backend) {
    return Response.json(
      { error: { message: "Speech auto-detect is not configured." } },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: { message: "Expected an audio upload." } }, { status: 400 });
  }

  const audio = form.get("audio");
  if (!(audio instanceof File)) {
    return Response.json({ error: { message: "Missing audio." } }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: { message: "That recording is too long." } }, { status: 413 });
  }
  if (audio.size < 800) {
    return Response.json({ text: "", language: "en" satisfies SpeechLanguage });
  }

  const name = audio.name && audio.name.includes(".") ? audio.name : "speech.webm";
  const headers = { Authorization: `Bearer ${backend.apiKey}` };
  const bytes = Buffer.from(await audio.arrayBuffer());

  const requestTranscript = (withPrompt: boolean) => {
    if (backend.provider === "openrouter") {
      return fetch(backend.transcribeUrl, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: backend.transcribeModel,
          input_audio: {
            data: bytes.toString("base64"),
            format: audioFormat(name, audio.type),
          },
          response_format: "json",
          ...(withPrompt ? { prompt: TRANSCRIBE_PROMPT } : {}),
        }),
      });
    }
    const upload = new FormData();
    upload.append("file", new File([bytes], name, { type: audio.type || "audio/webm" }), name);
    upload.append("model", backend.transcribeModel);
    upload.append("response_format", "json");
    if (withPrompt) upload.append("prompt", TRANSCRIBE_PROMPT);
    return fetch(backend.transcribeUrl, {
      method: "POST",
      headers,
      body: upload,
    });
  };

  let response = await requestTranscript(true);
  if (!response.ok) {
    const detail = await response.clone().json().catch(() => null);
    if (/prompt/i.test(providerError(detail))) {
      response = await requestTranscript(false);
    }
  }

  if (!response.ok) {
    return Response.json(
      { error: { message: "Speech transcription failed." } },
      { status: 502 },
    );
  }

  const payload = (await response.json()) as { text?: unknown; language?: unknown };
  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  const accepted = languageFromPayload(text);
  if (text && !accepted) {
    return Response.json({ text: "", language: null, rejected: "language" });
  }
  return Response.json({ text: accepted?.text ?? "", language: accepted?.language ?? null });
}
