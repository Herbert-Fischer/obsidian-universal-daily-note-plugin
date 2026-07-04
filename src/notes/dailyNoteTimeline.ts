import type { App, TFile } from "obsidian";
import type { CalendarSyncSettings, DailyNoteFallbackSettings, TagebuchVerweiseSettings } from "../settings";
import { syncCalendarAppointmentsIntoDailyNote } from "../integrations/calendarAppointments";
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
import {
  entryMatchesFeedContextFilter,
  entryMatchesFeedProfileFilters,
  effectiveFeedProfile,
  parseFeedMetadataComment,
  resolveFeedMetadata,
  resolveOutlineFeedFilters,
  type FeedProfile,
} from "./feedMetadata";
import { readDailyNoteSummary } from "./dailyNoteSummary";
import { stripLeadingTimeFromKurz, findTagebuchFeedLine } from "./appendTagebuchFeedLine";
import { parseJournalEntryDisplay } from "./parseJournalEntryDisplay";
import { buildReisenFeedKurz, buildWandernFeedKurz, feedDetailTimelineTextFromMeta, parseFeedDetailMetaFromLines, parseFeedDetailMetaLine } from "./feedDetailComposer";
import { parseSonstigesMetaFromLines, parseSonstigesMetaLine, SONSTIGES_HEADING } from "./sonstigesComposer";
import { collectReisenEntryIds, parseReisenMetaLine, parseReisenSortLine, reisenSupplementMatchesByTitle } from "./reisenComposer";
import { journalProfileById, journalProfileForHeading } from "./journalProfiles";
import { parseWandernMetaFromLines, parseWandernMetaLine, wandernTimelineTextFromMeta } from "./wandernLayout";
import {
  isLegacyMisplacedSonstigesTripCallout,
  isManagedCalloutStart,
  isPlainJournalBulletLine,
  isReisenTripCalloutLine,
  extractReisenTripFromSection,
  extractSectionRange,
  parseReisenTripLabel,
  readCalloutTitleFromLines,
  stripLeadingGermanDateFromCalloutTitle,
  dateFromDateKey,
} from "./journalCallout";
import { stripEntryMeta, parseEntryMetaComment, isEntryMetaCommentLine } from "./journalEntryMeta";
import {
  entryMatchesProfileFilter,
  feedProfileForSectionHeading,
} from "./journalEntryGroups";

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

function tryFeedDetailTimelineEntry(
  line: string,
  lineIndex: number,
  section: string,
  allLines: string[],
): TimelineEntry | null {
  const profile = journalProfileForHeading(section);
  if (!profile || profile.kind !== "detail" || (profile.id !== "heizung" && profile.id !== "lueftung")) {
    return null;
  }
  const meta = parseFeedDetailMetaLine(line.trim(), profile);
  if (!meta) return null;

  const context =
    meta.titel.trim().toLowerCase() !== profile.label.toLowerCase() ? meta.titel.trim() : "";
  let feed = findTagebuchFeedLine(allLines, profile.id, context);
  if (!feed && context) {
    feed = findTagebuchFeedLine(allLines, profile.id, "");
  }
  if (feed) {
    return {
      line: feed.lineIndex,
      text: feed.text,
      rawLine: feed.rawLine,
      section,
      feedProfile: profile.id,
      ...(context ? { feedContext: context } : {}),
    };
  }

  const text = feedDetailTimelineTextFromMeta(meta, profile);
  if (!text) return null;
  return {
    line: lineIndex,
    text,
    rawLine: line,
    section,
    feedProfile: profile.id,
    ...(context ? { feedContext: context } : {}),
  };
}

function extractFeedDetailSectionEntries(textLines: string[], journalHeading: string): TimelineEntry[] {
  const profile = journalProfileForHeading(journalHeading);
  if (!profile || (profile.id !== "heizung" && profile.id !== "lueftung")) return [];

  const range = extractSectionRange(textLines, profile.label);
  if (!range) return [];

  for (let i = range.start + 1; i < range.end; i++) {
    const entry = tryFeedDetailTimelineEntry(textLines[i] ?? "", i, profile.label, textLines);
    if (entry) return [entry];
  }

  return [];
}

function sonstigesFeedContext(textLines: string[]): string {
  const title = readCalloutTitleFromLines(textLines, SONSTIGES_HEADING);
  return title.trim().toLowerCase() !== SONSTIGES_HEADING.toLowerCase() ? title.trim() : "";
}

function sonstigesTimelineEntryFromFeed(
  textLines: string[],
  section: string,
  fallbackLine: number,
): TimelineEntry | null {
  const context = sonstigesFeedContext(textLines);
  const feed = findTagebuchFeedLine(textLines, "sonstiges", context);
  if (feed) {
    return {
      line: feed.lineIndex,
      text: feed.text,
      rawLine: feed.rawLine,
      section,
      feedProfile: "sonstiges",
      ...(context ? { feedContext: context } : {}),
    };
  }

  const range = extractSectionRange(textLines, SONSTIGES_HEADING);
  if (!range) return null;
  const meta = parseSonstigesMetaFromLines(textLines.slice(range.start + 1, range.end));
  if (!meta) return null;

  const kurz = stripLeadingTimeFromKurz(meta.feedKurz || meta.titel || SONSTIGES_HEADING);
  const time = meta.feedTime.trim() || "12:00";
  const text = `${time} ${kurz}`.trim();
  return {
    line: fallbackLine,
    text,
    rawLine: `- ${text}`,
    section,
    feedProfile: "sonstiges",
    ...(context ? { feedContext: context } : {}),
  };
}

function extractSonstigesSectionEntries(textLines: string[], journalHeading: string): TimelineEntry[] {
  if (journalHeading.trim().toLowerCase() !== SONSTIGES_HEADING.toLowerCase()) return [];
  const range = extractSectionRange(textLines, SONSTIGES_HEADING);
  if (!range) return [];
  const entry = sonstigesTimelineEntryFromFeed(textLines, SONSTIGES_HEADING, range.start + 1);
  return entry ? [entry] : [];
}

function trySonstigesTimelineEntry(
  line: string,
  lineIndex: number,
  section: string,
  allLines: string[],
): TimelineEntry | null {
  if (section.trim().toLowerCase() !== SONSTIGES_HEADING.toLowerCase()) return null;
  if (!parseSonstigesMetaLine(line.trim())) return null;
  return sonstigesTimelineEntryFromFeed(allLines, section, lineIndex);
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
    if (headingLower === SONSTIGES_HEADING.toLowerCase()) {
      if (parseSonstigesMetaLine(trimmed)) return true;
      if (isManagedCalloutStart(line, heading)) return true;
      if (sonstigesTimelineEntryFromFeed(textLines, heading, j)) return true;
    }
    const profile = journalProfileForHeading(heading);
    if (profile && (profile.id === "heizung" || profile.id === "lueftung")) {
      if (parseFeedDetailMetaLine(trimmed, profile)) return true;
      const context =
        readCalloutTitleFromLines(textLines, heading)?.trim().toLowerCase() !== heading.trim().toLowerCase()
          ? readCalloutTitleFromLines(textLines, heading)?.trim() ?? ""
          : "";
      if (findTagebuchFeedLine(textLines, profile.id, context)) return true;
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
  feedProfile?: FeedProfile;
  feedContext?: string;
  entryId?: string;
  calloutId?: string;
  hasCallout?: boolean;
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

function stripCalloutPrefix(line: string): string {
  return line.trim().replace(/^>\s*/, "");
}

function feedMetaFromLine(line: string): ReturnType<typeof parseFeedMetadataComment> {
  return parseFeedMetadataComment(stripCalloutPrefix(line));
}

export type TimelineContextGroup = {
  profile: FeedProfile;
  context: string;
  entries: TimelineEntry[];
};

function entryMetaFromNextLine(textLines: string[], bulletIndex: number): ReturnType<typeof parseEntryMetaComment> {
  const nextLine = textLines[bulletIndex + 1] ?? "";
  if (!isEntryMetaCommentLine(nextLine)) return null;
  return parseEntryMetaComment(cleanJournalLine(nextLine.trim()));
}

function pushJournalBulletLine(
  out: TimelineEntry[],
  textLines: string[],
  lineIndex: number,
  line: string,
  section: string | undefined,
  pendingFeedMeta: ReturnType<typeof parseFeedMetadataComment>,
): number {
  const trimmed = line.trim();
  const text = cleanJournalLine(trimmed);
  if (!text) return lineIndex;
  const nearbyMeta = entryMetaFromNextLine(textLines, lineIndex);
  pushJournalEntry(out, lineIndex, line, text, section, pendingFeedMeta ?? undefined, nearbyMeta ?? undefined);
  return nearbyMeta ? lineIndex + 1 : lineIndex;
}

function pushJournalEntry(
  out: TimelineEntry[],
  lineIndex: number,
  line: string,
  text: string,
  section?: string,
  pendingMeta?: ReturnType<typeof parseFeedMetadataComment>,
  nearbyEntryMeta?: ReturnType<typeof parseEntryMetaComment>,
): void {
  const inline = stripEntryMeta(text);
  const displayText = inline.body;
  const fromInline = inline.meta ?? nearbyEntryMeta ?? null;
  const fromFeed = pendingMeta ?? resolveFeedMetadata(line, displayText);
  const profile =
    fromInline?.profile && fromInline.profile !== "tagebuch"
      ? fromInline.profile
      : fromFeed.profile !== "tagebuch"
        ? fromFeed.profile
        : undefined;
  const context = fromInline?.context?.trim() || fromFeed.context?.trim() || undefined;
  out.push({
    line: lineIndex,
    text: displayText,
    rawLine: line,
    ...(section ? { section } : {}),
    feedProfile: profile ?? fromFeed.profile,
    ...(context ? { feedContext: context } : {}),
    ...(fromInline?.id ? { entryId: fromInline.id } : {}),
    ...(fromInline?.callout ? { calloutId: fromInline.callout, hasCallout: true } : {}),
  });
}

function cleanJournalLine(raw: string): string {
  return raw
    .trim()
    .replace(/^>\s*/, "")
    .replace(/^[-*+]\s+/, "");
}

export function applyFeedFiltersToEntries(
  entries: TimelineEntry[],
  journalHeading: string,
  feedProfileFilters: FeedProfile[],
  feedContextFilter: string,
  includeRestOfTagebuch = false,
): TimelineEntry[] {
  if (feedProfileFilters.length === 0 && !feedContextFilter.trim()) return entries;
  const heading = journalHeading.trim().toLowerCase();
  const filterTagebuchOnly = heading === DEFAULT_JOURNAL_HEADING.toLowerCase() || isAllJournalHeadings(journalHeading);

  const inScope = entries.filter((entry) => {
    const section = entry.section?.trim().toLowerCase() || DEFAULT_JOURNAL_HEADING.toLowerCase();
    if (feedProfileFilters.length > 0 || feedContextFilter.trim()) {
      if (filterTagebuchOnly && section !== DEFAULT_JOURNAL_HEADING.toLowerCase()) {
        return feedProfileFilters.length === 0 && !feedContextFilter.trim();
      }
    }
    return true;
  });

  if (feedProfileFilters.length > 0) {
    const matches = inScope.filter((entry) =>
      entryMatchesFeedProfileFilters(entry.feedProfile, entry.feedContext, feedProfileFilters),
    );
    if (matches.length === 0) return [];
    if (!includeRestOfTagebuch) return matches;
    const rest = inScope.filter(
      (entry) => effectiveFeedProfile(entry.feedProfile, entry.feedContext) === "tagebuch",
    );
    return mergeEntriesByLine([...matches, ...rest]);
  }

  const matches = inScope.filter((entry) =>
    entryMatchesFeedContextFilter(entry.feedContext, feedContextFilter),
  );
  if (matches.length === 0) return [];
  if (!includeRestOfTagebuch) return matches;
  const rest = inScope.filter(
    (entry) => effectiveFeedProfile(entry.feedProfile, entry.feedContext) === "tagebuch",
  );
  return mergeEntriesByLine([...matches, ...rest]);
}

function mergeEntriesByLine(entries: TimelineEntry[]): TimelineEntry[] {
  const byLine = new Map<number, TimelineEntry>();
  for (const entry of entries) {
    byLine.set(entry.line, entry);
  }
  return [...byLine.values()].sort((a, b) => a.line - b.line);
}

/** Keep one Tagebuch feed row per profile/context only for legacy rows without entryId. */
export function dedupeFeedProfileEntries(entries: TimelineEntry[]): TimelineEntry[] {
  const passthrough: TimelineEntry[] = [];
  const byKey = new Map<string, TimelineEntry>();

  for (const entry of entries) {
    const profile = entry.feedProfile ?? "tagebuch";
    if (profile === "tagebuch" || entry.entryId) {
      passthrough.push(entry);
      continue;
    }
    const ctx = (entry.feedContext ?? "").trim().toLowerCase();
    const key = `${profile}::${ctx}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, entry);
      continue;
    }
    const prefer =
      entry.line > prev.line || (entry.line === prev.line && entry.rawLine.includes(">"))
        ? entry
        : prev;
    byKey.set(key, prefer);
  }

  return [...passthrough, ...byKey.values()].sort((a, b) => a.line - b.line);
}

/** Group Tagebuch entries by profile + context (document order). */
export function groupTimelineEntriesByContext(entries: TimelineEntry[]): TimelineContextGroup[] {
  const groups: TimelineContextGroup[] = [];
  const indexByKey = new Map<string, number>();

  for (const entry of entries) {
    const profile = entry.feedProfile ?? "tagebuch";
    if (profile === "tagebuch" && !entry.feedContext?.trim()) continue;
    const context = (entry.feedContext ?? "").trim();
    const key = `${profile}::${context.toLowerCase()}`;
    const idx = indexByKey.get(key);
    if (idx != null) {
      groups[idx]!.entries.push(entry);
    } else {
      indexByKey.set(key, groups.length);
      groups.push({ profile, context, entries: [entry] });
    }
  }

  return groups;
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
  const reisenContexts = new Map<string, number>();
  for (const entry of entries) {
    if (effectiveFeedProfile(entry.feedProfile, entry.feedContext) !== "reisen") continue;
    const ctx = entry.feedContext?.trim();
    if (!ctx) continue;
    reisenContexts.set(ctx, (reisenContexts.get(ctx) ?? 0) + 1);
  }
  if (reisenContexts.size > 0) {
    let best = "";
    let bestCount = 0;
    for (const [ctx, count] of reisenContexts) {
      if (count > bestCount) {
        best = ctx;
        bestCount = count;
      }
    }
    return best || null;
  }
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
  if (target === "heizung" || target === "lüftung" || target === "lueftung") {
    return extractFeedDetailSectionEntries(textLines, journalHeading);
  }
  if (target === SONSTIGES_HEADING.toLowerCase()) {
    return extractSonstigesSectionEntries(textLines, journalHeading);
  }
  const isReisen = target === "reisen";
  const isWandern = target === "wandern";
  let inSection = false;
  let inManagedCallout = false;
  let skipReisenTripCallout = false;
  let pendingFeedMeta: ReturnType<typeof parseFeedMetadataComment> = null;
  const out: TimelineEntry[] = [];

  for (let i = 0; i < textLines.length; i++) {
    const line = textLines[i] ?? "";
    const trimmed = line.trim();
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      inSection = h2[1]?.trim().toLowerCase() === target;
      inManagedCallout = false;
      skipReisenTripCallout = false;
      pendingFeedMeta = null;
      continue;
    }

    const lineMeta = feedMetaFromLine(line);
    if (lineMeta && inSection) {
      pendingFeedMeta = lineMeta;
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
    if (isEntryMetaCommentLine(line)) continue;

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
        i = pushJournalBulletLine(out, textLines, i, line, undefined, pendingFeedMeta);
        pendingFeedMeta = null;
        continue;
      } else if (trimmed === ">") {
        continue;
      } else {
        inManagedCallout = false;
      }
    }

    if (isPlainJournalBulletLine(line)) {
      i = pushJournalBulletLine(out, textLines, i, line, undefined, pendingFeedMeta);
      pendingFeedMeta = null;
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
  let pendingFeedMeta: ReturnType<typeof parseFeedMetadataComment> = null;

  for (let i = 0; i < textLines.length; i++) {
    const line = textLines[i] ?? "";
    const trimmed = line.trim();
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      currentSection = h2[1]?.trim() ?? null;
      inManagedCallout = false;
      reisenTripSection = false;
      pendingFeedMeta = null;
      continue;
    }

    const lineMeta = feedMetaFromLine(line);
    if (lineMeta && currentSection?.trim().toLowerCase() === DEFAULT_JOURNAL_HEADING.toLowerCase()) {
      pendingFeedMeta = lineMeta;
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

    if (currentSection && isEntryMetaCommentLine(line)) continue;

    if (currentSection?.trim().toLowerCase() === "wandern") {
      const entry = tryWandernTimelineEntry(line, i, currentSection);
      if (entry) {
        out.push(entry);
        continue;
      }
    }

    if (currentSection) {
      const feedDetailEntry = tryFeedDetailTimelineEntry(line, i, currentSection, textLines);
      if (feedDetailEntry) {
        out.push(feedDetailEntry);
        continue;
      }
    }

    if (currentSection) {
      const sonstigesEntry = trySonstigesTimelineEntry(line, i, currentSection, textLines);
      if (sonstigesEntry) {
        out.push(sonstigesEntry);
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
        if (sectionLabel) {
          i = pushJournalBulletLine(out, textLines, i, line, sectionLabel, pendingFeedMeta);
        }
        pendingFeedMeta = null;
        continue;
      } else if (trimmed === ">") {
        continue;
      } else {
        inManagedCallout = false;
        reisenTripSection = false;
      }
    }

    if (currentSection && !reisenTripSection && isPlainJournalBulletLine(line)) {
      if (currentSection.trim().toLowerCase() === DEFAULT_JOURNAL_HEADING.toLowerCase()) {
        i = pushJournalBulletLine(out, textLines, i, line, currentSection, pendingFeedMeta);
        pendingFeedMeta = null;
      } else {
        const text = stripEntryMeta(cleanJournalLine(line.trim())).body;
        if (text) out.push({ line: i, text, rawLine: line, section: currentSection });
      }
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

function reisenContextByEntryId(lines: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of lines) {
    const meta = parseReisenMetaLine(line);
    if (meta?.entryId && meta.reise.trim()) map.set(meta.entryId, meta.reise.trim());
  }
  return map;
}

function reisenTripLabelFromSection(lines: string[]): string {
  const fromCallout = extractReisenTripFromSection(lines, "Reisen");
  if (fromCallout?.trim()) return fromCallout.trim();
  const range = extractSectionRange(lines, "Reisen");
  if (!range) return "";
  for (let i = range.start + 1; i < range.end; i++) {
    const sort = parseReisenSortLine(lines[i] ?? "");
    if (sort?.reise.trim()) return sort.reise.trim();
    const meta = parseReisenMetaLine(lines[i] ?? "");
    if (meta?.reise.trim()) return meta.reise.trim();
  }
  return "";
}

function mergeSyntheticTagebuchFeedEntries(lines: string[], entries: TimelineEntry[]): TimelineEntry[] {
  const next = [...entries];
  const has = (profile: FeedProfile) =>
    next.some((e) => {
      if (effectiveFeedProfile(e.feedProfile, e.feedContext) === profile) return true;
      if ((e.feedProfile ?? "tagebuch") === profile) return true;
      const meta = parseFeedMetadataComment(stripCalloutPrefix(e.rawLine));
      return meta?.profile === profile;
    });

  const addDetail = (profileId: FeedProfile, label: string) => {
    if (has(profileId)) return;
    const profile = journalProfileById(profileId);
    const def = journalProfileForHeading(label);
    if (!profile || !def) return;
    const range = extractSectionRange(lines, label);
    if (!range) return;
    const meta = parseFeedDetailMetaFromLines(lines.slice(range.start + 1, range.end), def);
    if (!meta) return;
    const kurz = stripLeadingTimeFromKurz(meta.kurz || meta.titel || label);
    const suffix = (meta.feedLinks ?? profile.feedSuffix).trim();
    const text = `${kurz} ${suffix}`.trim();
    next.push({
      line: range.start + 1,
      text,
      rawLine: `- ${text}`,
      feedProfile: profileId,
      ...(meta.titel !== label ? { feedContext: meta.titel } : {}),
    });
  };

  addDetail("heizung", "Heizung");
  addDetail("lueftung", "Lüftung");

  if (!has("wandern")) {
    const range = extractSectionRange(lines, "Wandern");
    const profile = journalProfileById("wandern");
    if (range && profile) {
      const meta = parseWandernMetaFromLines(lines.slice(range.start + 1, range.end));
      if (meta) {
        const kurz = stripLeadingTimeFromKurz(buildWandernFeedKurz(meta.kurz, meta.titel || "Wandern"));
        const text = `${kurz} ${profile.feedSuffix}`.trim();
        next.push({
          line: range.start + 1,
          text,
          rawLine: `- ${text}`,
          feedProfile: "wandern",
          ...(meta.titel.trim() !== "Wandern" ? { feedContext: meta.titel.trim() } : {}),
        });
      }
    }
  }

  if (!has("sonstiges")) {
    const range = extractSectionRange(lines, SONSTIGES_HEADING);
    if (range) {
      const entry = sonstigesTimelineEntryFromFeed(lines, SONSTIGES_HEADING, range.start + 1);
      if (entry) {
        next.push({
          line: entry.line,
          text: entry.text,
          rawLine: entry.rawLine,
          feedProfile: "sonstiges",
          ...(entry.feedContext ? { feedContext: entry.feedContext } : {}),
        });
      }
    }
  }

  if (!has("reisen")) {
    const reisenEntries = extractJournalLines(lines, "Reisen");
    const profile = journalProfileById("reisen");
    const range = extractSectionRange(lines, "Reisen");
    const reisenIds = collectReisenEntryIds(lines);
    const trip = reisenTripLabelFromSection(lines);
    if (profile && range && (reisenEntries.length > 0 || reisenIds.size > 0 || trip)) {
      if (reisenEntries.length > 0) {
        const kurz = stripLeadingTimeFromKurz(
          buildReisenFeedKurz(
            reisenEntries.map((e) => e.text),
            "",
          ),
        );
        const text = `${kurz} ${profile.feedSuffix}`.trim();
        const first = reisenEntries[0]!;
        next.push({
          line: first.line,
          text,
          rawLine: first.rawLine,
          feedProfile: "reisen",
          ...(trip ? { feedContext: trip } : {}),
        });
      } else {
        const kurz = stripLeadingTimeFromKurz(trip || "Reisen");
        const text = `${kurz} ${profile.feedSuffix}`.trim();
        next.push({
          line: range.start + 1,
          text,
          rawLine: `- ${text}`,
          feedProfile: "reisen",
          ...(trip ? { feedContext: trip } : {}),
        });
      }
    }
  }

  return next.sort((a, b) => a.line - b.line);
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

export function loadTagebuchTimelineEntries(lines: string[]): TimelineEntry[] {
  let entries = extractJournalLines(lines, DEFAULT_JOURNAL_HEADING);
  entries = overlayReisenTimelineEntries(lines, entries);
  entries = mergeSyntheticTagebuchFeedEntries(lines, entries);
  entries = dedupeFeedProfileEntries(entries);
  return entries;
}

function overlayReisenTimelineEntries(lines: string[], entries: TimelineEntry[]): TimelineEntry[] {
  const reisenIds = collectReisenEntryIds(lines);
  if (reisenIds.size === 0 && !extractSectionRange(lines, "Reisen")) return entries;
  const reisenContext = reisenContextByEntryId(lines);
  const reisenByTitle = reisenSupplementMatchesByTitle(lines);
  return entries.map((entry) => {
    if (entry.entryId && reisenIds.has(entry.entryId)) {
      return {
        ...entry,
        feedProfile: "reisen",
        feedContext: entry.feedContext?.trim() || reisenContext.get(entry.entryId),
        hasCallout: true,
        calloutId: entry.entryId,
      };
    }
    if (effectiveFeedProfile(entry.feedProfile, entry.feedContext) === "reisen") {
      return entry;
    }
    const { body } = parseJournalEntryDisplay(entry.text);
    const titleKey = stripLeadingTimeFromKurz(body).trim().toLowerCase();
    const byTitle = titleKey ? reisenByTitle.get(titleKey) : undefined;
    if (byTitle) {
      return {
        ...entry,
        feedProfile: "reisen",
        entryId: byTitle.entryId,
        feedContext: entry.feedContext?.trim() || byTitle.reise || reisenContext.get(byTitle.entryId),
        hasCallout: true,
        calloutId: byTitle.entryId,
      };
    }
    return entry;
  });
}

const OUTLINE_SCAN_CONCURRENCY = 12;

type OutlinePluginSettings = {
  calendarSync: CalendarSyncSettings;
  dailyNoteFallback: DailyNoteFallbackSettings;
  tagebuchVerweise?: TagebuchVerweiseSettings;
  outline: { journalHeading: string };
};

function getOutlinePluginSettings(app: App): { settings: OutlinePluginSettings } | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (app as any).plugins?.plugins?.["universal-daily-note"] as
    | { settings?: OutlinePluginSettings }
    | undefined;
}

async function trySyncCalendarForOutlineDay(app: App, dateKey: string): Promise<number> {
  const plugin = getOutlinePluginSettings(app);
  const sync = plugin?.settings?.calendarSync;
  if (!sync?.enabled || !sync.syncOnOutlineLoad || !plugin?.settings) return 0;

  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return 0;

  try {
    const dailyNotesFolder =
      plugin.settings.tagebuchVerweise?.dailyNotesFolder?.trim() ||
      plugin.settings.dailyNoteFallback?.folder?.trim() ||
      "";
    return await syncCalendarAppointmentsIntoDailyNote(app, {
      date: new Date(y, m - 1, d, 0, 0, 0, 0),
      fallback: plugin.settings.dailyNoteFallback,
      settings: sync,
      oncePerSession: true,
      dailyNotesFolder,
    });
  } catch (e) {
    console.warn("Universal Daily Note: calendar sync on outline load failed", e);
    return 0;
  }
}

async function loadDayFromFile(
  file: TFile,
  dateKey: string,
  journalHeading: string,
  app: App,
  textQuery?: string,
  excludedHeadings: string[] = DEFAULT_EXCLUDED_JOURNAL_HEADINGS,
  feedProfileFilters: FeedProfile[] = [],
  feedContextFilter = "",
  includeRestOfTagebuch = false,
  runCalendarSync = true,
): Promise<TimelineDay | null> {
  if (runCalendarSync) {
    await trySyncCalendarForOutlineDay(app, dateKey);
  }

  let text = "";
  try {
    text = await app.vault.read(file);
  } catch {
    return null;
  }

  const lines = text.split("\n");
  const headingLower = journalHeading.trim().toLowerCase();
  const activeProfileFilters = resolveOutlineFeedFilters(feedProfileFilters);
  const restEnabled = activeProfileFilters.length > 0 && includeRestOfTagebuch;
  let entries: TimelineEntry[];
  if (activeProfileFilters.length > 0 || feedContextFilter.trim()) {
    entries = loadTagebuchTimelineEntries(lines);
    entries = applyFeedFiltersToEntries(
      entries,
      DEFAULT_JOURNAL_HEADING,
      activeProfileFilters,
      feedContextFilter,
      restEnabled,
    );
  } else if (isAllJournalHeadings(journalHeading)) {
    entries = extractJournalLinesAllHeadings(lines, excludedHeadings);
  } else if (headingLower === DEFAULT_JOURNAL_HEADING.toLowerCase()) {
    entries = loadTagebuchTimelineEntries(lines);
  } else if (headingLower === "reisen") {
    entries = extractReisenJournalLines(lines);
    if (entries.length === 0) {
      entries = loadTagebuchTimelineEntries(lines).filter((entry) =>
        entryMatchesFeedProfileFilters(entry.feedProfile, entry.feedContext, ["reisen"]),
      );
    }
  } else {
    entries = extractJournalLines(lines, journalHeading);
  }
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
  feedProfileFilters?: FeedProfile[];
  feedContextFilter?: string;
  includeRestOfTagebuch?: boolean;
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
  const feedProfileFilters = resolveOutlineFeedFilters(options.feedProfileFilters);
  const feedContextFilter = options.feedContextFilter ?? "";
  const includeRestOfTagebuch =
    feedProfileFilters.length > 0 && (options.includeRestOfTagebuch ?? false);
  const dailyNotesFolder = resolveDailyNotesFolder(app, tagebuch, fallback);
  const filenameFormat = fallback.filenameFormat.trim() || "YYYY-MM-DD";

  const { keysDesc, fileByKey } = buildFileKeyIndex(app, dailyNotesFolder, filenameFormat);
  const keys = candidateKeys(keysDesc, anchor, options);

  const days: TimelineDay[] = [];
  const outlinePlugin = getOutlinePluginSettings(app);
  const calendarSync = outlinePlugin?.settings?.calendarSync;
  const shouldSyncCalendar = Boolean(calendarSync?.enabled && calendarSync.syncOnOutlineLoad);

  for (let i = 0; i < keys.length; i += OUTLINE_SCAN_CONCURRENCY) {
    if (!loadAll && days.length >= pageSize) break;

    const chunk = keys.slice(i, i + OUTLINE_SCAN_CONCURRENCY);
    const chunkDays = await Promise.all(
      chunk.map(async (key) => {
        const file = fileByKey.get(key);
        if (!file) return null;
        return loadDayFromFile(
          file,
          key,
          journalHeading,
          app,
          textQuery,
          excludedHeadings,
          feedProfileFilters,
          feedContextFilter,
          includeRestOfTagebuch,
          false,
        );
      }),
    );

    for (let j = 0; j < chunk.length; j++) {
      let day = chunkDays[j];
      if (!day) continue;

      if (shouldSyncCalendar) {
        const added = await trySyncCalendarForOutlineDay(app, day.dateKey);
        if (added > 0) {
          const file = fileByKey.get(day.dateKey);
          if (file) {
            day =
              (await loadDayFromFile(
                file,
                day.dateKey,
                journalHeading,
                app,
                textQuery,
                excludedHeadings,
                feedProfileFilters,
                feedContextFilter,
                includeRestOfTagebuch,
                false,
              )) ?? day;
          }
        }
      }

      days.push(day);
      if (!loadAll && days.length >= pageSize) break;
    }
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
