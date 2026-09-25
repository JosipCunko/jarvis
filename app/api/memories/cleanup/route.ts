import { staleMemoryCutoff } from "@/app/_lib/memory";
import { getMissionStore } from "@/app/_lib/mission-store";
import { getApiUserId } from "@/app/_lib/session";

export async function POST() {
  const userId = await getApiUserId();
  if (!userId) {
    return Response.json({ error: { message: "Sign in first." } }, { status: 401 });
  }
  const removed = await getMissionStore().forgetStaleMemories(userId, staleMemoryCutoff());
  return Response.json({ removed });
}
