import { TFile, type App } from "obsidian";
import type { DailyNoteFallbackSettings, TagebuchVerweiseSettings } from "../settings";
import { DEFAULT_JOURNAL_HEADING } from "../settings";
import { ensureDailyNoteFileForDate } from "./appendLogLine";
import { processVaultFile } from "./vaultProcess";
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
import { stripLeadingTimeFromKurz } from "./appendTagebuchFeedLine";
import { splitFeedEntrySuffix } from "./feedEntryDisplay";
import { parseFeedMetadataComment } from "./feedMetadata";
import { formatJournalEntryText, journalEntrySortMinutes, parseJournalEntryDisplay, sortJournalEntryTexts } from "./parseJournalEntryDisplay";
import {
  parseCalendarSyncId,
  stripCalendarSyncMarker,
  withCalendarSyncMarker,
} from "../integrations/calendarSyncMarker";
import { readDailyNoteSummary } from "./dailyNoteSummary";
import {
  buildPhotoCollageMarkdownAsync,
  mergePhotoSources,
  parsePhotoCollageFromLines,
  parsePhotoCollageMetaFromLines,
  photoCollageMetaComment,
  stripPhotoEmbed,
  type PhotoCollageLayout,
} from "./photoCollage";
import { resolveJournalBodyWikiLinks, upgradeJournalEntryTextsLinks } from "./resolveWikiLinks";
import type { FeedProfile } from "./feedMetadata";
import {
  appendEntryMeta,
  entryMetaFromProfile,
  generateEntryId,
  isEntryMetaCommentLine,
  parseEntryMetaComment,
  stripEntryMeta,
  stripJournalLineForDisplay,
  type JournalEntryMeta,
} from "./journalEntryMeta";
import { loadReisenSupplements, mergeReisenSupplementsIntoEntries, type ReisenSortOrder } from "./reisenComposer";
import { loadHeizungSupplements, mergeHeizungSupplementsIntoEntries } from "./heizungComposer";
import { loadLueftungSupplements, mergeLueftungSupplementsIntoEntries } from "./lueftungComposer";
import { loadGedankenSupplements, mergeGedankenSupplementsIntoEntries } from "./gedankenComposer";
import { loadWandernSupplements, mergeWandernSupplementsIntoEntries } from "./wandernComposer";
import { loadSpaziergangSupplements, mergeSpaziergangSupplementsIntoEntries } from "./spaziergangComposer";
import { loadSonstigesSupplements, mergeSonstigesSupplementsIntoEntries } from "./sonstigesComposer";

export type ComposerEntry = {
  id: string;
  line: number;
  time: string;
  body: string;
  rawLine: string;
  calendarId?: string;
  entryId?: string;
  profile?: FeedProfile;
  context?: string;
  calloutId?: string;
  /** Fließtext im Profil-Supplement-Callout (z. B. ## Reisen). */
  supplementDetail?: string;
  /** Bilder im Profil-Supplement-Callout (z. B. ## Lüftung). */
  supplementPhotos?: string[];
  /** Kurztext für ## Wandern (Profil wandern). */
  supplementKurz?: string;
  /** GPX-Pfad für ## Wandern (Profil wandern). */
  supplementTrackPath?: string;
  /** Optionale Reise-Zuordnung bei Profil wandern (erscheint zusätzlich unter ## Reisen). */
  reiseAssignment?: string;
};

export type ComposerState = {
  file: TFile;
  dateKey: string;
  journalHeading: string;
  calloutTitle: string;
  summary: string;
  entries: ComposerEntry[];
  photos: string[];
  reisenSortOrders: Record<string, ReisenSortOrder>;
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

/** Walk chips offered alongside Reisen chips in the Reise-Tagebuch composer. */
export const REISEN_WALK_COMPOSER_CHIPS: ComposerChip[] = [
  { label: "Wandern", template: "Wandern:", defaultTime: "09:00" },
  { label: "Spaziergang", template: "Spaziergang:", defaultTime: "11:00" },
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

export const HEIZUNG_COMPOSER_CHIPS: ComposerChip[] = [
  { label: "Störung", template: "Störung:", defaultTime: "12:00" },
  { label: "Wartung", template: "Wartung:", defaultTime: "10:00" },
  { label: "Temperatur", template: "Temperatur:", defaultTime: "08:00" },
  { label: "Foto", template: "Foto:", defaultTime: "12:30" },
];

export const LUEFTUNG_COMPOSER_CHIPS: ComposerChip[] = [
  { label: "Filter", template: "Filter:", defaultTime: "10:00" },
  { label: "Wartung", template: "Wartung:", defaultTime: "11:00" },
  { label: "Störung", template: "Störung:", defaultTime: "12:00" },
  { label: "Foto", template: "Foto:", defaultTime: "12:30" },
];

export const GEDANKEN_COMPOSER_CHIPS: ComposerChip[] = [
  { label: "Einfall", template: "Einfall:", defaultTime: "09:00" },
  { label: "Beobachtung", template: "Beobachtung:", defaultTime: "12:00" },
  { label: "Frage", template: "Frage:", defaultTime: "14:00" },
  { label: "Später prüfen", template: "Später prüfen:", defaultTime: "16:00" },
  { label: "Notiz", template: "Notiz:", defaultTime: "18:00" },
];

export const SONSTIGES_COMPOSER_CHIPS: ComposerChip[] = [
  { label: "Notiz", template: "Notiz:", defaultTime: "12:00" },
  { label: "Geschenk", template: "Geschenk:", defaultTime: "14:00" },
  { label: "Besuch", template: "Besuch:", defaultTime: "15:00" },
  { label: "Erledigt", template: "Erledigt:", defaultTime: "16:00" },
  { label: "Später", template: "Später:", defaultTime: "18:00" },
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
  const rawText = entry.rawLine
    .trim()
    .replace(/^>\s*/, "")
    .replace(/^[-*+]\s+/, "");
  const stripped = stripEntryMeta(rawText);
  const { time, body } = parseJournalEntryDisplay(stripped.body);
  const calendarId = parseCalendarSyncId(stripped.body) ?? undefined;
  const displayBody = stripCalendarSyncMarker(body);
  const meta = stripped.meta;
  const profile =
    meta?.profile && meta.profile !== "tagebuch"
      ? meta.profile
      : entry.feedProfile && entry.feedProfile !== "tagebuch"
        ? entry.feedProfile
        : undefined;
  const context = meta?.context?.trim() || entry.feedContext?.trim() || undefined;
  const entryId = meta?.id || entry.entryId || (profile || context ? generateEntryId() : undefined);
  const reiseAssignment =
    profile === "wandern" || profile === "spaziergang"
      ? meta?.reise?.trim() || undefined
      : undefined;
  return {
    id: calendarId ? `cal-${calendarId}` : `line-${entry.line}`,
    line: entry.line,
    time: time ?? "",
    body: displayBody,
    rawLine: entry.rawLine,
    calendarId,
    entryId,
    profile,
    context,
    reiseAssignment,
    calloutId: meta?.callout || entry.calloutId,
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

  await processVaultFile(app, file, (data) => {
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
export function composerEntryText(
  entry: Pick<
    ComposerEntry,
    | "time"
    | "body"
    | "calendarId"
    | "entryId"
    | "profile"
    | "context"
    | "calloutId"
    | "supplementDetail"
    | "supplementPhotos"
    | "supplementKurz"
    | "supplementTrackPath"
    | "reiseAssignment"
  >,
): string {
  let body = entry.body.trim();
  if (entry.calendarId) {
    body = withCalendarSyncMarker(body, entry.calendarId);
  }
  const line = formatJournalEntryText(entry.time, body);
  const calloutId =
    (entry.profile === "reisen" ||
      entry.profile === "lueftung" ||
      entry.profile === "heizung" ||
      entry.profile === "gedanken" ||
      entry.profile === "wandern" ||
      entry.profile === "spaziergang") &&
    (entry.supplementDetail?.trim() ||
      entry.supplementKurz?.trim() ||
      entry.supplementTrackPath?.trim() ||
      (entry.supplementPhotos?.length ?? 0) > 0 ||
      ((entry.profile === "wandern" || entry.profile === "spaziergang") && entry.reiseAssignment?.trim())) &&
    entry.entryId
      ? entry.entryId
      : entry.calloutId;
  const meta = entryMetaFromProfile(
    entry.profile,
    entry.context,
    entry.entryId,
    calloutId,
    entry.reiseAssignment,
  );
  return appendEntryMeta(line, meta);
}

export function composerEntryMeta(entry: ComposerEntry): JournalEntryMeta | null {
  return entryMetaFromProfile(
    entry.profile,
    entry.context,
    entry.entryId,
    entry.calloutId,
    entry.reiseAssignment,
  );
}

function supplementEntryDedupeKey(entry: ComposerEntry): string | null {
  if (!entry.profile || entry.profile === "tagebuch") return null;
  const { lead } = splitFeedEntrySuffix(stripJournalLineForDisplay(entry.body));
  const bodyKey = stripLeadingTimeFromKurz(lead).trim().toLowerCase();
  if (entry.profile === "wandern" || entry.profile === "spaziergang") {
    const ctxKey = walkTitleFromText(entry.context ?? "").trim().toLowerCase();
    const titleKey = ctxKey.length > bodyKey.length ? ctxKey : bodyKey;
    return `${entry.profile}::${titleKey}`;
  }
  const ctx = (entry.context ?? "").trim().toLowerCase();
  return `${entry.profile}::${bodyKey}::${ctx}`;
}

function walkTitleFromText(text: string): string {
  const { lead } = splitFeedEntrySuffix(stripJournalLineForDisplay(text));
  return stripLeadingTimeFromKurz(lead).trim();
}

function supplementEntryRichness(entry: ComposerEntry): number {
  let score = 0;
  if (entry.calloutId) score += 8;
  if (entry.supplementDetail?.trim()) score += 4;
  if (entry.supplementTrackPath?.trim()) score += 3;
  if ((entry.supplementPhotos?.length ?? 0) > 0) score += 2;
  if (entry.supplementKurz?.trim()) score += 1;
  if (entry.entryId) score += 1;
  if (parseEntryMetaComment(composerEntryText(entry))) score += 2;
  return score;
}

/** Merge duplicate supplement-profile rows (e.g. feed suffix copy + original bullet). */
export function dedupeSupplementProfileEntries(entries: ComposerEntry[]): ComposerEntry[] {
  const result: ComposerEntry[] = [];
  const indexByKey = new Map<string, number>();

  for (const entry of entries) {
    const key = supplementEntryDedupeKey(entry);
    if (!key) {
      result.push(entry);
      continue;
    }
    const idx = indexByKey.get(key);
    if (idx == null) {
      indexByKey.set(key, result.length);
      result.push(entry);
      continue;
    }
    const prev = result[idx]!;
    if (supplementEntryRichness(entry) <= supplementEntryRichness(prev)) continue;
    result[idx] = {
      ...prev,
      ...entry,
      id: prev.id,
      line: prev.line,
      entryId: entry.entryId || prev.entryId,
      calloutId: entry.calloutId || prev.calloutId,
      supplementDetail: entry.supplementDetail || prev.supplementDetail,
      supplementKurz: entry.supplementKurz || prev.supplementKurz,
      supplementTrackPath: entry.supplementTrackPath || prev.supplementTrackPath,
      supplementPhotos:
        (entry.supplementPhotos?.length ?? 0) > 0 ? entry.supplementPhotos : prev.supplementPhotos,
    };
  }

  return result;
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
  if (h === "reisen") {
    return chipsFromPrefixes(prefixes, [...REISEN_COMPOSER_CHIPS, ...REISEN_WALK_COMPOSER_CHIPS]);
  }
  if (h === "wandern") return chipsFromPrefixes(prefixes, WANDERN_COMPOSER_CHIPS);
  if (h === "heizung") return chipsFromPrefixes(prefixes, HEIZUNG_COMPOSER_CHIPS);
  if (h === "lüftung" || h === "lueftung") return chipsFromPrefixes(prefixes, LUEFTUNG_COMPOSER_CHIPS);
  if (h === "gedanken") return chipsFromPrefixes(prefixes, GEDANKEN_COMPOSER_CHIPS);
  if (h === "sonstiges") return chipsFromPrefixes(prefixes, SONSTIGES_COMPOSER_CHIPS);
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
  photoCollageMarkdown?: string,
  photoCollageMetaLine?: string,
): string[] {
  const heading = journalHeading.trim();
  const bodies = sortJournalEntryTexts(entryTexts.map(formatComposerEntryLine).filter(Boolean));
  const range = extractSectionRange(lines, heading);

  let resolvedTitle = calloutTitle?.trim() || resolveComposerCalloutTitle(lines, heading, date);

  if (!range) {
    const calloutBlock = buildComposerCalloutBlock(heading, bodies, date, null, resolvedTitle);
    const next = [...lines];
    if (next.length > 0 && next[next.length - 1] !== "") next.push("");
    next.push(`## ${heading}`, "");
    if (calloutBlock.length > 0) next.push(...calloutBlock);
    return next;
  }

  const before = lines.slice(0, range.start + 1);
  const sectionBody = lines.slice(range.start + 1, range.end);
  const after = lines.slice(range.end);

  const calloutBlock = buildComposerCalloutBlock(heading, bodies, date, null, resolvedTitle);
  let calloutWithExtras = calloutBlock;
  if (photoCollageMarkdown?.trim()) {
    const trimmed = calloutWithExtras;
    if (trimmed.length > 0 && trimmed[trimmed.length - 1]?.trim() === "") {
      calloutWithExtras = [
        ...trimmed.slice(0, -1),
        ">",
        ...photoCollageMarkdown.split("\n"),
        "",
      ];
    } else {
      calloutWithExtras = [...trimmed, ">", ...photoCollageMarkdown.split("\n"), ""];
    }
  }

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
    if (parseFeedMetadataComment(trimmed.replace(/^>\s*/, ""))) {
      i++;
      if (sectionBody[i] && isPlainJournalBulletLine(sectionBody[i] ?? "")) i++;
      continue;
    }
    if (trimmed.startsWith("<!-- udn-photos:")) {
      i++;
      continue;
    }
    if (trimmed.startsWith("<!-- udn-sonstiges:") || trimmed.startsWith("<!-- udn-sonstiges-entry:")) {
      i++;
      continue;
    }
    if (trimmed.startsWith("<!-- udn-reisen:") || trimmed.startsWith("<!-- udn-reisen-sort:")) {
      i++;
      continue;
    }
    if (trimmed.startsWith("<!-- udn-lueftung-entry:") || trimmed.startsWith("<!-- udn-heizung-entry:") || trimmed.startsWith("<!-- udn-wandern-entry:") || trimmed.startsWith("<!-- udn-spaziergang-entry:")) {
      i++;
      continue;
    }
    if (isEntryMetaCommentLine(line)) {
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
  if (calloutWithExtras.length > 0) rebuilt.push(...calloutWithExtras);
  if (photoCollageMetaLine?.trim()) rebuilt.push(photoCollageMetaLine);
  rebuilt.push(...after);
  return rebuilt;
}

export type LoadComposerSectionHeadingsOptions = {
  excludedHeadings: string[];
  defaultHeading?: string;
  durationDays: number;
};

/** Always available in composer heading picker, even before first use in the vault. */
export const COMPOSER_SECTION_PRESETS = ["Tagebuch", "Reisen", "Wandern", "Heizung", "Lüftung", "Sonstiges"] as const;

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
  dailyNotesFolder?: string,
): Promise<ComposerState> {
  const file = await ensureDailyNoteFileForDate(app, date, fallback, dailyNotesFolder);
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
  const reisenLoaded = await loadReisenSupplements(app, file);
  entries = mergeReisenSupplementsIntoEntries(entries, reisenLoaded);
  const lueftungLoaded = await loadLueftungSupplements(app, file);
  entries = mergeLueftungSupplementsIntoEntries(entries, lueftungLoaded);
  const heizungLoaded = await loadHeizungSupplements(app, file);
  entries = mergeHeizungSupplementsIntoEntries(entries, heizungLoaded);
  const gedankenLoaded = await loadGedankenSupplements(app, file);
  entries = mergeGedankenSupplementsIntoEntries(entries, gedankenLoaded);
  const sonstigesLoaded = await loadSonstigesSupplements(app, file);
  entries = mergeSonstigesSupplementsIntoEntries(entries, sonstigesLoaded);
  const wandernLoaded = await loadWandernSupplements(app, file);
  entries = mergeWandernSupplementsIntoEntries(entries, wandernLoaded);
  const spaziergangLoaded = await loadSpaziergangSupplements(app, file);
  entries = mergeSpaziergangSupplementsIntoEntries(entries, spaziergangLoaded);
  entries = dedupeSupplementProfileEntries(entries);
  const priorTexts = entries.map(composerEntryText);
  entries = entries.map((entry) => {
    const body = resolveJournalBodyWikiLinks(app, entry.body, file.path);
    return body === entry.body ? entry : { ...entry, body };
  });
  const resolvedTexts = entries.map(composerEntryText);
  const linksUpgraded = resolvedTexts.some((text, index) => text !== priorTexts[index]);
  const summary = readDailyNoteSummary(app, file) || suggestSummaryFromEntries(resolvedTexts);
  const calloutTitle = readCalloutTitleFromLines(lines, heading, noteDate);
  const sectionLines = (() => {
    const range = extractSectionRange(lines, heading);
    return range ? lines.slice(range.start + 1, range.end) : [];
  })();
  const photoMeta = parsePhotoCollageMetaFromLines(sectionLines);
  const parsedCollage = parsePhotoCollageFromLines(sectionLines, 0, sectionLines.length);
  const hasSupplementPhotoEntries = entries.some((e) => e.profile === "lueftung" || e.profile === "heizung");
  const photos = hasSupplementPhotoEntries ? [] : mergePhotoSources(parsedCollage, photoMeta).photos;

  if (linksUpgraded) {
    await saveComposerState(
      app,
      {
        file,
        journalHeading: heading,
        calloutTitle,
        summary,
        dateKey: localDayKey(date),
        photos,
      },
      resolvedTexts,
    );
  }

  return {
    file,
    dateKey: localDayKey(date),
    journalHeading: heading,
    calloutTitle,
    summary,
    entries,
    photos,
    reisenSortOrders: reisenLoaded.sortOrders,
  };
}

export async function saveComposerState(
  app: App,
  state: Pick<ComposerState, "file" | "journalHeading" | "calloutTitle" | "summary" | "dateKey"> & {
    photos?: ComposerState["photos"];
  },
  entryTexts: string[],
): Promise<boolean> {
  const texts = upgradeJournalEntryTextsLinks(
    app,
    entryTexts.map(formatComposerEntryLine).filter(Boolean),
    state.file.path,
  );
  const heading = state.journalHeading.trim() || "Tagebuch";
  const date = dateFromDateKey(state.dateKey);
  const calloutTitle = state.calloutTitle.trim();
  const photoPaths = (state.photos ?? []).map(stripPhotoEmbed).filter(Boolean);
  const { markdown: photoCollageMarkdown, layout } = await buildPhotoCollageMarkdownAsync(
    app,
    photoPaths,
    "> > ",
  );
  const photoCollageMetaLine =
    photoPaths.length > 0
      ? photoCollageMetaComment({ fotos: photoPaths, layout: layout as PhotoCollageLayout | "" })
      : "";

  await processVaultFile(app, state.file, (data) => {
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
    lines = rewriteJournalBullets(
      lines,
      heading,
      texts,
      date,
      calloutTitle,
      photoCollageMarkdown,
      photoCollageMetaLine,
    );
    content = lines.join("\n");
    return content.endsWith("\n") || content.length === 0 ? content : `${content}\n`;
  });

  return true;
}
