import type { App } from "obsidian";
import type { DailyNoteFallbackSettings, GarminSyncSettings, WandernLayoutSettings } from "../settings";
import {
  importGarminActivityIntoDailyNote,
  type GarminActivityProfile,
  type GarminPendingActivity,
} from "./garminSync";

export type GarminPendingManifest = {
  activities: GarminPendingActivity[];
};

function isProfile(value: unknown): value is GarminActivityProfile {
  return value === "wandern" || value === "spaziergang";
}

function parsePendingActivity(raw: unknown): GarminPendingActivity | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const garminId = String(item.garminId ?? "").trim();
  const date = String(item.date ?? "").trim();
  const startTime = String(item.startTime ?? "").trim();
  const title = String(item.title ?? "").trim();
  const profile = item.profile;
  if (!garminId || !date || !startTime || !title || !isProfile(profile)) return null;

  const numOrNull = (value: unknown): number | null | undefined => {
    if (value == null || value === "") return value === undefined ? undefined : null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  return {
    garminId,
    date,
    startTime,
    title,
    profile,
    gpxPath: typeof item.gpxPath === "string" ? item.gpxPath.trim() || undefined : undefined,
    distanceKm: numOrNull(item.distanceKm),
    durationSec: numOrNull(item.durationSec),
    elevationGainM: numOrNull(item.elevationGainM),
  };
}

export function parseGarminPendingManifest(raw: string): GarminPendingManifest {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Garmin pending manifest must be a JSON object");
  }
  const activitiesRaw = (parsed as GarminPendingManifest).activities;
  if (!Array.isArray(activitiesRaw)) {
    return { activities: [] };
  }
  const activities = activitiesRaw
    .map(parsePendingActivity)
    .filter((item): item is GarminPendingActivity => item != null);
  return { activities };
}

export async function readGarminPendingManifest(
  app: App,
  manifestPath: string,
): Promise<GarminPendingManifest | null> {
  const path = manifestPath.trim();
  if (!path) return null;
  const exists = await app.vault.adapter.exists(path);
  if (!exists) return null;
  const raw = await app.vault.adapter.read(path);
  return parseGarminPendingManifest(raw);
}

export async function writeGarminPendingManifest(
  app: App,
  manifestPath: string,
  manifest: GarminPendingManifest,
): Promise<void> {
  const path = manifestPath.trim();
  if (!path) return;
  const parent = path.split("/").slice(0, -1).join("/");
  if (parent && !(await app.vault.adapter.exists(parent))) {
    await app.vault.adapter.mkdir(parent);
  }
  const body = `${JSON.stringify(manifest, null, 2)}\n`;
  await app.vault.adapter.write(path, body);
}

export type ImportGarminPendingOptions = {
  settings: GarminSyncSettings;
  fallback: DailyNoteFallbackSettings;
  wandernLayout: WandernLayoutSettings;
  spaziergangLayout: WandernLayoutSettings;
  dailyNotesFolder?: string;
};

/** Import all pending Garmin activities; remove successfully imported entries from the manifest. */
export async function importGarminPendingActivities(
  app: App,
  options: ImportGarminPendingOptions,
): Promise<number> {
  const { settings, fallback, wandernLayout, spaziergangLayout, dailyNotesFolder } = options;
  if (!settings.enabled) return 0;

  const manifestPath = settings.pendingManifestPath.trim();
  if (!manifestPath) return 0;

  const manifest = await readGarminPendingManifest(app, manifestPath);
  if (!manifest || manifest.activities.length === 0) return 0;

  const remaining: GarminPendingActivity[] = [];
  let imported = 0;

  for (const activity of manifest.activities) {
    const ok = await importGarminActivityIntoDailyNote(app, {
      activity,
      fallback,
      wandernLayout,
      spaziergangLayout,
      dailyNotesFolder,
    });
    if (ok) {
      imported += 1;
    } else {
      remaining.push(activity);
    }
  }

  if (imported > 0) {
    await writeGarminPendingManifest(app, manifestPath, { activities: remaining });
  }

  return imported;
}
