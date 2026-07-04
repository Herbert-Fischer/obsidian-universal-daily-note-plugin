import type { App } from "obsidian";
import { normalizePath } from "obsidian";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function dateKey(d: Date): string {
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

/** Folder name under Calendar/Anhänge/Bilder/ from the mountain callout title. */
export function folderFromCalloutTitel(titel: string): string {
  const raw = titel.trim() || "Wandern";
  return (
    raw
      .replace(/[\\:*?"<>|]/g, "")
      .replace(/\s*[·:\-–—]\s*/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 64) || "Wandern"
  );
}

/** @deprecated Kept for tests; folder names use folderFromCalloutTitel. */
export function slugFromWandernTitel(titel: string): string {
  return sanitizeBaseName(folderFromCalloutTitel(titel));
}

export function buildWandernAttachmentVaultPath(
  photoIndex: number,
  originalName: string,
  titel: string,
  photosFolder = "Calendar/Anhänge/Bilder",
): string {
  const base = photosFolder.trim().replace(/^\/+|\/+$/g, "") || "Calendar/Anhänge/Bilder";
  const folderName = folderFromCalloutTitel(titel);
  const extMatch = /\.([a-zA-Z0-9]{1,8})$/.exec(originalName);
  const ext = extMatch ? extMatch[1]!.toLowerCase() : "jpg";
  const num = String(photoIndex + 1).padStart(2, "0");
  const fileName = `${num}.${ext}`;
  return normalizePath(`${base}/${folderName}/${fileName}`);
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

/** Copy a browser File into the vault and return its path. */
export async function importAttachmentFile(
  app: App,
  file: File,
  date: Date,
  attachmentsFolder: string,
): Promise<string> {
  let destPath = buildAttachmentVaultPath(date, attachmentsFolder, file.name);
  const folder = destPath.replace(/\/[^/]+$/, "");
  await ensureFolder(app, folder);

  if (app.vault.getAbstractFileByPath(destPath)) {
    const dot = destPath.lastIndexOf(".");
    const stem = dot >= 0 ? destPath.slice(0, dot) : destPath;
    const ext = dot >= 0 ? destPath.slice(dot) : "";
    destPath = `${stem}-${Math.random().toString(36).slice(2, 6)}${ext}`;
  }

  const data = await file.arrayBuffer();
  await app.vault.createBinary(destPath, data);
  return destPath;
}

/** Wandern photos: Calendar/Anhänge/Bilder/<Callout-Titel>/01.jpg */
export async function importWandernAttachmentFile(
  app: App,
  file: File,
  photoIndex: number,
  titel: string,
  photosFolder: string,
): Promise<string> {
  let destPath = buildWandernAttachmentVaultPath(photoIndex, file.name, titel, photosFolder);
  const folder = destPath.replace(/\/[^/]+$/, "");
  await ensureFolder(app, folder);

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

export async function normalizeWandernPhotoPath(
  app: App,
  path: string,
  photoIndex: number,
  titel: string,
  photosFolder: string,
): Promise<string> {
  const name = path.split("/").pop() ?? "";
  const destPath = buildWandernAttachmentVaultPath(photoIndex, name, titel, photosFolder);
  if (destPath === path) return path;

  const file = app.vault.getAbstractFileByPath(path);
  if (!file || !("extension" in file)) return path;
  if (app.vault.getAbstractFileByPath(destPath)) return destPath;

  const parent = destPath.replace(/\/[^/]+$/, "");
  await ensureFolder(app, parent);
  await app.vault.rename(file as import("obsidian").TFile, destPath);
  return destPath;
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
