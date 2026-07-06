import type { App, TFile } from "obsidian";
import { DEFAULT_JOURNAL_HEADING } from "../settings";
import { ensureSectionHeading } from "./appendLogLine";
import { findTagebuchFeedLine, stripLeadingTimeFromKurz, upsertTagebuchFeedLine } from "./appendTagebuchFeedLine";
import { updateSummaryInContent } from "./dailyComposer";
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

export const SONSTIGES_HEADING = "Sonstiges";
export const SONSTIGES_META_PREFIX = "<!-- udn-sonstiges:";

export type SonstigesMeta = {
  titel: string;
  detail: string;
  feedTime: string;
  feedKurz: string;
};

export type SonstigesComposerData = {
  calloutTitle: string;
  detail: string;
  feedTime: string;
  feedKurz: string;
};

export function sonstigesMetaComment(meta: SonstigesMeta): string {
  return `${SONSTIGES_META_PREFIX} ${JSON.stringify(meta)} -->`;
}

export function parseSonstigesMetaLine(line: string): SonstigesMeta | null {
  const trimmed = line.trim().replace(/^(?:>\s*)+/, "");
  if (!trimmed.startsWith(SONSTIGES_META_PREFIX)) return null;
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as Partial<SonstigesMeta>;
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

export function parseSonstigesMetaFromLines(lines: string[]): SonstigesMeta | null {
  for (const line of lines) {
    const meta = parseSonstigesMetaLine(line);
    if (meta) return meta;
  }
  return null;
}

function stripCalloutPrefix(line: string): string {
  return stripCalloutPrefixRaw(line);
}

function proseFromCalloutLines(sectionLines: string[]): { titel: string; detail: string } {
  let titel = SONSTIGES_HEADING;
  const prose: string[] = [];
  let inCallout = false;

  for (const line of sectionLines) {
    if (parseSonstigesMetaLine(line)) continue;
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

export function buildSonstigesCalloutBlock(title: string, detail: string): string {
  const titel = title.trim() || SONSTIGES_HEADING;
  const lines = [formatManagedCalloutTitleLine(SONSTIGES_HEADING, titel)];
  const proseLines = detailToCalloutProseLines(detail);
  if (proseLines.length === 0) {
    lines.push(">");
  } else {
    lines.push(...proseLines);
  }
  lines.push("");
  return lines.join("\n");
}

function replaceSonstigesSectionBody(lines: string[], rendered: string, meta: SonstigesMeta): string[] {
  const range = extractSectionRange(lines, SONSTIGES_HEADING);
  const bodyLines = [...rendered.split("\n"), "", sonstigesMetaComment(meta), ""];

  if (!range) {
    const next = [...lines];
    if (next.length > 0 && next[next.length - 1] !== "") next.push("");
    next.push(`## ${SONSTIGES_HEADING}`, "");
    next.push(...bodyLines);
    return next;
  }

  return [...lines.slice(0, range.start + 1), ...bodyLines, ...lines.slice(range.end)];
}

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
  const parsed = proseFromCalloutLines(sectionLines);
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
  const meta: SonstigesMeta = { titel, detail, feedTime: time, feedKurz: kurz };
  const feedMetadata: FeedMetadata = {
    profile: "sonstiges",
    context: titel.toLowerCase() !== SONSTIGES_HEADING.toLowerCase() ? titel : "",
  };

  await processVaultFile(app, file, (raw) => {
    let content = updateSummaryInContent(raw, summary.trim());
    let lines = content.split("\n");
    lines = ensureSectionHeading(lines, SONSTIGES_HEADING);
    lines = replaceSonstigesSectionBody(lines, rendered, meta);
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
