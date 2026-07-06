import type { App, TFile } from "obsidian";
import type { FeedDetailLayoutSettings } from "../settings";
import { normalizeDailyNotePhotoPath, DEFAULT_DAILY_PHOTOS_FOLDER } from "./attachJournalMedia";
import { ensureSectionHeading } from "./appendLogLine";
import { stripLeadingTimeFromKurz } from "./appendTagebuchFeedLine";
import type { ComposerEntry } from "./dailyComposer";
import { composerEntryText } from "./dailyComposer";
import {
  extractSectionRange,
  formatManagedCalloutTitleLine,
  isManagedCalloutStart,
} from "./journalCallout";
import { journalProfileById } from "./journalProfiles";
import { journalEntrySortMinutes, parseJournalEntryDisplay } from "./parseJournalEntryDisplay";
import {
  buildPhotoCollageMarkdownAsync,
  mergePhotoSources,
  nestedGalleryPrefixForCallout,
  parsePhotoCollageFromLines,
  photoEmbeds,
  stripPhotoEmbed,
  type PhotoCollageLayout,
} from "./photoCollage";
import { detailToCalloutProseLines, stripCalloutPrefixRaw } from "./calloutProse";
import { processVaultFile } from "./vaultProcess";

export const HEIZUNG_HEADING = "Heizung";
/** Per-entry supplements in ## Heizung (distinct from legacy `<!-- udn-heizung:` day detail meta). */
export const HEIZUNG_ENTRY_META_PREFIX = "<!-- udn-heizung-entry:";

export type HeizungMeta = {
  entryId: string;
  vorfall: string;
  detail: string;
  fotos?: string[];
  layout?: PhotoCollageLayout | "";
};

export type HeizungSupplement = {
  vorfall: string;
  detail: string;
  photos: string[];
};

export type HeizungSupplementsLoadResult = {
  supplements: Map<string, HeizungSupplement>;
  entryIdsWithCallout: Set<string>;
};

export type HeizungSyncEntry = Pick<
  ComposerEntry,
  "entryId" | "time" | "body" | "context" | "profile" | "supplementDetail" | "supplementPhotos"
>;

export function heizungMetaComment(meta: HeizungMeta): string {
  return `${HEIZUNG_ENTRY_META_PREFIX} ${JSON.stringify(meta)} -->`;
}

export function parseHeizungMetaLine(line: string): HeizungMeta | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith(HEIZUNG_ENTRY_META_PREFIX)) return null;
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as Partial<HeizungMeta>;
    const entryId = parsed.entryId?.trim() ?? "";
    if (!entryId) return null;
    return {
      entryId,
      vorfall: parsed.vorfall?.trim() ?? "",
      detail: typeof parsed.detail === "string" ? parsed.detail : "",
      fotos: Array.isArray(parsed.fotos) ? parsed.fotos.map((f) => stripPhotoEmbed(String(f))) : undefined,
      layout: (parsed.layout as PhotoCollageLayout | "") ?? "",
    };
  } catch {
    return null;
  }
}

function stripCalloutPrefix(line: string): string {
  return stripCalloutPrefixRaw(line);
}

function parseHeizungCalloutContent(
  sectionLines: string[],
  titleLineIndex: number,
): { detail: string; photos: string[]; layout: PhotoCollageLayout | "" } {
  let end = sectionLines.length;
  for (let i = titleLineIndex + 1; i < sectionLines.length; i++) {
    const line = sectionLines[i] ?? "";
    const trimmed = line.trim();
    if (parseHeizungMetaLine(trimmed) || isManagedCalloutStart(line, HEIZUNG_HEADING)) {
      end = i;
      break;
    }
  }

  const blockLines = sectionLines.slice(titleLineIndex + 1, end);
  const parsed = parsePhotoCollageFromLines(blockLines, 0, blockLines.length);
  const prose: string[] = [];
  for (const line of blockLines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(">")) continue;
    const inner = stripCalloutPrefix(line);
    if (/^\[!blank-container[^\]]*gallery/i.test(inner.trim())) continue;
    if (/^!\[\[/.test(inner) && !inner.trim().startsWith("[!")) continue;
    prose.push(inner);
  }
  return { detail: prose.join("\n"), photos: parsed.photos, layout: parsed.layout };
}

export function buildHeizungCalloutBlock(title: string, detail: string, photoLines: string[] = []): string {
  const titel = title.trim() || "Heizung";
  const lines = [formatManagedCalloutTitleLine(HEIZUNG_HEADING, titel)];
  const proseLines = detailToCalloutProseLines(detail);
  if (proseLines.length > 0) {
    lines.push(...proseLines);
  }
  if (photoLines.length > 0) {
    lines.push(...photoLines);
  }
  if (proseLines.length === 0 && photoLines.length === 0) {
    lines.push(">");
  }
  lines.push("");
  return lines.join("\n");
}

export async function buildHeizungCalloutBlockAsync(
  app: App,
  title: string,
  detail: string,
  photos: string[],
): Promise<string> {
  const photoLines =
    photos.length > 0
      ? (await buildPhotoCollageMarkdownAsync(app, photos, nestedGalleryPrefixForCallout("> ")))
          .markdown.split("\n")
          .filter(Boolean)
      : [];
  return buildHeizungCalloutBlock(title, detail, photoLines);
}

export function heizungCalloutTitle(entry: HeizungSyncEntry): string {
  const body = entry.body.trim();
  const parsed = parseJournalEntryDisplay(body);
  const text = stripLeadingTimeFromKurz(parsed.body.trim() || body);
  return text || "Heizung";
}

function sortHeizungEntries(entries: HeizungSyncEntry[]): HeizungSyncEntry[] {
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

export async function renderHeizungSectionBody(
  app: App,
  entries: HeizungSyncEntry[],
): Promise<string[]> {
  const heizungEntries = entries.filter((e) => e.profile === "heizung" && e.entryId?.trim());
  if (heizungEntries.length === 0) return [];

  const out: string[] = [];
  for (const entry of sortHeizungEntries(heizungEntries)) {
    const title = heizungCalloutTitle(entry);
    const detail = entry.supplementDetail ?? "";
    const photos = (entry.supplementPhotos ?? []).map(stripPhotoEmbed).filter(Boolean);
    out.push(
      ...(await buildHeizungCalloutBlockAsync(app, title, detail, photos)).split("\n"),
    );
    out.push(
      heizungMetaComment({
        entryId: entry.entryId!,
        vorfall: entry.context?.trim() ?? "",
        detail,
        ...(photos.length > 0 ? { fotos: photoEmbeds(photos) } : {}),
      }),
    );
    out.push("");
  }
  return out;
}

export function parseHeizungSupplementsFromLines(lines: string[]): HeizungSupplementsLoadResult {
  const supplements = new Map<string, HeizungSupplement>();
  const entryIdsWithCallout = new Set<string>();

  const range = extractSectionRange(lines, HEIZUNG_HEADING);
  const sectionLines = range ? lines.slice(range.start + 1, range.end) : [];

  for (let i = 0; i < sectionLines.length; i++) {
    const line = sectionLines[i] ?? "";
    const meta = parseHeizungMetaLine(line);
    if (!meta) continue;
    entryIdsWithCallout.add(meta.entryId);

    let detail = meta.detail;
    let photos = (meta.fotos ?? []).map(stripPhotoEmbed).filter(Boolean);
    for (let j = i - 1; j >= 0; j--) {
      if (isManagedCalloutStart(sectionLines[j] ?? "", HEIZUNG_HEADING)) {
        const parsed = parseHeizungCalloutContent(sectionLines, j);
        if (!detail) detail = parsed.detail;
        photos = mergePhotoSources(
          { photos: parsed.photos, layout: parsed.layout },
          photos.length > 0 ? { photos } : null,
        ).photos;
        break;
      }
    }

    supplements.set(meta.entryId, { vorfall: meta.vorfall, detail, photos });
  }

  return { supplements, entryIdsWithCallout };
}

export async function loadHeizungSupplements(app: App, file: TFile): Promise<HeizungSupplementsLoadResult> {
  let text = "";
  try {
    text = await app.vault.read(file);
  } catch {
    text = "";
  }
  return parseHeizungSupplementsFromLines(text.split("\n"));
}

export function collectHeizungEntryIds(lines: string[]): Set<string> {
  const ids = new Set<string>();
  for (const line of lines) {
    const meta = parseHeizungMetaLine(line);
    if (meta?.entryId) ids.add(meta.entryId);
  }
  return ids;
}

export type HeizungSupplementTitleMatch = {
  entryId: string;
  vorfall: string;
};

/** Map ## Heizung callout titles to udn-heizung-entry ids (fallback when Tagebuch bullets lost udn-entry). */
export function heizungSupplementMatchesByTitle(lines: string[]): Map<string, HeizungSupplementTitleMatch> {
  const map = new Map<string, HeizungSupplementTitleMatch>();
  const range = extractSectionRange(lines, HEIZUNG_HEADING);
  if (!range) return map;

  const section = lines.slice(range.start + 1, range.end);
  for (let i = 0; i < section.length; i++) {
    const line = section[i] ?? "";
    if (!isManagedCalloutStart(line, HEIZUNG_HEADING)) continue;
    const title = parseHeizungCalloutBody(line).trim().toLowerCase();
    if (!title) continue;

    for (let j = i + 1; j < section.length; j++) {
      const next = section[j] ?? "";
      const meta = parseHeizungMetaLine(next);
      if (meta?.entryId) {
        map.set(title, { entryId: meta.entryId, vorfall: meta.vorfall.trim() });
        break;
      }
      if (isManagedCalloutStart(next, HEIZUNG_HEADING)) break;
    }
  }
  return map;
}

function parseHeizungCalloutBody(line: string): string {
  const trimmed = line.trim();
  const m = trimmed.match(/^>\s*\[!([^\]|]+)(?:\|([^\]]*))?\]([+-])?\s*(.*)$/);
  if (!m) return "";
  return (m[2]?.trim() || (m[4]?.trim() ?? "").replace(/^[+-]\s*/, "").trim());
}

function replaceHeizungSectionBody(lines: string[], bodyLines: string[]): string[] {
  const range = extractSectionRange(lines, HEIZUNG_HEADING);
  if (!range) {
    if (bodyLines.length === 0) return lines;
    const next = [...lines];
    if (next.length > 0 && next[next.length - 1] !== "") next.push("");
    next.push(`## ${HEIZUNG_HEADING}`, "");
    next.push(...bodyLines);
    return next;
  }
  if (bodyLines.length === 0) {
    return [...lines.slice(0, range.start), ...lines.slice(range.end)];
  }
  return [...lines.slice(0, range.start + 1), ...bodyLines, ...lines.slice(range.end)];
}

export async function syncHeizungSupplements(
  app: App,
  file: TFile,
  entries: ComposerEntry[],
  date: Date,
  layout: FeedDetailLayoutSettings,
): Promise<boolean> {
  const profile = journalProfileById("heizung");
  const photosFolder = profile?.photosFolder.trim() || DEFAULT_DAILY_PHOTOS_FOLDER;
  const maxPhotos = Math.max(1, layout.maxPhotos ?? profile?.maxPhotos ?? 6);

  const syncEntries: HeizungSyncEntry[] = [];
  for (const e of entries.filter((entry) => entry.profile === "heizung" && entry.entryId?.trim())) {
    const title = heizungCalloutTitle(e);
    const normalizedPhotos: string[] = [];
    for (let i = 0; i < Math.min(e.supplementPhotos?.length ?? 0, maxPhotos); i++) {
      const path = await normalizeDailyNotePhotoPath(
        app,
        stripPhotoEmbed(e.supplementPhotos![i]!),
        i,
        date,
        title,
        photosFolder,
      );
      normalizedPhotos.push(path);
    }
    syncEntries.push({
      entryId: e.entryId,
      time: e.time,
      body: e.body,
      context: e.context,
      profile: e.profile,
      supplementDetail: e.supplementDetail,
      supplementPhotos: normalizedPhotos,
    });
  }

  const bodyLines = await renderHeizungSectionBody(app, syncEntries);

  await processVaultFile(app, file, (raw) => {
    let lines = raw.split("\n");
    if (bodyLines.length > 0) {
      lines = ensureSectionHeading(lines, HEIZUNG_HEADING);
    }
    lines = replaceHeizungSectionBody(lines, bodyLines);
    const content = lines.join("\n");
    return content.endsWith("\n") || content.length === 0 ? content : `${content}\n`;
  });

  return true;
}

export function mergeHeizungSupplementsIntoEntries(
  entries: ComposerEntry[],
  loaded: HeizungSupplementsLoadResult,
): ComposerEntry[] {
  return entries.map((entry) => {
    if (entry.profile !== "heizung" || !entry.entryId) return entry;
    const sup = loaded.supplements.get(entry.entryId);
    if (!sup) return entry;
    const hasCallout = loaded.entryIdsWithCallout.has(entry.entryId);
    return {
      ...entry,
      supplementDetail: sup.detail,
      supplementPhotos: sup.photos.length > 0 ? sup.photos : entry.supplementPhotos,
      context: entry.context?.trim() || sup.vorfall || entry.context,
      calloutId: hasCallout ? entry.entryId : entry.calloutId,
    };
  });
}

export function heizungContextByEntryId(lines: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of lines) {
    const meta = parseHeizungMetaLine(line);
    if (meta?.entryId && meta.vorfall.trim()) map.set(meta.entryId, meta.vorfall.trim());
  }
  return map;
}
