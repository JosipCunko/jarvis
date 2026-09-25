import { parseMemoryKind } from "@/app/_lib/memory";
import { getMissionStore } from "@/app/_lib/mission-store";
import { getApiUserId } from "@/app/_lib/session";
import type { MemoryPatch } from "@/app/_types/jarvis";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const userId = await getApiUserId();
  if (!userId) {
    return Response.json({ error: { message: "Sign in first." } }, { status: 401 });
  }
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    text?: unknown;
    kind?: unknown;
    pinned?: unknown;
  } | null;
  if (!body) {
    return Response.json({ error: { message: "Note update is required." } }, { status: 400 });
  }
  const patch: MemoryPatch = {};
  if ("text" in body) {
    if (typeof body.text !== "string" || !body.text.trim()) {
      return Response.json({ error: { message: "Note text is required." } }, { status: 400 });
    }
    if (body.text.trim().length > 500) {
      return Response.json(
        { error: { message: "Keep the note under 500 characters." } },
        { status: 400 },
      );
    }
    patch.text = body.text;
  }
  if ("kind" in body) {
    const kind = parseMemoryKind(body.kind);
    if (!kind) {
      return Response.json({ error: { message: "Unknown note kind." } }, { status: 400 });
    }
    patch.kind = kind;
  }
  if ("pinned" in body) {
    if (typeof body.pinned !== "boolean") {
      return Response.json({ error: { message: "Pinned must be true or false." } }, { status: 400 });
    }
    patch.pinned = body.pinned;
  }
  if (patch.text === undefined && patch.kind === undefined && patch.pinned === undefined) {
    return Response.json({ error: { message: "Nothing to update." } }, { status: 400 });
  }
  try {
    const memory = await getMissionStore().updateMemory(userId, id, patch);
    return Response.json({ memory });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update that note.";
    const status = message === "Memory not found." ? 404 : 400;
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
    await getMissionStore().forgetMemory(userId, id);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete that note.";
    return Response.json({ error: { message } }, { status: 404 });
  }
}
