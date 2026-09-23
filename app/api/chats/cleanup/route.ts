import { timingSafeEqual } from "crypto";
import { disposableChatReason, type NoiseReason } from "@/app/_lib/chat-noise";
import { getMissionStore } from "@/app/_lib/mission-store";
import { getApiUserId } from "@/app/_lib/session";
import type { ChatThread } from "@/app/_types/jarvis";

type CleanupHit = {
  id: string;
  userId: string;
  title: string;
  reason: NoiseReason;
  updatedAt: number;
};

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

function hitsFor(threads: ChatThread[]): CleanupHit[] {
  const hits: CleanupHit[] = [];
  for (const thread of threads) {
    const reason = disposableChatReason(thread);
    if (!reason) continue;
    hits.push({
      id: thread.id,
      userId: thread.userId,
      title: thread.title || "Conversation",
      reason,
      updatedAt: thread.updatedAt,
    });
  }
  return hits;
}

async function runCleanup(request: Request, apply: boolean) {
  const token = bearerToken(request);
  const store = getMissionStore();
  let threads: ChatThread[];
  let scheduled = false;

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
    threads = await store.listAllChatThreads();
    scheduled = true;
  } else {
    const userId = await getApiUserId();
    if (!userId) {
      return Response.json({ error: { message: "Sign in first." } }, { status: 401 });
    }
    threads = await store.listChatThreads(userId);
  }

  const hits = hitsFor(threads);
  const removed: CleanupHit[] = [];
  const failed: Array<{ id: string; title: string; message: string }> = [];

  if (apply) {
    for (const hit of hits) {
      try {
        await store.deleteChat(hit.userId, hit.id);
        removed.push(hit);
      } catch (error) {
        failed.push({
          id: hit.id,
          title: hit.title,
          message: error instanceof Error ? error.message : "Could not delete that conversation.",
        });
      }
    }
  }

  const listed = apply ? removed : hits;
  return Response.json({
    dryRun: !apply,
    scanned: threads.length,
    kept: threads.length - (apply ? removed.length : hits.length),
    removed: listed.map((hit) => ({
      id: hit.id,
      title: hit.title,
      reason: hit.reason,
      updatedAt: hit.updatedAt,
      ...(scheduled ? { userId: hit.userId } : {}),
    })),
    ...(apply ? { failed } : {}),
  });
}

export async function GET(request: Request) {
  return runCleanup(request, false);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { apply?: boolean } | null;
  return runCleanup(request, body?.apply === true);
}
