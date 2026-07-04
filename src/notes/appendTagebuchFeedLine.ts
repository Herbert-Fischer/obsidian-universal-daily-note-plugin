import { DEFAULT_JOURNAL_HEADING } from "../settings";
import { ensureSectionHeading } from "./appendLogLine";
import {
  formatFeedMetadataComment,
  parseFeedMetadataComment,
  type FeedMetadata,
} from "./feedMetadata";
import { journalEntrySortMinutes, parseJournalEntryDisplay } from "./parseJournalEntryDisplay";
import {
  extractSectionRange,
  formatComposerCalloutTitle,
  isManagedCalloutStart,
  isPlainJournalBulletLine,
  readCalloutTitleFromLines,
} from "./journalCallout";

export type TagebuchFeedLineInput = {
  time: string;
  kurz: string;
  metadata: FeedMetadata;
  suffixLinks: string;
};

const LEADING_TIME = /^\d{1,2}:\d{2}\s+/;

export function stripLeadingTimeFromKurz(kurz: string): string {
  return kurz.trim().replace(LEADING_TIME, "").trim();
}

function stripCalloutPrefix(line: string): string {
  return line.trim().replace(/^>\s*/, "");
}

function calloutLinePrefix(line: string): string {
  const match = line.match(/^((?:>\s*)*)/);
  return match?.[1] ?? "> ";
}

function indentForCallout(line: string, prefix = "> "): string {
  const trimmed = line.trim();
  if (!trimmed) return prefix.trimEnd();
  return `${prefix}${trimmed}`;
}

function feedMetaFromLine(line: string): FeedMetadata | null {
  return parseFeedMetadataComment(stripCalloutPrefix(line));
}

function isFeedMetadataLine(line: string): boolean {
  return feedMetaFromLine(line) !== null;
}

function isFeedBulletLine(line: string): boolean {
  return isPlainJournalBulletLine(line);
}

function feedProfileFromNearbyLines(lines: string[], bulletIndex: number): FeedMetadata | null {
  for (let i = bulletIndex - 1; i >= Math.max(0, bulletIndex - 3); i--) {
    const meta = feedMetaFromLine(lines[i] ?? "");
    if (meta) return meta;
    const trimmed = stripCalloutPrefix(lines[i] ?? "");
    if (trimmed && !trimmed.startsWith("<!--")) break;
  }
  return null;
}

/** Collect feed metadata+bullet pairs from a ## Tagebuch section (inside or outside callout). */
export function extractTagebuchFeedBlocks(sectionLines: string[]): string[][] {
  const blocks: string[][] = [];
  for (let i = 0; i < sectionLines.length; i++) {
    const meta = feedMetaFromLine(sectionLines[i] ?? "");
    if (!meta) continue;
    const block = [stripCalloutPrefix(sectionLines[i] ?? "")];
    const next = sectionLines[i + 1];
    if (next && isFeedBulletLine(next)) {
      block.push(stripCalloutPrefix(next));
      i++;
    }
    blocks.push(block);
  }
  return blocks;
}

export function buildTagebuchFeedBulletLines(input: TagebuchFeedLineInput): string[] {
  const time = input.time.trim() || "12:00";
  const kurz = stripLeadingTimeFromKurz(input.kurz);
  const suffix = input.suffixLinks.trim();
  const body = [kurz, suffix].filter(Boolean).join(" ");
  return [formatFeedMetadataComment(input.metadata), `- ${time} ${body}`.trim()];
}

export type TagebuchFeedMatch = {
  lineIndex: number;
  time: string;
  kurz: string;
  text: string;
  rawLine: string;
  metadata: FeedMetadata;
};

function feedBulletDisplayText(line: string): string {
  return stripCalloutPrefix(line).replace(/^[-*+]\s+/, "").trim();
}

/** Find the ## Tagebuch feed bullet for a profile (+ optional context title). */
export function findTagebuchFeedLine(
  lines: string[],
  profile: FeedMetadata["profile"],
  context = "",
): TagebuchFeedMatch | null {
  const direct = findTagebuchFeedLineMatch(lines, profile, context);
  if (direct) return direct;
  // Legacy Sonstiges feeds used profile=tagebuch with context.
  if (profile === "sonstiges") {
    return findTagebuchFeedLineMatch(lines, "tagebuch", context);
  }
  return null;
}

function findTagebuchFeedLineMatch(
  lines: string[],
  profile: FeedMetadata["profile"],
  context = "",
): TagebuchFeedMatch | null {
  const range = extractSectionRange(lines, DEFAULT_JOURNAL_HEADING);
  if (!range) return null;
  const ctx = context.trim().toLowerCase();
  const sectionLines = lines.slice(range.start + 1, range.end);

  for (let i = 0; i < sectionLines.length; i++) {
    const meta = feedMetaFromLine(sectionLines[i] ?? "");
    if (!meta || meta.profile !== profile) continue;
    if (ctx && meta.context.trim().toLowerCase() !== ctx) continue;
    if (!ctx && meta.context.trim()) continue;

    const bulletLine = sectionLines[i + 1];
    if (!bulletLine || !isFeedBulletLine(bulletLine)) continue;

    const text = feedBulletDisplayText(bulletLine);
    const parsed = parseJournalEntryDisplay(text);
    return {
      lineIndex: range.start + 1 + i + 1,
      time: parsed.time ?? "",
      kurz: stripLeadingTimeFromKurz(parsed.body),
      text,
      rawLine: bulletLine,
      metadata: meta,
    };
  }

  return null;
}

function findFeedBulletIndexInLines(lines: string[], profile: FeedMetadata["profile"], context: string): number {
  const ctx = context.trim().toLowerCase();
  for (let i = 0; i < lines.length; i++) {
    if (!isFeedBulletLine(lines[i] ?? "")) continue;
    const meta = feedProfileFromNearbyLines(lines, i);
    if (!meta || meta.profile !== profile) continue;
    if (ctx && meta.context.trim().toLowerCase() !== ctx) continue;
    if (!ctx && meta.context.trim()) continue;
    return i;
  }
  return -1;
}

function replaceFeedBlockInLines(lines: string[], bulletIndex: number, blockLines: string[]): string[] {
  let start = bulletIndex;
  for (let i = bulletIndex - 1; i >= Math.max(0, bulletIndex - 3); i--) {
    if (feedMetaFromLine(lines[i] ?? "")) {
      start = i;
      break;
    }
    const trimmed = stripCalloutPrefix(lines[i] ?? "");
    if (trimmed && !trimmed.startsWith("<!--")) break;
  }
  return [...lines.slice(0, start), ...blockLines, ...lines.slice(bulletIndex + 1)];
}

function removeOrphanFeedBlocksOutsideCallout(sectionLines: string[], calloutEnd: number): string[] {
  const kept: string[] = [];
  for (let i = 0; i < sectionLines.length; i++) {
    const line = sectionLines[i] ?? "";
    if (i >= calloutEnd && isFeedMetadataLine(line)) {
      if (sectionLines[i + 1] && isPlainJournalBulletLine(sectionLines[i + 1]!)) i++;
      continue;
    }
    kept.push(line);
  }
  return kept;
}

function findManagedTagebuchCallout(sectionLines: string[]): {
  start: number;
  end: number;
  prefix: string;
} | null {
  for (let i = 0; i < sectionLines.length; i++) {
    if (!isManagedCalloutStart(sectionLines[i] ?? "", DEFAULT_JOURNAL_HEADING)) continue;
    const prefix = calloutLinePrefix(sectionLines[i] ?? "");
    let end = i + 1;
    while (end < sectionLines.length) {
      const trimmed = (sectionLines[end] ?? "").trim();
      if (!trimmed.startsWith(">")) break;
      end++;
    }
    return { start: i, end, prefix };
  }
  return null;
}

function createTagebuchCalloutWithFeed(
  lines: string[],
  blockLines: string[],
  date?: Date,
): string[] {
  const title = readCalloutTitleFromLines(lines, DEFAULT_JOURNAL_HEADING, date);
  const prefix = "> ";
  const calloutLines = [
    `> [!tagebuch-ref] ${title || formatComposerCalloutTitle(DEFAULT_JOURNAL_HEADING, date)}`,
    ...blockLines.map((line) => indentForCallout(line, prefix)),
    "",
  ];
  const next = [...lines];
  if (next.length > 0 && next[next.length - 1] !== "") next.push("");
  next.push(`## ${DEFAULT_JOURNAL_HEADING}`, "", ...calloutLines);
  return next;
}

type CalloutSortBlock = {
  lines: string[];
  minutes: number | null;
  index: number;
};

function bulletMinutesFromCalloutLine(line: string): number | null {
  if (!isFeedBulletLine(line)) return null;
  const text = stripCalloutPrefix(line).replace(/^[-*+]\s+/, "").trim();
  return journalEntrySortMinutes(text);
}

function partitionCalloutLines(calloutLines: string[]): {
  prefix: string[];
  sortables: CalloutSortBlock[];
  statics: string[];
} {
  const prefix: string[] = [];
  const sortables: CalloutSortBlock[] = [];
  const statics: string[] = [];
  let sortIndex = 0;

  for (let i = 0; i < calloutLines.length; i++) {
    const line = calloutLines[i] ?? "";
    const meta = feedMetaFromLine(line);
    if (meta && calloutLines[i + 1] && isFeedBulletLine(calloutLines[i + 1]!)) {
      sortables.push({
        lines: [line, calloutLines[i + 1]!],
        minutes: bulletMinutesFromCalloutLine(calloutLines[i + 1]!),
        index: sortIndex++,
      });
      i++;
      continue;
    }
    if (isPlainJournalBulletLine(line)) {
      sortables.push({
        lines: [line],
        minutes: bulletMinutesFromCalloutLine(line),
        index: sortIndex++,
      });
      continue;
    }
    if (sortables.length === 0) prefix.push(line);
    else statics.push(line);
  }

  return { prefix, sortables, statics };
}

/** Re-order timed journal bullets and feed blocks; galleries and other blocks stay at the end. */
export function sortCalloutTimedEntries(calloutLines: string[]): string[] {
  const { prefix, sortables, statics } = partitionCalloutLines(calloutLines);
  if (sortables.length === 0) return calloutLines;

  const sorted = [...sortables].sort((a, b) => {
    if (a.minutes != null && b.minutes != null) {
      return a.minutes - b.minutes || a.index - b.index;
    }
    if (a.minutes != null) return -1;
    if (b.minutes != null) return 1;
    return a.index - b.index;
  });

  return [...prefix, ...sorted.flatMap((block) => block.lines), ...statics];
}

function upsertFeedInsideCallout(
  sectionLines: string[],
  blockLines: string[],
  metadata: FeedMetadata,
): string[] {
  const callout = findManagedTagebuchCallout(sectionLines);
  if (!callout) return sectionLines;

  let body = removeOrphanFeedBlocksOutsideCallout(sectionLines, callout.end);
  const refreshed = findManagedTagebuchCallout(body);
  if (!refreshed) return body;

  const calloutLines = body.slice(refreshed.start, refreshed.end);
  const prefixedBlock = blockLines.map((line) => indentForCallout(line, refreshed.prefix));
  const existing = findFeedBulletIndexInLines(calloutLines, metadata.profile, metadata.context);

  let nextCallout: string[];
  if (existing >= 0) {
    nextCallout = replaceFeedBlockInLines(calloutLines, existing, prefixedBlock);
  } else {
    nextCallout = [...calloutLines, ...prefixedBlock];
  }
  nextCallout = sortCalloutTimedEntries(nextCallout);

  return [...body.slice(0, refreshed.start), ...nextCallout, ...body.slice(refreshed.end)];
}

/** Upsert a short feed bullet inside the ## Tagebuch callout (with metadata comment). */
export function upsertTagebuchFeedLine(lines: string[], input: TagebuchFeedLineInput, date?: Date): string[] {
  let next = ensureSectionHeading(lines, DEFAULT_JOURNAL_HEADING);
  const block = buildTagebuchFeedBulletLines(input);
  const range = extractSectionRange(next, DEFAULT_JOURNAL_HEADING);

  if (!range) {
    return createTagebuchCalloutWithFeed(next, block, date);
  }

  const sectionLines = next.slice(range.start + 1, range.end);
  const callout = findManagedTagebuchCallout(sectionLines);

  if (!callout) {
    const title =
      readCalloutTitleFromLines(next, DEFAULT_JOURNAL_HEADING, date) ||
      formatComposerCalloutTitle(DEFAULT_JOURNAL_HEADING, date);
    const sectionBody = next.slice(range.start + 1, range.end);
    const rebuiltSection = [
      ...sectionBody,
      `> [!tagebuch-ref] ${title}`,
      ...block.map((line) => indentForCallout(line, "> ")),
      "",
    ];
    return [...next.slice(0, range.start + 1), ...rebuiltSection, ...next.slice(range.end)];
  }

  const updatedSection = upsertFeedInsideCallout(sectionLines, block, input.metadata);
  return [...next.slice(0, range.start + 1), ...updatedSection, ...next.slice(range.end)];
}

/** Re-indent preserved feed blocks for inclusion in a rebuilt callout. */
export function feedBlocksForCallout(blocks: string[][], prefix = "> "): string[] {
  const out: string[] = [];
  for (const block of blocks) {
    for (const line of block) {
      out.push(indentForCallout(line, prefix));
    }
  }
  return out;
}

export function mergeFeedBlocksIntoCalloutBlock(calloutBlock: string[], feedBlocks: string[][]): string[] {
  if (feedBlocks.length === 0 || calloutBlock.length === 0) return calloutBlock;
  const prefix = calloutLinePrefix(calloutBlock[0] ?? "> ");
  const feedLines = feedBlocksForCallout(feedBlocks, prefix);
  if (calloutBlock[calloutBlock.length - 1]?.trim() === "") {
    return [...calloutBlock.slice(0, -1), ...feedLines, ""];
  }
  return [...calloutBlock, ...feedLines, ""];
}
