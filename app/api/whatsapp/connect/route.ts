import { getApiUserId } from "@/app/_lib/session";
import { connectWhatsApp } from "@/app/_lib/whatsapp";

export const dynamic = "force-dynamic";

export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return Response.json(
      { error: { message: "WhatsApp connection is only available in local development." } },
      { status: 403 },
    );
  }
  const userId = await getApiUserId();
  if (!userId) {
    return Response.json({ error: { message: "Sign in first." } }, { status: 401 });
  }
  const status = await connectWhatsApp(userId);
  return Response.json(status);
}
