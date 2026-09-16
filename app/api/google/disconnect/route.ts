import { getMissionStore } from "@/app/_lib/mission-store";
import { getApiUserId } from "@/app/_lib/session";

export async function POST() {
  const userId = await getApiUserId();
  if (!userId) {
    return Response.json({ error: { message: "Sign in first." } }, { status: 401 });
  }
  await getMissionStore().deleteGoogleAccount(userId);
  return Response.json({ ok: true, connected: false });
}
