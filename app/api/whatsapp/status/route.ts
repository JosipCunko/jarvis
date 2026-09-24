import { getApiUserId } from "@/app/_lib/session";
import { getWhatsAppStatus } from "@/app/_lib/whatsapp";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getApiUserId();
  if (!userId) {
    return Response.json({ connected: false, phone: null, qr: null }, { status: 401 });
  }
  const status = await getWhatsAppStatus(userId, 6_000);
  return Response.json(status);
}
