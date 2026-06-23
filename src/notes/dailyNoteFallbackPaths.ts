import { TFile, type App } from "obsidian";
import type { DailyNoteFallbackSettings } from "../settings";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatFallbackFilename(d: Date, fmt: string): string {
  const yyyy = String(d.getFullYear());
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return fmt.replaceAll("YYYY", yyyy).replaceAll("MM", mm).replaceAll("DD", dd);
}

export function getFallbackDailyNoteVaultPath(date: Date, fallback: DailyNoteFallbackSettings): string {
  const filename = formatFallbackFilename(date, fallback.filenameFormat);
  const folder = fallback.folder.trim().replace(/\/+$/, "");
  return folder ? `${folder}/${filename}` : filename;
}

export function getExistingFallbackDailyNoteFile(
  app: App,
  date: Date,
  fallback: DailyNoteFallbackSettings,
): TFile | null {
  const path = getFallbackDailyNoteVaultPath(date, fallback);
  const f = app.vault.getAbstractFileByPath(path);
  return f instanceof TFile ? f : null;
}

export function getExistingDailyNoteFileInFolder(
  app: App,
  date: Date,
  folder: string,
  filenameFormat: string,
): TFile | null {
  const trimmed = normalizeVaultPath(folder.trim());
  if (!trimmed) return null;
  const filename = formatFallbackFilename(date, filenameFormat);
  const path = `${trimmed}/${filename}`;
  const f = app.vault.getAbstractFileByPath(path);
  if (f instanceof TFile) return f;
  const alt = app.vault.getAbstractFileByPath(`/${path}`);
  return alt instanceof TFile ? alt : null;
}

export function collectFolderOccupiedLocalDaysSync(
  app: App,
  folder: string,
  filenameFormat: string,
): Set<string> {
  return collectFallbackOccupiedLocalDaysSync(app, {
    folder,
    filenameFormat,
    templatePath: null,
  });
}

/** Regex for the configured filename (supports YYYY, MM, DD tokens only). */
export function dailyFilenameRegexFromFormat(filenameFormat: string): RegExp | null {
  if (!filenameFormat.includes("YYYY") || !filenameFormat.includes("MM") || !filenameFormat.includes("DD")) {
    return null;
  }
  let pattern = "";
  for (let i = 0; i < filenameFormat.length; ) {
    if (filenameFormat.startsWith("YYYY", i)) {
      pattern += "(\\d{4})";
      i += 4;
    } else if (filenameFormat.startsWith("MM", i)) {
      pattern += "(\\d{2})";
      i += 2;
    } else if (filenameFormat.startsWith("DD", i)) {
      pattern += "(\\d{2})";
      i += 2;
    } else {
      const c = filenameFormat[i]!;
      pattern += /[\\^$.*+?()[\]{}|]/.test(c) ? `\\${c}` : c;
      i += 1;
    }
  }
  return new RegExp(`^${pattern}$`);
}

const CONFLICTED_SUFFIX = /(?:\s+\[conflicted\])?$/i;

/** Parse YYYY-MM-DD from a daily-note basename (supports Obsidian conflict copies). */
export function dateKeyFromDailyNoteBasename(name: string, filenameFormat?: string): string | null {
  const base = name.replace(/\.md$/i, "");
  if (filenameFormat) {
    const re = dailyFilenameRegexFromFormat(filenameFormat);
    const stem = base.replace(CONFLICTED_SUFFIX, "");
    const m = re?.exec(stem);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const da = Number(m[3]);
      if (Number.isFinite(y) && mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
        return localDayKeyFromYmd(y, mo, da);
      }
    }
  }
  const relaxed = /^(\d{4})-(\d{2})-(\d{2})(?:\s+\[conflicted\])?$/i.exec(base);
  if (!relaxed) return null;
  const y = Number(relaxed[1]);
  const mo = Number(relaxed[2]);
  const da = Number(relaxed[3]);
  if (!Number.isFinite(y) || mo < 1 || mo > 12 || da < 1 || da > 31) return null;
  return localDayKeyFromYmd(y, mo, da);
}

function preferDailyNoteFile(existing: TFile | undefined, candidate: TFile): TFile {
  if (!existing) return candidate;
  const existingConflict = existing.name.includes("[conflicted]");
  const candidateConflict = candidate.name.includes("[conflicted]");
  if (existingConflict && !candidateConflict) return candidate;
  return existing;
}

function normalizeVaultPath(path: string): string {
  return path.replace(/^\/+/, "").replace(/\/+$/, "");
}

function parentDirOfVaultPath(path: string): string {
  const normalized = normalizeVaultPath(path);
  const i = normalized.lastIndexOf("/");
  return i === -1 ? "" : normalized.slice(0, i);
}

function localDayKeyFromYmd(y: number, mo: number, da: number): string {
  return `${y}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}`;
}

/**
 * Local calendar days (YYYY-MM-DD) that have a note file matching the fallback folder + filename pattern.
 */
export function collectFallbackOccupiedLocalDaysSync(app: App, fallback: DailyNoteFallbackSettings): Set<string> {
  const out = new Set<string>();
  const folder = normalizeVaultPath(fallback.folder.trim());
  if (!folder) return out;

  for (const f of app.vault.getMarkdownFiles()) {
    if (parentDirOfVaultPath(f.path) !== folder) continue;
    const key = dateKeyFromDailyNoteBasename(f.name, fallback.filenameFormat);
    if (!key) continue;
    out.add(key);
  }
  return out;
}

/** Markdown daily-note files in a folder (YYYY-MM-DD.md pattern). */
export function listDailyNoteFilesInFolder(
  app: App,
  folder: string,
  filenameFormat: string,
): TFile[] {
  const normalizedFolder = normalizeVaultPath(folder.trim());
  if (!normalizedFolder) return [];

  const byKey = new Map<string, TFile>();
  for (const f of app.vault.getMarkdownFiles()) {
    if (parentDirOfVaultPath(f.path) !== normalizedFolder) continue;
    const key = dateKeyFromDailyNoteBasename(f.name, filenameFormat);
    if (!key) continue;
    byKey.set(key, preferDailyNoteFile(byKey.get(key), f));
  }
  return [...byKey.values()];
}
