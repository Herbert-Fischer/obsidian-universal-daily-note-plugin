import { DEFAULT_EXCLUDED_JOURNAL_HEADINGS, DEFAULT_JOURNAL_HEADING } from "../settings";

export function isExcludedJournalHeading(
  heading: string,
  excluded: string[] = DEFAULT_EXCLUDED_JOURNAL_HEADINGS,
): boolean {
  const lower = heading.trim().toLowerCase();
  return excluded.some((item) => item.trim().toLowerCase() === lower);
}

/** Filter excluded headings and sort with default (Tagebuch) first. */
export function finalizeJournalHeadings(
  headings: string[],
  excluded: string[] = DEFAULT_EXCLUDED_JOURNAL_HEADINGS,
  defaultHeading: string = DEFAULT_JOURNAL_HEADING,
): string[] {
  const defaultLower = defaultHeading.trim().toLowerCase();
  const seen = new Map<string, string>();

  for (const heading of headings) {
    const trimmed = heading.trim();
    if (!trimmed || isExcludedJournalHeading(trimmed, excluded)) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  }

  return [...seen.values()].sort((a, b) => {
    const aDefault = a.toLowerCase() === defaultLower ? 0 : 1;
    const bDefault = b.toLowerCase() === defaultLower ? 0 : 1;
    if (aDefault !== bDefault) return aDefault - bDefault;
    return a.localeCompare(b, "de");
  });
}

export function normalizeActiveJournalHeading(
  heading: string | undefined,
  excluded: string[] = DEFAULT_EXCLUDED_JOURNAL_HEADINGS,
  defaultHeading: string = DEFAULT_JOURNAL_HEADING,
): string {
  const trimmed = heading?.trim() || defaultHeading;
  if (isExcludedJournalHeading(trimmed, excluded)) return defaultHeading;
  return trimmed;
}
