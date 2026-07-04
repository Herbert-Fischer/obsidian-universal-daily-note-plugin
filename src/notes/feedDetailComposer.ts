import type { App, TFile } from "obsidian";
import { normalizePath } from "obsidian";
import type { FeedDetailLayoutSettings } from "../settings";
import { DEFAULT_JOURNAL_HEADING } from "../settings";
import { ensureSectionHeading } from "./appendLogLine";
import { findTagebuchFeedLine, stripLeadingTimeFromKurz, upsertTagebuchFeedLine } from "./appendTagebuchFeedLine";
import { updateSummaryInContent } from "./dailyComposer";
import { extractReisenTripFromSection, extractSectionRange, formatManagedCalloutTitleLine, readCalloutTitleFromLines } from "./journalCallout";
import type { FeedMetadata } from "./feedMetadata";
import {
  journalProfileById,
  journalProfileForHeading,
  lueftungPhotosFolderForYear,
  type JournalProfileDef,
} from "./journalProfiles";
import { defaultFeedLinksForProfile, resolveFeedLinksMarkdown, splitFeedLineContent } from "./feedLinks";
import { wikiEmbedForPath } from "./attachJournalMedia";
import { processVaultFile } from "./vaultProcess";
import {
  buildPhotoCollageMarkdownAsync,
  mergePhotoSources,
  parsePhotoCollageFromLines,
  photoCollageMetaComment,
  photoEmbeds,
  stripPhotoEmbed,
  type PhotoCollageLayout,
} from "./photoCollage";

async function ensureFolder(app: App, folderPath: string): Promise<void> {
  const parts = folderPath.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) {
      await app.vault.createFolder(current);
    }
  }
}

export type FeedDetailMeta = {
  kurz: string;
  detail: string;
  fotos: string[];
  titel: string;
  feedTime?: string;
  feedLinks?: string;
  layout?: PhotoCollageLayout | "";
};

export type FeedDetailComposerData = {
  feedText: string;
  feedLinks: string;
  detail: string;
  photos: string[];
  feedTime: string;
  calloutTitle: string;
};

function metaPrefixForProfile(profile: JournalProfileDef): string {
  return profile.id === "heizung" ? "<!-- udn-heizung:" : "<!-- udn-lueftung:";
}

export function feedDetailMetaComment(profile: JournalProfileDef, meta: FeedDetailMeta): string {
  const prefix = metaPrefixForProfile(profile);
  return `${prefix} ${JSON.stringify(meta)} -->`;
}

export function parseFeedDetailMetaLine(line: string, profile: JournalProfileDef): FeedDetailMeta | null {
  const prefix = metaPrefixForProfile(profile);
  const trimmed = line.trim();
  if (!trimmed.startsWith(prefix)) return null;
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as Partial<FeedDetailMeta>;
    return {
      kurz: parsed.kurz?.trim() ?? "",
      detail: parsed.detail?.trim() ?? "",
      fotos: Array.isArray(parsed.fotos) ? parsed.fotos.map(String) : [],
      titel: parsed.titel?.trim() ?? "",
      feedTime: parsed.feedTime?.trim() ?? "",
      feedLinks: parsed.feedLinks?.trim() ?? "",
      layout: (parsed.layout as PhotoCollageLayout | "") ?? "",
    };
  } catch {
    return null;
  }
}

export function parseFeedDetailMetaFromLines(lines: string[], profile: JournalProfileDef): FeedDetailMeta | null {
  for (const line of lines) {
    const meta = parseFeedDetailMetaLine(line, profile);
    if (meta) return meta;
  }
  return null;
}

export function feedDetailTimelineTextFromMeta(meta: FeedDetailMeta, profile: JournalProfileDef): string {
  const time = meta.feedTime?.trim() || "";
  const kurz = stripLeadingTimeFromKurz(meta.kurz);
  const suffix = (meta.feedLinks?.trim() || profile.feedSuffix).trim();
  const body = [kurz, suffix].filter(Boolean).join(" ");
  if (time && body) return `${time} ${body}`;
  return body || meta.titel.trim() || profile.label;
}

function photoEmbedsFromPaths(paths: string[]): string[] {
  return photoEmbeds(paths);
}

export async function renderFeedDetailSection(
  app: App,
  profile: JournalProfileDef,
  data: FeedDetailComposerData,
): Promise<{ rendered: string; layout: PhotoCollageLayout | "" }> {
  const detail = data.detail.trim();
  const titel = data.calloutTitle.trim() || profile.label;
  const innerLines: string[] = [];
  if (detail) innerLines.push(detail, "");

  let layout: PhotoCollageLayout | "" = "";
  if (data.photos.length > 0) {
    const collage = await buildPhotoCollageMarkdownAsync(app, data.photos, "> > ");
    layout = collage.layout;
    if (collage.markdown) {
      innerLines.push(...collage.markdown.split("\n"), "");
    }
  }

  if (innerLines.length === 0) innerLines.push(`_${titel}_`, "");
  const body = innerLines.join("\n").trimEnd();
  const titleLine = formatManagedCalloutTitleLine(profile.label, titel);
  const rendered = [
    titleLine,
    ...body.split("\n").map((line) => (line.length === 0 ? ">" : `> ${line}`)),
    "",
  ].join("\n");
  return { rendered, layout };
}

function replaceDetailSectionBody(lines: string[], profile: JournalProfileDef, rendered: string, meta: FeedDetailMeta): string[] {
  const heading = profile.label;
  const range = extractSectionRange(lines, heading);
  const bodyLines = [...rendered.split("\n"), "", feedDetailMetaComment(profile, meta), ""];

  if (!range) {
    const next = [...lines];
    if (next.length > 0 && next[next.length - 1] !== "") next.push("");
    next.push(`## ${heading}`, "");
    next.push(...bodyLines);
    return next;
  }

  return [...lines.slice(0, range.start + 1), ...bodyLines, ...lines.slice(range.end)];
}

function photosFolderForProfile(profile: JournalProfileDef, date: Date, layout: FeedDetailLayoutSettings): string {
  if (profile.id === "heizung") {
    return layout.heizungPhotosFolder.trim() || profile.photosFolder;
  }
  const base = layout.lueftungPhotosFolder.trim() || profile.photosFolder;
  return lueftungPhotosFolderForYear(base, date.getFullYear());
}

async function normalizeFeedDetailPhotoPath(
  app: App,
  rawPath: string,
  photoIndex: number,
  date: Date,
  photosFolder: string,
): Promise<string> {
  const trimmed = rawPath.replace(/^!\[\[|\]\]$/g, "").trim();
  if (trimmed.includes("/")) return normalizePath(trimmed);
  const extMatch = /\.([a-zA-Z0-9]{1,8})$/.exec(trimmed);
  const ext = extMatch ? extMatch[1]!.toLowerCase() : "jpg";
  const num = String(photoIndex + 1).padStart(2, "0");
  const fileName = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}_${num}.${ext}`;
  return normalizePath(`${photosFolder.replace(/\/+$/, "")}/${fileName}`);
}

export async function importFeedDetailPhotoFile(
  app: App,
  file: File,
  photoIndex: number,
  date: Date,
  profile: JournalProfileDef,
  layout: FeedDetailLayoutSettings,
): Promise<string> {
  const folder = photosFolderForProfile(profile, date, layout);
  let destPath = await normalizeFeedDetailPhotoPath(app, file.name, photoIndex, date, folder);
  const parent = destPath.replace(/\/[^/]+$/, "");
  await ensureFolder(app, parent);
  if (app.vault.getAbstractFileByPath(destPath)) {
    const dot = destPath.lastIndexOf(".");
    const stem = dot >= 0 ? destPath.slice(0, dot) : destPath;
    const ext = dot >= 0 ? destPath.slice(dot) : "";
    destPath = `${stem}-${Math.random().toString(36).slice(2, 4)}${ext}`;
  }
  const data = await file.arrayBuffer();
  await app.vault.createBinary(destPath, data);
  return destPath;
}

export async function loadFeedDetailComposerData(
  app: App,
  file: TFile,
  heading: string,
): Promise<FeedDetailComposerData | null> {
  const profile = journalProfileForHeading(heading);
  if (!profile || profile.kind !== "detail" || (profile.id !== "heizung" && profile.id !== "lueftung")) {
    return null;
  }

  let text = "";
  try {
    text = await app.vault.read(file);
  } catch {
    text = "";
  }
  const lines = text.split("\n");
  const range = extractSectionRange(lines, profile.label);
  const sectionLines = range ? lines.slice(range.start + 1, range.end) : [];
  const meta = parseFeedDetailMetaFromLines(sectionLines, profile);
  const parsedCollage = parsePhotoCollageFromLines(sectionLines, 0, sectionLines.length);
  const mergedPhotos = mergePhotoSources(parsedCollage, meta ? { photos: meta.fotos.map(stripPhotoEmbed), layout: meta.layout } : null);
  const calloutTitle =
    readCalloutTitleFromLines(lines, profile.label) ||
    meta?.titel ||
    profile.label;
  const context =
    calloutTitle.trim().toLowerCase() !== profile.label.toLowerCase() ? calloutTitle.trim() : "";
  const feed = findTagebuchFeedLine(lines, profile.id, context);
  let feedText = "";
  let feedLinks = defaultFeedLinksForProfile(app, profile.feedSuffix, file.path);

  if (feed) {
    const split = splitFeedLineContent(feed.text);
    feedText = stripLeadingTimeFromKurz(split.body);
    if (split.linksMarkdown) feedLinks = split.linksMarkdown;
  }

  if (meta) {
    if (meta.feedLinks?.trim()) feedLinks = meta.feedLinks;
    if (!feedText) feedText = stripLeadingTimeFromKurz(meta.kurz);
    if (!meta.feedLinks?.trim()) {
      const legacy = splitFeedLineContent(meta.kurz);
      if (legacy.linksMarkdown) {
        feedText = stripLeadingTimeFromKurz(legacy.body);
        feedLinks = legacy.linksMarkdown;
      }
    }
  }

  feedLinks = resolveFeedLinksMarkdown(app, feedLinks, file.path);

  if (meta || feed) {
    return {
      feedText,
      feedLinks,
      detail: meta?.detail ?? "",
      photos: mergedPhotos.photos,
      feedTime: feed?.time || meta?.feedTime || "",
      calloutTitle,
    };
  }

  return {
    feedText: "",
    feedLinks,
    detail: "",
    photos: [],
    feedTime: "",
    calloutTitle,
  };
}

export async function saveFeedDetailComposerState(
  app: App,
  file: TFile,
  summary: string,
  date: Date,
  heading: string,
  data: FeedDetailComposerData,
  layout: FeedDetailLayoutSettings,
  feedTime: string,
): Promise<boolean> {
  const profile = journalProfileForHeading(heading);
  if (!profile || profile.kind !== "detail" || (profile.id !== "heizung" && profile.id !== "lueftung")) {
    return false;
  }

  const photosFolder = photosFolderForProfile(profile, date, layout);
  const maxPhotos = Math.max(1, layout.maxPhotos ?? profile.maxPhotos);
  const normalizedPhotos: string[] = [];
  for (let i = 0; i < Math.min(data.photos.length, maxPhotos); i++) {
    const path = await normalizeFeedDetailPhotoPath(app, data.photos[i]!, i, date, photosFolder);
    normalizedPhotos.push(path);
  }

  const titel = data.calloutTitle.trim() || profile.label;
  const feedText = stripLeadingTimeFromKurz(data.feedText);
  const suffixLinks = resolveFeedLinksMarkdown(
    app,
    data.feedLinks.trim() || profile.feedSuffix,
    file.path,
  );
  const dataWithAssets: FeedDetailComposerData = {
    ...data,
    calloutTitle: titel,
    feedText,
    feedLinks: suffixLinks,
    photos: normalizedPhotos,
  };
  const { rendered, layout: collageLayout } = await renderFeedDetailSection(app, profile, dataWithAssets);
  const meta: FeedDetailMeta = {
    kurz: dataWithAssets.feedText.trim(),
    feedLinks: suffixLinks,
    detail: dataWithAssets.detail.trim(),
    fotos: photoEmbedsFromPaths(dataWithAssets.photos),
    titel,
    feedTime: feedTime.trim() || "12:00",
    ...(collageLayout ? { layout: collageLayout } : {}),
  };
  const feedMetadata: FeedMetadata = {
    profile: profile.id,
    context: titel !== profile.label ? titel : "",
  };
  const kurzForFeed = meta.kurz || titel;

  await processVaultFile(app, file, (raw) => {
    let content = updateSummaryInContent(raw, summary.trim());
    let lines = content.split("\n");
    lines = ensureSectionHeading(lines, profile.label);
    lines = replaceDetailSectionBody(lines, profile, rendered, meta);
    lines = upsertTagebuchFeedLine(lines, {
      time: feedTime.trim() || "12:00",
      kurz: kurzForFeed,
      metadata: feedMetadata,
      suffixLinks,
    }, date);
    lines = ensureSectionHeading(lines, DEFAULT_JOURNAL_HEADING);
    content = lines.join("\n");
    return content.endsWith("\n") || content.length === 0 ? content : `${content}\n`;
  });

  return true;
}

export function buildReisenFeedKurz(entryTexts: string[], summary: string): string {
  const trimmedSummary = summary.trim();
  if (trimmedSummary) return trimmedSummary;
  for (const text of entryTexts) {
    const body = text.replace(/^\d{1,2}:\d{2}\s*/, "").trim();
    if (body) return body.length > 120 ? `${body.slice(0, 117)}…` : body;
  }
  return "Reise";
}

export function buildWandernFeedKurz(kurz: string, titel: string): string {
  const k = kurz.trim();
  if (k) return k;
  const t = titel.trim();
  if (t && t.toLowerCase() !== "wandern") return t;
  return "Wandern";
}

export function profileDefById(id: FeedMetadata["profile"]): JournalProfileDef | null {
  return journalProfileById(id);
}

export function wikiEmbed(path: string): string {
  return wikiEmbedForPath(path);
}

export async function syncReisenTagebuchFeed(
  app: App,
  file: TFile,
  entryTexts: string[],
  summary: string,
  feedTime: string,
  date: Date,
): Promise<void> {
  const profile = journalProfileById("reisen");
  if (!profile) return;
  let lines: string[] = [];
  try {
    lines = (await app.vault.read(file)).split("\n");
  } catch {
    return;
  }
  const trip = extractReisenTripFromSection(lines, "Reisen");
  const metadata: FeedMetadata = { profile: "reisen", context: trip ?? "" };
  const kurz = buildReisenFeedKurz(entryTexts, summary);
  await processVaultFile(app, file, (raw) => {
    let next = raw.split("\n");
    next = upsertTagebuchFeedLine(next, {
      time: feedTime.trim() || "12:00",
      kurz,
      metadata,
      suffixLinks: profile.feedSuffix,
    }, date);
    next = ensureSectionHeading(next, DEFAULT_JOURNAL_HEADING);
    const content = next.join("\n");
    return content.endsWith("\n") || content.length === 0 ? content : `${content}\n`;
  });
}

export async function syncWandernTagebuchFeed(
  app: App,
  file: TFile,
  kurz: string,
  titel: string,
  feedTime: string,
  date: Date,
): Promise<void> {
  const profile = journalProfileById("wandern");
  if (!profile) return;
  const metadata: FeedMetadata = {
    profile: "wandern",
    context: titel.trim() !== "Wandern" ? titel.trim() : "",
  };
  await processVaultFile(app, file, (raw) => {
    let next = raw.split("\n");
    next = upsertTagebuchFeedLine(next, {
      time: feedTime.trim() || "12:00",
      kurz: buildWandernFeedKurz(kurz, titel),
      metadata,
      suffixLinks: profile.feedSuffix,
    }, date);
    next = ensureSectionHeading(next, DEFAULT_JOURNAL_HEADING);
    const content = next.join("\n");
    return content.endsWith("\n") || content.length === 0 ? content : `${content}\n`;
  });
}
