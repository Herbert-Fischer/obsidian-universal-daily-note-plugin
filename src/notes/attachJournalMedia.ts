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
  return stem
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 48)
    .toLowerCase() || "anhang";
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

export function wikiEmbedForPath(vaultPath: string): string {
  return `![[${vaultPath}]]`;
}
