import { requestUrl } from "obsidian";

export type GeoPlace = {
  latitude: number;
  longitude: number;
  placeName: string;
  admin1?: string;
  country?: string;
  locality?: string;
  county?: string;
  landscape?: string;
};

export type CurrentWeather = {
  temperatureC: number;
  weatherCode: number;
  windKmh: number;
};

export type HistoricalWeather = {
  weatherCode: number;
  tempMin: number;
  tempMax: number;
  windKmh: number;
};

type GeocodeResult = {
  results?: Array<{
    name: string;
    latitude: number;
    longitude: number;
    admin1?: string;
    country?: string;
  }>;
};

type ForecastJson = {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
    wind_speed_10m?: number;
  };
};

type ArchiveJson = {
  daily?: {
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    wind_speed_10m_max?: number[];
  };
};

function formatPlaceName(r: { name: string; admin1?: string; country?: string }): string {
  const parts = [r.name];
  if (r.admin1 && r.admin1 !== r.name) parts.push(r.admin1);
  if (r.country) parts.push(r.country);
  return parts.join(", ");
}

type GeocodeHit = NonNullable<GeocodeResult["results"]>[number];

/** Search terms to try for comma-separated place labels (e.g. from reverse geocode). */
export function geocodeSearchCandidates(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const parts = trimmed.split(",").map((p) => p.trim()).filter(Boolean);
  const candidates = [trimmed];
  if (parts.length >= 2) candidates.push(parts.slice(0, 2).join(", "));
  if (parts[0]) candidates.push(parts[0]);
  return [...new Set(candidates)];
}

export function geocodeResultScore(
  hit: { name: string; admin1?: string; country?: string },
  query: string,
): number {
  const parts = query.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (parts.length === 0) return 0;
  let score = 0;
  const name = hit.name.toLowerCase();
  const admin1 = (hit.admin1 ?? "").toLowerCase();
  const country = (hit.country ?? "").toLowerCase();
  const city = parts[0] ?? "";
  if (city && (name === city || name.includes(city) || city.includes(name))) score += 20;
  if (parts[1] && admin1 && (admin1.includes(parts[1]) || parts[1].includes(admin1))) score += 10;
  if (parts[2] && country && (country.includes(parts[2]) || parts[2].includes(country))) score += 10;
  return score;
}

async function fetchGeocodeResults(query: string): Promise<GeocodeHit[]> {
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}` +
    `&count=10&language=de&format=json`;
  const res = await requestUrl({ url });
  const data = res.json as GeocodeResult;
  return data.results ?? [];
}

function hitToGeoPlace(hit: GeocodeHit): GeoPlace {
  return {
    latitude: hit.latitude,
    longitude: hit.longitude,
    placeName: formatPlaceName(hit),
    admin1: hit.admin1,
    country: hit.country,
  };
}

const NOMINATIM_USER_AGENT = "UniversalDailyNote/1.1.0 (Obsidian plugin; weather capture)";

type NominatimAddress = {
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  municipality?: string;
  state?: string;
  country?: string;
  county?: string;
  region?: string;
  state_district?: string;
};

/** Extract landscape name from Nominatim address (region, district, or parenthetical suffix). */
export function landscapeFromNominatimAddress(address: NominatimAddress): string | undefined {
  const region = address.region?.trim();
  if (region) return region;
  const district = address.state_district?.trim();
  if (district) return district;
  for (const key of ["municipality", "village", "town", "city"] as const) {
    const val = address[key]?.trim();
    if (!val) continue;
    const match = val.match(/\(([^)]+)\)\s*$/);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return undefined;
}

function stripParentheticalSuffix(name: string): string {
  return name.replace(/\s*\([^)]+\)\s*$/, "").trim();
}

/** Map Nominatim reverse-geocode address fields to Open-Meteo-style place parts. */
export function nominatimAddressToPlaceFields(address: NominatimAddress): {
  name: string;
  admin1?: string;
  country?: string;
  county?: string;
  landscape?: string;
} {
  const rawName =
    address.village ??
    address.town ??
    address.city ??
    address.hamlet ??
    address.municipality ??
    "";
  const name = stripParentheticalSuffix(rawName);
  return {
    name,
    admin1: address.state,
    country: address.country,
    county: address.county?.trim() || undefined,
    landscape: landscapeFromNominatimAddress(address),
  };
}

function coordinatePlaceName(latitude: number, longitude: number): string {
  return `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`;
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<GeoPlace> {
  const coordFallback = (): GeoPlace => ({
    latitude,
    longitude,
    placeName: coordinatePlaceName(latitude, longitude),
  });

  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(String(latitude))}` +
      `&lon=${encodeURIComponent(String(longitude))}` +
      `&format=json&accept-language=de&addressdetails=1&zoom=10`;
    const res = await requestUrl({
      url,
      headers: { "User-Agent": NOMINATIM_USER_AGENT },
    });
    if (res.status >= 400) return coordFallback();

    const data = res.json as { address?: NominatimAddress };
    const fields = data.address ? nominatimAddressToPlaceFields(data.address) : null;
    if (!fields || (!fields.admin1 && !fields.name && !fields.county)) return coordFallback();

    const locality = fields.name || stripParentheticalSuffix(data.address?.municipality ?? "") || fields.county || "";
    const placeName = locality
      ? formatPlaceName({ name: locality, admin1: fields.admin1, country: fields.country })
      : [fields.county, fields.admin1, fields.country].filter(Boolean).join(", ");

    return {
      latitude,
      longitude,
      placeName,
      admin1: fields.admin1,
      country: fields.country,
      locality: locality || undefined,
      county: fields.county,
      landscape: fields.landscape,
    };
  } catch {
    return coordFallback();
  }
}

export async function searchGeocode(query: string): Promise<GeoPlace | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const candidates = geocodeSearchCandidates(trimmed);
  let bestHit: GeocodeHit | null = null;
  let bestScore = -1;

  for (const candidate of candidates) {
    const results = await fetchGeocodeResults(candidate);
    if (results.length === 0) continue;

    for (const hit of results) {
      const score = geocodeResultScore(hit, trimmed);
      if (score > bestScore) {
        bestScore = score;
        bestHit = hit;
      }
    }

    if (bestHit && bestScore >= 20) break;
  }

  if (!bestHit) return null;
  return hitToGeoPlace(bestHit);
}

export async function fetchCurrentWeather(latitude: number, longitude: number): Promise<CurrentWeather> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&current=temperature_2m,weather_code,wind_speed_10m&wind_speed_unit=kmh&timezone=auto`;
  const res = await requestUrl({ url });
  const data = res.json as ForecastJson;
  const cur = data.current;
  if (!cur || cur.temperature_2m == null || cur.weather_code == null) {
    throw new Error("Aktuelle Wetterdaten nicht verfügbar.");
  }
  return {
    temperatureC: Math.round(cur.temperature_2m),
    weatherCode: cur.weather_code,
    windKmh: Math.round(cur.wind_speed_10m ?? 0),
  };
}

export async function fetchHistoricalWeather(
  latitude: number,
  longitude: number,
  dateKey: string,
): Promise<HistoricalWeather> {
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}` +
    `&start_date=${dateKey}&end_date=${dateKey}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max` +
    `&wind_speed_unit=kmh&timezone=auto`;
  const res = await requestUrl({ url });
  const data = res.json as ArchiveJson;
  const daily = data.daily;
  const code = daily?.weather_code?.[0];
  const tMax = daily?.temperature_2m_max?.[0];
  const tMin = daily?.temperature_2m_min?.[0];
  if (code == null || tMax == null || tMin == null) {
    throw new Error(`Keine Archiv-Daten für ${dateKey}.`);
  }
  return {
    weatherCode: code,
    tempMin: Math.round(tMin),
    tempMax: Math.round(tMax),
    windKmh: Math.round(daily?.wind_speed_10m_max?.[0] ?? 0),
  };
}

export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Standortdienst nicht verfügbar."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 120000,
    });
  });
}
