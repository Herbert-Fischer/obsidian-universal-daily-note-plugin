import type { TimelineDay } from "./dailyNoteTimeline";

export function entryMatchesTextFilter(text: string, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  return text.toLowerCase().includes(q.toLowerCase());
}

export function filterTimelineDaysByText(days: TimelineDay[], query: string): TimelineDay[] {
  const q = query.trim();
  if (!q) return days;
  return days
    .map((day) => ({
      ...day,
      entries: day.entries.filter((e) => entryMatchesTextFilter(e.text, q)),
    }))
    .filter((day) => day.entries.length > 0);
}

export function filterLinesByText<T extends { line: string }>(rows: T[], query: string): T[] {
  const q = query.trim();
  if (!q) return rows;
  return rows.filter((row) => entryMatchesTextFilter(row.line, q));
}
