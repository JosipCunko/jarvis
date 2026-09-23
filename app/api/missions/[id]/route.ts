import { getMissionStore } from "@/app/_lib/mission-store";
import { getApiUserId } from "@/app/_lib/session";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  const userId = await getApiUserId();
  if (!userId) {
    return Response.json({ error: { message: "Sign in first." } }, { status: 401 });
  }
  const { id } = await context.params;
  if (!id.trim()) {
    return Response.json({ error: { message: "Mission id is required." } }, { status: 400 });
  }
  try {
    await getMissionStore().deleteTask(userId, id);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete that mission.";
    return Response.json({ error: { message } }, { status: 404 });
  }
}
