import { DEFAULT_JOURNAL_HEADING } from "../settings";
import { appendEntryMeta, stripEntryMeta } from "./journalEntryMeta";
import { journalProfileForHeading } from "./journalProfiles";

/** Nick Milo / Denkarium callout types written for known ## headings. */
const HEADING_CALLOUT_WRITE: Record<string, string> = {
  tagebuch: "tagebuch-ref",
  sonstiges: "notes",
  reisen: "compass",
  wandern: "mountain",
  spaziergang: "person-walking",
  heizung: "fire",
  lueftung: "wind",
  gedanken: "lightbulb",
  wichtig: "cone",
  gesundheit: "activity",
  arbeit: "command",
  familie: "user",
  aufgaben: "todo",
  aufgabe: "todo",
  tasks: "todo",
};

/** Recognized callout types when reading (includes legacy plugin slugs). */
const HEADING_CALLOUT_ALIASES: Record<string, string[]> = {
  tagebuch: ["tagebuch-ref", "tagebuch", "calendar"],
  sonstiges: ["notes", "box", "sonstiges"],
  reisen: ["compass", "globe", "travel", "reisen", "reise", "notes"],
  wandern: ["mountain", "footprints", "wandern", "hike", "notes"],
  spaziergang: ["person-walking", "walking", "footprints", "spaziergang", "notes"],
  heizung: ["fire", "flame", "heizung"],
  lueftung: ["wind", "fan", "lueftung", "lüftung"],
  gedanken: ["lightbulb", "bulb", "idea", "gedanken"],
  wichtig: ["cone", "warning", "wichtig"],
  gesundheit: ["activity", "gesundheit"],
  arbeit: ["command", "industry", "Industry", "arbeit"],
  familie: ["user", "contact", "familie"],
  aufgaben: ["todo", "check", "checkbox", "aufgaben", "tasks", "aufgabe"],
  aufgabe: ["todo", "check", "checkbox", "aufgaben", "tasks", "aufgabe"],
  tasks: ["todo", "check", "checkbox", "aufgaben", "tasks", "aufgabe"],
};

const DEFAULT_CALLOUT_TYPE = "notes";

export function slugifyJournalHeading(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function formatGermanShortDate(date: Date): string {
  const d = date.getDate();
  const m = date.getMonth() + 1;
  const y = date.getFullYear();
  return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
}

const LEADING_GERMAN_DATE = /^(\d{1,2}\.\d{1,2}\.\d{4})(?:\s*·\s*)?/;

/** Remove leading DD.MM.YYYY (and optional „ · “) from a callout title for outline display. */
export function stripLeadingGermanDateFromCalloutTitle(title: string): string {
  return title.trim().replace(LEADING_GERMAN_DATE, "").trim();
}

export function dateFromDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 0, 0, 0, 0);
}

function headingCalloutSlug(heading: string): string {
  const slug = slugifyJournalHeading(heading);
  if (slug === slugifyJournalHeading(DEFAULT_JOURNAL_HEADING)) return "tagebuch";
  return slug || "journal";
}

export function formatComposerCalloutType(heading: string): string {
  const slug = headingCalloutSlug(heading);
  return HEADING_CALLOUT_WRITE[slug] ?? DEFAULT_CALLOUT_TYPE;
}

const EXPANDED_PROFILE_CALLOUTS = new Set(["reisen", "wandern", "spaziergang", "heizung", "lueftung", "gedanken"]);

/** Fold marker for profile ## sections written from the composer (+ = expanded). */
export function calloutFoldMarkerForHeading(heading: string): string {
  const slug = headingCalloutSlug(heading.trim());
  return EXPANDED_PROFILE_CALLOUTS.has(slug) ? "+" : "";
}

/** Managed callout title line for a ## section (type from heading, title from composer). */
export function formatManagedCalloutTitleLine(heading: string, title: string): string {
  const type = formatComposerCalloutType(heading);
  const fold = calloutFoldMarkerForHeading(heading);
  const trimmed = title.trim();
  return fold ? `> [!${type}]${fold} ${trimmed}` : `> [!${type}] ${trimmed}`;
}

export function calloutTypesForHeading(heading: string): string[] {
  const slug = headingCalloutSlug(heading);
  const aliases = HEADING_CALLOUT_ALIASES[slug];
  if (aliases) return aliases;
  const writeType = formatComposerCalloutType(heading);
  const rawSlug = slugifyJournalHeading(heading);
  if (rawSlug && writeType === DEFAULT_CALLOUT_TYPE) return [writeType, rawSlug];
  return [writeType];
}

const CALLOUT_TITLE = /^>\s*\[!([^\]|]+)(?:\|([^\]]*))?\]([+-])?\s*(.*)$/;

/** Inline callout marker without leading `>` (after journalLineCell / cleanJournalLine). */
const INLINE_CALLOUT_MARKER = /^\[!([^\]|]+)(?:\|([^\]]*))?\]([+-])?\s*(.*)$/;

/** Remove Obsidian callout syntax from journal display text (Outline / Verweise). */
export function stripCalloutMarkerFromDisplay(text: string): string {
  let rest = text.trim().replace(/^>\s*/, "");
  const m = rest.match(INLINE_CALLOUT_MARKER);
  if (!m) return rest;
  const fromPipe = m[2]?.trim();
  const fromRest = (m[4]?.trim() ?? "");
  const inner = fromPipe || fromRest;
  return inner || rest;
}

/** Trip name from a Reisen callout title line (e.g. „Mamas 90ter Geburtstag“). */
export function parseReisenTripLabel(calloutLine: string): string | null {
  const m = calloutLine.trim().match(CALLOUT_TITLE);
  if (!m) return null;
  const rest = (m[2]?.trim() || (m[4]?.trim() ?? "").replace(/^[+-]\s*/, "").trim());
  if (!rest || rest.toLowerCase() === "reisen") return null;

  const brackets = [...rest.matchAll(/\[([^\]]+)\]/g)]
    .map((x) => x[1]?.trim())
    .filter(Boolean);
  if (brackets.length === 1) return brackets[0]!;
  if (brackets.length > 1) return null;

  return rest;
}

export function formatReisenCalloutTitle(tripLabel: string | null | undefined): string {
  const trip = tripLabel?.trim();
  if (!trip) return "Reisen";
  return `Reisen [${trip}]`;
}

export function extractReisenTripFromSection(
  lines: string[],
  heading = "Reisen",
): string | null {
  const range = extractSectionRange(lines, heading);
  if (!range) return null;
  for (let i = range.start + 1; i < range.end; i++) {
    const line = lines[i] ?? "";
    if (/^>\s*\[!/.test(line.trim())) {
      return parseReisenTripLabel(line);
    }
  }
  return null;
}

export function formatComposerCalloutTitle(
  heading: string,
  date?: Date,
  tripLabel?: string | null,
): string {
  if (heading.trim().toLowerCase() === "reisen") {
    return formatReisenCalloutTitle(tripLabel);
  }
  if (heading.trim().toLowerCase() === DEFAULT_JOURNAL_HEADING.toLowerCase() && date) {
    return formatGermanShortDate(date);
  }
  return heading.trim();
}

/** Raw callout title from a managed callout start line. */
export function parseComposerCalloutTitle(calloutLine: string): string | null {
  const m = calloutLine.trim().match(CALLOUT_TITLE);
  if (!m) return null;
  const fromPipe = m[2]?.trim();
  const fromRest = (m[4]?.trim() ?? "").replace(/^[+-]\s*/, "").trim();
  return fromPipe || fromRest || null;
}

export function readCalloutTitleFromLines(
  lines: string[],
  journalHeading: string,
  date?: Date,
): string {
  const heading = journalHeading.trim();
  const range = extractSectionRange(lines, heading);
  if (range) {
    for (let i = range.start + 1; i < range.end; i++) {
      const line = lines[i] ?? "";
      if (
        isManagedCalloutStart(line, heading) ||
        (journalProfileForHeading(heading) != null && /^>\s*\[!/.test(line.trim()))
      ) {
        const title = parseComposerCalloutTitle(line);
        if (title) return title;
      }
    }
  }

  for (const line of lines) {
    if (!isManagedCalloutStart(line, heading)) continue;
    const title = parseComposerCalloutTitle(line);
    if (title) return title;
  }

  return formatComposerCalloutTitle(heading, date, null);
}

/** Callout title written for a ## heading (heading name, date, or Reisen trip). */
export function resolveComposerCalloutTitle(
  lines: string[],
  journalHeading: string,
  date?: Date,
): string {
  const heading = journalHeading.trim();
  if (heading.toLowerCase() === "reisen") {
    const trip =
      extractReisenTripFromSection(lines, heading) ??
      (() => {
        for (const line of lines) {
          if (!isReisenTripCalloutLine(line)) continue;
          const label = parseReisenTripLabel(line);
          if (label) return label;
        }
        return null;
      })();
    return formatComposerCalloutTitle(heading, date, trip);
  }
  return formatComposerCalloutTitle(heading, date, null);
}

const CALLOUT_START = /^>\s*\[!([^\]|]+)\]/;

const DECORATIVE_CALLOUT_TYPES = new Set(["weather"]);

export function parseManagedCalloutType(line: string): string | null {
  const m = line.trim().match(CALLOUT_START);
  return m?.[1]?.trim().toLowerCase() ?? null;
}

export function isManagedCalloutStart(line: string, heading: string): boolean {
  const type = parseManagedCalloutType(line);
  if (!type || DECORATIVE_CALLOUT_TYPES.has(type)) return false;
  return calloutTypesForHeading(heading).includes(type);
}

export function isDecorativeCalloutLine(line: string): boolean {
  const type = parseManagedCalloutType(line);
  return type != null && DECORATIVE_CALLOUT_TYPES.has(type);
}

const KNOWN_SECTION_CALLOUT_TITLES = new Set([
  "sonstiges",
  "reisen",
  "spaziergang",
  "tagebuch",
  "wichtig",
  "gesundheit",
  "arbeit",
  "familie",
  "aufgaben",
  "aufgabe",
  "tasks",
]);

/** True when callout title is a trip label, not a generic section or date title. */
export function isReisenTripCalloutTitleLine(line: string): boolean {
  const m = line.trim().match(CALLOUT_TITLE);
  if (!m) return false;
  const rest = (m[2]?.trim() || (m[4]?.trim() ?? "").replace(/^[+-]\s*/, "").trim());
  if (!rest || rest.toLowerCase() === "reisen") return false;
  if (KNOWN_SECTION_CALLOUT_TITLES.has(rest.toLowerCase())) return false;
  if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(rest)) return false;
  return /^reisen\b/i.test(rest) || /\[[^\]]+\]/.test(rest);
}

/** Reisen trip callouts with explicit trip markers (compass, Reisen […], …). */
export function isReisenTripCalloutLine(line: string): boolean {
  const trimmed = line.trim();
  if (!/^>\s*\[!/.test(trimmed)) return false;
  const type = parseManagedCalloutType(line);
  if (type && calloutTypesForHeading("Reisen").includes(type) && type !== "notes") {
    return true;
  }
  return isReisenTripCalloutTitleLine(line);
}

/**
 * Legacy `[!notes]` trip blocks filed under ## Sonstiges (custom title, not „Sonstiges“).
 * Used for migration and Reisen filter back-compat only — not for other ## headings.
 */
export function isLegacyMisplacedSonstigesTripCallout(line: string): boolean {
  const type = parseManagedCalloutType(line);
  if (type !== "notes") return isReisenTripCalloutLine(line);
  const m = line.trim().match(CALLOUT_TITLE);
  if (!m) return false;
  const rest = (m[2]?.trim() || (m[4]?.trim() ?? "").replace(/^[+-]\s*/, "").trim());
  if (!rest || rest.toLowerCase() === "sonstiges") return false;
  if (KNOWN_SECTION_CALLOUT_TITLES.has(rest.toLowerCase())) return false;
  if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(rest)) return false;
  return true;
}

export function isPlainJournalBulletLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^>\s/.test(trimmed)) {
    return /^>\s*[-*+]\s+(?!\[[ xX]\])/.test(trimmed);
  }
  return /^[-*+]\s+(?!\[[ xX]\])/.test(trimmed);
}

export function buildComposerCalloutBlock(
  heading: string,
  bulletBodies: string[],
  date?: Date,
  tripLabel?: string | null,
  calloutTitle?: string | null,
): string[] {
  const type = formatComposerCalloutType(heading);
  const title = calloutTitle?.trim() || formatComposerCalloutTitle(heading, date, tripLabel);
  const bullets: string[] = [];
  for (const text of bulletBodies.map((t) => t.trim()).filter(Boolean)) {
    const { body, meta } = stripEntryMeta(text);
    if (!body) continue;
    const bulletBody = meta ? appendEntryMeta(body, meta) : body;
    bullets.push(`> - ${bulletBody}`);
  }
  if (bullets.length === 0) return [];
  return [formatManagedCalloutTitleLine(heading, title), ...bullets, ""];
}

export function upsertManagedCalloutTitle(
  lines: string[],
  journalHeading: string,
  title: string,
  date?: Date,
): string[] {
  const heading = journalHeading.trim();
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return lines;

  const range = extractSectionRange(lines, heading);
  if (!range) return lines;

  const before = lines.slice(0, range.start + 1);
  let sectionBody = lines.slice(range.start + 1, range.end);
  const after = lines.slice(range.end);
  const titleLine = formatManagedCalloutTitleLine(heading, trimmedTitle);

  const stripped: string[] = [];
  let i = 0;
  while (i < sectionBody.length) {
    const line = sectionBody[i] ?? "";
    if (isDecorativeCalloutLine(line)) {
      i++;
      while (i < sectionBody.length && (sectionBody[i]?.trim() ?? "").startsWith(">")) i++;
      continue;
    }
    stripped.push(line);
    i++;
  }

  const updated: string[] = [];
  let found = false;
  i = 0;
  while (i < stripped.length) {
    const line = stripped[i] ?? "";
    if (
      isManagedCalloutStart(line, heading) ||
      (journalProfileForHeading(heading) != null && /^>\s*\[!/.test(line.trim()))
    ) {
      updated.push(titleLine);
      found = true;
      i++;
      while (i < stripped.length && (stripped[i]?.trim() ?? "").startsWith(">")) i++;
      continue;
    }
    updated.push(line);
    i++;
  }

  if (!found) {
    let insertAt = 0;
    while (insertAt < updated.length && updated[insertAt]?.trim() === "") insertAt++;
    updated.splice(insertAt, 0, titleLine, "");
  }

  return [...before, ...updated, ...after];
}

export function extractSectionRange(
  lines: string[],
  journalHeading: string,
): { start: number; end: number } | null {
  const target = journalHeading.trim().toLowerCase();
  for (let i = 0; i < lines.length; i++) {
    const h2 = lines[i]?.match(/^##\s+(.+)$/);
    if (h2 && h2[1]?.trim().toLowerCase() === target) {
      let end = i + 1;
      while (end < lines.length && !/^#{1,6}\s/.test(lines[end]?.trim() ?? "")) end++;
      return { start: i, end };
    }
  }
  return null;
}
