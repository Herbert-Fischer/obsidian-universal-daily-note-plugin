import { moment, type App, type TFile } from "obsidian";
import type { DailyNoteFallbackSettings } from "../settings";
import {
  collectFallbackOccupiedLocalDaysSync,
  collectFolderOccupiedLocalDaysSync,
  getExistingDailyNoteFileInFolder,
  getExistingFallbackDailyNoteFile,
} from "./dailyNoteFallbackPaths";

/** Local calendar day as Moment (matches obsidian-daily-notes-interface expectations). */
export function dailyMomentForCalendarDate(d: Date) {
  return moment([d.getFullYear(), d.getMonth(), d.getDate()]);
}

export function getDailyNoteInterface(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return require("obsidian-daily-notes-interface") as any;
  } catch {
    return null;
  }
}

/** Same key as used in `getAllDailyNotes()` / `getDailyNote()`. */
export function dailyNoteUidForDate(d: Date): string {
  const dni = getDailyNoteInterface();
  const getDateUID = dni?.getDateUID;
  if (typeof getDateUID !== "function") return "";
  return getDateUID(dailyMomentForCalendarDate(d), "day");
}

function getExistingDailyNoteFileFromInterface(allNotes: Record<string, TFile>, mDate: ReturnType<typeof moment>): TFile | null {
  const dni = getDailyNoteInterface();
  const getDailyNote = dni?.getDailyNote;
  if (typeof getDailyNote !== "function") return null;
  try {
    return (getDailyNote(mDate, allNotes) as TFile) ?? null;
  } catch {
    return null;
  }
}

/** Synchronous index of daily-note date UIDs (same keys as `getDailyNote`). Use for UI dots. */
export function getAllDailyNoteUidsSync(): Set<string> {
  const dni = getDailyNoteInterface();
  if (!dni?.getAllDailyNotes) return new Set();
  try {
    const notes = dni.getAllDailyNotes();
    return new Set(Object.keys(notes ?? {}));
  } catch {
    return new Set();
  }
}

/**
 * Local calendar days (YYYY-MM-DD) that have an existing daily note file.
 * Uses Daily Notes interface when available; otherwise (or in addition) the plugin fallback path pattern.
 */
export function getDailyNoteOccupiedLocalDaysSync(
  app: App,
  fallback: DailyNoteFallbackSettings,
  extraFolder?: string,
): Set<string> {
  const out = new Set<string>();
  const dni = getDailyNoteInterface();
  const getAll = dni?.getAllDailyNotes;
  const getDateFromFile = dni?.getDateFromFile;
  if (typeof getAll === "function" && typeof getDateFromFile === "function") {
    try {
      const notes = getAll() as Record<string, TFile>;
      for (const file of Object.values(notes)) {
        if (!file || typeof file.path !== "string") continue;
        const m = getDateFromFile(file, "day");
        if (!m) continue;
        if (typeof m.isValid === "function" && !m.isValid()) continue;
        const y = m.year();
        const mo = m.month() + 1;
        const da = m.date();
        out.add(`${y}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}`);
      }
    } catch {
      // folder missing, etc.
    }
  }
  for (const k of collectFallbackOccupiedLocalDaysSync(app, fallback)) {
    out.add(k);
  }
  if (extraFolder?.trim()) {
    for (const k of collectFolderOccupiedLocalDaysSync(app, extraFolder, fallback.filenameFormat)) {
      out.add(k);
    }
  }
  return out;
}

/** Returns the daily note file for that calendar day if it already exists (no create). */
export function getExistingDailyNoteFile(
  app: App,
  date: Date,
  fallback: DailyNoteFallbackSettings,
  extraFolder?: string,
): TFile | null {
  const dni = getDailyNoteInterface();
  const getAllDailyNotes = dni?.getAllDailyNotes;
  if (typeof getAllDailyNotes === "function") {
    try {
      const allNotes = getAllDailyNotes();
      const mDate = dailyMomentForCalendarDate(date);
      const via = getExistingDailyNoteFileFromInterface(allNotes, mDate);
      if (via) return via;
    } catch {
      // ignore
    }
  }
  if (extraFolder?.trim()) {
    const viaFolder = getExistingDailyNoteFileInFolder(
      app,
      date,
      extraFolder,
      fallback.filenameFormat,
    );
    if (viaFolder) return viaFolder;
  }
  return getExistingFallbackDailyNoteFile(app, date, fallback);
}

export async function openOrCreateCoreDailyNote(app: App, date: Date): Promise<TFile | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dailyNotes = (app as any).internalPlugins?.plugins?.["daily-notes"];
  if (!dailyNotes?.enabled) return null;

  const dni = getDailyNoteInterface();
  const getAllDailyNotes = dni?.getAllDailyNotes;
  const getDailyNote = dni?.getDailyNote;
  const createDailyNote = dni?.createDailyNote;

  if (typeof getAllDailyNotes !== "function" || typeof getDailyNote !== "function" || typeof createDailyNote !== "function") {
    return legacyOpenOrCreateDailyNote(dailyNotes, date);
  }

  const mDate = dailyMomentForCalendarDate(date);
  const allNotes = getAllDailyNotes();
  const existing = getDailyNote(mDate, allNotes);
  if (existing) return existing as TFile;

  const created = await createDailyNote(mDate);
  return (created as TFile) ?? null;
}

function legacyOpenOrCreateDailyNote(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dailyNotesPlugin: any,
  date: Date,
): Promise<TFile | null> {
  const instance = dailyNotesPlugin.instance;
  const mDate = dailyMomentForCalendarDate(date);
  const fn = instance?.getDailyNote ?? instance?.openDailyNote ?? instance?.createDailyNote;
  if (typeof fn !== "function") return Promise.resolve(null);
  return Promise.resolve()
    .then(() => fn.call(instance, mDate))
    .then((res: unknown) => (res as TFile) ?? null)
    .catch(() => null);
}
