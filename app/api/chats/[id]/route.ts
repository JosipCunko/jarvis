import { getMissionStore } from "@/app/_lib/mission-store";
import { getApiUserId } from "@/app/_lib/session";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const userId = await getApiUserId();
  if (!userId) {
    return Response.json({ error: { message: "Sign in first." } }, { status: 401 });
  }
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { title?: string } | null;
  const title = body?.title?.trim() ?? "";
  if (!title) {
    return Response.json({ error: { message: "Title is required." } }, { status: 400 });
  }
  try {
    const chat = await getMissionStore().renameChat(userId, id, title);
    return Response.json({ chat });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not rename that conversation.";
    const status = message === "Title is required." ? 400 : 404;
    return Response.json({ error: { message } }, { status });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const userId = await getApiUserId();
  if (!userId) {
    return Response.json({ error: { message: "Sign in first." } }, { status: 401 });
  }
  const { id } = await context.params;
  try {
    await getMissionStore().deleteChat(userId, id);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete that conversation.";
    return Response.json({ error: { message } }, { status: 404 });
  }
}
