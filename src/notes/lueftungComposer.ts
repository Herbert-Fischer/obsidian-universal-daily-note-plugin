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

export const LUEFTUNG_HEADING = "Lüftung";
/** Per-entry supplements in ## Lüftung (distinct from legacy `<!-- udn-lueftung:` day detail meta). */
export const LUEFTUNG_ENTRY_META_PREFIX = "<!-- udn-lueftung-entry:";

export type LueftungMeta = {
  entryId: string;
  wartung: string;
  detail: string;
  fotos?: string[];
  layout?: PhotoCollageLayout | "";
};

export type LueftungSupplement = {
  wartung: string;
  detail: string;
  photos: string[];
};

export type LueftungSupplementsLoadResult = {
  supplements: Map<string, LueftungSupplement>;
  entryIdsWithCallout: Set<string>;
};

export type LueftungSyncEntry = Pick<
  ComposerEntry,
  "entryId" | "time" | "body" | "context" | "profile" | "supplementDetail" | "supplementPhotos"
>;

export function lueftungMetaComment(meta: LueftungMeta): string {
  return `${LUEFTUNG_ENTRY_META_PREFIX} ${JSON.stringify(meta)} -->`;
}

export function parseLueftungMetaLine(line: string): LueftungMeta | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith(LUEFTUNG_ENTRY_META_PREFIX)) return null;
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as Partial<LueftungMeta>;
    const entryId = parsed.entryId?.trim() ?? "";
    if (!entryId) return null;
    return {
      entryId,
      wartung: parsed.wartung?.trim() ?? "",
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

function parseLueftungCalloutContent(
  sectionLines: string[],
  titleLineIndex: number,
): { detail: string; photos: string[]; layout: PhotoCollageLayout | "" } {
  let end = sectionLines.length;
  for (let i = titleLineIndex + 1; i < sectionLines.length; i++) {
    const line = sectionLines[i] ?? "";
    const trimmed = line.trim();
    if (parseLueftungMetaLine(trimmed) || isManagedCalloutStart(line, LUEFTUNG_HEADING)) {
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

export function buildLueftungCalloutBlock(title: string, detail: string, photoLines: string[] = []): string {
  const titel = title.trim() || "Lüftung";
  const lines = [formatManagedCalloutTitleLine(LUEFTUNG_HEADING, titel)];
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

export async function buildLueftungCalloutBlockAsync(
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
  return buildLueftungCalloutBlock(title, detail, photoLines);
}

export function lueftungCalloutTitle(entry: LueftungSyncEntry): string {
  const body = entry.body.trim();
  const parsed = parseJournalEntryDisplay(body);
  const text = stripLeadingTimeFromKurz(parsed.body.trim() || body);
  return text || "Lüftung";
}

function sortLueftungEntries(entries: LueftungSyncEntry[]): LueftungSyncEntry[] {
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

export async function renderLueftungSectionBody(
  app: App,
  entries: LueftungSyncEntry[],
): Promise<string[]> {
  const lueftungEntries = entries.filter((e) => e.profile === "lueftung" && e.entryId?.trim());
  if (lueftungEntries.length === 0) return [];

  const out: string[] = [];
  for (const entry of sortLueftungEntries(lueftungEntries)) {
    const title = lueftungCalloutTitle(entry);
    const detail = entry.supplementDetail ?? "";
    const photos = (entry.supplementPhotos ?? []).map(stripPhotoEmbed).filter(Boolean);
    out.push(
      ...(await buildLueftungCalloutBlockAsync(app, title, detail, photos)).split("\n"),
    );
    out.push(
      lueftungMetaComment({
        entryId: entry.entryId!,
        wartung: entry.context?.trim() ?? "",
        detail,
        ...(photos.length > 0 ? { fotos: photoEmbeds(photos) } : {}),
      }),
    );
    out.push("");
  }
  return out;
}

export function parseLueftungSupplementsFromLines(lines: string[]): LueftungSupplementsLoadResult {
  const supplements = new Map<string, LueftungSupplement>();
  const entryIdsWithCallout = new Set<string>();

  const range = extractSectionRange(lines, LUEFTUNG_HEADING);
  const sectionLines = range ? lines.slice(range.start + 1, range.end) : [];

  for (let i = 0; i < sectionLines.length; i++) {
    const line = sectionLines[i] ?? "";
    const meta = parseLueftungMetaLine(line);
    if (!meta) continue;
    entryIdsWithCallout.add(meta.entryId);

    let detail = meta.detail;
    let photos = (meta.fotos ?? []).map(stripPhotoEmbed).filter(Boolean);
    for (let j = i - 1; j >= 0; j--) {
      if (isManagedCalloutStart(sectionLines[j] ?? "", LUEFTUNG_HEADING)) {
        const parsed = parseLueftungCalloutContent(sectionLines, j);
        if (!detail) detail = parsed.detail;
        photos = mergePhotoSources(
          { photos: parsed.photos, layout: parsed.layout },
          photos.length > 0 ? { photos } : null,
        ).photos;
        break;
      }
    }

    supplements.set(meta.entryId, { wartung: meta.wartung, detail, photos });
  }

  return { supplements, entryIdsWithCallout };
}

export async function loadLueftungSupplements(app: App, file: TFile): Promise<LueftungSupplementsLoadResult> {
  let text = "";
  try {
    text = await app.vault.read(file);
  } catch {
    text = "";
  }
  return parseLueftungSupplementsFromLines(text.split("\n"));
}

export function collectLueftungEntryIds(lines: string[]): Set<string> {
  const ids = new Set<string>();
  for (const line of lines) {
    const meta = parseLueftungMetaLine(line);
    if (meta?.entryId) ids.add(meta.entryId);
  }
  return ids;
}

export type LueftungSupplementTitleMatch = {
  entryId: string;
  wartung: string;
};

/** Map ## Lüftung callout titles to udn-lueftung-entry ids (fallback when Tagebuch bullets lost udn-entry). */
export function lueftungSupplementMatchesByTitle(lines: string[]): Map<string, LueftungSupplementTitleMatch> {
  const map = new Map<string, LueftungSupplementTitleMatch>();
  const range = extractSectionRange(lines, LUEFTUNG_HEADING);
  if (!range) return map;

  const section = lines.slice(range.start + 1, range.end);
  for (let i = 0; i < section.length; i++) {
    const line = section[i] ?? "";
    if (!isManagedCalloutStart(line, LUEFTUNG_HEADING)) continue;
    const title = parseLueftungCalloutBody(line).trim().toLowerCase();
    if (!title) continue;

    for (let j = i + 1; j < section.length; j++) {
      const next = section[j] ?? "";
      const meta = parseLueftungMetaLine(next);
      if (meta?.entryId) {
        map.set(title, { entryId: meta.entryId, wartung: meta.wartung.trim() });
        break;
      }
      if (isManagedCalloutStart(next, LUEFTUNG_HEADING)) break;
    }
  }
  return map;
}

function parseLueftungCalloutBody(line: string): string {
  const trimmed = line.trim();
  const m = trimmed.match(/^>\s*\[!([^\]|]+)(?:\|([^\]]*))?\]([+-])?\s*(.*)$/);
  if (!m) return "";
  return (m[2]?.trim() || (m[4]?.trim() ?? "").replace(/^[+-]\s*/, "").trim());
}

function replaceLueftungSectionBody(lines: string[], bodyLines: string[]): string[] {
  const range = extractSectionRange(lines, LUEFTUNG_HEADING);
  if (!range) {
    if (bodyLines.length === 0) return lines;
    const next = [...lines];
    if (next.length > 0 && next[next.length - 1] !== "") next.push("");
    next.push(`## ${LUEFTUNG_HEADING}`, "");
    next.push(...bodyLines);
    return next;
  }
  if (bodyLines.length === 0) {
    return [...lines.slice(0, range.start), ...lines.slice(range.end)];
  }
  return [...lines.slice(0, range.start + 1), ...bodyLines, ...lines.slice(range.end)];
}

export async function syncLueftungSupplements(
  app: App,
  file: TFile,
  entries: ComposerEntry[],
  date: Date,
  layout: FeedDetailLayoutSettings,
): Promise<boolean> {
  const profile = journalProfileById("lueftung");
  const photosFolder = profile?.photosFolder.trim() || DEFAULT_DAILY_PHOTOS_FOLDER;
  const maxPhotos = Math.max(1, layout.maxPhotos ?? profile?.maxPhotos ?? 6);

  const syncEntries: LueftungSyncEntry[] = [];
  for (const e of entries.filter((entry) => entry.profile === "lueftung" && entry.entryId?.trim())) {
    const title = lueftungCalloutTitle(e);
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

  const bodyLines = await renderLueftungSectionBody(app, syncEntries);

  await processVaultFile(app, file, (raw) => {
    let lines = raw.split("\n");
    if (bodyLines.length > 0) {
      lines = ensureSectionHeading(lines, LUEFTUNG_HEADING);
    }
    lines = replaceLueftungSectionBody(lines, bodyLines);
    const content = lines.join("\n");
    return content.endsWith("\n") || content.length === 0 ? content : `${content}\n`;
  });

  return true;
}

export function mergeLueftungSupplementsIntoEntries(
  entries: ComposerEntry[],
  loaded: LueftungSupplementsLoadResult,
): ComposerEntry[] {
  return entries.map((entry) => {
    if (entry.profile !== "lueftung" || !entry.entryId) return entry;
    const sup = loaded.supplements.get(entry.entryId);
    if (!sup) return entry;
    const hasCallout = loaded.entryIdsWithCallout.has(entry.entryId);
    return {
      ...entry,
      supplementDetail: sup.detail,
      supplementPhotos: sup.photos.length > 0 ? sup.photos : entry.supplementPhotos,
      context: entry.context?.trim() || sup.wartung || entry.context,
      calloutId: hasCallout ? entry.entryId : entry.calloutId,
    };
  });
}

export function lueftungContextByEntryId(lines: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of lines) {
    const meta = parseLueftungMetaLine(line);
    if (meta?.entryId && meta.wartung.trim()) map.set(meta.entryId, meta.wartung.trim());
  }
  return map;
}
