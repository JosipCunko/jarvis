import "server-only";
import type { LocalWeather } from "@/app/_types/workflows";

const WEATHER_LABELS: Record<number, string> = {
  0: "Clear",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Dense drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Heavy freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light showers",
  81: "Showers",
  82: "Heavy showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm",
  99: "Thunderstorm",
};

type OpenMeteoForecast = {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
    is_day?: number;
    wind_speed_10m?: number;
  };
  daily?: {
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
  };
};

type ReversePlace = {
  city?: string;
  locality?: string;
  principalSubdivision?: string;
};

function roundOrNull(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function placeName(data: ReversePlace) {
  return data.city?.trim() || data.locality?.trim() || data.principalSubdivision?.trim() || "";
}

async function lookupPlace(latitude: number, longitude: number) {
  const url = new URL("https://api.bigdatacloud.net/data/reverse-geocode-client");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("localityLanguage", "en");
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return "";
  const data = (await response.json()) as ReversePlace;
  return placeName(data);
}

export async function getLocalWeather(latitude: number, longitude: number): Promise<LocalWeather> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("current", "temperature_2m,weather_code,is_day,wind_speed_10m");
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "1");

  const [forecastResponse, place] = await Promise.all([
    fetch(url, { cache: "no-store" }),
    lookupPlace(latitude, longitude).catch(() => ""),
  ]);
  if (!forecastResponse.ok) throw new Error("Weather is unavailable.");
  const data = (await forecastResponse.json()) as OpenMeteoForecast;
  const temperature = roundOrNull(data.current?.temperature_2m);
  const code = data.current?.weather_code;
  if (temperature == null || typeof code !== "number") {
    throw new Error("Weather is unavailable.");
  }

  return {
    place,
    temperature,
    code,
    label: WEATHER_LABELS[code] ?? "Unknown",
    isDay: data.current?.is_day !== 0,
    wind: roundOrNull(data.current?.wind_speed_10m) ?? 0,
    high: roundOrNull(data.daily?.temperature_2m_max?.[0]),
    low: roundOrNull(data.daily?.temperature_2m_min?.[0]),
  };
}
