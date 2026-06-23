import type { App, TFile } from "obsidian";
import type { DailyNoteFallbackSettings, TagebuchVerweiseSettings } from "../settings";
import { dateKeyFromDailyNoteBasename, listDailyNoteFilesInFolder } from "./dailyNoteFallbackPaths";
import { getDailyNoteInterface, getExistingDailyNoteFile } from "./dailyNotesCore";
import { addLocalDays, normalizeLocalDay } from "../panel/dateUtils";
import {
  finalizeJournalHeadings,
  isExcludedJournalHeading,
} from "./journalHeadingFilter";
import { DEFAULT_EXCLUDED_JOURNAL_HEADINGS, DEFAULT_JOURNAL_HEADING } from "../settings";
import { entryMatchesTextFilter } from "./entryTextFilter";
import { readDailyNoteSummary } from "./dailyNoteSummary";

export type TimelineEntry = {
  line: number;
  text: string;
  rawLine: string;
};

export type TimelineDay = {
  dateKey: string;
  label: string;
  filePath: string;
  entries: TimelineEntry[];
  summary: string;
};

export type DailyNoteTimeline = {
  rangeLabel: string;
  days: TimelineDay[];
};

export type TimelineSettings = {
  durationDays: number;
  journalHeading: string;
};

function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateKeyFromFileName(name: string, filenameFormat: string): string | null {
  return dateKeyFromDailyNoteBasename(name, filenameFormat);
}

function formatRangeLabel(earliest: Date, latest: Date): string {
  const fmt = (d: Date) =>
    `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  return `${fmt(earliest)} - ${fmt(latest)}`;
}

function cleanJournalLine(raw: string): string {
  return raw
    .trim()
    .replace(/^>\s*/, "")
    .replace(/^[-*+]\s+/, "");
}

export function extractJournalLines(
  textLines: string[],
  journalHeading: string,
): TimelineEntry[] {
  const target = journalHeading.trim().toLowerCase();
  let inSection = false;
  const out: TimelineEntry[] = [];

  for (let i = 0; i < textLines.length; i++) {
    const line = textLines[i] ?? "";
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      inSection = h2[1]?.trim().toLowerCase() === target;
      continue;
    }
    if (!inSection) continue;
    const trimmed = line.trim();
    if (!trimmed || trimmed === "---") continue;
    if (/^#{1,6}\s/.test(trimmed)) break;
    if (/^[-*+]\s/.test(trimmed) || /^>\s*[-*+]\s/.test(trimmed)) {
      const text = cleanJournalLine(trimmed);
      if (text) out.push({ line: i, text, rawLine: line });
    }
  }

  return out;
}

/** ## headings that contain at least one bullet/list entry. */
export function extractUsedJournalHeadings(textLines: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < textLines.length; i++) {
    const h2 = textLines[i]?.match(/^##\s+(.+)$/);
    if (!h2) continue;
    const heading = h2[1]?.trim();
    if (!heading) continue;

    let hasEntry = false;
    for (let j = i + 1; j < textLines.length; j++) {
      const line = textLines[j] ?? "";
      const trimmed = line.trim();
      if (/^#{1,6}\s/.test(trimmed)) break;
      if (!trimmed || trimmed === "---") continue;
      if (/^[-*+]\s/.test(trimmed) || /^>\s*[-*+]\s/.test(trimmed)) {
        hasEntry = true;
        break;
      }
    }

    if (hasEntry) {
      const key = heading.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(heading);
      }
    }
  }

  return out;
}

export function resolveDailyNotesFolder(
  app: App,
  tagebuch: TagebuchVerweiseSettings,
  fallback: DailyNoteFallbackSettings,
): string {
  const configured = tagebuch.dailyNotesFolder.trim();
  if (configured) return configured;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const coreFolder = (app as any).internalPlugins?.plugins?.["daily-notes"]?.instance?.options?.folder;
  if (typeof coreFolder === "string" && coreFolder.trim()) return coreFolder.trim();

  return fallback.folder.trim();
}

async function loadDayFromFile(
  file: TFile,
  dateKey: string,
  journalHeading: string,
  app: App,
  textQuery?: string,
): Promise<TimelineDay | null> {
  let text = "";
  try {
    text = await app.vault.read(file);
  } catch {
    return null;
  }

  let entries = extractJournalLines(text.split("\n"), journalHeading);
  const q = textQuery?.trim();
  if (q) {
    entries = entries.filter((e) => entryMatchesTextFilter(e.text, q));
  }
  if (entries.length === 0) return null;

  return {
    dateKey,
    label: dateKey,
    filePath: file.path,
    entries,
    summary: readDailyNoteSummary(app, file),
  };
}

async function loadDay(
  app: App,
  date: Date,
  fallback: DailyNoteFallbackSettings,
  dailyNotesFolder: string,
  journalHeading: string,
): Promise<TimelineDay | null> {
  const file = getExistingDailyNoteFile(app, date, fallback, dailyNotesFolder);
  if (!file) return null;
  return loadDayFromFile(file, localDayKey(date), journalHeading, app);
}

export type OutlineBatch = {
  days: TimelineDay[];
  hasMore: boolean;
  rangeLabel: string;
};

export type OutlineBatchOptions = {
  pageSize: number;
  /** Load days strictly before this YYYY-MM-DD key (for infinite scroll). */
  beforeDateKey?: string | null;
  /** When set, load all journal days in this inclusive date-key range (no pagination). */
  bounds?: OutlineDateBounds | null;
  /** Skip pageSize cap and scan the full candidate key range (text search in „Alle“). */
  loadAll?: boolean;
  /** Limit scroll-mode scan to this many days ending at anchor (matches durationDays). */
  maxDaysBack?: number;
  /** When set, only days with matching journal lines are included. */
  textQuery?: string;
};

export type OutlineDateBounds = {
  startDateKey: string;
  endDateKey: string;
};

function buildFileKeyIndex(
  app: App,
  dailyNotesFolder: string,
  filenameFormat: string,
): { keysDesc: string[]; fileByKey: Map<string, TFile> } {
  const fileByKey = new Map<string, TFile>();
  const normalizedFolder = dailyNotesFolder.trim().replace(/^\/+/, "").replace(/\/+$/, "");

  const dni = getDailyNoteInterface();
  const getAll = dni?.getAllDailyNotes;
  if (typeof getAll === "function") {
    try {
      const notes = getAll() as Record<string, TFile>;
      for (const file of Object.values(notes)) {
        if (!file?.path) continue;
        const parent = file.path.replace(/^\/+/, "").replace(/\/[^/]+$/, "");
        if (parent !== normalizedFolder) continue;
        const key = dateKeyFromDailyNoteBasename(file.name, filenameFormat);
        if (!key) continue;
        const existing = fileByKey.get(key);
        if (!existing || (existing.name.includes("[conflicted]") && !file.name.includes("[conflicted]"))) {
          fileByKey.set(key, file);
        }
      }
    } catch {
      // fall through to folder scan
    }
  }

  for (const file of listDailyNoteFilesInFolder(app, dailyNotesFolder, filenameFormat)) {
    const key = dateKeyFromDailyNoteBasename(file.name, filenameFormat);
    if (!key) continue;
    const existing = fileByKey.get(key);
    if (!existing || (existing.name.includes("[conflicted]") && !file.name.includes("[conflicted]"))) {
      fileByKey.set(key, file);
    }
  }

  const keysDesc = [...fileByKey.keys()].sort((a, b) => b.localeCompare(a));
  return { keysDesc, fileByKey };
}

function applyDateBounds(keys: string[], bounds?: OutlineDateBounds | null): string[] {
  if (!bounds) return keys;
  return keys.filter((k) => k >= bounds.startDateKey && k <= bounds.endDateKey);
}

function candidateKeys(
  keysDesc: string[],
  anchor: Date,
  options: Pick<OutlineBatchOptions, "beforeDateKey" | "bounds" | "maxDaysBack">,
): string[] {
  if (options.beforeDateKey) return keysDesc.filter((k) => k < options.beforeDateKey);
  if (options.bounds) return applyDateBounds(keysDesc, options.bounds);
  const anchorKey = localDayKey(anchor);
  let keys = keysDesc.filter((k) => k <= anchorKey);
  if (keys.length === 0) keys = keysDesc;
  const span = options.maxDaysBack;
  if (span != null && span > 0) {
    const end = normalizeLocalDay(anchor);
    const start = addLocalDays(end, -(Math.max(1, span) - 1));
    const startKey = localDayKey(start);
    keys = keys.filter((k) => k >= startKey);
  }
  return keys;
}

function batchRangeLabel(days: TimelineDay[]): string {
  if (days.length === 0) return "";
  const oldest = days[days.length - 1]!.dateKey;
  const newest = days[0]!.dateKey;
  const parse = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y!, m! - 1, d!, 0, 0, 0, 0);
  };
  return formatRangeLabel(parse(oldest)!, parse(newest)!);
}

export async function loadOutlineBatch(
  app: App,
  anchor: Date,
  fallback: DailyNoteFallbackSettings,
  tagebuch: TagebuchVerweiseSettings,
  timeline: TimelineSettings,
  options: OutlineBatchOptions,
): Promise<OutlineBatch> {
  const journalHeading = timeline?.journalHeading?.trim() || "Tagebuch";
  const pageSize = Math.max(1, options.pageSize);
  const bounded = Boolean(options.bounds);
  const loadAll = bounded || Boolean(options.loadAll);
  const textQuery = options.textQuery?.trim() || undefined;
  const dailyNotesFolder = resolveDailyNotesFolder(app, tagebuch, fallback);
  const filenameFormat = fallback.filenameFormat.trim() || "YYYY-MM-DD";

  const { keysDesc, fileByKey } = buildFileKeyIndex(app, dailyNotesFolder, filenameFormat);
  const keys = candidateKeys(keysDesc, anchor, options);

  const days: TimelineDay[] = [];

  for (const key of keys) {
    const file = fileByKey.get(key);
    if (!file) continue;
    const day = await loadDayFromFile(file, key, journalHeading, app, textQuery);
    if (!day) continue;
    days.push(day);
    if (!loadAll && days.length >= pageSize) break;
  }

  const oldestLoaded = days[days.length - 1]?.dateKey;
  const hasMore =
    !loadAll && oldestLoaded != null && keys.some((k) => k < oldestLoaded);

  return {
    days,
    hasMore,
    rangeLabel: batchRangeLabel(days),
  };
}

export type LoadUsedJournalHeadingsOptions = {
  excludedHeadings?: string[];
  defaultHeading?: string;
  bounds?: OutlineDateBounds | null;
  durationDays?: number;
};

export async function loadUsedJournalHeadings(
  app: App,
  anchor: Date,
  fallback: DailyNoteFallbackSettings,
  tagebuch: TagebuchVerweiseSettings,
  durationDays: number,
  options: LoadUsedJournalHeadingsOptions = {},
): Promise<string[]> {
  const excluded = options.excludedHeadings ?? DEFAULT_EXCLUDED_JOURNAL_HEADINGS;
  const defaultHeading = options.defaultHeading ?? DEFAULT_JOURNAL_HEADING;
  const dailyNotesFolder = resolveDailyNotesFolder(app, tagebuch, fallback);
  const filenameFormat = fallback.filenameFormat.trim() || "YYYY-MM-DD";
  const { keysDesc, fileByKey } = buildFileKeyIndex(app, dailyNotesFolder, filenameFormat);

  let keys: string[];
  if (options.bounds) {
    keys = applyDateBounds(keysDesc, options.bounds);
  } else {
    const end = normalizeLocalDay(anchor);
    const span = Math.max(1, options.durationDays ?? durationDays);
    const start = addLocalDays(end, -(span - 1));
    const startKey = localDayKey(start);
    const endKey = localDayKey(end);
    keys = keysDesc.filter((k) => k >= startKey && k <= endKey);
  }

  const seen = new Map<string, string>();
  for (const key of keys) {
    const file = fileByKey.get(key);
    if (!file) continue;
    let text = "";
    try {
      text = await app.vault.read(file);
    } catch {
      continue;
    }
    for (const heading of extractUsedJournalHeadings(text.split("\n"))) {
      if (isExcludedJournalHeading(heading, excluded)) continue;
      const lower = heading.toLowerCase();
      if (!seen.has(lower)) seen.set(lower, heading);
    }
  }

  return finalizeJournalHeadings([...seen.values()], excluded, defaultHeading);
}

/** @deprecated Use loadOutlineBatch for paginated outline. */
export async function loadDailyNoteTimeline(
  app: App,
  latest: Date,
  fallback: DailyNoteFallbackSettings,
  tagebuch: TagebuchVerweiseSettings,
  timeline: TimelineSettings,
): Promise<DailyNoteTimeline> {
  const settings: TimelineSettings = {
    durationDays: Math.max(1, timeline?.durationDays ?? 365),
    journalHeading: timeline?.journalHeading?.trim() || "Tagebuch",
  };

  const end = normalizeLocalDay(latest);
  const start = addLocalDays(end, -(settings.durationDays - 1));
  const startKey = localDayKey(start);
  const endKey = localDayKey(end);
  const dailyNotesFolder = resolveDailyNotesFolder(app, tagebuch, fallback);
  const filenameFormat = fallback.filenameFormat.trim() || "YYYY-MM-DD";

  const filesInFolder = listDailyNoteFilesInFolder(app, dailyNotesFolder, filenameFormat);
  const filesInRange = filesInFolder.filter((file) => {
    const key = dateKeyFromFileName(file.name, filenameFormat);
    return key != null && key >= startKey && key <= endKey;
  });

  const loaded = await Promise.all(
    filesInRange.map(async (file) => {
      const dateKey = dateKeyFromFileName(file.name, filenameFormat);
      if (!dateKey) return null;
      return loadDayFromFile(file, dateKey, settings.journalHeading, app);
    }),
  );

  let days = loaded.filter((day): day is TimelineDay => day != null);

  if (days.length === 0 && filesInRange.length === 0) {
    const date = normalizeLocalDay(latest);
    const single = await loadDay(app, date, fallback, dailyNotesFolder, settings.journalHeading);
    if (single) days = [single];
  }

  days.sort((a, b) => b.dateKey.localeCompare(a.dateKey));

  return {
    rangeLabel: formatRangeLabel(start, end),
    days,
  };
}

import { openPathInMainPane } from "./openInMainPane";

export async function openTimelineEntry(app: App, filePath: string, line: number): Promise<void> {
  await openPathInMainPane(app, filePath, line);
}
