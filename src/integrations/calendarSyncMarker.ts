import { parseJournalEntryDisplay } from "../notes/parseJournalEntryDisplay";

const UDN_CAL_MARKER_RE = /\s*<!--\s*udn-cal:([^>]+)\s*-->\s*$/;

export function parseCalendarSyncId(text: string): string | null {
  const body = parseJournalEntryDisplay(text).body;
  const m = UDN_CAL_MARKER_RE.exec(body) ?? UDN_CAL_MARKER_RE.exec(text.trim());
  return m?.[1]?.trim() ?? null;
}

export function stripCalendarSyncMarker(body: string): string {
  return body.replace(UDN_CAL_MARKER_RE, "").trim();
}

export function withCalendarSyncMarker(body: string, calendarId: string): string {
  const trimmed = stripCalendarSyncMarker(body);
  return `${trimmed} <!-- udn-cal:${calendarId} -->`;
}

export function collectCalendarSyncIds(entryTexts: string[]): Set<string> {
  const ids = new Set<string>();
  for (const text of entryTexts) {
    const id = parseCalendarSyncId(text);
    if (id) ids.add(id);
  }
  return ids;
}

/** Drop duplicate calendar rows and orphan Termin lines when a marked row exists at the same time. */
export function dedupeCalendarAppointmentEntries(entryTexts: string[]): string[] {
  const seenIds = new Set<string>();
  const markedTimes = new Set<string>();

  for (const text of entryTexts) {
    const id = parseCalendarSyncId(text);
    if (!id) continue;
    const { time } = parseJournalEntryDisplay(text);
    if (time) markedTimes.add(time);
  }

  const out: string[] = [];
  for (const text of entryTexts) {
    const id = parseCalendarSyncId(text);
    if (id) {
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      out.push(text);
      continue;
    }

    const { time, body } = parseJournalEntryDisplay(text);
    if (/^termin:/i.test(body.trim()) && time && markedTimes.has(time)) continue;
    out.push(text);
  }
  return out;
}

/** Universal Calendar markdown / invoice ids (not CalDAV appointments). */
export function isMarkdownCalendarSyncId(id: string): boolean {
  return id.trim().toLowerCase().startsWith("md:");
}

/** Drop Termin lines synced from vault markdown (invoices, notes) — CalDAV only. */
export function stripMarkdownCalendarAppointmentEntries(entryTexts: string[]): string[] {
  return entryTexts.filter((text) => {
    const id = parseCalendarSyncId(text);
    if (!id) return true;
    return !isMarkdownCalendarSyncId(id);
  });
}
