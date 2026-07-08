import { parseJournalEntryDisplay } from "../notes/parseJournalEntryDisplay";

const UDN_GARMIN_MARKER_RE = /<!--\s*udn-garmin:([^>]+)\s*-->/;

export function parseGarminSyncId(text: string): string | null {
  const body = parseJournalEntryDisplay(text).body;
  const m = UDN_GARMIN_MARKER_RE.exec(body) ?? UDN_GARMIN_MARKER_RE.exec(text.trim());
  return m?.[1]?.trim() ?? null;
}

export function stripGarminSyncMarker(body: string): string {
  return body.replace(UDN_GARMIN_MARKER_RE, "").replace(/\s{2,}/g, " ").trim();
}

export function withGarminSyncMarker(body: string, garminId: string): string {
  const trimmed = stripGarminSyncMarker(body);
  return `${trimmed} <!-- udn-garmin:${garminId.trim()} -->`;
}

export function collectGarminSyncIds(entryTexts: string[]): Set<string> {
  const ids = new Set<string>();
  for (const text of entryTexts) {
    const id = parseGarminSyncId(text);
    if (id) ids.add(id);
  }
  return ids;
}
