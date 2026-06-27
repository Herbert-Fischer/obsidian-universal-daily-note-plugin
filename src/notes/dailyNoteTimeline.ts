import type { App, TFile } from "obsidian";
import type { CalendarSyncSettings, DailyNoteFallbackSettings, TagebuchVerweiseSettings } from "../settings";
import { dateKeyFromDailyNoteBasename, listDailyNoteFilesInFolder } from "./dailyNoteFallbackPaths";
import { getDailyNoteInterface, getExistingDailyNoteFile } from "./dailyNotesCore";
import { addLocalDays, normalizeLocalDay } from "../panel/dateUtils";
import {
  finalizeJournalHeadings,
  isAllJournalHeadings,
  isExcludedJournalHeading,
} from "./journalHeadingFilter";
import { DEFAULT_EXCLUDED_JOURNAL_HEADINGS, DEFAULT_JOURNAL_HEADING } from "../settings";
import { entryMatchesTextFilter } from "./entryTextFilter";
import { readDailyNoteSummary } from "./dailyNoteSummary";
import { parseWandernMetaLine, wandernTimelineTextFromMeta } from "./wandernLayout";
import {
  isLegacyMisplacedSonstigesTripCallout,
  isManagedCalloutStart,
  isPlainJournalBulletLine,
  isReisenTripCalloutLine,
  extractReisenTripFromSection,
  parseReisenTripLabel,
  readCalloutTitleFromLines,
  stripLeadingGermanDateFromCalloutTitle,
  dateFromDateKey,
} from "./journalCallout";

function tryWandernTimelineEntry(
  line: string,
  lineIndex: number,
  section: string,
): TimelineEntry | null {
  const meta = parseWandernMetaLine(line.trim());
  if (!meta) return null;
  const text = wandernTimelineTextFromMeta(meta);
  if (!text) return null;
  return { line: lineIndex, text, rawLine: line, section };
}

function sectionHasJournalActivity(textLines: string[], sectionStart: number, heading: string): boolean {
  const headingLower = heading.trim().toLowerCase();
  for (let j = sectionStart + 1; j < textLines.length; j++) {
    const line = textLines[j] ?? "";
    const trimmed = line.trim();
    if (/^#{1,6}\s/.test(trimmed)) break;
    if (!trimmed || trimmed === "---") continue;
    if (/^[-*+]\s/.test(trimmed) || /^>\s*[-*+]\s/.test(trimmed)) return true;
    if (headingLower === "wandern") {
      if (parseWandernMetaLine(trimmed)) return true;
      if (isManagedCalloutStart(line, heading)) return true;
    }
  }
  return false;
}

export type TimelineEntry = {
  line: number;
  text: string;
  rawLine: string;
  /** Set when loading merged sections (journalHeading = Alle). */
  section?: string;
};

export type TimelineDay = {
  dateKey: string;
  label: string;
  filePath: string;
  entries: TimelineEntry[];
  summary: string;
  /** Reisen trip bracket label from callout title (e.g. Mamas 90ter Geburtstag). */
  tripLabel?: string;
  /** Populated for journalHeading = Alle. */
  sectionGroups?: TimelineSectionGroup[];
};

export type TimelineTripGroup = {
  tripLabel: string | null;
  days: TimelineDay[];
};

export type TimelineSectionGroup = {
  section: string;
  calloutTitle: string;
  entries: TimelineEntry[];
};

/** Group „Alle“ entries by ## section with callout title (document order). */
export function groupTimelineEntriesBySection(
  lines: string[],
  entries: TimelineEntry[],
  dateKey: string,
): TimelineSectionGroup[] {
  const date = dateFromDateKey(dateKey);
  const buckets = new Map<string, { section: string; entries: TimelineEntry[]; firstLine: number }>();

  for (const entry of entries) {
    const section = entry.section?.trim() || DEFAULT_JOURNAL_HEADING;
    const key = section.toLowerCase();
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.entries.push(entry);
    } else {
      buckets.set(key, { section, entries: [entry], firstLine: entry.line });
    }
  }

  return [...buckets.values()]
    .sort((a, b) => a.firstLine - b.firstLine)
    .map(({ section, entries: sectionEntries }) => ({
      section,
      calloutTitle: readCalloutTitleFromLines(lines, section, date),
      entries: sectionEntries.sort((a, b) => a.line - b.line),
    }));
}

/** Keep section order/titles after text filter removed some entries. */
export function filterTimelineSectionGroups(
  entries: TimelineEntry[],
  groups: TimelineSectionGroup[] | undefined,
): TimelineSectionGroup[] | undefined {
  if (!groups || groups.length === 0) return groups;
  const bySection = new Map<string, TimelineEntry[]>();
  for (const entry of entries) {
    const key = (entry.section?.trim() || DEFAULT_JOURNAL_HEADING).toLowerCase();
    const list = bySection.get(key);
    if (list) list.push(entry);
    else bySection.set(key, [entry]);
  }
  return groups
    .map((group) => ({
      ...group,
      entries: (bySection.get(group.section.toLowerCase()) ?? []).sort((a, b) => a.line - b.line),
    }))
    .filter((group) => group.entries.length > 0);
}

/** Group consecutive days that share the same Reisen trip label. Days are newest-first. */
export function groupTimelineDaysByTrip(days: TimelineDay[]): TimelineTripGroup[] {
  const groups: TimelineTripGroup[] = [];
  for (const day of days) {
    const label = day.tripLabel ?? null;
    const prev = groups[groups.length - 1];
    if (prev && label !== null && prev.tripLabel === label) {
      prev.days.push(day);
    } else {
      groups.push({ tripLabel: label, days: [day] });
    }
  }
  for (const group of groups) {
    group.days.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }
  return groups;
}

export type DailyNoteTimeline = {
  rangeLabel: string;
  days: TimelineDay[];
};

export type TimelineSettings = {
  durationDays: number;
  journalHeading: string;
  excludedHeadings?: string[];
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

function mergeEntriesByLine(entries: TimelineEntry[]): TimelineEntry[] {
  const byLine = new Map<number, TimelineEntry>();
  for (const entry of entries) {
    byLine.set(entry.line, entry);
  }
  return [...byLine.values()].sort((a, b) => a.line - b.line);
}

/** Reisen entries only from ## Reisen (section-based, not global callout scan). */
export function extractReisenJournalLines(textLines: string[]): TimelineEntry[] {
  return extractJournalLines(textLines, "Reisen");
}

function resolveTripLabelForDay(
  lines: string[],
  journalHeading: string,
  entries: TimelineEntry[],
): string | null {
  if (journalHeading.trim().toLowerCase() !== "reisen" || entries.length === 0) return null;
  const fromSection = extractReisenTripFromSection(lines, journalHeading);
  if (fromSection) return fromSection;
  for (let i = 0; i < lines.length; i++) {
    if (!isReisenTripCalloutLine(lines[i] ?? "")) continue;
    const label = parseReisenTripLabel(lines[i] ?? "");
    if (label) return label;
  }
  return null;
}

export function extractJournalLines(
  textLines: string[],
  journalHeading: string,
): TimelineEntry[] {
  const target = journalHeading.trim().toLowerCase();
  const isReisen = target === "reisen";
  const isWandern = target === "wandern";
  let inSection = false;
  let inManagedCallout = false;
  let skipReisenTripCallout = false;
  const out: TimelineEntry[] = [];

  for (let i = 0; i < textLines.length; i++) {
    const line = textLines[i] ?? "";
    const trimmed = line.trim();
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      inSection = h2[1]?.trim().toLowerCase() === target;
      inManagedCallout = false;
      skipReisenTripCallout = false;
      continue;
    }

    if (
      !isReisen &&
      (isReisenTripCalloutLine(line) ||
        (target === "sonstiges" && isLegacyMisplacedSonstigesTripCallout(line)))
    ) {
      skipReisenTripCallout = true;
      inManagedCallout = false;
      continue;
    }

    if (skipReisenTripCallout) {
      if (!trimmed.startsWith(">")) skipReisenTripCallout = false;
      else continue;
    }

    if (!inSection) continue;
    if (!trimmed || trimmed === "---") continue;
    if (/^#{1,6}\s/.test(trimmed)) break;

    if (isWandern) {
      const entry = tryWandernTimelineEntry(line, i, journalHeading);
      if (entry) {
        out.push(entry);
        continue;
      }
    }

    if (isManagedCalloutStart(line, journalHeading)) {
      inManagedCallout = true;
      continue;
    }

    if (inManagedCallout) {
      if (!trimmed.startsWith(">")) {
        inManagedCallout = false;
      } else if (isPlainJournalBulletLine(line)) {
        const text = cleanJournalLine(trimmed);
        if (text) out.push({ line: i, text, rawLine: line });
        continue;
      } else if (trimmed === ">") {
        continue;
      } else {
        inManagedCallout = false;
      }
    }

    if (isPlainJournalBulletLine(line)) {
      const text = cleanJournalLine(trimmed);
      if (text) out.push({ line: i, text, rawLine: line });
    }
  }

  return out;
}

/** Read entries from a managed callout when the ## section is missing (legacy notes). */
export function extractJournalLinesFromCallout(
  textLines: string[],
  journalHeading: string,
): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  let inCallout = false;

  for (let i = 0; i < textLines.length; i++) {
    const line = textLines[i] ?? "";
    if (isManagedCalloutStart(line, journalHeading)) {
      inCallout = true;
      continue;
    }
    if (!inCallout) continue;
    const trimmed = line.trim();
    if (!trimmed.startsWith(">")) break;
    if (trimmed === ">") continue;
    if (isPlainJournalBulletLine(line)) {
      const text = cleanJournalLine(trimmed);
      if (text) out.push({ line: i, text, rawLine: line });
    }
  }

  return out;
}

/** Journal bullets from every non-excluded ## section (and legacy Tagebuch callout). */
export function extractJournalLinesAllHeadings(
  textLines: string[],
  excluded: string[] = DEFAULT_EXCLUDED_JOURNAL_HEADINGS,
): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  let currentSection: string | null = null;
  let inManagedCallout = false;
  let reisenTripSection = false;

  for (let i = 0; i < textLines.length; i++) {
    const line = textLines[i] ?? "";
    const trimmed = line.trim();
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      currentSection = h2[1]?.trim() ?? null;
      inManagedCallout = false;
      reisenTripSection = false;
      continue;
    }

    if (isReisenTripCalloutLine(line)) {
      inManagedCallout = true;
      reisenTripSection = true;
      continue;
    }

    if (currentSection && isExcludedJournalHeading(currentSection, excluded)) {
      inManagedCallout = false;
      reisenTripSection = false;
      continue;
    }

    if (currentSection?.trim().toLowerCase() === "wandern") {
      const entry = tryWandernTimelineEntry(line, i, currentSection);
      if (entry) {
        out.push(entry);
        continue;
      }
    }

    const sectionLabel = reisenTripSection ? "Reisen" : currentSection;

    if (currentSection && !reisenTripSection && isManagedCalloutStart(line, currentSection)) {
      inManagedCallout = true;
      continue;
    }

    if (currentSection && inManagedCallout) {
      if (!trimmed.startsWith(">")) {
        inManagedCallout = false;
        reisenTripSection = false;
      } else if (isPlainJournalBulletLine(line)) {
        const text = cleanJournalLine(trimmed);
        if (text && sectionLabel) out.push({ line: i, text, rawLine: line, section: sectionLabel });
        continue;
      } else if (trimmed === ">") {
        continue;
      } else {
        inManagedCallout = false;
        reisenTripSection = false;
      }
    }

    if (currentSection && !reisenTripSection && isPlainJournalBulletLine(line)) {
      const text = cleanJournalLine(line.trim());
      if (text) out.push({ line: i, text, rawLine: line, section: currentSection });
    }
  }

  if (out.length === 0) {
    const legacy = extractJournalLinesFromCallout(textLines, DEFAULT_JOURNAL_HEADING);
    for (const entry of legacy) {
      out.push({ ...entry, section: DEFAULT_JOURNAL_HEADING });
    }
  }

  return mergeEntriesByLine(out);
}

/** All ## level-2 headings in document order. */
export function extractAllH2Headings(textLines: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const line of textLines) {
    const h2 = line.match(/^##\s+(.+)$/);
    if (!h2) continue;
    const heading = h2[1]?.trim();
    if (!heading) continue;
    const key = heading.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(heading);
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

    if (sectionHasJournalActivity(textLines, i, heading)) {
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

/** Day headline in outline: YAML summary for „Alle“, otherwise active section callout title. */
export function resolveDayHeadline(
  lines: string[],
  journalHeading: string,
  yamlSummary: string,
  dateKey: string,
): string {
  if (isAllJournalHeadings(journalHeading)) {
    return yamlSummary.trim();
  }
  const title = readCalloutTitleFromLines(lines, journalHeading, dateFromDateKey(dateKey));
  if (journalHeading.trim().toLowerCase() === DEFAULT_JOURNAL_HEADING.toLowerCase()) {
    return stripLeadingGermanDateFromCalloutTitle(title);
  }
  return title;
}

async function loadDayFromFile(
  file: TFile,
  dateKey: string,
  journalHeading: string,
  app: App,
  textQuery?: string,
  excludedHeadings: string[] = DEFAULT_EXCLUDED_JOURNAL_HEADINGS,
): Promise<TimelineDay | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plugin = (app as any).plugins?.plugins?.["universal-daily-note"] as
    | {
        settings?: {
          calendarSync: CalendarSyncSettings;
          dailyNoteFallback: DailyNoteFallbackSettings;
          outline: { journalHeading: string };
        };
      }
    | undefined;
  const sync = plugin?.settings?.calendarSync;
  if (sync?.enabled && sync.syncOnOutlineLoad && plugin?.settings) {
    const [y, m, d] = dateKey.split("-").map(Number);
    if (y && m && d) {
      const { syncCalendarAppointmentsIntoDailyNote } = await import("../integrations/calendarAppointments");
      await syncCalendarAppointmentsIntoDailyNote(app, {
        date: new Date(y, m - 1, d, 0, 0, 0, 0),
        fallback: plugin.settings.dailyNoteFallback,
        settings: sync,
        oncePerSession: true,
      });
    }
  }

  let text = "";
  try {
    text = await app.vault.read(file);
  } catch {
    return null;
  }

  const lines = text.split("\n");
  const headingLower = journalHeading.trim().toLowerCase();
  let entries = isAllJournalHeadings(journalHeading)
    ? extractJournalLinesAllHeadings(lines, excludedHeadings)
    : headingLower === "reisen"
      ? extractReisenJournalLines(lines)
      : extractJournalLines(lines, journalHeading);
  const q = textQuery?.trim();
  if (q) {
    entries = entries.filter((e) => entryMatchesTextFilter(e.text, q));
  }
  if (entries.length === 0) return null;

  const tripLabel = resolveTripLabelForDay(lines, journalHeading, entries);
  const yamlSummary = readDailyNoteSummary(app, file);
  const allHeadings = isAllJournalHeadings(journalHeading);

  return {
    dateKey,
    label: dateKey,
    filePath: file.path,
    entries,
    summary: resolveDayHeadline(lines, journalHeading, yamlSummary, dateKey),
    ...(allHeadings ? { sectionGroups: groupTimelineEntriesBySection(lines, entries, dateKey) } : {}),
    ...(tripLabel ? { tripLabel } : {}),
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
  const excludedHeadings = timeline.excludedHeadings ?? DEFAULT_EXCLUDED_JOURNAL_HEADINGS;
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
    const day = await loadDayFromFile(file, key, journalHeading, app, textQuery, excludedHeadings);
    if (!day) continue;
    days.push(day);
    if (!loadAll && days.length >= pageSize) break;
  }

  days.sort((a, b) => b.dateKey.localeCompare(a.dateKey));

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
