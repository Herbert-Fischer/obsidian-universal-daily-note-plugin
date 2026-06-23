import type { App, TFile } from "obsidian";
import type { DailyNoteFallbackSettings } from "../settings";
import { getFallbackDailyNoteVaultPath } from "./dailyNoteFallbackPaths";
import { openOrCreateCoreDailyNote } from "./dailyNotesCore";

async function ensureFolder(app: App, folderPath: string) {
  if (!folderPath) return;
  const existing = app.vault.getAbstractFileByPath(folderPath);
  if (existing) return;
  await app.vault.createFolder(folderPath);
}

async function readTemplateIfAny(app: App, path: string | null): Promise<string | null> {
  if (!path) return null;
  const f = app.vault.getAbstractFileByPath(path);
  if (!f) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maybeFile = f as any;
  if (typeof maybeFile?.path !== "string") return null;
  try {
    return await app.vault.read(maybeFile);
  } catch {
    return null;
  }
}

async function openFile(app: App, file: TFile) {
  await app.workspace.getLeaf(true).openFile(file);
}

async function openOrCreateDailyNoteFallback(
  app: App,
  date: Date,
  fallback: DailyNoteFallbackSettings,
): Promise<TFile> {
  const fullPath = getFallbackDailyNoteVaultPath(date, fallback);
  const folder = fallback.folder.trim().replace(/\/+$/, "");

  await ensureFolder(app, folder);

  const existing = app.vault.getAbstractFileByPath(fullPath);
  if (existing) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return existing as any as TFile;
  }

  const template = await readTemplateIfAny(app, fallback.templatePath);
  const created = await app.vault.create(fullPath, template ?? "");
  return created;
}

function isCoreDailyNotesEnabled(app: App): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plugins = (app as any).internalPlugins;
  const daily = plugins?.plugins?.["daily-notes"];
  return Boolean(daily?.enabled);
}

async function openOrCreateViaCoreDailyNotes(app: App, date: Date): Promise<TFile | null> {
  try {
    return await openOrCreateCoreDailyNote(app, date);
  } catch (e) {
    console.error("Universal Daily Note: core daily note failed", e);
    return null;
  }
}

export async function openOrCreateDailyNoteForDate(
  app: App,
  date: Date,
  fallback: DailyNoteFallbackSettings,
): Promise<TFile> {
  if (isCoreDailyNotesEnabled(app)) {
    const viaCore = await openOrCreateViaCoreDailyNotes(app, date);
    if (viaCore) {
      await openFile(app, viaCore);
      return viaCore;
    }
  }

  const viaFallback = await openOrCreateDailyNoteFallback(app, date, fallback);
  await openFile(app, viaFallback);
  return viaFallback;
}
