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
  parseWandernMetaLine,
  renderWandernTemplate,
  wandernMetaFromData,
  type WandernComposerData,
} from "./wandernLayout";

export const WANDERN_HEADING = "Wandern";
/** Per-entry supplements in ## Wandern (distinct from legacy day-level `<!-- udn-wandern:`). */
export const WANDERN_ENTRY_META_PREFIX = "<!-- udn-wandern-entry:";

export type WandernEntryMeta = {
  entryId: string;
  titel: string;
  kurz: string;
  beschreibung: string;
  trackPath: string;
  track: string;
  fotos?: string[];
  layout?: PhotoCollageLayout | "";
} & WalkEntryGeoFields;

export type WandernSupplement = {
  titel: string;
  kurz: string;
  beschreibung: string;
  trackPath: string;
  photos: string[];
  layout?: PhotoCollageLayout | "";
};

export type WandernSupplementsLoadResult = {
  supplements: Map<string, WandernSupplement>;
  entryIdsWithCallout: Set<string>;
  /** Legacy single-block meta without entryId (key = titel lower). */
  legacyByTitle: Map<string, WandernSupplement>;
};

export type WandernSyncEntry = Pick<
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

export function wandernEntryMetaComment(meta: WandernEntryMeta): string {
  return `${WANDERN_ENTRY_META_PREFIX} ${JSON.stringify(meta)} -->`;
}

export function parseWandernEntryMetaLine(line: string): WandernEntryMeta | null {
  const trimmed = line.trim().replace(/^(?:>\s*)+/, "");
  if (!trimmed.startsWith(WANDERN_ENTRY_META_PREFIX)) return null;
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as Partial<WandernEntryMeta>;
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

function supplementFromEntryMeta(meta: WandernEntryMeta): WandernSupplement {
  return {
    titel: meta.titel,
    kurz: meta.kurz,
    beschreibung: meta.beschreibung,
    trackPath: meta.trackPath,
    photos: (meta.fotos ?? []).map(stripPhotoEmbed).filter(Boolean),
    layout: meta.layout,
  };
}

function supplementFromLegacyMeta(meta: ReturnType<typeof parseWandernMetaLine>): WandernSupplement | null {
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
    if (parseWandernEntryMetaLine(trimmed) || parseWandernMetaLine(trimmed)) {
      return i + 1;
    }
    if (/^##\s/.test(trimmed)) return i + 1;
  }
  return 0;
}

export function parseWandernSupplementsFromLines(lines: string[]): WandernSupplementsLoadResult {
  const supplements = new Map<string, WandernSupplement>();
  const entryIdsWithCallout = new Set<string>();
  const legacyByTitle = new Map<string, WandernSupplement>();

  const range = extractSectionRange(lines, WANDERN_HEADING);
  const sectionLines = range ? lines.slice(range.start + 1, range.end) : [];

  for (let i = 0; i < sectionLines.length; i++) {
    const line = sectionLines[i] ?? "";
    const entryMeta = parseWandernEntryMetaLine(line);
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

    const legacyMeta = parseWandernMetaLine(line);
    if (legacyMeta && !parseWandernEntryMetaLine(line)) {
      const sup = supplementFromLegacyMeta(legacyMeta);
      if (sup) {
        const key = sup.titel.trim().toLowerCase() || "wandern";
        legacyByTitle.set(key, sup);
      }
    }
  }

  return { supplements, entryIdsWithCallout, legacyByTitle };
}

export async function loadWandernSupplements(app: App, file: TFile): Promise<WandernSupplementsLoadResult> {
  let text = "";
  try {
    text = await app.vault.read(file);
  } catch {
    text = "";
  }
  return parseWandernSupplementsFromLines(text.split("\n"));
}

export function collectWandernEntryIds(lines: string[]): Set<string> {
  const ids = new Set<string>();
  for (const line of lines) {
    const meta = parseWandernEntryMetaLine(line);
    if (meta?.entryId) ids.add(meta.entryId);
  }
  return ids;
}

function wandernTitleFromText(text: string): string {
  const { lead } = splitFeedEntrySuffix(stripJournalLineForDisplay(text));
  return stripLeadingTimeFromKurz(lead).trim();
}

export function wandernCalloutTitle(entry: WandernSyncEntry): string {
  const body = entry.body.trim();
  const parsed = parseJournalEntryDisplay(body);
  const fromBody = wandernTitleFromText(parsed.body.trim() || body);
  if (fromBody) return fromBody;
  const ctx = entry.context?.trim();
  if (ctx) return wandernTitleFromText(ctx);
  return "Wandern";
}

function sortWandernEntries(entries: WandernSyncEntry[]): WandernSyncEntry[] {
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

async function normalizeWandernSyncEntry(
  app: App,
  entry: WandernSyncEntry,
  date: Date,
  layout: WandernLayoutSettings,
): Promise<{ data: WandernComposerData; layoutClass: PhotoCollageLayout | "" }> {
  const profile = journalProfileById("wandern");
  const photosFolder = layout.photosFolder?.trim() || profile?.photosFolder.trim() || "Calendar/Anhänge/Bilder";
  const tracksFolder = layout.tracksFolder?.trim() || "Calendar/Anhänge/GPX";
  const maxPhotos = Math.max(1, layout.maxPhotos ?? profile?.maxPhotos ?? 3);
  const titel = wandernCalloutTitle(entry);

  const normalizedPhotos: string[] = [];
  for (let i = 0; i < Math.min(entry.supplementPhotos?.length ?? 0, maxPhotos); i++) {
    const path = await normalizeDailyNotePhotoPath(
      app,
      stripPhotoEmbed(entry.supplementPhotos![i]!),
      i,
      date,
      titel,
      photosFolder,
    );
    normalizedPhotos.push(path);
  }

  let track = trackMatchFromPath(entry.supplementTrackPath ?? "");
  if (track?.path) {
    const trackPath = await normalizeWandernTrackPath(app, track.path, titel, tracksFolder);
    track = { ...track, path: trackPath, name: trackPath.split("/").pop() ?? trackPath };
  }

  const data: WandernComposerData = {
    titel,
    kurz: entry.supplementKurz?.trim() ?? "",
    beschreibung: resolveWalkBeschreibung(
      entry.supplementDetail?.trim() ?? "",
      entry.supplementKurz?.trim() ?? "",
      track,
    ),
    track,
    photos: normalizedPhotos,
  };

  const { layout: layoutClass } = await buildPhotoCollageMarkdownAsync(
    app,
    data.photos,
    "",
  );

  return { data, layoutClass: layoutClass as PhotoCollageLayout | "" };
}

export async function renderWandernSectionBody(
  app: App,
  entries: WandernSyncEntry[],
  date: Date,
  layout: WandernLayoutSettings,
): Promise<string[]> {
  const wandernEntries = entries.filter((e) => e.profile === "wandern" && e.entryId?.trim());
  if (wandernEntries.length === 0) return [];

  const out: string[] = [];
  let geoCache = await loadGeocodeCache(app);
  for (const entry of sortWandernEntries(wandernEntries)) {
    const { data, layoutClass } = await normalizeWandernSyncEntry(app, entry, date, layout);
    const template = layout.template.trim();
    const { markdown: photoCollageMarkdown } = await buildPhotoCollageMarkdownAsync(
      app,
      data.photos,
      "",
    );
    const rendered = renderWandernTemplate({
      titel: data.titel,
      kurz: data.kurz,
      beschreibung: data.beschreibung,
      track: data.track,
      photos: data.photos,
      date,
      layout,
      photoCollageMarkdown,
      layoutClass,
    });
    out.push(...rendered.split("\n"));
    const legacyMeta = wandernMetaFromData(data, layoutClass);
    const baseMeta: WandernEntryMeta = {
      entryId: entry.entryId!,
      titel: data.titel,
      kurz: data.kurz,
      beschreibung: data.beschreibung,
      trackPath: data.track?.path ?? "",
      track: data.track ? formatTrackSummary(data.track) : "",
      fotos: legacyMeta.fotos,
      layout: layoutClass,
    };
    const { meta: enrichedMeta, cache: nextCache } = await enrichEntryMetaWithTrackGeo(
      app,
      baseMeta,
      geoCache,
    );
    geoCache = nextCache;
    out.push(`> ${wandernEntryMetaComment(enrichedMeta)}`);
    out.push("");
  }
  return out;
}

function replaceWandernSectionBody(lines: string[], bodyLines: string[]): string[] {
  const range = extractSectionRange(lines, WANDERN_HEADING);
  if (!range) {
    if (bodyLines.length === 0) return lines;
    const next = [...lines];
    if (next.length > 0 && next[next.length - 1] !== "") next.push("");
    next.push(`## ${WANDERN_HEADING}`, "");
    next.push(...bodyLines);
    return next;
  }
  if (bodyLines.length === 0) {
    return [...lines.slice(0, range.start), ...lines.slice(range.end)];
  }
  return [...lines.slice(0, range.start + 1), ...bodyLines, ...lines.slice(range.end)];
}

function wandernEntryRichness(entry: WandernSyncEntry): number {
  let score = 0;
  if (entry.supplementDetail?.trim()) score += 4;
  if (entry.supplementTrackPath?.trim()) score += 3;
  if ((entry.supplementPhotos?.length ?? 0) > 0) score += 2;
  if (entry.supplementKurz?.trim()) score += 1;
  return score;
}

function dedupeWandernSyncEntries(entries: WandernSyncEntry[]): WandernSyncEntry[] {
  const byTitle = new Map<string, WandernSyncEntry>();
  for (const entry of sortWandernEntries(entries)) {
    const key = wandernCalloutTitle(entry).trim().toLowerCase();
    const prev = byTitle.get(key);
    if (!prev || wandernEntryRichness(entry) >= wandernEntryRichness(prev)) {
      byTitle.set(key, entry);
    }
  }
  return sortWandernEntries([...byTitle.values()]);
}

export async function syncWandernSupplements(
  app: App,
  file: TFile,
  entries: ComposerEntry[],
  date: Date,
  layout: WandernLayoutSettings,
): Promise<boolean> {
  const syncEntries = dedupeWandernSyncEntries(
    entries
      .filter((e) => e.profile === "wandern" && e.entryId?.trim())
      .map((e) => ({
        entryId: e.entryId,
        time: e.time,
        body: e.body,
        context: e.context,
        profile: e.profile,
        supplementDetail: e.supplementDetail,
        supplementPhotos: e.supplementPhotos,
        supplementKurz: e.supplementKurz,
        supplementTrackPath: e.supplementTrackPath,
      })),
  );

  const bodyLines = await renderWandernSectionBody(app, syncEntries, date, layout);

  await processVaultFile(app, file, (raw) => {
    let lines = raw.split("\n");
    if (bodyLines.length > 0) {
      lines = ensureSectionHeading(lines, WANDERN_HEADING);
    }
    lines = replaceWandernSectionBody(lines, bodyLines);
    const content = lines.join("\n");
    return content.endsWith("\n") || content.length === 0 ? content : `${content}\n`;
  });

  return true;
}

export function mergeWandernSupplementsIntoEntries(
  entries: ComposerEntry[],
  loaded: WandernSupplementsLoadResult,
): ComposerEntry[] {
  const legacyUsed = new Set<string>();
  return entries.map((entry) => {
    if (entry.profile !== "wandern" || !entry.entryId) return entry;

    const sup = loaded.supplements.get(entry.entryId);
    if (sup) {
      const hasCallout = loaded.entryIdsWithCallout.has(entry.entryId);
      return {
        ...entry,
        supplementKurz: sup.kurz || entry.supplementKurz,
        supplementDetail: resolveWalkBeschreibung(
          sup.beschreibung,
          sup.kurz || entry.supplementKurz || "",
          trackMatchFromPath(sup.trackPath),
        ) || entry.supplementDetail,
        supplementPhotos: sup.photos.length > 0 ? sup.photos : entry.supplementPhotos,
        supplementTrackPath: sup.trackPath || entry.supplementTrackPath,
        context: entry.context?.trim() || (sup.titel.toLowerCase() !== "wandern" ? sup.titel : entry.context),
        calloutId: hasCallout ? entry.entryId : entry.calloutId,
      };
    }

    const ctxKey = (entry.context ?? "").trim().toLowerCase();
    const titleKey = ctxKey || "wandern";
    const legacy = loaded.legacyByTitle.get(titleKey) ?? loaded.legacyByTitle.get("wandern");
    if (legacy && !legacyUsed.has(titleKey)) {
      legacyUsed.add(titleKey);
      return {
        ...entry,
        supplementKurz: legacy.kurz || entry.supplementKurz,
        supplementDetail: resolveWalkBeschreibung(
          legacy.beschreibung,
          legacy.kurz || entry.supplementKurz || "",
          trackMatchFromPath(legacy.trackPath),
        ) || entry.supplementDetail,
        supplementPhotos: legacy.photos.length > 0 ? legacy.photos : entry.supplementPhotos,
        supplementTrackPath: legacy.trackPath || entry.supplementTrackPath,
        context: entry.context?.trim() || (legacy.titel.toLowerCase() !== "wandern" ? legacy.titel : entry.context),
      };
    }

    return entry;
  });
}

export function wandernContextByEntryId(lines: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of lines) {
    const meta = parseWandernEntryMetaLine(line);
    if (meta?.entryId && meta.titel.trim()) {
      map.set(meta.entryId, meta.titel.trim());
    }
  }
  return map;
}

export type WandernSupplementTitleMatch = {
  entryId: string;
  titel: string;
};

function parseWandernCalloutTitle(line: string): string {
  const trimmed = line.trim().replace(/^(?:>\s*)+/, "");
  const mountain = trimmed.match(/^\[!mountain[^\]]*\]\+?\s*(.+)$/i);
  if (mountain?.[1]?.trim()) return mountain[1].trim();
  const generic = trimmed.match(/^\[!([^\]|]+)(?:\|[^\]]*)?\]\+?\s*(.+)$/i);
  return generic?.[2]?.trim() ?? "";
}

/** Map ## Wandern callout titles to udn-wandern-entry ids (fallback when Tagebuch bullets lost udn-entry). */
export function wandernSupplementMatchesByTitle(lines: string[]): Map<string, WandernSupplementTitleMatch> {
  const map = new Map<string, WandernSupplementTitleMatch>();
  const range = extractSectionRange(lines, WANDERN_HEADING);
  if (!range) return map;

  const section = lines.slice(range.start + 1, range.end);
  for (let i = 0; i < section.length; i++) {
    const line = section[i] ?? "";
    if (!isManagedCalloutStart(line, WANDERN_HEADING)) continue;
    const title = parseWandernCalloutTitle(line).trim().toLowerCase();
    if (!title) continue;

    for (let j = i + 1; j < section.length; j++) {
      const next = section[j] ?? "";
      const meta = parseWandernEntryMetaLine(next);
      if (meta?.entryId) {
        map.set(title, { entryId: meta.entryId, titel: meta.titel.trim() });
        break;
      }
      if (isManagedCalloutStart(next, WANDERN_HEADING)) break;
    }
  }
  return map;
}
