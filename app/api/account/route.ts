import { getMissionStore } from "@/app/_lib/mission-store";
import { getApiUserId } from "@/app/_lib/session";

export async function PATCH(request: Request) {
  const userId = await getApiUserId();
  if (!userId) {
    return Response.json({ error: { message: "Sign in first." } }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { displayName?: string } | null;
  const displayName = body?.displayName?.trim() ?? "";
  if (!displayName) {
    return Response.json({ error: { message: "Name is required." } }, { status: 400 });
  }
  if (displayName.length > 80) {
    return Response.json(
      { error: { message: "Keep the name under 80 characters." } },
      { status: 400 },
    );
  }

  const store = getMissionStore();
  const existing = await store.getUser(userId);
  if (!existing) {
    return Response.json({ error: { message: "Account not found." } }, { status: 404 });
  }
  if (existing.provider === "demo") {
    return Response.json(
      { error: { message: "Demo mode has no real account." } },
      { status: 403 },
    );
  }

  const user = { ...existing, displayName };
  await store.upsertUser(user);
  return Response.json({ user });
}
