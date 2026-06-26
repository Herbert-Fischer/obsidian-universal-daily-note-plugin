import { weatherCodeLabel } from "./weatherCodes";

export type WeatherSnapshot = {
  placeName: string;
  dateKey: string;
  isHistorical: boolean;
  temperatureC?: number;
  tempMin?: number;
  tempMax?: number;
  weatherCode: number;
  windKmh: number;
};

function windSuffix(windKmh: number): string {
  if (windKmh <= 0) return "";
  return ` · Wind ${windKmh} km/h`;
}

export function formatWeatherJournalBody(snapshot: WeatherSnapshot): string {
  const { emoji, label } = weatherCodeLabel(snapshot.weatherCode);
  const place = snapshot.placeName.replace(/\[\[/g, "").replace(/\]\]/g, "");
  if (snapshot.isHistorical) {
    return `[[${place}]] · ${emoji} ${snapshot.tempMin}–${snapshot.tempMax} °C, ${label}${windSuffix(snapshot.windKmh)}`;
  }
  return `[[${place}]] · ${emoji} ${snapshot.temperatureC} °C, ${label}${windSuffix(snapshot.windKmh)}`;
}

export function formatLocationFrontmatter(placeName: string): string {
  const trimmed = placeName.trim();
  if (!trimmed) return "";
  if (/[:#\[\]{}|>&*!@`"]/.test(trimmed)) {
    return `"${trimmed.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return trimmed;
}

/** Short one-line weather text for callout title suffix. */
export function formatWeatherSummaryShort(snapshot: WeatherSnapshot): string {
  const { emoji, label } = weatherCodeLabel(snapshot.weatherCode);
  const place = snapshot.placeName.split(",")[0]?.trim() || snapshot.placeName;
  if (snapshot.isHistorical) {
    return `${emoji} ${snapshot.tempMin}–${snapshot.tempMax} °C ${label}, ${place}`;
  }
  return `${emoji} ${snapshot.temperatureC} °C ${label}, ${place}`;
}

/** Prepend weather to Zusammenfassung; keep existing text after the weather snippet. */
export function prependWeatherToSummary(existing: string, weatherShort: string): string {
  const trimmed = existing.trim();
  if (!trimmed) return weatherShort;
  if (trimmed === weatherShort || trimmed.startsWith(`${weatherShort} ·`)) return trimmed;
  return `${weatherShort} · ${trimmed}`;
}

/** Append weather to managed callout title; keep existing title text first. */
export function appendWeatherToCalloutTitle(existing: string, weatherShort: string): string {
  const trimmed = existing.trim();
  if (!trimmed) return weatherShort;
  if (trimmed === weatherShort || trimmed.endsWith(` · ${weatherShort}`)) return trimmed;
  return `${trimmed} · ${weatherShort}`;
}
