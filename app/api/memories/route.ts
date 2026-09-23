import { getMissionStore } from "@/app/_lib/mission-store";
import { getApiUserId } from "@/app/_lib/session";

export async function GET() {
  const userId = await getApiUserId();
  if (!userId) {
    return Response.json({ error: { message: "Sign in first." } }, { status: 401 });
  }
  const memories = await getMissionStore().listMemories(userId);
  return Response.json({ memories });
}

export async function POST(request: Request) {
  const userId = await getApiUserId();
  if (!userId) {
    return Response.json({ error: { message: "Sign in first." } }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { text?: string } | null;
  const text = body?.text?.trim() ?? "";
  if (!text) {
    return Response.json({ error: { message: "Note text is required." } }, { status: 400 });
  }
  if (text.length > 500) {
    return Response.json(
      { error: { message: "Keep the note under 500 characters." } },
      { status: 400 },
    );
  }
  const memory = await getMissionStore().remember(userId, text);
  return Response.json({ memory });
}
