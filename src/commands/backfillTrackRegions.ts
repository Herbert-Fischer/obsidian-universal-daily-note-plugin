import type { App, TFile } from "obsidian";
import { Notice } from "obsidian";
import {
  WANDERN_ENTRY_META_PREFIX,
  parseWandernEntryMetaLine,
  wandernEntryMetaComment,
  type WandernEntryMeta,
} from "../notes/wandernComposer";
import {
  SPAZIERGANG_ENTRY_META_PREFIX,
  parseSpaziergangEntryMetaLine,
  spaziergangEntryMetaComment,
  type SpaziergangEntryMeta,
} from "../notes/spaziergangComposer";
import { enrichEntryMetaWithTrackGeo, hasTrackGeo, loadGeocodeCache, type TrackGeo } from "../tracks/gpxGeo";

export const WALK_ENTRY_META_PREFIXES = [WANDERN_ENTRY_META_PREFIX, SPAZIERGANG_ENTRY_META_PREFIX] as const;

export const NOMINATIM_BACKFILL_DELAY_MS = 1100;

export type WalkEntryMetaPatch = {
  lineIndex: number;
  meta: WandernEntryMeta | SpaziergangEntryMeta;
  prefix: typeof WANDERN_ENTRY_META_PREFIX | typeof SPAZIERGANG_ENTRY_META_PREFIX;
};

export function isWalkEntryMetaLine(line: string): boolean {
  const trimmed = line.trim().replace(/^(?:>\s*)+/, "");
  return WALK_ENTRY_META_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

export function parseWalkEntryMetaFromLine(line: string): WalkEntryMetaPatch | null {
  const wandern = parseWandernEntryMetaLine(line);
  if (wandern) {
    return { lineIndex: -1, meta: wandern, prefix: WANDERN_ENTRY_META_PREFIX };
  }
  const spaziergang = parseSpaziergangEntryMetaLine(line);
  if (spaziergang) {
    return { lineIndex: -1, meta: spaziergang, prefix: SPAZIERGANG_ENTRY_META_PREFIX };
  }
  return null;
}

export function walkEntryNeedsGeoBackfill(meta: WandernEntryMeta | SpaziergangEntryMeta): boolean {
  if (!meta.trackPath?.trim()) return false;
  return !meta.admin1?.trim() || !meta.county?.trim();
}

export function findWalkEntryMetaPatches(lines: string[]): WalkEntryMetaPatch[] {
  const patches: WalkEntryMetaPatch[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const parsed = parseWalkEntryMetaFromLine(line);
    if (!parsed) continue;
    if (!walkEntryNeedsGeoBackfill(parsed.meta)) continue;
    patches.push({ ...parsed, lineIndex: i });
  }
  return patches;
}

export function applyWalkEntryMetaPatches(
  lines: string[],
  patches: WalkEntryMetaPatch[],
): string[] {
  const next = [...lines];
  for (const patch of patches) {
    if (patch.lineIndex < 0 || patch.lineIndex >= next.length) continue;
    const prev = next[patch.lineIndex] ?? "";
    const calloutPrefix = prev.match(/^((?:>\s*)*)/)?.[1] ?? "> ";
    const comment =
      patch.prefix === WANDERN_ENTRY_META_PREFIX
        ? wandernEntryMetaComment(patch.meta as WandernEntryMeta)
        : spaziergangEntryMetaComment(patch.meta as SpaziergangEntryMeta);
    next[patch.lineIndex] = `${calloutPrefix}${comment}`;
  }
  return next;
}

function isDailyNoteFile(file: TFile, folder: string): boolean {
  if (!file.path.startsWith(`${folder}/`)) return false;
  const base = file.basename.replace(/\.md$/i, "");
  return /^\d{4}-\d{2}-\d{2}$/.test(base);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type BackfillTrackRegionsResult = {
  filesScanned: number;
  entriesUpdated: number;
  entriesSkipped: number;
};

export async function backfillTrackRegionsInFile(
  app: App,
  file: TFile,
  geoCache: Record<string, TrackGeo>,
  onNetworkRequest?: () => Promise<void>,
): Promise<{ updated: number; skipped: number; cache: Record<string, TrackGeo>; changed: boolean }> {
  const text = await app.vault.read(file);
  const lines = text.split("\n");
  const patches = findWalkEntryMetaPatches(lines);
  if (patches.length === 0) {
    return { updated: 0, skipped: 0, cache: geoCache, changed: false };
  }

  let cache = geoCache;
  const enrichedPatches: WalkEntryMetaPatch[] = [];
  let updated = 0;
  let skipped = 0;

  for (const patch of patches) {
    const { meta, cache: nextCache, fromCache } = await enrichEntryMetaWithTrackGeo(
      app,
      patch.meta,
      cache,
    );
    cache = nextCache;
    if (!fromCache && onNetworkRequest) {
      await onNetworkRequest();
    }
    if (!hasTrackGeo(meta)) {
      skipped++;
      continue;
    }
    enrichedPatches.push({ ...patch, meta });
    updated++;
  }

  if (enrichedPatches.length === 0) {
    return { updated: 0, skipped, cache, changed: false };
  }

  const nextLines = applyWalkEntryMetaPatches(lines, enrichedPatches);
  const nextText = nextLines.join("\n");
  if (nextText !== text) {
    await app.vault.modify(file, nextText);
  }
  return { updated, skipped, cache, changed: nextText !== text };
}

export async function backfillTrackRegions(
  app: App,
  dailyNotesFolder = "Calendar/Notes",
): Promise<BackfillTrackRegionsResult> {
  let geoCache = await loadGeocodeCache(app);
  let filesScanned = 0;
  let entriesUpdated = 0;
  let entriesSkipped = 0;
  let lastNetworkAt = 0;

  const onNetworkRequest = async () => {
    const elapsed = Date.now() - lastNetworkAt;
    if (elapsed < NOMINATIM_BACKFILL_DELAY_MS) {
      await sleep(NOMINATIM_BACKFILL_DELAY_MS - elapsed);
    }
    lastNetworkAt = Date.now();
  };

  for (const file of app.vault.getMarkdownFiles()) {
    if (!isDailyNoteFile(file, dailyNotesFolder)) continue;
    filesScanned++;
    const result = await backfillTrackRegionsInFile(app, file, geoCache, onNetworkRequest);
    geoCache = result.cache;
    entriesUpdated += result.updated;
    entriesSkipped += result.skipped;
  }

  return { filesScanned, entriesUpdated, entriesSkipped };
}

export async function runBackfillTrackRegionsCommand(app: App): Promise<void> {
  const notice = new Notice("Outdoor-Strecken: Region aus GPX wird nachtragen …", 0);
  try {
    const result = await backfillTrackRegions(app);
    notice.hide();
    new Notice(
      `Region nachtragen: ${result.entriesUpdated} Strecken in ${result.filesScanned} Daily Notes (${result.entriesSkipped} ohne GPX/Region).`,
      8000,
    );
  } catch (err) {
    notice.hide();
    const msg = err instanceof Error ? err.message : String(err);
    new Notice(`Region nachtragen fehlgeschlagen: ${msg}`, 10000);
    console.error("Universal Daily Note: backfillTrackRegions", err);
  }
}
