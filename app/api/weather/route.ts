import { getApiUserId } from "@/app/_lib/session";
import { getLocalWeather } from "@/app/_lib/weather";

function coordinate(value: string | null, min: number, max: number) {
  if (!value || !/^-?\d+(\.\d+)?$/.test(value)) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return number;
}

export async function GET(request: Request) {
  const userId = await getApiUserId();
  if (!userId) {
    return Response.json({ error: { message: "Sign in first." } }, { status: 401 });
  }
  const url = new URL(request.url);
  const latitude = coordinate(url.searchParams.get("latitude"), -90, 90);
  const longitude = coordinate(url.searchParams.get("longitude"), -180, 180);
  if (latitude == null || longitude == null) {
    return Response.json(
      { error: { message: "A location is required for weather." } },
      { status: 400 },
    );
  }
  try {
    return Response.json(await getLocalWeather(latitude, longitude));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Weather is unavailable.";
    return Response.json({ error: { message } }, { status: 502 });
  }
}
