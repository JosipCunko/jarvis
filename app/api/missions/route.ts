import { getMissionStore } from "@/app/_lib/mission-store";
import { getApiUserId } from "@/app/_lib/session";

export async function GET() {
  const userId = await getApiUserId();
  if (!userId) {
    return Response.json({ error: { message: "Sign in first." } }, { status: 401 });
  }
  const snapshot = await getMissionStore().loadSnapshot(userId);
  return Response.json({ snapshot });
}
