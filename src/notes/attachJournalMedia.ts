import type { App } from "obsidian";
import { normalizePath } from "obsidian";

export const DEFAULT_DAILY_PHOTOS_FOLDER = "Calendar/Anhänge/Bilder";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function timestampToken(d: Date): string {
  return `${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

function sanitizeBaseName(name: string): string {
  const stem = name.replace(/\.[^.]+$/, "").trim() || "anhang";
  return (
    stem
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 48)
      .toLowerCase() || "anhang"
  );
}

/** Sanitized callout title stem for filenames (e.g. Wandern_Bläsis_Mühle). */
export function folderFromCalloutTitel(titel: string): string {
  const raw = titel.trim() || "Tagebuch";
  const withoutWiki = raw.replace(/\[\[[^\]]+\]\]/g, "").trim();
  return (
    withoutWiki
      .replace(/[\\:*?"<>|]/g, "")
      .replace(/\s*[·:\-–—]\s*/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 64) || "Tagebuch"
  );
}

/** @deprecated Kept for tests; folder names use folderFromCalloutTitel. */
export function slugFromWandernTitel(titel: string): string {
  return sanitizeBaseName(folderFromCalloutTitel(titel));
}

/** Daily-note photos: Calendar/Anhänge/Bilder/<yyyy-mm-dd>/<Callout-Titel>_01.ext */
export function buildDailyNotePhotoVaultPath(
  date: Date,
  photoIndex: number,
  titel: string,
  originalName: string,
  photosFolder = DEFAULT_DAILY_PHOTOS_FOLDER,
): string {
  const base = photosFolder.trim().replace(/^\/+|\/+$/g, "") || DEFAULT_DAILY_PHOTOS_FOLDER;
  const stem = folderFromCalloutTitel(titel);
  const extMatch = /\.([a-zA-Z0-9]{1,8})$/.exec(originalName);
  const ext = extMatch ? extMatch[1]!.toLowerCase() : "jpg";
  const num = String(photoIndex + 1).padStart(2, "0");
  const fileName = `${stem}_${num}.${ext}`;
  return normalizePath(`${base}/${dateKey(date)}/${fileName}`);
}

/** @deprecated Use buildDailyNotePhotoVaultPath */
export function buildWandernAttachmentVaultPath(
  photoIndex: number,
  originalName: string,
  titel: string,
  photosFolder = DEFAULT_DAILY_PHOTOS_FOLDER,
  date: Date = new Date(),
): string {
  return buildDailyNotePhotoVaultPath(date, photoIndex, titel, originalName, photosFolder);
}

/** @deprecated Use buildDailyNotePhotoVaultPath */
export function buildLueftungAttachmentVaultPath(
  photoIndex: number,
  originalName: string,
  titel: string,
  photosFolder: string,
  _year: number,
  date?: Date,
): string {
  return buildDailyNotePhotoVaultPath(date ?? new Date(), photoIndex, titel, originalName, photosFolder);
}

/** GPX file name from callout title (matches existing Anhänge/GPX naming). */
export function gpxFileNameFromCalloutTitel(titel: string): string {
  const raw = titel.trim() || "Wandern";
  const stem =
    raw
      .replace(/[\\:*?"<>|]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 64) || "Wandern";
  return `${stem}.gpx`;
}

export function buildWandernTrackVaultPath(
  titel: string,
  tracksFolder = "Calendar/Anhänge/GPX",
): string {
  const base = tracksFolder.trim().replace(/^\/+|\/+$/g, "") || "Calendar/Anhänge/GPX";
  return normalizePath(`${base}/${gpxFileNameFromCalloutTitel(titel)}`);
}

/** Legacy quick-capture attachments (not daily-note gallery photos). */
export function buildAttachmentVaultPath(
  date: Date,
  attachmentsFolder: string,
  originalName: string,
): string {
  const folder = attachmentsFolder.trim().replace(/^\/+|\/+$/g, "") || "Attachments";
  const extMatch = /\.([a-zA-Z0-9]{1,8})$/.exec(originalName);
  const ext = extMatch ? extMatch[1]!.toLowerCase() : "bin";
  const base = sanitizeBaseName(originalName);
  const fileName = `${timestampToken(date)}-${base}.${ext}`;
  return normalizePath(`${folder}/${dateKey(date)}/${fileName}`);
}

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

async function importBinaryToPath(app: App, file: File, destPath: string): Promise<string> {
  let nextPath = destPath;
  const folder = nextPath.replace(/\/[^/]+$/, "");
  await ensureFolder(app, folder);

  if (app.vault.getAbstractFileByPath(nextPath)) {
    const dot = nextPath.lastIndexOf(".");
    const stem = dot >= 0 ? nextPath.slice(0, dot) : nextPath;
    const ext = dot >= 0 ? nextPath.slice(dot) : "";
    nextPath = `${stem}-${Math.random().toString(36).slice(2, 4)}${ext}`;
  }

  const data = await file.arrayBuffer();
  await app.vault.createBinary(nextPath, data);
  return nextPath;
}

/** Copy a browser File into the vault and return its path. */
export async function importAttachmentFile(
  app: App,
  file: File,
  date: Date,
  attachmentsFolder: string,
): Promise<string> {
  return importBinaryToPath(app, file, buildAttachmentVaultPath(date, attachmentsFolder, file.name));
}

export async function importDailyNotePhotoFile(
  app: App,
  file: File,
  date: Date,
  photoIndex: number,
  titel: string,
  photosFolder = DEFAULT_DAILY_PHOTOS_FOLDER,
): Promise<string> {
  const destPath = buildDailyNotePhotoVaultPath(date, photoIndex, titel, file.name, photosFolder);
  return importBinaryToPath(app, file, destPath);
}

export function isCanonicalDailyNotePhotoPath(path: string): boolean {
  const norm = stripPhotoEmbed(path).replace(/\\/g, "/");
  if (!norm.startsWith(`${DEFAULT_DAILY_PHOTOS_FOLDER}/`)) return false;
  const rest = norm.slice(`${DEFAULT_DAILY_PHOTOS_FOLDER}/`.length);
  const slash = rest.indexOf("/");
  if (slash < 0) return false;
  const dateFolder = rest.slice(0, slash);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFolder)) return false;
  const fileName = rest.slice(slash + 1);
  return /_\d{2}\.[a-z0-9]+$/i.test(fileName);
}

function stripPhotoEmbed(path: string): string {
  return path.replace(/^!\[\[|\]\]$/g, "").trim();
}

export function isMisplacedDailyNotePhotoPath(path: string): boolean {
  const norm = stripPhotoEmbed(path).replace(/\\/g, "/");
  if (!norm) return false;
  if (isCanonicalDailyNotePhotoPath(norm)) return false;
  const baseName = norm.split("/").pop() ?? "";
  if (/[\[\]]/.test(baseName)) return true;
  if (norm.startsWith("+/")) return true;
  if (norm.startsWith("Calendar/Attachments/")) return true;
  if (/^Atlas\/Immobilien\/[^/]+\/Anhänge\/(Lueftung|Lüftung|Heizung)\//i.test(norm)) return true;
  if (norm.startsWith(`${DEFAULT_DAILY_PHOTOS_FOLDER}/`)) {
    const rest = norm.slice(`${DEFAULT_DAILY_PHOTOS_FOLDER}/`.length);
    const slash = rest.indexOf("/");
    if (slash < 0) return true;
    const folder = rest.slice(0, slash);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(folder)) return true;
  }
  return false;
}

export async function normalizeDailyNotePhotoPath(
  app: App,
  path: string,
  photoIndex: number,
  date: Date,
  titel: string,
  photosFolder = DEFAULT_DAILY_PHOTOS_FOLDER,
): Promise<string> {
  const name = path.split("/").pop() ?? "";
  const destPath = buildDailyNotePhotoVaultPath(date, photoIndex, titel, name, photosFolder);
  if (destPath === path) return path;

  const file = app.vault.getAbstractFileByPath(path);
  if (!file || !("extension" in file)) return path;
  if (app.vault.getAbstractFileByPath(destPath)) return destPath;

  const parent = destPath.replace(/\/[^/]+$/, "");
  await ensureFolder(app, parent);
  await app.vault.rename(file as import("obsidian").TFile, destPath);
  return destPath;
}

/** @deprecated Use importDailyNotePhotoFile */
export async function importLueftungAttachmentFile(
  app: App,
  file: File,
  photoIndex: number,
  titel: string,
  photosFolder: string,
  _year: number,
  date?: Date,
): Promise<string> {
  return importDailyNotePhotoFile(app, file, date ?? new Date(), photoIndex, titel, photosFolder);
}

/** @deprecated Use normalizeDailyNotePhotoPath */
export async function normalizeLueftungPhotoPath(
  app: App,
  path: string,
  photoIndex: number,
  titel: string,
  photosFolder: string,
  _year: number,
  date?: Date,
): Promise<string> {
  return normalizeDailyNotePhotoPath(app, path, photoIndex, date ?? new Date(), titel, photosFolder);
}

/** @deprecated Use importDailyNotePhotoFile */
export async function importWandernAttachmentFile(
  app: App,
  file: File,
  photoIndex: number,
  titel: string,
  photosFolder: string,
  date?: Date,
): Promise<string> {
  return importDailyNotePhotoFile(app, file, date ?? new Date(), photoIndex, titel, photosFolder);
}

/** @deprecated Use normalizeDailyNotePhotoPath */
export async function normalizeWandernPhotoPath(
  app: App,
  path: string,
  photoIndex: number,
  titel: string,
  photosFolder: string,
  date?: Date,
): Promise<string> {
  return normalizeDailyNotePhotoPath(app, path, photoIndex, date ?? new Date(), titel, photosFolder);
}

/** Copy or reuse GPX under Calendar/Anhänge/GPX/<Callout-Titel>.gpx */
export async function normalizeWandernTrackPath(
  app: App,
  path: string,
  titel: string,
  tracksFolder: string,
): Promise<string> {
  const destPath = buildWandernTrackVaultPath(titel, tracksFolder);
  if (path === destPath) return path;
  if (app.vault.getAbstractFileByPath(destPath)) return destPath;

  const file = app.vault.getAbstractFileByPath(path);
  if (!file || !("extension" in file)) return path;

  const folder = destPath.replace(/\/[^/]+$/, "");
  await ensureFolder(app, folder);
  const data = await app.vault.readBinary(file as import("obsidian").TFile);
  await app.vault.createBinary(destPath, data);
  return destPath;
}

export function wikiEmbedForPath(vaultPath: string): string {
  return `![[${vaultPath}]]`;
}
