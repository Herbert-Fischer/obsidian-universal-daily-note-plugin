#!/usr/bin/env node
/**
 * One-off vault backfill using the same geo rules as the plugin command.
 * Usage: node scripts/backfill-vault-geo.mjs [/path/to/vault]
 */
import fs from "node:fs/promises";
import path from "node:path";

const VAULT = path.resolve(process.argv[2] ?? "/vault");
const DAILY_FOLDER = "Calendar/Notes";
const CACHE_REL = "Calendar/.udn/geocode-cache.json";
const UA = "UniversalDailyNote/1.1.0 (Obsidian plugin; weather capture)";
const DELAY_MS = 1100;

const META_PREFIXES = ["<!-- udn-wandern-entry:", "<!-- udn-spaziergang-entry:"];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function geocodeCacheKey(lat, lon) {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

function parseGpxCentroid(xml) {
  const points = [];
  const re = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"/g;
  let m;
  while ((m = re.exec(xml))) {
    points.push({ lat: Number(m[1]), lon: Number(m[2]) });
  }
  if (points.length === 0) return null;
  let latSum = 0;
  let lonSum = 0;
  for (const p of points) {
    latSum += p.lat;
    lonSum += p.lon;
  }
  return { lat: latSum / points.length, lon: lonSum / points.length };
}

function landscapeFromAddress(address) {
  const region = address.region?.trim();
  if (region) return region;
  const district = address.state_district?.trim();
  if (district) return district;
  for (const key of ["municipality", "village", "town", "city"]) {
    const val = address[key]?.trim();
    if (!val) continue;
    const match = val.match(/\(([^)]+)\)\s*$/);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return undefined;
}

function addressToFields(address) {
  const rawName =
    address.village ?? address.town ?? address.city ?? address.hamlet ?? address.municipality ?? "";
  const name = rawName.replace(/\s*\([^)]+\)\s*$/, "").trim();
  return {
    admin1: address.state,
    country: address.country,
    county: address.county?.trim() || undefined,
    landscape: landscapeFromAddress(address),
    locality: name || address.county?.trim() || "",
  };
}

async function reverseGeocode(lat, lon) {
  const url =
    `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(String(lat))}` +
    `&lon=${encodeURIComponent(String(lon))}` +
    `&format=json&accept-language=de&addressdetails=1&zoom=10`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.address) return null;
  const fields = addressToFields(data.address);
  if (!fields.admin1 && !fields.locality && !fields.county) return null;
  return {
    admin1: fields.admin1,
    locality: fields.locality || undefined,
    country: fields.country,
    county: fields.county,
    landscape: fields.landscape,
    lat: Math.round(lat * 1000) / 1000,
    lon: Math.round(lon * 1000) / 1000,
  };
}

function needsBackfill(meta) {
  if (!meta.trackPath?.trim()) return false;
  return !meta.admin1?.trim() || !meta.county?.trim();
}

function parseMetaLine(line) {
  const trimmed = line.trim().replace(/^(?:>\s*)+/, "");
  const prefix = META_PREFIXES.find((p) => trimmed.startsWith(p));
  if (!prefix) return null;
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) return null;
  try {
    return { prefix, meta: JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) };
  } catch {
    return null;
  }
}

function metaComment(prefix, meta) {
  return `${prefix} ${JSON.stringify(meta)} -->`;
}

async function loadCache() {
  try {
    const raw = await fs.readFile(path.join(VAULT, CACHE_REL), "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveCache(cache) {
  const dir = path.join(VAULT, "Calendar/.udn");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(VAULT, CACHE_REL), JSON.stringify(cache, null, 2));
}

async function geocodeWithCache(lat, lon, cache) {
  const key = geocodeCacheKey(lat, lon);
  const cached = cache[key];
  if (cached?.admin1?.trim() && cached?.county?.trim()) {
    return { geo: cached, fromCache: true };
  }
  const geo = await reverseGeocode(lat, lon);
  if (geo) cache[key] = geo;
  return { geo, fromCache: false };
}

function mergeGeo(meta, geo) {
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

async function main() {
  const cache = await loadCache();
  let filesScanned = 0;
  let entriesUpdated = 0;
  let entriesSkipped = 0;
  let lastNetworkAt = 0;

  const dailyDir = path.join(VAULT, DAILY_FOLDER);
  const files = (await fs.readdir(dailyDir))
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .map((f) => path.join(dailyDir, f));

  for (const filePath of files) {
    filesScanned++;
    const text = await fs.readFile(filePath, "utf8");
    const lines = text.split("\n");
    let changed = false;

    for (let i = 0; i < lines.length; i++) {
      const parsed = parseMetaLine(lines[i] ?? "");
      if (!parsed || !needsBackfill(parsed.meta)) continue;

      const gpxPath = path.join(VAULT, parsed.meta.trackPath);
      let xml;
      try {
        xml = await fs.readFile(gpxPath, "utf8");
      } catch {
        entriesSkipped++;
        continue;
      }

      const centroid = parseGpxCentroid(xml);
      if (!centroid) {
        entriesSkipped++;
        continue;
      }

      const elapsed = Date.now() - lastNetworkAt;
      if (elapsed < DELAY_MS) await sleep(DELAY_MS - elapsed);

      const { geo, fromCache } = await geocodeWithCache(centroid.lat, centroid.lon, cache);
      if (!fromCache) lastNetworkAt = Date.now();

      if (!geo?.admin1 && !geo?.county) {
        entriesSkipped++;
        continue;
      }

      const nextMeta = mergeGeo(parsed.meta, geo);
      const calloutPrefix = (lines[i] ?? "").match(/^((?:>\s*)*)/)?.[1] ?? "> ";
      lines[i] = `${calloutPrefix}${metaComment(parsed.prefix, nextMeta)}`;
      changed = true;
      entriesUpdated++;
      console.log(`Updated ${path.basename(filePath)}: ${nextMeta.locality ?? "?"} / ${nextMeta.admin1} / ${nextMeta.county ?? ""}`);
    }

    if (changed) {
      await fs.writeFile(filePath, lines.join("\n"));
    }
  }

  await saveCache(cache);
  console.log(`Done: ${entriesUpdated} updated, ${entriesSkipped} skipped, ${filesScanned} files scanned.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
