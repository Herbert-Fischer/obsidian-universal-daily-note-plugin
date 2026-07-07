import { DEFAULT_EXCLUDED_JOURNAL_HEADINGS, DEFAULT_JOURNAL_HEADING } from "../settings";
import { ensureSectionHeading } from "./appendLogLine";
import { rewriteJournalBullets } from "./dailyComposer";
import {
  extractAllH2Headings,
  extractJournalLines,
  extractJournalLinesFromCallout,
} from "./dailyNoteTimeline";
import {
  dateFromDateKey,
  extractSectionRange,
  formatComposerCalloutTitle,
  formatComposerCalloutType,
  formatReisenCalloutTitle,
  isManagedCalloutStart,
  isPlainJournalBulletLine,
  isLegacyMisplacedSonstigesTripCallout,
  parseReisenTripLabel,
} from "./journalCallout";

const NAV_CALLOUT_RE = /^>\s*\[! *(mfh|calendar|script)\]/i;

/** Denkarium nav bar — matches daily note template. */
export const DAILY_NOTE_MFH_CALLOUT =
  ">[!mfh]+ `$= dv.current().up` | `$= dv.array(dv.current().related || []).join(\" | \")`";

function parseFrontmatter(content: string): { fm: string; body: string } | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content);
  if (!match) return null;
  return { fm: match[1] ?? "", body: match[2] ?? "" };
}

function extractSummaryLine(fm: string): string {
  const match = fm.match(/^Zusammenfassung:.*$/m);
  return match?.[0] ?? "Zusammenfassung:";
}

export function normalizeDailyNoteFrontmatter(dateKey: string, fm: string): string {
  return [
    "fileClass: Daily Notes",
    "category: Personal",
    "doctype: Tagebuch",
    "Erstellt:",
    `  ${dateKey}`,
    "Location:",
    'Up: "[[Tagebuch]]"',
    "Related: []",
    extractSummaryLine(fm),
  ].join("\n");
}

function stripLegacyNavCallouts(lines: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i]?.trim() ?? "";
    if (NAV_CALLOUT_RE.test(trimmed)) {
      i++;
      while (i < lines.length && (lines[i]?.trim() ?? "").startsWith(">")) i++;
      continue;
    }
    out.push(lines[i] ?? "");
    i++;
  }
  while (out.length > 0 && out[0]?.trim() === "") out.shift();
  return out;
}

export function ensureMfhNavCallout(lines: string[]): string[] {
  const body = stripLegacyNavCallouts(lines);
  if (body.length === 0) return [DAILY_NOTE_MFH_CALLOUT, ""];
  return [DAILY_NOTE_MFH_CALLOUT, "", ...body];
}

function hasH2Section(lines: string[], heading: string): boolean {
  const target = heading.toLowerCase();
  return lines.some((l) => {
    const m = l.match(/^##\s+(.+)$/);
    return m && m[1]?.trim().toLowerCase() === target;
  });
}

function removeStandaloneManagedCallout(lines: string[], heading: string): string[] {
  if (hasH2Section(lines, heading)) return lines;
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (isManagedCalloutStart(lines[i] ?? "", heading)) {
      i++;
      while (i < lines.length && (lines[i]?.trim() ?? "").startsWith(">")) i++;
      continue;
    }
    out.push(lines[i] ?? "");
    i++;
  }
  while (out.length > 0 && out[out.length - 1]?.trim() === "") out.pop();
  return out;
}

function buildEmptyCalloutBlock(heading: string, date?: Date): string[] {
  const type = formatComposerCalloutType(heading);
  const title = formatComposerCalloutTitle(heading, date);
  return [`> [!${type}] ${title}`, ">", ""];
}

function fixTagebuchCalloutTitle(lines: string[], date: Date): string[] {
  const expectedTitle = formatComposerCalloutTitle(DEFAULT_JOURNAL_HEADING, date);
  const type = formatComposerCalloutType(DEFAULT_JOURNAL_HEADING);
  return lines.map((line) => {
    if (isManagedCalloutStart(line, DEFAULT_JOURNAL_HEADING)) {
      return `> [!${type}] ${expectedTitle}`;
    }
    return line;
  });
}

function ensureEmptyTagebuchCallout(lines: string[], date: Date): string[] {
  let next = ensureSectionHeading(lines, DEFAULT_JOURNAL_HEADING);
  next = rewriteJournalBullets(next, DEFAULT_JOURNAL_HEADING, [], date);
  const range = extractSectionRange(next, DEFAULT_JOURNAL_HEADING);
  if (!range) return next;

  const sectionBody = next.slice(range.start + 1, range.end);
  if (sectionBody.some((l) => isManagedCalloutStart(l, DEFAULT_JOURNAL_HEADING))) {
    return fixTagebuchCalloutTitle(next, date);
  }

  const block = buildEmptyCalloutBlock(DEFAULT_JOURNAL_HEADING, date);
  const before = next.slice(0, range.end);
  const after = next.slice(range.end);
  while (before.length > 0 && before[before.length - 1]?.trim() === "") before.pop();
  if (before[before.length - 1]?.trim() !== "") before.push("");
  return [...before, ...block, ...after];
}

function migrateJournalSection(
  lines: string[],
  heading: string,
  dateKey: string,
): string[] {
  const isTagebuch = heading.toLowerCase() === DEFAULT_JOURNAL_HEADING.toLowerCase();
  const date = isTagebuch ? dateFromDateKey(dateKey) : undefined;
  let entries = extractJournalLines(lines, heading).map((e) => e.text);
  if (entries.length === 0 && isTagebuch) {
    entries = extractJournalLinesFromCallout(lines, heading).map((e) => e.text);
  }

  if (entries.length > 0) {
    let next = lines;
    if (isTagebuch && !hasH2Section(lines, heading)) {
      next = removeStandaloneManagedCallout(lines, heading);
      next = ensureSectionHeading(next, heading);
    }
    next = rewriteJournalBullets(next, heading, entries, date);
    return isTagebuch ? fixTagebuchCalloutTitle(next, date!) : next;
  }

  if (isTagebuch) {
    let next = removeStandaloneManagedCallout(lines, heading);
    return ensureEmptyTagebuchCallout(next, date!);
  }

  return rewriteJournalBullets(lines, heading, [], date);
}

const REISEN_HEADING = "Reisen";
const SONSTIGES_HEADING = "Sonstiges";

function cleanBulletText(raw: string): string {
  return raw
    .trim()
    .replace(/^>\s*/, "")
    .replace(/^[-*+]\s+/, "");
}

function extractSonstigesReisenTrip(
  lines: string[],
): { entries: string[]; tripLabel: string | null } | null {
  const range = extractSectionRange(lines, SONSTIGES_HEADING);
  if (!range) return null;

  for (let i = range.start + 1; i < range.end; i++) {
    const line = lines[i] ?? "";
    if (!isLegacyMisplacedSonstigesTripCallout(line)) continue;

    const entries: string[] = [];
    for (let j = i + 1; j < range.end; j++) {
      const bulletLine = lines[j] ?? "";
      const trimmed = bulletLine.trim();
      if (!trimmed.startsWith(">")) break;
      if (isPlainJournalBulletLine(bulletLine)) {
        const text = cleanBulletText(trimmed);
        if (text) entries.push(text);
      }
    }
    if (entries.length === 0) return null;
    return { entries, tripLabel: parseReisenTripLabel(line) };
  }

  return null;
}

function removeSonstigesReisenTripBlock(lines: string[]): string[] {
  const range = extractSectionRange(lines, SONSTIGES_HEADING);
  if (!range) return lines;

  let tripStart = -1;
  let tripEnd = -1;
  for (let i = range.start + 1; i < range.end; i++) {
    if (!isLegacyMisplacedSonstigesTripCallout(lines[i] ?? "")) continue;
    tripStart = i;
    tripEnd = i + 1;
    while (tripEnd < range.end && (lines[tripEnd]?.trim() ?? "").startsWith(">")) tripEnd++;
    break;
  }
  if (tripStart < 0) return lines;

  let next = [...lines.slice(0, tripStart), ...lines.slice(tripEnd)];
  const sonstigesRange = extractSectionRange(next, SONSTIGES_HEADING);
  if (!sonstigesRange) return next;

  const body = next.slice(sonstigesRange.start + 1, sonstigesRange.end);
  const hasContent = body.some((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && trimmed !== "---";
  });
  if (hasContent) return next;

  next = [...next.slice(0, sonstigesRange.start), ...next.slice(sonstigesRange.end)];
  while (next.length > 0 && next[next.length - 1]?.trim() === "") next.pop();
  return next;
}

function ensureReisenTripStub(lines: string[], tripLabel: string | null): string[] {
  if (!tripLabel) return lines;
  const range = extractSectionRange(lines, REISEN_HEADING);
  if (!range) return lines;

  const body = lines.slice(range.start + 1, range.end);
  if (body.some((line) => /^>\s*\[!/.test(line.trim()))) return lines;

  const stub = [`> [!notes] ${tripLabel}`, ""];
  return [...lines.slice(0, range.start + 1), "", ...stub, ...lines.slice(range.start + 1)];
}

function wrapSonstigesBulletsInNotesCallout(lines: string[]): string[] {
  const range = extractSectionRange(lines, SONSTIGES_HEADING);
  if (!range) return lines;
  const body = lines.slice(range.start + 1, range.end);
  const hasNotesCallout = body.some((l) => /^\s*>\s*\[!\s*notes\]/i.test(l.trim()));
  if (hasNotesCallout) return lines;
  const bullets = body.filter((l) => /^\s*[-*+]\s+/.test(l.trim()));
  if (bullets.length === 0) return lines;
  const wrapped: string[] = ["> [!notes] Sonstiges", ...bullets.map((b) => `> ${b.trim()}`)];
  const next = [
    ...lines.slice(0, range.start + 1),
    "",
    ...wrapped,
    "",
    ...lines.slice(range.end),
  ];
  return next;
}

/** Move misplaced Reisen trip callouts from ## Sonstiges into ## Reisen. */
export function migrateMisplacedReisenTrips(lines: string[]): string[] {
  const trip = extractSonstigesReisenTrip(lines);
  if (!trip) return lines;

  let next = removeSonstigesReisenTripBlock(lines);
  const existing = extractJournalLines(next, REISEN_HEADING).map((entry) => entry.text);
  const entries = [...existing, ...trip.entries];

  next = ensureSectionHeading(next, REISEN_HEADING);
  next = ensureReisenTripStub(next, trip.tripLabel);
  const calloutTitle = trip.tripLabel ? formatReisenCalloutTitle(trip.tripLabel) : undefined;
  next = rewriteJournalBullets(next, REISEN_HEADING, entries, undefined, calloutTitle);

  return next;
}

export function migrateDailyNoteBody(lines: string[], dateKey: string): string[] {
  const excluded = new Set(DEFAULT_EXCLUDED_JOURNAL_HEADINGS.map((h) => h.toLowerCase()));
  // Sonstiges migration is handled separately to avoid losing legacy free-text bullets.
  excluded.add("sonstiges");
  let next = ensureMfhNavCallout(lines);
  next = migrateMisplacedReisenTrips(next);
  next = wrapSonstigesBulletsInNotesCallout(next);

  const headings = extractAllH2Headings(next);
  const toProcess: string[] = [];
  const seen = new Set<string>();

  if (!headings.some((h) => h.toLowerCase() === DEFAULT_JOURNAL_HEADING.toLowerCase())) {
    toProcess.push(DEFAULT_JOURNAL_HEADING);
    seen.add(DEFAULT_JOURNAL_HEADING.toLowerCase());
  }

  for (const heading of headings) {
    const key = heading.toLowerCase();
    if (seen.has(key) || excluded.has(key)) continue;
    seen.add(key);
    toProcess.push(heading);
  }

  for (const heading of toProcess) {
    next = migrateJournalSection(next, heading, dateKey);
  }

  return next;
}

export function migrateDailyNoteContent(content: string, dateKey: string): string | null {
  const parsed = parseFrontmatter(content);
  if (!parsed) return null;

  const fm = normalizeDailyNoteFrontmatter(dateKey, parsed.fm);
  const bodyLines = migrateDailyNoteBody(parsed.body.split("\n"), dateKey);
  let body = bodyLines.join("\n");
  if (body.length > 0 && !body.endsWith("\n")) body += "\n";
  return `---\n${fm}\n---\n\n${body}`;
}
