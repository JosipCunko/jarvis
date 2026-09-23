import { speakableReply } from "@/app/_lib/c1";
import { getSpeechBackend, speakRequestBody } from "@/app/_lib/speech-provider";
import { getApiUserId } from "@/app/_lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const userId = await getApiUserId();
  if (!userId) {
    return Response.json({ error: { message: "Sign in first." } }, { status: 401 });
  }
  const backend = getSpeechBackend();
  if (!backend) {
    return Response.json(
      { error: { message: "Spoken replies are not configured." } },
      { status: 503 },
    );
  }

  let body: { text?: unknown };
  try {
    body = (await request.json()) as { text?: unknown };
  } catch {
    return Response.json({ error: { message: "Expected text to speak." } }, { status: 400 });
  }

  const text = speakableReply(typeof body.text === "string" ? body.text : "");
  if (!text) {
    return Response.json({ error: { message: "Nothing to speak." } }, { status: 400 });
  }

  const response = await fetch(backend.speakUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${backend.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(speakRequestBody(backend, text)),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    const detail = payload?.error?.message;
    return Response.json(
      {
        error: {
          message: detail
            ? `Could not speak that reply. ${detail}`
            : "Could not speak that reply.",
        },
      },
      { status: 502 },
    );
  }

  const audio = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "audio/mpeg";
  return new Response(audio, {
    headers: {
      "Content-Type": contentType.startsWith("audio/") ? contentType : "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
