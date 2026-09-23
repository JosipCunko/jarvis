import { getMissionStore } from "@/app/_lib/mission-store";
import { getApiUserId } from "@/app/_lib/session";
import type { TaskStatus } from "@/app/_types/jarvis";

export async function GET() {
  const userId = await getApiUserId();
  if (!userId) {
    return Response.json({ error: { message: "Sign in first." } }, { status: 401 });
  }
  const snapshot = await getMissionStore().loadSnapshot(userId);
  return Response.json({ snapshot });
}

export async function PATCH(request: Request) {
  const userId = await getApiUserId();
  if (!userId) {
    return Response.json({ error: { message: "Sign in first." } }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as {
    id?: string;
    status?: string;
  } | null;
  const id = body?.id?.trim() ?? "";
  const status = body?.status;
  if (!id) {
    return Response.json({ error: { message: "Mission id is required." } }, { status: 400 });
  }
  if (status !== "open" && status !== "in_progress" && status !== "done") {
    return Response.json({ error: { message: "Status is invalid." } }, { status: 400 });
  }
  const store = getMissionStore();
  const existing = (await store.listTasks(userId)).find((task) => task.id === id);
  if (!existing) {
    return Response.json({ error: { message: "Mission not found." } }, { status: 404 });
  }
  const nextStatus = status as TaskStatus;
  const task =
    nextStatus === "done"
      ? await store.completeTask(userId, id)
      : await store.upsertTask(userId, {
          id,
          title: existing.title,
          status: nextStatus,
          priority: existing.priority,
          dueAt: existing.dueAt,
          tags: existing.tags,
          notes: existing.notes,
          icon: existing.icon,
          color: existing.color,
        });
  return Response.json({ task });
}
