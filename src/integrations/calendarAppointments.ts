import type { App } from "obsidian";
import type { CalendarSyncSettings, DailyNoteFallbackSettings } from "../settings";
import { DEFAULT_JOURNAL_HEADING } from "../settings";
import {
  composerEntryText,
  loadComposerState,
  saveComposerState,
} from "../notes/dailyComposer";
import { formatJournalEntryText, sortJournalEntryTexts } from "../notes/parseJournalEntryDisplay";
import {
  collectCalendarSyncIds,
  parseCalendarSyncId,
  withCalendarSyncMarker,
} from "./calendarSyncMarker";
import { UNIVERSAL_CALENDAR_PLUGIN_ID } from "./universalCalendar";

export {
  collectCalendarSyncIds,
  parseCalendarSyncId,
  stripCalendarSyncMarker,
  withCalendarSyncMarker,
} from "./calendarSyncMarker";

/** Calendar sync always writes to this journal section. */
export const CALENDAR_SYNC_JOURNAL_HEADING = DEFAULT_JOURNAL_HEADING;

export type CalendarItemLike = {
  id: string;
  source: "markdown" | "caldav_event" | "caldav_todo";
  title: string;
  start: Date;
  end?: Date;
  allDay: boolean;
  filePath?: string;
  raw?: unknown;
};

type CalendarPluginLike = {
  store?: { getItemsForDay: (date: Date) => CalendarItemLike[] };
  settings?: {
    show?: { caldav?: boolean; markdownNotes?: boolean; invoices?: boolean };
    invoicePathPrefix?: string;
  };
};

const INVOICE_USED_PROPERTIES = new Set([
  "rechnungsdatum",
  "invoiceDate",
  "invoice_date",
  "paymentDue",
  "payment_due",
]);

const outlineSyncSession = new Set<string>();

export function resetCalendarSyncSession(): void {
  outlineSyncSession.clear();
}

function isInvoiceMarkdownItem(item: CalendarItemLike, invoicePathPrefix: string): boolean {
  if (item.source !== "markdown") return false;
  const used = (item.raw as { usedProperty?: string } | undefined)?.usedProperty;
  if (used && INVOICE_USED_PROPERTIES.has(used)) return true;
  const prefix = invoicePathPrefix.trim().replace(/\/+$/, "");
  if (!prefix) return false;
  const p = item.filePath ?? "";
  return p === prefix || p.startsWith(`${prefix}/`);
}

function isCalendarItemVisible(item: CalendarItemLike, plugin: CalendarPluginLike): boolean {
  const sh = plugin.settings?.show;
  if (!sh) return true;
  if (item.source === "caldav_event" || item.source === "caldav_todo") return sh.caldav !== false;
  if (item.source === "markdown") {
    if (isInvoiceMarkdownItem(item, plugin.settings?.invoicePathPrefix ?? "")) return sh.invoices !== false;
    return sh.markdownNotes !== false;
  }
  return true;
}

/** Items eligible for daily-note Termin: lines (CalDAV with time, no all-day, no vault markdown by default). */
export function isSyncableCalendarItem(item: CalendarItemLike, settings: CalendarSyncSettings): boolean {
  if (item.allDay) return false;
  if (item.source === "markdown" && !settings.includeMarkdownNotes) return false;
  return true;
}

export function getCalendarItemsForDay(app: App, date: Date, settings: CalendarSyncSettings): CalendarItemLike[] {
  const plugin = app.plugins.plugins[UNIVERSAL_CALENDAR_PLUGIN_ID] as CalendarPluginLike | undefined;
  if (!plugin?.store?.getItemsForDay) return [];

  return plugin.store
    .getItemsForDay(date)
    .filter((item) => isCalendarItemVisible(item, plugin))
    .filter((item) => isSyncableCalendarItem(item, settings))
    .filter((item) => settings.includeTodos || item.source !== "caldav_todo")
    .sort((a, b) => a.start.getTime() - b.start.getTime() || a.title.localeCompare(b.title, "de"));
}

function formatItemTime(item: CalendarItemLike): string {
  const hh = String(item.start.getHours()).padStart(2, "0");
  const mm = String(item.start.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatAppointmentTitle(item: CalendarItemLike): string {
  const title = item.title.trim();
  if (item.source === "markdown" && item.filePath) {
    const path = item.filePath.replace(/\.md$/i, "");
    if (path) return `[[${path}|${title}]]`;
  }
  return title;
}

export function formatCalendarAppointmentEntry(item: CalendarItemLike): string {
  const time = formatItemTime(item);
  const body = withCalendarSyncMarker(`Termin: ${formatAppointmentTitle(item)}`, item.id);
  return formatJournalEntryText(time, body);
}

export function mergeCalendarAppointmentTexts(
  app: App,
  date: Date,
  entryTexts: string[],
  options: {
    settings: CalendarSyncSettings;
  },
): string[] {
  if (!options.settings.enabled) return entryTexts;

  const items = getCalendarItemsForDay(app, date, options.settings);
  if (items.length === 0) return entryTexts;

  const known = collectCalendarSyncIds(entryTexts);
  const additions = items
    .filter((item) => !known.has(item.id))
    .map((item) => formatCalendarAppointmentEntry(item));

  if (additions.length === 0) return entryTexts;
  return sortJournalEntryTexts([...entryTexts, ...additions]);
}

export type SyncCalendarAppointmentsOptions = {
  date: Date;
  fallback: DailyNoteFallbackSettings;
  settings: CalendarSyncSettings;
  oncePerSession?: boolean;
};

export async function syncCalendarAppointmentsIntoDailyNote(
  app: App,
  options: SyncCalendarAppointmentsOptions,
): Promise<number> {
  if (!options.settings.enabled) return 0;

  const heading = CALENDAR_SYNC_JOURNAL_HEADING;
  const y = options.date.getFullYear();
  const m = options.date.getMonth() + 1;
  const d = options.date.getDate();
  const dateKey = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const sessionKey = `${dateKey}|${heading.toLowerCase()}`;

  if (options.oncePerSession && outlineSyncSession.has(sessionKey)) return 0;

  const items = getCalendarItemsForDay(app, options.date, options.settings);
  if (items.length === 0) {
    if (options.oncePerSession) outlineSyncSession.add(sessionKey);
    return 0;
  }

  const state = await loadComposerState(app, options.date, options.fallback, heading);
  const existing = state.entries.map(composerEntryText);
  const merged = mergeCalendarAppointmentTexts(app, options.date, existing, {
    settings: options.settings,
  });

  if (merged.length === existing.length) {
    if (options.oncePerSession) outlineSyncSession.add(sessionKey);
    return 0;
  }

  await saveComposerState(
    app,
    {
      file: state.file,
      journalHeading: heading,
      calloutTitle: state.calloutTitle,
      summary: state.summary,
      dateKey: state.dateKey,
    },
    merged,
  );

  if (options.oncePerSession) outlineSyncSession.add(sessionKey);
  return merged.length - existing.length;
}
