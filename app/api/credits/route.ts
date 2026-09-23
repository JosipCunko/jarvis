import { getProviderCredits } from "@/app/_lib/credits";
import { getApiUserId } from "@/app/_lib/session";

export async function GET() {
  const userId = await getApiUserId();
  if (!userId) {
    return Response.json({ error: { message: "Sign in first." } }, { status: 401 });
  }
  const credits = await getProviderCredits();
  return Response.json(credits);
}
