import type { App, TFile } from "obsidian";
import {
  buildDailyNotePhotoVaultPath,
  DEFAULT_DAILY_PHOTOS_FOLDER,
  isMisplacedDailyNotePhotoPath,
  normalizeDailyNotePhotoPath,
} from "./attachJournalMedia";
import { readCalloutTitleFromLines } from "./journalCallout";
import { stripPhotoEmbed } from "./photoCollage";
import { parseWandernMetaFromLines } from "./wandernLayout";

const IMAGE_PATH_RE = /!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
const LEGACY_ATTACHMENTS_PREFIX = "Calendar/Attachments/";
const PHOTOS_BASE_PREFIX = "Calendar/Anhänge/Bilder/";
const DATE_FOLDER_RE = /^\d{4}-\d{2}-\d{2}$/;

export type MigrateDailyNotePhotosResult = {
  filesScanned: number;
  filesUpdated: number;
  photosMoved: number;
  errors: string[];
};

type LegacyPhotoGroup = {
  paths: string[];
  calloutTitle: string;
};

export function parseDailyNoteDateFromPath(filePath: string): Date | null {
  const match = filePath.match(/(\d{4})-(\d{2})-(\d{2})\.md$/i);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

export function isLegacyAttachmentPhotoPath(path: string): boolean {
  const norm = stripPhotoEmbed(path).replace(/\\/g, "/");
  return norm.startsWith(LEGACY_ATTACHMENTS_PREFIX);
}

/** @deprecated */
export const isLegacyDailyNotePhotoPath = isLegacyAttachmentPhotoPath;

/** Legacy Wandern layout: Calendar/Anhänge/Bilder/<Titel-Ordner>/01.jpg */
export function isLegacyWandernFolderPhotoPath(path: string): boolean {
  const norm = stripPhotoEmbed(path).replace(/\\/g, "/");
  if (!norm.startsWith(PHOTOS_BASE_PREFIX)) return false;
  const rest = norm.slice(PHOTOS_BASE_PREFIX.length);
  const slash = rest.indexOf("/");
  if (slash < 0) return false;
  const folder = rest.slice(0, slash);
  return !DATE_FOLDER_RE.test(folder);
}

function collectImagePaths(text: string): string[] {
  const paths: string[] = [];
  for (const match of text.matchAll(IMAGE_PATH_RE)) {
    const path = match[1]?.trim();
    if (path) paths.push(path);
  }
  return paths;
}

function sortLegacyPhotoPaths(paths: string[]): string[] {
  return [...paths].sort((a, b) => {
    const folderCmp = a.localeCompare(b);
    if (folderCmp !== 0) return folderCmp;
    const na = a.split("/").pop() ?? "";
    const nb = b.split("/").pop() ?? "";
    return na.localeCompare(nb, undefined, { numeric: true });
  });
}

function replacePathEverywhere(text: string, oldPath: string, newPath: string): string {
  if (oldPath === newPath) return text;
  return text.split(oldPath).join(newPath);
}

function calloutTitleForTagebuch(lines: string[], date: Date): string {
  return readCalloutTitleFromLines(lines, "Tagebuch", date) || "Tagebuch";
}

function calloutTitleForWandern(lines: string[], date: Date): string {
  const fromCallout = readCalloutTitleFromLines(lines, "Wandern", date);
  if (fromCallout) return fromCallout;
  const meta = parseWandernMetaFromLines(lines);
  if (meta?.titel?.trim()) return meta.titel.trim();
  return "Wandern";
}

function calloutTitleForLueftung(lines: string[], date: Date): string {
  return readCalloutTitleFromLines(lines, "Lüftung", date) || "Lüftung";
}

function sectionHeadingBeforeLine(lines: string[], path: string): string {
  const lineIndex = lines.findIndex((line) => line.includes(path));
  if (lineIndex < 0) return "Tagebuch";
  let heading = "Tagebuch";
  for (let i = 0; i <= lineIndex; i++) {
    const match = lines[i]?.match(/^##\s+(.+)$/);
    if (match?.[1]) heading = match[1].trim();
  }
  return heading;
}

function collectLegacyPhotoGroups(text: string, lines: string[], date: Date): LegacyPhotoGroup[] {
  const groups = new Map<string, LegacyPhotoGroup>();
  const misplaced = sortLegacyPhotoPaths(
    [...new Set(collectImagePaths(text).filter(isMisplacedDailyNotePhotoPath))],
  );

  const addToGroup = (key: string, calloutTitle: string, path: string) => {
    const existing = groups.get(key);
    if (existing) existing.paths.push(path);
    else groups.set(key, { paths: [path], calloutTitle });
  };

  for (const path of misplaced) {
    const heading = sectionHeadingBeforeLine(lines, path);
    const key = heading.toLowerCase();
    if (key === "lüftung" || key === "lueftung") {
      addToGroup("lueftung", calloutTitleForLueftung(lines, date), path);
    } else if (key === "wandern") {
      addToGroup("wandern", calloutTitleForWandern(lines, date), path);
    } else {
      addToGroup("tagebuch", calloutTitleForTagebuch(lines, date), path);
    }
  }

  for (const group of groups.values()) {
    group.paths = sortLegacyPhotoPaths([...new Set(group.paths)]);
  }

  return [...groups.values()];
}

async function migrateLegacyGroup(
  app: App,
  file: TFile,
  date: Date,
  group: LegacyPhotoGroup,
  photosFolder: string,
  dryRun: boolean,
): Promise<{ pathMap: Map<string, string>; moved: number; errors: string[] }> {
  const pathMap = new Map<string, string>();
  const errors: string[] = [];
  let moved = 0;

  for (let i = 0; i < group.paths.length; i++) {
    const oldPath = group.paths[i]!;
    try {
      const newPath = buildDailyNotePhotoVaultPath(date, i, group.calloutTitle, oldPath, photosFolder);
      pathMap.set(oldPath, newPath);
      if (dryRun) continue;

      const existing = app.vault.getAbstractFileByPath(oldPath);
      if (!existing || !("extension" in existing)) {
        if (app.vault.getAbstractFileByPath(newPath)) {
          pathMap.set(oldPath, newPath);
          continue;
        }
        errors.push(`${file.path}: Quelle fehlt ${oldPath}`);
        continue;
      }

      const normalized = await normalizeDailyNotePhotoPath(
        app,
        oldPath,
        i,
        date,
        group.calloutTitle,
        photosFolder,
      );
      pathMap.set(oldPath, normalized);
      moved++;
    } catch (e) {
      errors.push(`${file.path}: ${oldPath} → ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { pathMap, moved, errors };
}

export async function migrateDailyNotePhotoFile(
  app: App,
  file: TFile,
  photosFolder = DEFAULT_DAILY_PHOTOS_FOLDER,
  dryRun = false,
): Promise<{ updated: boolean; moved: number; errors: string[] }> {
  const errors: string[] = [];
  const date = parseDailyNoteDateFromPath(file.path);
  if (!date) return { updated: false, moved: 0, errors };

  let text = "";
  try {
    text = await app.vault.read(file);
  } catch (e) {
    errors.push(`${file.path}: ${e instanceof Error ? e.message : String(e)}`);
    return { updated: false, moved: 0, errors };
  }

  const lines = text.split("\n");
  const groups = collectLegacyPhotoGroups(text, lines, date);
  if (groups.length === 0) return { updated: false, moved: 0, errors };

  const pathMap = new Map<string, string>();
  let moved = 0;

  for (const group of groups) {
    const result = await migrateLegacyGroup(app, file, date, group, photosFolder, dryRun);
    moved += result.moved;
    errors.push(...result.errors);
    for (const [oldPath, newPath] of result.pathMap) pathMap.set(oldPath, newPath);
  }

  let next = text;
  for (const [oldPath, newPath] of pathMap) {
    next = replacePathEverywhere(next, oldPath, newPath);
  }

  if (!dryRun && next !== text) {
    await app.vault.modify(file, next);
    return { updated: true, moved, errors };
  }

  return { updated: dryRun && pathMap.size > 0, moved, errors };
}

export async function migrateAllDailyNotePhotos(
  app: App,
  options?: {
    notesFolder?: string;
    photosFolder?: string;
    dryRun?: boolean;
  },
): Promise<MigrateDailyNotePhotosResult> {
  const notesFolder = (options?.notesFolder ?? "Calendar/Notes").replace(/\/+$/, "");
  const photosFolder = options?.photosFolder ?? DEFAULT_DAILY_PHOTOS_FOLDER;
  const dryRun = options?.dryRun ?? false;
  const result: MigrateDailyNotePhotosResult = {
    filesScanned: 0,
    filesUpdated: 0,
    photosMoved: 0,
    errors: [],
  };

  const files = app.vault
    .getMarkdownFiles()
    .filter((f) => f.path.startsWith(`${notesFolder}/`) && parseDailyNoteDateFromPath(f.path));

  for (const file of files) {
    result.filesScanned++;
    const fileResult = await migrateDailyNotePhotoFile(app, file, photosFolder, dryRun);
    if (fileResult.updated) result.filesUpdated++;
    result.photosMoved += fileResult.moved;
    result.errors.push(...fileResult.errors);
  }

  return result;
}
