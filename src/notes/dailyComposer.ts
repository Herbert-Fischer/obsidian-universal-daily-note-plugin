import { TFile, type App } from "obsidian";
import type { DailyNoteFallbackSettings, TagebuchVerweiseSettings } from "../settings";
import { DEFAULT_JOURNAL_HEADING } from "../settings";
import { ensureDailyNoteFileForDate } from "./appendLogLine";
import {
  extractAllH2Headings,
  extractJournalLines,
  extractJournalLinesFromCallout,
  loadUsedJournalHeadings,
  type TimelineEntry,
} from "./dailyNoteTimeline";
import { finalizeJournalHeadings } from "./journalHeadingFilter";
import {
  buildComposerCalloutBlock,
  dateFromDateKey,
  extractSectionRange,
  formatComposerCalloutType,
  isDecorativeCalloutLine,
  isManagedCalloutStart,
  isPlainJournalBulletLine,
  readCalloutTitleFromLines,
  resolveComposerCalloutTitle,
} from "./journalCallout";
import { ensureSectionHeading, findInsertIndex } from "./appendLogLine";
import { formatJournalEntryText, journalEntrySortMinutes, parseJournalEntryDisplay, sortJournalEntryTexts } from "./parseJournalEntryDisplay";
import {
  parseCalendarSyncId,
  stripCalendarSyncMarker,
  withCalendarSyncMarker,
} from "../integrations/calendarSyncMarker";
import { readDailyNoteSummary } from "./dailyNoteSummary";

export type ComposerEntry = {
  id: string;
  line: number;
  time: string;
  body: string;
  rawLine: string;
  calendarId?: string;
};

export type ComposerState = {
  file: TFile;
  dateKey: string;
  journalHeading: string;
  calloutTitle: string;
  summary: string;
  entries: ComposerEntry[];
};

export type ComposerChip = {
  label: string;
  template: string;
  defaultTime?: string;
};

export const TAGEBUCH_COMPOSER_CHIPS: ComposerChip[] = [
  { label: "Aufstehen", template: "Aufstehen", defaultTime: "07:30" },
  { label: "Mittagessen", template: "Mittagessen:", defaultTime: "12:00" },
  { label: "Abendessen", template: "Abendessen:", defaultTime: "18:30" },
  { label: "Spaziergang", template: "Spaziergang:", defaultTime: "11:00" },
  { label: "Termin", template: "Termin:", defaultTime: "10:00" },
  { label: "Besuch", template: "Besuch:", defaultTime: "14:00" },
  { label: "Garten", template: "Garten:", defaultTime: "16:00" },
];

export const REISEN_COMPOSER_CHIPS: ComposerChip[] = [
  { label: "Abfahrt", template: "Abfahrt:", defaultTime: "10:00" },
  { label: "Etappe", template: "Etappe:", defaultTime: "12:00" },
  { label: "Highlight", template: "Highlight:", defaultTime: "15:00" },
  { label: "Ankunft", template: "Ankunft:", defaultTime: "18:00" },
  { label: "Unterkunft", template: "Unterkunft:", defaultTime: "19:00" },
  { label: "Foto", template: "Foto:", defaultTime: "14:00" },
];

export const WANDERN_COMPOSER_CHIPS: ComposerChip[] = [
  { label: "Start", template: "Start:", defaultTime: "09:00" },
  { label: "Kurzbeschreibung", template: "Kurzbeschreibung:", defaultTime: "09:30" },
  { label: "Beschreibung", template: "Beschreibung:", defaultTime: "15:00" },
  { label: "Gipfel", template: "Gipfel:", defaultTime: "12:00" },
  { label: "Ende", template: "Ende:", defaultTime: "16:00" },
  { label: "Track", template: "Track:", defaultTime: "15:00" },
  { label: "Foto", template: "Foto:", defaultTime: "15:30" },
];

export const GENERIC_COMPOSER_CHIPS: ComposerChip[] = [
  { label: "Termin", template: "Termin:", defaultTime: "10:00" },
  { label: "Besuch", template: "Besuch:", defaultTime: "14:00" },
  { label: "Notiz", template: "Notiz:", defaultTime: "12:00" },
];

/** @deprecated Use chipsForHeading */
export const DEFAULT_COMPOSER_CHIPS: ComposerChip[] = TAGEBUCH_COMPOSER_CHIPS;

function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function entryToComposer(entry: TimelineEntry): ComposerEntry {
  const { time, body } = parseJournalEntryDisplay(entry.text);
  const calendarId = parseCalendarSyncId(entry.text) ?? undefined;
  const displayBody = stripCalendarSyncMarker(body);
  return {
    id: calendarId ? `cal-${calendarId}` : `line-${entry.line}`,
    line: entry.line,
    time: time ?? "",
    body: displayBody,
    rawLine: entry.rawLine,
    calendarId,
  };
}

function sortComposerEntries(entries: ComposerEntry[]): ComposerEntry[] {
  const indexed = entries.map((entry, index) => ({
    entry,
    index,
    minutes: journalEntrySortMinutes(composerEntryText(entry)),
  }));
  indexed.sort((a, b) => {
    if (a.minutes != null && b.minutes != null) {
      return a.minutes - b.minutes || a.index - b.index;
    }
    if (a.minutes != null) return -1;
    if (b.minutes != null) return 1;
    return a.index - b.index;
  });
  return indexed.map((item) => item.entry);
}

/** Re-sort callout bullets under a journal heading after inline edits. */
export async function resortJournalCalloutEntries(
  app: App,
  filePath: string,
  journalHeading: string,
  date?: Date,
): Promise<boolean> {
  const file = app.vault.getAbstractFileByPath(filePath);
  if (!(file instanceof TFile)) return false;

  await app.vault.process(file, (data) => {
    const heading = journalHeading.trim() || "Tagebuch";
    const lines = data.split("\n");
    let texts = extractJournalLines(lines, heading).map((entry) => entry.text);
    if (texts.length === 0) {
      texts = extractJournalLinesFromCallout(lines, heading).map((entry) => entry.text);
    }
    if (texts.length <= 1) return data;

    const sorted = sortJournalEntryTexts(texts);
    if (sorted.every((text, index) => text === texts[index])) return data;

    const calloutTitle = readCalloutTitleFromLines(lines, heading, date);
    const next = rewriteJournalBullets(lines, heading, sorted, date, calloutTitle);
    const content = next.join("\n");
    return content.endsWith("\n") || content.length === 0 ? content : `${content}\n`;
  });

  return true;
}

/** Stored journal line text for one composer row. */
export function composerEntryText(entry: Pick<ComposerEntry, "time" | "body" | "calendarId">): string {
  let body = entry.body.trim();
  if (entry.calendarId) {
    body = withCalendarSyncMarker(body, entry.calendarId);
  }
  return formatJournalEntryText(entry.time, body);
}


export function formatComposerEntryLine(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("- ") ? trimmed.slice(2).trim() : trimmed;
}

export function buildChipEntryText(chip: ComposerChip, time: string): string {
  const template = chip.template.trim();
  if (template === "Aufstehen") return `${time} Aufstehen`;
  if (template.endsWith(":")) return `${time} ${template} `;
  return `${time} ${template}`;
}

export function chipsFromPrefixes(prefixes: string[], base: ComposerChip[]): ComposerChip[] {
  const merged = [...base];
  const seen = new Set(base.map((c) => c.template.toLowerCase()));
  for (const prefix of prefixes) {
    const p = prefix.trim();
    if (!p) continue;
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ label: p.replace(/:$/, ""), template: p.endsWith(":") ? p : `${p}:`, defaultTime: "12:00" });
  }
  return merged;
}

export function chipsForHeading(heading: string, prefixes: string[]): ComposerChip[] {
  const h = heading.trim().toLowerCase();
  if (h === "tagebuch") return chipsFromPrefixes(prefixes, TAGEBUCH_COMPOSER_CHIPS);
  if (h === "reisen") return chipsFromPrefixes(prefixes, REISEN_COMPOSER_CHIPS);
  if (h === "wandern") return chipsFromPrefixes(prefixes, WANDERN_COMPOSER_CHIPS);
  return chipsFromPrefixes(prefixes, GENERIC_COMPOSER_CHIPS);
}

/** Build a short summary from journal entry texts. */
export function suggestSummaryFromEntries(entryTexts: string[]): string {
  const parts: string[] = [];
  for (const text of entryTexts) {
    const { body } = parseJournalEntryDisplay(text);
    const trimmed = body.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (lower.startsWith("mittagessen:")) {
      const detail = trimmed.replace(/^mittagessen:\s*/i, "").trim();
      if (detail) parts.push(detail);
    } else if (lower.startsWith("spaziergang:")) {
      const detail = trimmed.replace(/^spaziergang:\s*/i, "").trim();
      parts.push(detail ? `Spaziergang ${detail}` : "Spaziergang");
    } else if (lower.startsWith("kurzbeschreibung:")) {
      const detail = trimmed.replace(/^kurzbeschreibung:\s*/i, "").trim();
      if (detail) parts.push(detail);
    } else if (lower.startsWith("besuch")) {
      parts.push(trimmed);
    } else if (lower.startsWith("film:") || lower.startsWith("kaffee")) {
      parts.push(trimmed);
    }
    if (parts.length >= 4) break;
  }
  return parts.join("; ");
}

function formatSummaryYamlLine(summary: string): string {
  const trimmed = summary.trim();
  if (!trimmed) return "Zusammenfassung:";
  if (/[:#\[\]{}|>&*!@`"]/.test(trimmed) || trimmed.includes('"') || /[^\x00-\x7F]/.test(trimmed)) {
    const escaped = trimmed.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `Zusammenfassung: "${escaped}"`;
  }
  return `Zusammenfassung: ${trimmed}`;
}

export function updateSummaryInContent(content: string, summary: string): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(content);
  if (!match) return content;
  let fm = match[1] ?? "";
  const body = match[2] ?? "";
  const line = formatSummaryYamlLine(summary);
  if (/^Zusammenfassung:/m.test(fm)) {
    fm = fm.replace(/^Zusammenfassung:.*$/m, line);
  } else {
    fm = `${fm.trimEnd()}\n${line}`;
  }
  return `---\n${fm}\n---\n${body}`;
}

/** Replace journal bullets under ## heading with a managed callout block. */
export function rewriteJournalBullets(
  lines: string[],
  journalHeading: string,
  entryTexts: string[],
  date?: Date,
  calloutTitle?: string | null,
): string[] {
  const heading = journalHeading.trim();
  const bodies = sortJournalEntryTexts(entryTexts.map(formatComposerEntryLine).filter(Boolean));
  const range = extractSectionRange(lines, heading);

  let resolvedTitle = calloutTitle?.trim() || resolveComposerCalloutTitle(lines, heading, date);

  const calloutBlock = buildComposerCalloutBlock(heading, bodies, date, null, resolvedTitle);

  if (!range) {
    const next = [...lines];
    if (next.length > 0 && next[next.length - 1] !== "") next.push("");
    next.push(`## ${heading}`, "");
    if (calloutBlock.length > 0) next.push(...calloutBlock);
    return next;
  }

  const before = lines.slice(0, range.start + 1);
  const sectionBody = lines.slice(range.start + 1, range.end);
  const after = lines.slice(range.end);

  const kept: string[] = [];
  let i = 0;
  while (i < sectionBody.length) {
    const line = sectionBody[i] ?? "";
    const trimmed = line.trim();
    if (isDecorativeCalloutLine(line)) {
      i++;
      while (i < sectionBody.length && (sectionBody[i]?.trim() ?? "").startsWith(">")) i++;
      continue;
    }
    if (isManagedCalloutStart(line, heading) || (heading.toLowerCase() === "reisen" && /^>\s*\[!/.test(trimmed))) {
      i++;
      while (i < sectionBody.length && (sectionBody[i]?.trim() ?? "").startsWith(">")) i++;
      continue;
    }
    if (isPlainJournalBulletLine(line)) {
      i++;
      continue;
    }
    kept.push(line);
    i++;
  }

  while (kept.length > 0 && kept[kept.length - 1]?.trim() === "") kept.pop();

  const rebuilt = [...before];
  if (kept.length > 0) {
    rebuilt.push(...kept, "");
  } else if (rebuilt[rebuilt.length - 1]?.trim() !== "") {
    rebuilt.push("");
  }
  if (calloutBlock.length > 0) rebuilt.push(...calloutBlock);
  rebuilt.push(...after);
  return rebuilt;
}

export type LoadComposerSectionHeadingsOptions = {
  excludedHeadings: string[];
  defaultHeading?: string;
  durationDays: number;
};

/** Always available in composer heading picker, even before first use in the vault. */
export const COMPOSER_SECTION_PRESETS = ["Tagebuch", "Reisen", "Wandern"] as const;

export async function loadComposerSectionHeadings(
  app: App,
  date: Date,
  fallback: DailyNoteFallbackSettings,
  tagebuch: TagebuchVerweiseSettings,
  options: LoadComposerSectionHeadingsOptions,
): Promise<string[]> {
  const defaultHeading = options.defaultHeading?.trim() || DEFAULT_JOURNAL_HEADING;
  const excluded = options.excludedHeadings;

  const file = await ensureDailyNoteFileForDate(app, date, fallback);
  let text = "";
  try {
    text = await app.vault.read(file);
  } catch {
    text = "";
  }

  const fromFile = extractAllH2Headings(text.split("\n"));
  const fromVault = await loadUsedJournalHeadings(app, date, fallback, tagebuch, options.durationDays, {
    excludedHeadings: excluded,
    defaultHeading,
  });

  return finalizeJournalHeadings(
    [...fromFile, ...fromVault, defaultHeading, ...COMPOSER_SECTION_PRESETS],
    excluded,
    defaultHeading,
  );
}

export async function loadComposerState(
  app: App,
  date: Date,
  fallback: DailyNoteFallbackSettings,
  journalHeading: string,
): Promise<ComposerState> {
  const file = await ensureDailyNoteFileForDate(app, date, fallback);
  const heading = journalHeading.trim() || "Tagebuch";
  let text = "";
  try {
    text = await app.vault.read(file);
  } catch {
    text = "";
  }

  const lines = text.split("\n");
  const noteDate = dateFromDateKey(localDayKey(date));
  let entries = extractJournalLines(lines, heading).map(entryToComposer);
  if (entries.length === 0) {
    entries = extractJournalLinesFromCallout(lines, heading).map(entryToComposer);
  }
  entries = sortComposerEntries(entries);
  const summary = readDailyNoteSummary(app, file) || suggestSummaryFromEntries(entries.map(composerEntryText));
  const calloutTitle = readCalloutTitleFromLines(lines, heading, noteDate);

  return {
    file,
    dateKey: localDayKey(date),
    journalHeading: heading,
    calloutTitle,
    summary,
    entries,
  };
}

export async function saveComposerState(
  app: App,
  state: Pick<ComposerState, "file" | "journalHeading" | "calloutTitle" | "summary" | "dateKey">,
  entryTexts: string[],
): Promise<boolean> {
  const texts = entryTexts.map(formatComposerEntryLine).filter(Boolean);
  const heading = state.journalHeading.trim() || "Tagebuch";
  const date = dateFromDateKey(state.dateKey);
  const calloutTitle = state.calloutTitle.trim();

  await app.vault.process(state.file, (data) => {
    let content = updateSummaryInContent(data, state.summary.trim());
    let lines = content.split("\n");
    lines = ensureSectionHeading(lines, heading);
    const hasSection = lines.some((l) => {
      const m = l.match(/^##\s+(.+)$/);
      return m && m[1]?.trim().toLowerCase() === heading.toLowerCase();
    });
    if (!hasSection) {
      const idx = findInsertIndex(lines, null);
      lines = [...lines.slice(0, idx), `## ${heading}`, "", ...lines.slice(idx)];
    }
    lines = rewriteJournalBullets(lines, heading, texts, date, calloutTitle);
    content = lines.join("\n");
    return content.endsWith("\n") || content.length === 0 ? content : `${content}\n`;
  });

  return true;
}
