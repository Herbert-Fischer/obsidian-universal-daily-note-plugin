import type { App, TFile } from "obsidian";
import type { WandernLayoutSettings } from "../settings";
import { ensureSectionHeading } from "./appendLogLine";
import { stripLeadingTimeFromKurz } from "./appendTagebuchFeedLine";
import { splitFeedEntrySuffix } from "./feedEntryDisplay";
import type { ComposerEntry } from "./dailyComposer";
import { composerEntryText } from "./dailyComposer";
import { extractSectionRange, isManagedCalloutStart } from "./journalCallout";
import { stripJournalLineForDisplay } from "./journalEntryMeta";
import { journalProfileById } from "./journalProfiles";
import { journalEntrySortMinutes, parseJournalEntryDisplay } from "./parseJournalEntryDisplay";
import { normalizeDailyNotePhotoPath, normalizeWandernTrackPath } from "./attachJournalMedia";
import { processVaultFile } from "./vaultProcess";
import {
  buildPhotoCollageMarkdownAsync,
  mergePhotoSources,
  parsePhotoCollageFromLines,
  stripPhotoEmbed,
  type PhotoCollageLayout,
} from "./photoCollage";
import type { TrackMatch } from "../tracks/gpxImport";
import { formatTrackSummary } from "../tracks/gpxImport";
import { enrichEntryMetaWithTrackGeo, loadGeocodeCache } from "../tracks/gpxGeo";
import { parseWalkEntryGeoFields, type WalkEntryGeoFields } from "./walkEntryGeo";
import { resolveWalkBeschreibung } from "./walkStatsBeschreibung";
import {
  parseSpaziergangMetaLine,
  renderSpaziergangTemplate,
  spaziergangMetaFromData,
  type SpaziergangComposerData,
} from "./spaziergangLayout";

export const SPAZIERGANG_HEADING = "Spaziergang";
/** Per-entry supplements in ## Spaziergang. */
export const SPAZIERGANG_ENTRY_META_PREFIX = "<!-- udn-spaziergang-entry:";

export type SpaziergangEntryMeta = {
  entryId: string;
  titel: string;
  kurz: string;
  beschreibung: string;
  trackPath: string;
  track: string;
  fotos?: string[];
  layout?: PhotoCollageLayout | "";
} & WalkEntryGeoFields;

export type SpaziergangSupplement = {
  titel: string;
  kurz: string;
  beschreibung: string;
  trackPath: string;
  photos: string[];
  layout?: PhotoCollageLayout | "";
};

export type SpaziergangSupplementsLoadResult = {
  supplements: Map<string, SpaziergangSupplement>;
  entryIdsWithCallout: Set<string>;
  legacyByTitle: Map<string, SpaziergangSupplement>;
};

export type SpaziergangSyncEntry = Pick<
  ComposerEntry,
  | "entryId"
  | "time"
  | "body"
  | "context"
  | "profile"
  | "supplementDetail"
  | "supplementPhotos"
  | "supplementKurz"
  | "supplementTrackPath"
>;

export function spaziergangEntryMetaComment(meta: SpaziergangEntryMeta): string {
  return `${SPAZIERGANG_ENTRY_META_PREFIX} ${JSON.stringify(meta)} -->`;
}

export function parseSpaziergangEntryMetaLine(line: string): SpaziergangEntryMeta | null {
  const trimmed = line.trim().replace(/^(?:>\s*)+/, "");
  if (!trimmed.startsWith(SPAZIERGANG_ENTRY_META_PREFIX)) return null;
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as Partial<SpaziergangEntryMeta>;
    const entryId = parsed.entryId?.trim() ?? "";
    if (!entryId) return null;
    return {
      entryId,
      titel: parsed.titel?.trim() ?? "",
      kurz: parsed.kurz?.trim() ?? "",
      beschreibung: typeof parsed.beschreibung === "string" ? parsed.beschreibung : "",
      trackPath: parsed.trackPath?.trim() ?? "",
      track: parsed.track?.trim() ?? "",
      fotos: Array.isArray(parsed.fotos) ? parsed.fotos.map((f) => stripPhotoEmbed(String(f))) : undefined,
      layout: (parsed.layout as PhotoCollageLayout | "") ?? "",
      ...parseWalkEntryGeoFields(parsed as Record<string, unknown>),
    };
  } catch {
    return null;
  }
}

function supplementFromEntryMeta(meta: SpaziergangEntryMeta): SpaziergangSupplement {
  return {
    titel: meta.titel,
    kurz: meta.kurz,
    beschreibung: meta.beschreibung,
    trackPath: meta.trackPath,
    photos: (meta.fotos ?? []).map(stripPhotoEmbed).filter(Boolean),
    layout: meta.layout,
  };
}

function supplementFromLegacyMeta(meta: ReturnType<typeof parseSpaziergangMetaLine>): SpaziergangSupplement | null {
  if (!meta) return null;
  return {
    titel: meta.titel,
    kurz: meta.kurz,
    beschreibung: meta.beschreibung,
    trackPath: meta.trackPath,
    photos: meta.fotos.map((f) => stripPhotoEmbed(f)).filter(Boolean),
    layout: meta.layout,
  };
}

function photosFromSectionLines(sectionLines: string[], metaIndex: number): string[] {
  const blockStart = findBlockStart(sectionLines, metaIndex);
  const block = sectionLines.slice(blockStart, metaIndex);
  const parsed = parsePhotoCollageFromLines(block, 0, block.length);
  return parsed.photos.map(stripPhotoEmbed).filter(Boolean);
}

function findBlockStart(sectionLines: string[], metaIndex: number): number {
  for (let i = metaIndex - 1; i >= 0; i--) {
    const trimmed = (sectionLines[i] ?? "").trim();
    if (parseSpaziergangEntryMetaLine(trimmed) || parseSpaziergangMetaLine(trimmed)) {
      return i + 1;
    }
    if (/^##\s/.test(trimmed)) return i + 1;
  }
  return 0;
}

export function parseSpaziergangSupplementsFromLines(lines: string[]): SpaziergangSupplementsLoadResult {
  const supplements = new Map<string, SpaziergangSupplement>();
  const entryIdsWithCallout = new Set<string>();
  const legacyByTitle = new Map<string, SpaziergangSupplement>();

  const range = extractSectionRange(lines, SPAZIERGANG_HEADING);
  const sectionLines = range ? lines.slice(range.start + 1, range.end) : [];

  for (let i = 0; i < sectionLines.length; i++) {
    const line = sectionLines[i] ?? "";
    const entryMeta = parseSpaziergangEntryMetaLine(line);
    if (entryMeta) {
      entryIdsWithCallout.add(entryMeta.entryId);
      let sup = supplementFromEntryMeta(entryMeta);
      const sectionPhotos = photosFromSectionLines(sectionLines, i);
      if (sectionPhotos.length > 0) {
        sup = {
          ...sup,
          photos: mergePhotoSources(
            { photos: sectionPhotos, layout: entryMeta.layout ?? "" },
            sup.photos.length > 0 ? { photos: sup.photos } : null,
          ).photos,
        };
      }
      supplements.set(entryMeta.entryId, sup);
      continue;
    }

    const legacyMeta = parseSpaziergangMetaLine(line);
    if (legacyMeta && !parseSpaziergangEntryMetaLine(line)) {
      const sup = supplementFromLegacyMeta(legacyMeta);
      if (sup) {
        const key = sup.titel.trim().toLowerCase() || "spaziergang";
        legacyByTitle.set(key, sup);
      }
    }
  }

  return { supplements, entryIdsWithCallout, legacyByTitle };
}

export async function loadSpaziergangSupplements(app: App, file: TFile): Promise<SpaziergangSupplementsLoadResult> {
  let text = "";
  try {
    text = await app.vault.read(file);
  } catch {
    text = "";
  }
  return parseSpaziergangSupplementsFromLines(text.split("\n"));
}

export function collectSpaziergangEntryIds(lines: string[]): Set<string> {
  const ids = new Set<string>();
  for (const line of lines) {
    const meta = parseSpaziergangEntryMetaLine(line);
    if (meta?.entryId) ids.add(meta.entryId);
  }
  return ids;
}

function spaziergangTitleFromText(text: string): string {
  const { lead } = splitFeedEntrySuffix(stripJournalLineForDisplay(text));
  return stripLeadingTimeFromKurz(lead).trim();
}

export function spaziergangCalloutTitle(entry: SpaziergangSyncEntry): string {
  const body = entry.body.trim();
  const parsed = parseJournalEntryDisplay(body);
  const fromBody = spaziergangTitleFromText(parsed.body.trim() || body);
  if (fromBody) return fromBody;
  const ctx = entry.context?.trim();
  if (ctx) return spaziergangTitleFromText(ctx);
  return "Spaziergang";
}

function sortSpaziergangEntries(entries: SpaziergangSyncEntry[]): SpaziergangSyncEntry[] {
  const indexed = entries.map((entry, index) => ({
    entry,
    index,
    minutes: journalEntrySortMinutes(
      composerEntryText({
        time: entry.time,
        body: entry.body,
        entryId: entry.entryId,
        profile: entry.profile,
        context: entry.context,
      }),
    ),
  }));
  indexed.sort((a, b) => {
    const am = a.minutes ?? 9999;
    const bm = b.minutes ?? 9999;
    return am - bm || a.index - b.index;
  });
  return indexed.map((item) => item.entry);
}

function trackMatchFromPath(path: string): TrackMatch | null {
  const safe = path.trim();
  if (!safe) return null;
  return {
    path: safe,
    name: safe.split("/").pop() ?? safe,
    distanceKm: null,
    durationSec: null,
    startLabel: null,
    endLabel: null,
  };
}

async function normalizeSpaziergangSyncEntry(
  app: App,
  entry: SpaziergangSyncEntry,
  date: Date,
  layout: WandernLayoutSettings,
): Promise<{ data: SpaziergangComposerData; layoutClass: PhotoCollageLayout | "" }> {
  const profile = journalProfileById("spaziergang");
  const photosFolder = layout.photosFolder?.trim() || profile?.photosFolder.trim() || "Calendar/Anhänge/Bilder";
  const tracksFolder = layout.tracksFolder?.trim() || "Calendar/Anhänge/GPX";
  const titel = spaziergangCalloutTitle(entry);

  const trackPath = entry.supplementTrackPath?.trim()
    ? await normalizeWandernTrackPath(app, entry.supplementTrackPath, titel, tracksFolder)
    : "";

  const photosRaw = (entry.supplementPhotos ?? []).map(stripPhotoEmbed).filter(Boolean);
  const photos: string[] = [];
  for (let i = 0; i < photosRaw.length; i++) {
    const p = photosRaw[i]!;
    const next = await normalizeDailyNotePhotoPath(app, p, i, date, titel, photosFolder);
    photos.push(next);
  }

  const track = trackPath ? trackMatchFromPath(trackPath) : null;
  const kurz = entry.supplementKurz?.trim() ?? "";

  const data: SpaziergangComposerData = {
    titel,
    kurz,
    beschreibung: resolveWalkBeschreibung(entry.supplementDetail ?? "", kurz, track),
    track,
    photos,
  };
  const layoutClass = (entry as any).supplementLayoutClass as PhotoCollageLayout | "" | undefined;
  return { data, layoutClass: layoutClass ?? "" };
}

function dedupeByTitle(entries: SpaziergangSyncEntry[]): SpaziergangSyncEntry[] {
  const seen = new Set<string>();
  const out: SpaziergangSyncEntry[] = [];
  for (const e of entries) {
    const key = spaziergangCalloutTitle(e).trim().toLowerCase() || e.entryId || "";
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

function entryIsSpaziergang(entry: Pick<ComposerEntry, "profile">): boolean {
  return entry.profile === "spaziergang";
}

function renderEntryBlock(lines: string[], start: number, end: number): string[] {
  const slice = lines.slice(start, end);
  while (slice.length > 0 && slice[0]?.trim() === "") slice.shift();
  while (slice.length > 0 && slice[slice.length - 1]?.trim() === "") slice.pop();
  return slice;
}

function removeOrphanCallouts(
  sectionLines: string[],
  keepEntryIds: Set<string>,
): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < sectionLines.length) {
    const line = sectionLines[i] ?? "";
    const meta = parseSpaziergangEntryMetaLine(line);
    if (!meta) {
      out.push(line);
      i++;
      continue;
    }

    const blockStart = findBlockStart(sectionLines, i);
    const block = renderEntryBlock(sectionLines, blockStart, i + 1);
    const keep = keepEntryIds.has(meta.entryId);
    if (keep) {
      out.push(...block);
    } else {
      // drop block
    }
    i++;
  }
  return out;
}

export async function renderSpaziergangSectionBody(
  app: App,
  entries: SpaziergangSyncEntry[],
  date: Date,
  layout: WandernLayoutSettings,
): Promise<string[]> {
  const sorted = sortSpaziergangEntries(dedupeByTitle(entries));
  const out: string[] = [];
  let geoCache = await loadGeocodeCache(app);

  for (const entry of sorted) {
    const { data, layoutClass } = await normalizeSpaziergangSyncEntry(app, entry, date, layout);
    const trackSummary = data.track ? formatTrackSummary(data.track) : "";
    const meta = spaziergangMetaFromData(
      data,
      data.track?.path ?? "",
      trackSummary,
      data.photos,
      layoutClass,
    );

    const { markdown: photoCollageMarkdown } = await buildPhotoCollageMarkdownAsync(
      app,
      data.photos,
      "",
    );

    out.push(
      renderSpaziergangTemplate({
        titel: data.titel,
        kurz: data.kurz,
        beschreibung: data.beschreibung,
        track: data.track,
        photos: data.photos,
        date,
        layout,
        photoCollageMarkdown,
        layoutClass,
      }),
    );
    const baseMeta: SpaziergangEntryMeta = {
      ...meta,
      entryId: entry.entryId ?? "",
      fotos: meta.fotos,
      layout: meta.layout,
    };
    const { meta: enrichedMeta, cache: nextCache } = await enrichEntryMetaWithTrackGeo(
      app,
      baseMeta,
      geoCache,
    );
    geoCache = nextCache;
    out.push(`> ${spaziergangEntryMetaComment(enrichedMeta)}`);
    out.push("");
  }

  while (out.length > 0 && out[out.length - 1]?.trim() === "") out.pop();
  return out;
}

export function mergeSpaziergangSupplementsIntoEntries(
  entries: ComposerEntry[],
  loaded: SpaziergangSupplementsLoadResult,
): ComposerEntry[] {
  return entries.map((entry) => {
    if (!entryIsSpaziergang(entry)) return entry;
    const entryId = entry.entryId?.trim();
    const ctx = entry.context?.trim();
    const key = ctx?.trim().toLowerCase() || "";
    const byId = entryId ? loaded.supplements.get(entryId) : undefined;
    const byTitle = !byId && key ? loaded.legacyByTitle.get(key) : undefined;
    const sup = byId ?? byTitle;
    if (!sup) return entry;
    return {
      ...entry,
      supplementKurz: sup.kurz,
      supplementDetail: resolveWalkBeschreibung(sup.beschreibung, sup.kurz, trackMatchFromPath(sup.trackPath)),
      supplementTrackPath: sup.trackPath,
      supplementPhotos: sup.photos,
      calloutId: entryId || entry.calloutId,
    };
  });
}

export function spaziergangContextByEntryId(lines: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of lines) {
    const meta = parseSpaziergangEntryMetaLine(line);
    if (!meta?.entryId) continue;
    if (meta.titel?.trim()) map.set(meta.entryId, meta.titel.trim());
  }
  return map;
}

export function spaziergangSupplementMatchesByTitle(lines: string[]): Map<string, { entryId: string; titel: string }> {
  const out = new Map<string, { entryId: string; titel: string }>();
  const range = extractSectionRange(lines, SPAZIERGANG_HEADING);
  const sectionLines = range ? lines.slice(range.start + 1, range.end) : [];
  for (const line of sectionLines) {
    const meta = parseSpaziergangEntryMetaLine(line);
    if (!meta?.entryId) continue;
    const key = meta.titel?.trim().toLowerCase();
    if (!key) continue;
    out.set(key, { entryId: meta.entryId, titel: meta.titel.trim() });
  }
  return out;
}

function replaceSpaziergangSectionBody(
  lines: string[],
  bodyLines: string[],
  entryIds: Set<string>,
): string[] {
  const range = extractSectionRange(lines, SPAZIERGANG_HEADING);
  if (!range) {
    if (bodyLines.length === 0) return lines;
    const next = [...lines];
    if (next.length > 0 && next[next.length - 1] !== "") next.push("");
    next.push(`## ${SPAZIERGANG_HEADING}`, "");
    next.push(...bodyLines);
    return next;
  }
  if (bodyLines.length === 0) {
    return [...lines.slice(0, range.start), ...lines.slice(range.end)];
  }

  const existingSection = lines.slice(range.start + 1, range.end);
  const cleanedExisting = removeOrphanCallouts(existingSection, entryIds);
  const managedStart = cleanedExisting.findIndex((l) => isManagedCalloutStart(l, SPAZIERGANG_HEADING));
  const preserved = managedStart >= 0 ? cleanedExisting.slice(0, managedStart) : [];

  return [
    ...lines.slice(0, range.start + 1),
    ...preserved,
    ...(preserved.length > 0 ? [""] : []),
    ...bodyLines,
    ...lines.slice(range.end),
  ];
}

export async function syncSpaziergangSupplements(
  app: App,
  file: TFile,
  entries: ComposerEntry[],
  date: Date,
  layout: WandernLayoutSettings,
): Promise<boolean> {
  const spaziergangEntries = entries
    .filter((entry) => entryIsSpaziergang(entry) && entry.entryId?.trim())
    .map((entry) => ({
      entryId: entry.entryId,
      time: entry.time,
      body: entry.body,
      context: entry.context,
      profile: entry.profile,
      supplementDetail: entry.supplementDetail,
      supplementPhotos: entry.supplementPhotos,
      supplementKurz: entry.supplementKurz,
      supplementTrackPath: entry.supplementTrackPath,
      reiseAssignment: entry.reiseAssignment,
    })) as SpaziergangSyncEntry[];
  const entryIds = new Set(spaziergangEntries.map((e) => e.entryId!));
  const profile = journalProfileById("spaziergang");
  if (!profile) return false;

  const nextBody =
    spaziergangEntries.length > 0
      ? await renderSpaziergangSectionBody(app, spaziergangEntries, date, layout)
      : [];

  await processVaultFile(app, file, (raw) => {
    let lines = raw.split("\n");
    if (nextBody.length > 0) {
      lines = ensureSectionHeading(lines, SPAZIERGANG_HEADING);
    }
    lines = replaceSpaziergangSectionBody(lines, nextBody, entryIds);
    const content = lines.join("\n");
    return content.endsWith("\n") || content.length === 0 ? content : `${content}\n`;
  });

  // Mark meta cache
  try {
    app.metadataCache?.trigger("changed", file);
  } catch {
    // ignore
  }
  return true;
}

