import { isGoogleConfigured } from "@/app/_lib/config";
import { getMissionStore } from "@/app/_lib/mission-store";
import { getApiUserId } from "@/app/_lib/session";

export async function GET() {
  const userId = await getApiUserId();
  if (!userId) {
    return Response.json({ configured: isGoogleConfigured(), connected: false }, { status: 401 });
  }
  const account = await getMissionStore().getGoogleAccount(userId);
  return Response.json({
    configured: isGoogleConfigured(),
    connected: Boolean(account),
    email: account?.email ?? null,
  });
}
