import type { TrackGeo } from "../tracks/gpxGeo";

export type WalkEntryGeoFields = TrackGeo;

export function parseWalkEntryGeoFields(parsed: Record<string, unknown>): WalkEntryGeoFields {
  const admin1 = typeof parsed.admin1 === "string" ? parsed.admin1.trim() : "";
  const locality = typeof parsed.locality === "string" ? parsed.locality.trim() : "";
  const country = typeof parsed.country === "string" ? parsed.country.trim() : "";
  const county = typeof parsed.county === "string" ? parsed.county.trim() : "";
  const landscape = typeof parsed.landscape === "string" ? parsed.landscape.trim() : "";
  const latRaw = parsed.lat;
  const lonRaw = parsed.lon;
  const lat = typeof latRaw === "number" && !Number.isNaN(latRaw) ? latRaw : undefined;
  const lon = typeof lonRaw === "number" && !Number.isNaN(lonRaw) ? lonRaw : undefined;
  return {
    ...(admin1 ? { admin1 } : {}),
    ...(locality ? { locality } : {}),
    ...(country ? { country } : {}),
    ...(county ? { county } : {}),
    ...(landscape ? { landscape } : {}),
    ...(lat != null ? { lat } : {}),
    ...(lon != null ? { lon } : {}),
  };
}
