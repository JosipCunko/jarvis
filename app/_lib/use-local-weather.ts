"use client";

import { useEffect, useState } from "react";
import type { LocalWeather } from "@/app/_types/workflows";

const REFRESH_MS = 10 * 60 * 1000;

function geoMessage(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error ? Number(error.code) : 0;
  if (code === 1) return "Allow location to read local weather.";
  return "Location is unavailable.";
}

function readCoords() {
  return new Promise<GeolocationCoordinates>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position.coords),
      reject,
      { enableHighAccuracy: false, maximumAge: REFRESH_MS, timeout: 12000 },
    );
  });
}

export function useLocalWeather() {
  const [weather, setWeather] = useState<LocalWeather | null>(null);
  const [message, setMessage] = useState("Locating…");

  useEffect(() => {
    let cancelled = false;
    let timer = 0;

    async function load() {
      if (!navigator.geolocation) {
        if (!cancelled) setMessage("Location is unavailable in this browser.");
        return;
      }
      let coords: GeolocationCoordinates;
      try {
        coords = await readCoords();
      } catch (error) {
        if (!cancelled) setMessage(geoMessage(error));
        return;
      }
      const params = new URLSearchParams({
        latitude: String(coords.latitude),
        longitude: String(coords.longitude),
      });
      const response = await fetch(`/api/weather?${params}`);
      const data = (await response.json().catch(() => null)) as
        | (LocalWeather & { error?: { message?: string } })
        | null;
      if (cancelled) return;
      if (!response.ok || !data || typeof data.temperature !== "number") {
        setMessage(data?.error?.message ?? "Weather is unavailable.");
        return;
      }
      setWeather(data);
      setMessage("");
      timer = window.setTimeout(() => void load(), REFRESH_MS);
    }

    void load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  return { weather, message };
}
