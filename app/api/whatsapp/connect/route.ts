import { getApiUserId } from "@/app/_lib/session";
import { connectWhatsApp } from "@/app/_lib/whatsapp";

export const dynamic = "force-dynamic";

export async function POST() {
  const userId = await getApiUserId();
  if (!userId) {
    return Response.json({ error: { message: "Sign in first." } }, { status: 401 });
  }
  const status = await connectWhatsApp(userId);
  return Response.json(status);
}
