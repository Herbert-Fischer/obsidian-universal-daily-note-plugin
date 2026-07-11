import { TFile, type App } from "obsidian";
import { normalizePath } from "obsidian";
import { parseGpxTrackPoints } from "./gpxImport";
import { reverseGeocode, type GeoPlace } from "../weather/openMeteo";

export type TrackGeo = {
  admin1?: string;
  locality?: string;
  country?: string;
  county?: string;
  landscape?: string;
  lat?: number;
  lon?: number;
};

export const GEOCODE_CACHE_PATH = "Calendar/.udn/geocode-cache.json";

type GeocodeCacheFile = Record<string, TrackGeo>;

/** First segment before " / " for planned tour region strings (e.g. "Hessen / Rhön" → "Hessen"). */
export function admin1FromPlannedRegion(region: string | null | undefined): string {
  const raw = String(region ?? "").trim();
  if (!raw) return "";
  const slash = raw.indexOf(" / ");
  return (slash >= 0 ? raw.slice(0, slash) : raw).trim();
}

/** Cache key from coordinates rounded to 3 decimal places (~100 m). */
export function geocodeCacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

/** Arithmetic mean of all track points (better than start-only for loop hikes). */
export function trackCentroid(xml: string): { lat: number; lon: number } | null {
  const points = parseGpxTrackPoints(xml);
  if (points.length === 0) return null;
  let latSum = 0;
  let lonSum = 0;
  for (const p of points) {
    latSum += p.lat;
    lonSum += p.lon;
  }
  return { lat: latSum / points.length, lon: lonSum / points.length };
}

export function localityFromGeoPlace(place: GeoPlace): string {
  if (place.locality?.trim()) return place.locality.trim();
  const first = place.placeName.split(",")[0]?.trim() ?? "";
  if (!first || /°/.test(first)) return "";
  return first;
}

export function trackGeoFromGeoPlace(place: GeoPlace): TrackGeo {
  return {
    admin1: place.admin1?.trim() || undefined,
    locality: localityFromGeoPlace(place),
    country: place.country?.trim() || undefined,
    county: place.county?.trim() || undefined,
    landscape: place.landscape?.trim() || undefined,
    lat: Math.round(place.latitude * 1000) / 1000,
    lon: Math.round(place.longitude * 1000) / 1000,
  };
}

export function hasTrackGeo(geo: TrackGeo | null | undefined): boolean {
  return Boolean(
    geo?.admin1?.trim() ||
      geo?.locality?.trim() ||
      geo?.county?.trim() ||
      geo?.landscape?.trim(),
  );
}

export function walkEntryGeoComplete(meta: {
  admin1?: string;
  county?: string;
}): boolean {
  return Boolean(meta.admin1?.trim() && meta.county?.trim());
}

function mergeTrackGeoIntoMeta<T extends TrackGeo>(meta: T, geo: TrackGeo): T {
  return {
    ...meta,
    admin1: meta.admin1?.trim() || geo.admin1,
    locality: meta.locality?.trim() || geo.locality,
    country: meta.country?.trim() || geo.country,
    county: meta.county?.trim() || geo.county,
    landscape: meta.landscape?.trim() || geo.landscape,
    lat: meta.lat ?? geo.lat,
    lon: meta.lon ?? geo.lon,
  };
}

export async function loadGeocodeCache(app: App): Promise<GeocodeCacheFile> {
	if (!app?.vault?.getAbstractFileByPath) return {};
	const file = app.vault.getAbstractFileByPath(GEOCODE_CACHE_PATH);
	if (!(file instanceof TFile)) return {};
  try {
    const raw = await app.vault.read(file);
    const parsed = JSON.parse(raw) as GeocodeCacheFile;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveGeocodeCache(app: App, cache: GeocodeCacheFile): Promise<void> {
  const dir = normalizePath("Calendar/.udn");
  const folder = app.vault.getAbstractFileByPath(dir);
  if (!folder) {
    await app.vault.createFolder(dir).catch(() => undefined);
  }
  const json = JSON.stringify(cache, null, 2);
  const existing = app.vault.getAbstractFileByPath(GEOCODE_CACHE_PATH);
  if (existing instanceof TFile) {
    await app.vault.modify(existing, json);
  } else {
    await app.vault.create(GEOCODE_CACHE_PATH, json);
  }
}

export async function reverseGeocodeWithCache(
  app: App,
  lat: number,
  lon: number,
  cache?: GeocodeCacheFile,
): Promise<{ geo: TrackGeo; cache: GeocodeCacheFile; fromCache: boolean }> {
  const store = cache ?? (await loadGeocodeCache(app));
  const key = geocodeCacheKey(lat, lon);
  const cached = store[key];
  if (cached && cached.admin1?.trim() && cached.county?.trim()) {
    return { geo: cached, cache: store, fromCache: true };
  }

  const place = await reverseGeocode(lat, lon);
  const geo = trackGeoFromGeoPlace(place);
  const next = { ...store, [key]: geo };
  await saveGeocodeCache(app, next);
  return { geo, cache: next, fromCache: false };
}

export async function geocodeGpxXml(
  app: App,
  xml: string,
  cache?: GeocodeCacheFile,
): Promise<{ geo: TrackGeo | null; cache: GeocodeCacheFile }> {
  const centroid = trackCentroid(xml);
  if (!centroid) {
    return { geo: null, cache: cache ?? (await loadGeocodeCache(app)) };
  }
  const result = await reverseGeocodeWithCache(app, centroid.lat, centroid.lon, cache);
  return { geo: result.geo, cache: result.cache };
}

export async function geocodeGpxFile(
  app: App,
  file: TFile,
  cache?: GeocodeCacheFile,
): Promise<{ geo: TrackGeo | null; cache: GeocodeCacheFile }> {
  try {
    const xml = await app.vault.read(file);
    return geocodeGpxXml(app, xml, cache);
  } catch {
    return { geo: null, cache: cache ?? (await loadGeocodeCache(app)) };
  }
}

export async function geocodeTrackPath(
  app: App,
  trackPath: string,
  cache?: GeocodeCacheFile,
): Promise<{ geo: TrackGeo | null; cache: GeocodeCacheFile; fromCache: boolean }> {
  const path = trackPath.trim();
  if (!path || !app?.vault?.getAbstractFileByPath) {
    return { geo: null, cache: cache ?? {}, fromCache: true };
  }
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) {
    return { geo: null, cache: cache ?? (await loadGeocodeCache(app)), fromCache: true };
  }
  try {
    const xml = await app.vault.read(file);
    const centroid = trackCentroid(xml);
    if (!centroid) {
      return { geo: null, cache: cache ?? (await loadGeocodeCache(app)), fromCache: true };
    }
    const result = await reverseGeocodeWithCache(app, centroid.lat, centroid.lon, cache);
    return { geo: result.geo, cache: result.cache, fromCache: result.fromCache };
  } catch {
    return { geo: null, cache: cache ?? (await loadGeocodeCache(app)), fromCache: true };
  }
}

/** Merge geo into entry meta when trackPath is set and geo fields are still missing. */
export async function enrichEntryMetaWithTrackGeo<T extends TrackGeo & { trackPath?: string }>(
  app: App,
  meta: T,
  cache?: GeocodeCacheFile,
): Promise<{ meta: T; cache: GeocodeCacheFile; fromCache: boolean }> {
  const trackPath = meta.trackPath?.trim() ?? "";
  if (!trackPath || walkEntryGeoComplete(meta)) {
    return { meta, cache: cache ?? (await loadGeocodeCache(app)), fromCache: true };
  }
  const { geo, cache: nextCache, fromCache } = await geocodeTrackPath(app, trackPath, cache);
  if (!geo || !hasTrackGeo(geo)) {
    return { meta, cache: nextCache, fromCache };
  }
  return {
    meta: mergeTrackGeoIntoMeta(meta, geo),
    cache: nextCache,
    fromCache,
  };
}
