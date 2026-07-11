import type { App } from "obsidian";
import { TFile } from "obsidian";
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
  // Host cron writes pending.json outside Obsidian — adapter.read avoids stale TFile cache.
  if (await app.vault.adapter.exists(path)) {
    try {
      const raw = await app.vault.adapter.read(path);
      return parseGarminPendingManifest(raw);
    } catch {
      /* fall through to vault.read */
    }
  }
  const file = app.vault.getAbstractFileByPath(path);
  if (file instanceof TFile) {
    return parseGarminPendingManifest(await app.vault.read(file));
  }
  return null;
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

  const exists = await app.vault.adapter.exists(manifestPath);
  const manifest = await readGarminPendingManifest(app, manifestPath);
  if (!manifest) {
    console.info("Universal Daily Note: Garmin-Import — pending.json nicht lesbar", manifestPath, {
      exists,
    });
    return 0;
  }
  if (manifest.activities.length === 0) {
    console.info(
      "Universal Daily Note: Garmin-Import — keine ausstehenden Aktivitäten",
      manifestPath,
      exists ? "(Datei vorhanden, activities leer — vermutlich bereits importiert)" : "",
    );
    return 0;
  }

  console.info(
    "Universal Daily Note: Garmin-Import start",
    manifest.activities.length,
    "Aktivität(en)",
    manifestPath,
  );

  const remaining: GarminPendingActivity[] = [];
  let imported = 0;

  for (const activity of manifest.activities) {
    try {
      const ok = await importGarminActivityIntoDailyNote(app, {
        activity,
        fallback,
        wandernLayout,
        spaziergangLayout,
        dailyNotesFolder,
      });
      console.info(
        "Universal Daily Note: Garmin-Import",
        activity.garminId,
        ok ? "ok" : "übersprungen",
        activity.date,
        activity.profile,
      );
      if (ok) {
        imported += 1;
      } else {
        remaining.push(activity);
      }
    } catch (error) {
      console.error("Universal Daily Note: Garmin-Import", activity.garminId, error);
      remaining.push(activity);
    }
  }

  if (imported > 0) {
    await writeGarminPendingManifest(app, manifestPath, { activities: remaining });
  }

  return imported;
}
