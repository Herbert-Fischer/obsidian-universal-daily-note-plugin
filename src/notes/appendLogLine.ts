import type { App, TFile } from "obsidian";
import type { DailyNoteFallbackSettings } from "../settings";
import { getFallbackDailyNoteVaultPath } from "./dailyNoteFallbackPaths";
import { readDailyNoteTemplate } from "./dailyNoteTemplate";
import { getExistingDailyNoteFile, openOrCreateCoreDailyNote } from "./dailyNotesCore";

async function ensureFolder(app: App, folderPath: string) {
  if (!folderPath) return;
  const existing = app.vault.getAbstractFileByPath(folderPath);
  if (existing) return;
  await app.vault.createFolder(folderPath);
}

function isCoreDailyNotesEnabled(app: App): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plugins = (app as any).internalPlugins;
  const daily = plugins?.plugins?.["daily-notes"];
  return Boolean(daily?.enabled);
}

async function createDailyNoteFallback(
  app: App,
  date: Date,
  fallback: DailyNoteFallbackSettings,
): Promise<TFile> {
  const fullPath = getFallbackDailyNoteVaultPath(date, fallback);
  const folder = fallback.folder.trim().replace(/\/+$/, "");
  await ensureFolder(app, folder);
  const template = await readDailyNoteTemplate(app, fallback.templatePath, date);
  return app.vault.create(fullPath, template ?? "");
}

/** Returns daily note file for date, creating it if missing (does not open editor). */
export async function ensureDailyNoteFileForDate(
  app: App,
  date: Date,
  fallback: DailyNoteFallbackSettings,
): Promise<TFile> {
  const existing = getExistingDailyNoteFile(app, date, fallback);
  if (existing) return existing;

  if (isCoreDailyNotesEnabled(app)) {
    const viaCore = await openOrCreateCoreDailyNote(app, date);
    if (viaCore) return viaCore;
  }

  const path = getFallbackDailyNoteVaultPath(date, fallback);
  const inVault = app.vault.getAbstractFileByPath(path);
  if (inVault instanceof TFile) return inVault;

  return createDailyNoteFallback(app, date, fallback);
}

export type AppendLogLineOptions = {
  date: Date;
  text: string;
  fallback: DailyNoteFallbackSettings;
  linkFile?: TFile | null;
  timeFormat?: string;
  headingPath?: string | null;
  embedPaths?: string[];
  ensureHeading?: boolean;
};

export function buildLogLine(
  text: string,
  timeFormat: string,
  linkFile?: TFile | null,
  embedPaths?: string[],
): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const time = timeFormat.replace("HH", hh).replace("mm", mm);
  const trimmed = text.trim();
  let linkPart = "";
  if (linkFile) {
    const base = linkFile.basename.replace(/\.md$/i, "");
    if (base) linkPart = ` [[${base}]]`;
  }
  const embedPart = (embedPaths ?? [])
    .filter(Boolean)
    .map((p) => ` ![[${p}]]`)
    .join("");
  return `- ${time} ${trimmed}${linkPart}${embedPart}`;
}

export function ensureSectionHeading(lines: string[], headingPath: string | null): string[] {
  if (!headingPath?.trim()) return lines;
  const target = headingPath.trim().toLowerCase();
  for (const line of lines) {
    const m = line.match(/^#{1,6}\s+(.+)$/);
    if (m && m[1]?.trim().toLowerCase() === target) return lines;
  }
  const next = [...lines];
  if (next.length > 0 && next[next.length - 1] !== "") next.push("");
  next.push(`## ${headingPath.trim()}`, "");
  return next;
}

export function findInsertIndex(lines: string[], headingPath: string | null): number {
  if (!headingPath?.trim()) return lines.length;
  const target = headingPath.trim().toLowerCase();
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]?.match(/^#{1,6}\s+(.+)$/);
    if (m && m[1]?.trim().toLowerCase() === target) {
      let j = i + 1;
      while (j < lines.length && !/^#{1,6}\s+/.test(lines[j] ?? "")) j++;
      return j;
    }
  }
  return lines.length;
}

export async function appendTimestampedLogLine(
  app: App,
  options: AppendLogLineOptions,
): Promise<TFile> {
  const file = await ensureDailyNoteFileForDate(app, options.date, options.fallback);
  const line = buildLogLine(
    options.text,
    options.timeFormat ?? "HH:mm",
    options.linkFile,
    options.embedPaths,
  );

  await app.vault.process(file, (data) => {
    let lines = data.split("\n");
    const heading = options.headingPath ?? null;
    if (options.ensureHeading !== false && heading) {
      lines = ensureSectionHeading(lines, heading);
    }
    const idx = findInsertIndex(lines, heading);
    const before = lines.slice(0, idx);
    const after = lines.slice(idx);
    const block = [...before, line, ...after];
    const joined = block.join("\n");
    return joined.endsWith("\n") || joined.length === 0 ? joined : `${joined}\n`;
  });

  return file;
}
