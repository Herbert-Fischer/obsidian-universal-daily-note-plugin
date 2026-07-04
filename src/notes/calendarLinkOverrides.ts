import type { App } from "obsidian";
import type { ComposerEntry } from "./dailyComposer";
import { stripCalendarSyncMarker } from "../integrations/calendarSyncMarker";

const TERM_PREFIX = /^termin:\s*/i;

export function extractCalendarTermBody(body: string): string {
  const stripped = stripCalendarSyncMarker(body).trim();
  return stripped.replace(TERM_PREFIX, "").trim();
}

export function collectCalendarLinkOverrides(entries: ComposerEntry[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of entries) {
    const id = entry.calendarId?.trim();
    if (!id) continue;
    const termBody = extractCalendarTermBody(entry.body);
    if (termBody) out[id] = termBody;
  }
  return out;
}

export async function persistCalendarLinkOverrides(
  app: App,
  entries: ComposerEntry[],
): Promise<void> {
  const plugin = app.plugins.plugins["universal-daily-note"] as
    | { settings?: { calendarLinkOverrides?: Record<string, string> }; saveSettings?: () => Promise<void> }
    | undefined;
  if (!plugin?.settings) return;

  const next = { ...(plugin.settings.calendarLinkOverrides ?? {}) };
  for (const [id, body] of Object.entries(collectCalendarLinkOverrides(entries))) {
    next[id] = body;
  }
  plugin.settings.calendarLinkOverrides = next;
  await plugin.saveSettings?.();
}
