import type { App, TFile } from "obsidian";
import { DEFAULT_JOURNAL_HEADING } from "../settings";
import { ensureSectionHeading } from "./appendLogLine";
import { findTagebuchFeedLine, stripLeadingTimeFromKurz, upsertTagebuchFeedLine } from "./appendTagebuchFeedLine";
import { updateSummaryInContent } from "./dailyComposer";
import type { ComposerEntry } from "./dailyComposer";
import { composerEntryText } from "./dailyComposer";
import {
  extractSectionRange,
  formatManagedCalloutTitleLine,
  isManagedCalloutStart,
  isPlainJournalBulletLine,
  parseComposerCalloutTitle,
  readCalloutTitleFromLines,
} from "./journalCallout";
import type { FeedMetadata } from "./feedMetadata";
import { processVaultFile } from "./vaultProcess";
import { detailToCalloutProseLines, stripCalloutPrefixRaw } from "./calloutProse";
import { journalEntrySortMinutes, parseJournalEntryDisplay } from "./parseJournalEntryDisplay";

export const SONSTIGES_HEADING = "Sonstiges";
/** Legacy single-callout meta (one block per note). */
export const SONSTIGES_META_PREFIX = "<!-- udn-sonstiges:";
/** Per-entry meta in ## Sonstiges (1–n callouts). */
export const SONSTIGES_ENTRY_META_PREFIX = "<!-- udn-sonstiges-entry:";

export type SonstigesLegacyMeta = {
  titel: string;
  detail: string;
  feedTime: string;
  feedKurz: string;
};

export type SonstigesEntryMeta = {
  entryId: string;
  titel: string;
  detail: string;
};

export type SonstigesSupplement = {
  titel: string;
  detail: string;
};

export type SonstigesSupplementsLoadResult = {
  supplements: Map<string, SonstigesSupplement>;
  entryIdsWithCallout: Set<string>;
};

export type SonstigesComposerData = {
  calloutTitle: string;
  detail: string;
  feedTime: string;
  feedKurz: string;
};

export type SonstigesSyncEntry = Pick<
  ComposerEntry,
  "entryId" | "time" | "body" | "context" | "profile" | "supplementDetail"
>;

export function sonstigesEntryMetaComment(meta: SonstigesEntryMeta): string {
  return `${SONSTIGES_ENTRY_META_PREFIX} ${JSON.stringify(meta)} -->`;
}

export function sonstigesLegacyMetaComment(meta: SonstigesLegacyMeta): string {
  return `${SONSTIGES_META_PREFIX} ${JSON.stringify(meta)} -->`;
}

/** @deprecated Use sonstigesLegacyMetaComment */
export function sonstigesMetaComment(meta: SonstigesLegacyMeta): string {
  return sonstigesLegacyMetaComment(meta);
}

export function parseSonstigesEntryMetaLine(line: string): SonstigesEntryMeta | null {
  const trimmed = line.trim().replace(/^(?:>\s*)+/, "");
  if (!trimmed.startsWith(SONSTIGES_ENTRY_META_PREFIX)) return null;
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as Partial<SonstigesEntryMeta>;
    const entryId = parsed.entryId?.trim() ?? "";
    if (!entryId) return null;
    return {
      entryId,
      titel: parsed.titel?.trim() ?? "",
      detail: typeof parsed.detail === "string" ? parsed.detail : "",
    };
  } catch {
    return null;
  }
}

export function parseSonstigesMetaLine(line: string): SonstigesLegacyMeta | null {
  const trimmed = line.trim().replace(/^(?:>\s*)+/, "");
  if (!trimmed.startsWith(SONSTIGES_META_PREFIX)) return null;
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as Partial<SonstigesLegacyMeta>;
    return {
      titel: parsed.titel?.trim() ?? "",
      detail: typeof parsed.detail === "string" ? parsed.detail : "",
      feedTime: parsed.feedTime?.trim() ?? "",
      feedKurz: parsed.feedKurz?.trim() ?? "",
    };
  } catch {
    return null;
  }
}

function parseSonstigesCalloutContent(sectionLines: string[], titleLineIndex: number): { detail: string } {
  let end = sectionLines.length;
  for (let i = titleLineIndex + 1; i < sectionLines.length; i++) {
    const line = sectionLines[i] ?? "";
    const trimmed = line.trim();
    if (
      parseSonstigesEntryMetaLine(trimmed) ||
      parseSonstigesMetaLine(trimmed) ||
      isManagedCalloutStart(line, SONSTIGES_HEADING)
    ) {
      end = i;
      break;
    }
  }

  const blockLines = sectionLines.slice(titleLineIndex + 1, end);
  const prose: string[] = [];
  for (const line of blockLines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(">")) continue;
    const inner = stripCalloutPrefixRaw(line);
    if (/^!\[\[/.test(inner) && !inner.trim().startsWith("[!")) continue;
    if (isPlainJournalBulletLine(line)) {
      const body = inner.replace(/^[-*+]\s+/, "");
      const text = stripLeadingTimeFromKurz(body);
      if (text) prose.push(text);
      continue;
    }
    prose.push(inner);
  }
  return { detail: prose.join("\n") };
}

export function buildSonstigesCalloutBlock(title: string, detail: string): string {
  const titel = title.trim() || SONSTIGES_HEADING;
  const lines = [formatManagedCalloutTitleLine(SONSTIGES_HEADING, titel)];
  const proseLines = detailToCalloutProseLines(detail);
  if (proseLines.length > 0) {
    lines.push(...proseLines);
  } else {
    lines.push(">");
  }
  lines.push("");
  return lines.join("\n");
}

export function sonstigesCalloutTitle(entry: SonstigesSyncEntry): string {
  const body = entry.body.trim();
  const parsed = parseJournalEntryDisplay(body);
  const text = stripLeadingTimeFromKurz(parsed.body.trim() || body);
  return text || SONSTIGES_HEADING;
}

function sortSonstigesEntries(entries: SonstigesSyncEntry[]): SonstigesSyncEntry[] {
  const indexed = entries.map((entry, index) => ({
    entry,
    index,
    minutes: journalEntrySortMinutes(
      composerEntryText({
        time: entry.time,
        body: entry.body,
        entryId: entry.entryId,
        profile: entry.profile,
        context: entry.context,
      }),
    ),
  }));
  indexed.sort((a, b) => {
    const am = a.minutes ?? 9999;
    const bm = b.minutes ?? 9999;
    return am - bm || a.index - b.index;
  });
  return indexed.map((item) => item.entry);
}

export function renderSonstigesSectionBody(entries: SonstigesSyncEntry[]): string[] {
  const sonstigesEntries = entries.filter((e) => e.profile === "sonstiges" && e.entryId?.trim());
  if (sonstigesEntries.length === 0) return [];

  const out: string[] = [];
  for (const entry of sortSonstigesEntries(sonstigesEntries)) {
    const title = sonstigesCalloutTitle(entry);
    const detail = entry.supplementDetail ?? "";
    out.push(...buildSonstigesCalloutBlock(title, detail).split("\n"));
    out.push(
      sonstigesEntryMetaComment({
        entryId: entry.entryId!,
        titel: title,
        detail,
      }),
    );
    out.push("");
  }
  return out;
}

function parseLegacySonstigesSupplement(sectionLines: string[]): SonstigesSupplement | null {
  const meta = parseSonstigesMetaFromLines(sectionLines);
  if (!meta) return null;
  const parsed = proseFromLegacyCalloutLines(sectionLines);
  const titel = meta.titel || parsed.titel || SONSTIGES_HEADING;
  const detail = meta.detail || parsed.detail;
  return { titel, detail };
}

export function parseSonstigesSupplementsFromLines(lines: string[]): SonstigesSupplementsLoadResult {
  const supplements = new Map<string, SonstigesSupplement>();
  const entryIdsWithCallout = new Set<string>();

  const range = extractSectionRange(lines, SONSTIGES_HEADING);
  const sectionLines = range ? lines.slice(range.start + 1, range.end) : [];

  for (let i = 0; i < sectionLines.length; i++) {
    const line = sectionLines[i] ?? "";
    const entryMeta = parseSonstigesEntryMetaLine(line);
    if (entryMeta) {
      entryIdsWithCallout.add(entryMeta.entryId);
      let detail = entryMeta.detail;
      for (let j = i - 1; j >= 0; j--) {
        if (isManagedCalloutStart(sectionLines[j] ?? "", SONSTIGES_HEADING)) {
          const parsed = parseSonstigesCalloutContent(sectionLines, j);
          if (!detail) detail = parsed.detail;
          break;
        }
      }
      supplements.set(entryMeta.entryId, {
        titel: entryMeta.titel,
        detail,
      });
      continue;
    }

    const legacyMeta = parseSonstigesMetaLine(line);
    if (!legacyMeta || supplements.size > 0) continue;
    let detail = legacyMeta.detail;
    for (let j = i - 1; j >= 0; j--) {
      if (isManagedCalloutStart(sectionLines[j] ?? "", SONSTIGES_HEADING)) {
        const parsed = parseSonstigesCalloutContent(sectionLines, j);
        if (!detail) detail = parsed.detail;
        break;
      }
    }
    const legacy = parseLegacySonstigesSupplement(sectionLines);
    supplements.set("__legacy__", {
      titel: legacyMeta.titel || legacy?.titel || SONSTIGES_HEADING,
      detail: detail || legacy?.detail || "",
    });
  }

  return { supplements, entryIdsWithCallout };
}

export async function loadSonstigesSupplements(app: App, file: TFile): Promise<SonstigesSupplementsLoadResult> {
  let text = "";
  try {
    text = await app.vault.read(file);
  } catch {
    text = "";
  }
  return parseSonstigesSupplementsFromLines(text.split("\n"));
}

function replaceSonstigesSectionBody(lines: string[], bodyLines: string[]): string[] {
  const range = extractSectionRange(lines, SONSTIGES_HEADING);
  if (!range) {
    if (bodyLines.length === 0) return lines;
    const next = [...lines];
    if (next.length > 0 && next[next.length - 1] !== "") next.push("");
    next.push(`## ${SONSTIGES_HEADING}`, "");
    next.push(...bodyLines);
    return next;
  }
  if (bodyLines.length === 0) {
    return [...lines.slice(0, range.start), ...lines.slice(range.end)];
  }
  return [...lines.slice(0, range.start + 1), ...bodyLines, ...lines.slice(range.end)];
}

export async function syncSonstigesSupplements(app: App, file: TFile, entries: ComposerEntry[]): Promise<boolean> {
  const syncEntries: SonstigesSyncEntry[] = entries
    .filter((entry) => entry.profile === "sonstiges" && entry.entryId?.trim())
    .map((e) => ({
      entryId: e.entryId,
      time: e.time,
      body: e.body,
      context: e.context,
      profile: e.profile,
      supplementDetail: e.supplementDetail,
    }));

  const bodyLines = renderSonstigesSectionBody(syncEntries);

  await processVaultFile(app, file, (raw) => {
    let lines = raw.split("\n");
    if (bodyLines.length > 0) {
      lines = ensureSectionHeading(lines, SONSTIGES_HEADING);
    }
    lines = replaceSonstigesSectionBody(lines, bodyLines);
    const content = lines.join("\n");
    return content.endsWith("\n") || content.length === 0 ? content : `${content}\n`;
  });

  return true;
}

export function mergeSonstigesSupplementsIntoEntries(
  entries: ComposerEntry[],
  loaded: SonstigesSupplementsLoadResult,
): ComposerEntry[] {
  const legacy = loaded.supplements.get("__legacy__");
  let legacyApplied = false;

  return entries.map((entry) => {
    if (entry.profile !== "sonstiges" || !entry.entryId) {
      if (!legacyApplied && legacy && entry.profile === "sonstiges") {
        legacyApplied = true;
        return {
          ...entry,
          supplementDetail: legacy.detail,
        };
      }
      return entry;
    }

    const sup = loaded.supplements.get(entry.entryId);
    if (!sup) {
      if (!legacyApplied && legacy) {
        legacyApplied = true;
        return {
          ...entry,
          supplementDetail: legacy.detail,
          calloutId: loaded.entryIdsWithCallout.size > 0 ? entry.entryId : entry.calloutId,
        };
      }
      return entry;
    }

    const hasCallout = loaded.entryIdsWithCallout.has(entry.entryId);
    return {
      ...entry,
      supplementDetail: sup.detail,
      calloutId: hasCallout ? entry.entryId : entry.calloutId,
    };
  });
}

function stripCalloutPrefix(line: string): string {
  return stripCalloutPrefixRaw(line);
}

function proseFromLegacyCalloutLines(sectionLines: string[]): { titel: string; detail: string } {
  let titel = SONSTIGES_HEADING;
  const prose: string[] = [];
  let inCallout = false;

  for (const line of sectionLines) {
    if (parseSonstigesMetaLine(line) || parseSonstigesEntryMetaLine(line)) continue;
    const trimmed = line.trim();
    if (isManagedCalloutStart(line, SONSTIGES_HEADING)) {
      titel = parseComposerCalloutTitle(line) || titel;
      inCallout = true;
      continue;
    }
    if (!inCallout) continue;
    if (!trimmed.startsWith(">")) {
      inCallout = false;
      continue;
    }
    const inner = stripCalloutPrefix(line);
    if (isPlainJournalBulletLine(line)) {
      const body = inner.replace(/^[-*+]\s+/, "");
      const text = stripLeadingTimeFromKurz(body);
      if (text) prose.push(text);
      continue;
    }
    prose.push(inner);
  }

  return { titel, detail: prose.join("\n") };
}

export function parseSonstigesMetaFromLines(lines: string[]): SonstigesLegacyMeta | null {
  for (const line of lines) {
    const meta = parseSonstigesMetaLine(line);
    if (meta) return meta;
  }
  return null;
}

function replaceLegacySonstigesSectionBody(lines: string[], rendered: string, meta: SonstigesLegacyMeta): string[] {
  const range = extractSectionRange(lines, SONSTIGES_HEADING);
  const bodyLines = [...rendered.split("\n"), "", sonstigesLegacyMetaComment(meta), ""];

  if (!range) {
    const next = [...lines];
    if (next.length > 0 && next[next.length - 1] !== "") next.push("");
    next.push(`## ${SONSTIGES_HEADING}`, "");
    next.push(...bodyLines);
    return next;
  }

  return [...lines.slice(0, range.start + 1), ...bodyLines, ...lines.slice(range.end)];
}

/** Legacy single-callout save (heading ## Sonstiges im Composer-Altmodus). */
export async function loadSonstigesComposerData(app: App, file: TFile): Promise<SonstigesComposerData> {
  let text = "";
  try {
    text = await app.vault.read(file);
  } catch {
    text = "";
  }
  const lines = text.split("\n");
  const range = extractSectionRange(lines, SONSTIGES_HEADING);
  const sectionLines = range ? lines.slice(range.start + 1, range.end) : [];
  const meta = parseSonstigesMetaFromLines(sectionLines);
  const parsed = proseFromLegacyCalloutLines(sectionLines);
  const calloutTitle =
    readCalloutTitleFromLines(lines, SONSTIGES_HEADING) || meta?.titel || parsed.titel || SONSTIGES_HEADING;
  const context = calloutTitle.trim().toLowerCase() !== SONSTIGES_HEADING.toLowerCase() ? calloutTitle : "";
  const feed = findTagebuchFeedLine(lines, "sonstiges", context);

  return {
    calloutTitle,
    detail: meta?.detail ?? parsed.detail,
    feedTime: feed?.time || meta?.feedTime || "",
    feedKurz: feed ? stripLeadingTimeFromKurz(feed.kurz) : meta?.feedKurz ?? "",
  };
}

/** @deprecated Prefer profile „sonstiges“ on ## Tagebuch entries + syncSonstigesSupplements. */
export async function saveSonstigesComposerState(
  app: App,
  file: TFile,
  summary: string,
  date: Date,
  data: SonstigesComposerData,
  feedTime: string,
): Promise<boolean> {
  const titel = data.calloutTitle.trim() || SONSTIGES_HEADING;
  const detail = data.detail.trim();
  const kurz = stripLeadingTimeFromKurz(data.feedKurz.trim() || titel);
  const time = feedTime.trim() || "12:00";
  const rendered = buildSonstigesCalloutBlock(titel, detail);
  const meta: SonstigesLegacyMeta = { titel, detail, feedTime: time, feedKurz: kurz };
  const feedMetadata: FeedMetadata = {
    profile: "sonstiges",
    context: titel.toLowerCase() !== SONSTIGES_HEADING.toLowerCase() ? titel : "",
  };

  await processVaultFile(app, file, (raw) => {
    let content = updateSummaryInContent(raw, summary.trim());
    let lines = content.split("\n");
    lines = ensureSectionHeading(lines, SONSTIGES_HEADING);
    lines = replaceLegacySonstigesSectionBody(lines, rendered, meta);
    lines = upsertTagebuchFeedLine(
      lines,
      {
        time,
        kurz,
        metadata: feedMetadata,
        suffixLinks: "",
      },
      date,
    );
    lines = ensureSectionHeading(lines, DEFAULT_JOURNAL_HEADING);
    content = lines.join("\n");
    return content.endsWith("\n") || content.length === 0 ? content : `${content}\n`;
  });

  return true;
}
