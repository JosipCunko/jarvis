import { timingSafeEqual } from "crypto";
import { staleMemoryCutoff } from "@/app/_lib/memory";
import { getMissionStore } from "@/app/_lib/mission-store";
import { getApiUserId } from "@/app/_lib/session";

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
}

function cronAuthorized(token: string) {
  const secret = process.env.CRON_SECRET?.trim() ?? "";
  if (!secret || !token) return false;
  const left = Buffer.from(token);
  const right = Buffer.from(secret);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const token = bearerToken(request);
  const store = getMissionStore();
  const cutoff = staleMemoryCutoff();

  if (token) {
    if (!process.env.CRON_SECRET?.trim()) {
      return Response.json(
        { error: { message: "Set CRON_SECRET before a scheduled cleanup." } },
        { status: 401 },
      );
    }
    if (!cronAuthorized(token)) {
      return Response.json({ error: { message: "Unauthorized." } }, { status: 401 });
    }

    const notes = await store.listAllMemories();
    const userIds = [...new Set(notes.map((note) => note.userId))];
    let removed = 0;
    for (const userId of userIds) {
      removed += await store.forgetStaleMemories(userId, cutoff);
    }
    return Response.json({ removed, scanned: notes.length, users: userIds.length });
  }

  const userId = await getApiUserId();
  if (!userId) {
    return Response.json({ error: { message: "Sign in first." } }, { status: 401 });
  }
  const removed = await store.forgetStaleMemories(userId, cutoff);
  return Response.json({ removed });
}
