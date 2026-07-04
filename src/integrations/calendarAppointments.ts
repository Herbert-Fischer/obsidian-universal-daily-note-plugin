import type { App } from "obsidian";
import type { CalendarSyncSettings, DailyNoteFallbackSettings } from "../settings";
import { DEFAULT_JOURNAL_HEADING } from "../settings";
import {
  composerEntryText,
  loadComposerState,
  saveComposerState,
} from "../notes/dailyComposer";
import { resolveWikiLinksInText, buildVaultLinkIndex, upgradeJournalEntryTextsLinks } from "../notes/resolveWikiLinks";
import { formatJournalEntryText, sortJournalEntryTexts } from "../notes/parseJournalEntryDisplay";
import {
  collectCalendarSyncIds,
  parseCalendarSyncId,
  stripMarkdownCalendarAppointmentEntries,
  withCalendarSyncMarker,
} from "./calendarSyncMarker";
import { UNIVERSAL_CALENDAR_PLUGIN_ID } from "./universalCalendar";

export {
  collectCalendarSyncIds,
  isMarkdownCalendarSyncId,
  parseCalendarSyncId,
  stripCalendarSyncMarker,
  stripMarkdownCalendarAppointmentEntries,
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

/** Items eligible for daily-note Termin: timed CalDAV events/todos only (no vault markdown / invoices). */
export function isSyncableCalendarItem(item: CalendarItemLike, _settings: CalendarSyncSettings): boolean {
  if (item.allDay) return false;
  return item.source === "caldav_event" || item.source === "caldav_todo";
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

export function formatCalendarAppointmentEntry(
  item: CalendarItemLike,
  app?: App,
  sourcePath = "",
  linkOverrides: Record<string, string> = {},
): string {
  const time = formatItemTime(item);
  const override = linkOverrides[item.id]?.trim();
  const rawTitle = override || formatAppointmentTitle(item);
  const resolvedTitle =
    app && rawTitle.includes("[[")
      ? resolveWikiLinksInText(app, rawTitle, sourcePath, buildVaultLinkIndex(app))
      : rawTitle;
  const body = withCalendarSyncMarker(`Termin: ${resolvedTitle}`, item.id);
  return formatJournalEntryText(time, body);
}

export function mergeCalendarAppointmentTexts(
  app: App,
  date: Date,
  entryTexts: string[],
  options: {
    settings: CalendarSyncSettings;
    sourcePath?: string;
    linkOverrides?: Record<string, string>;
  },
): string[] {
  const base = stripMarkdownCalendarAppointmentEntries(entryTexts);
  if (!options.settings.enabled) return base;

  const items = getCalendarItemsForDay(app, date, options.settings);
  if (items.length === 0) return base;

  const known = collectCalendarSyncIds(base);
  const sourcePath = options.sourcePath ?? "";
  const linkOverrides = options.linkOverrides ?? {};
  const additions = items
    .filter((item) => !known.has(item.id))
    .map((item) => formatCalendarAppointmentEntry(item, app, sourcePath, linkOverrides));

  if (additions.length === 0) return base;
  return sortJournalEntryTexts([...base, ...additions]);
}

export type SyncCalendarAppointmentsOptions = {
  date: Date;
  fallback: DailyNoteFallbackSettings;
  settings: CalendarSyncSettings;
  oncePerSession?: boolean;
  /** Prefer daily notes in this folder (e.g. Calendar/Notes) before plugin fallback. */
  dailyNotesFolder?: string;
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

  if (options.oncePerSession && outlineSyncSession.has(sessionKey)) {
    return 0;
  }

  const state = await loadComposerState(
    app,
    options.date,
    options.fallback,
    heading,
    options.dailyNotesFolder,
  );
  const existing = state.entries.map(composerEntryText);
  const upgraded = upgradeJournalEntryTextsLinks(app, existing, state.file.path);
  const plugin = app.plugins.plugins["universal-daily-note"] as
    | { settings?: { calendarLinkOverrides?: Record<string, string> } }
    | undefined;
  const linkOverrides = plugin?.settings?.calendarLinkOverrides ?? {};

  const sessionDone = options.oncePerSession && outlineSyncSession.has(sessionKey);
  let merged: string[];
  if (sessionDone) {
    merged = stripMarkdownCalendarAppointmentEntries(upgraded);
  } else {
    merged = mergeCalendarAppointmentTexts(app, options.date, upgraded, {
      settings: options.settings,
      sourcePath: state.file.path,
      linkOverrides,
    });
  }

  const changed =
    merged.length !== existing.length || merged.some((line, index) => line !== existing[index]);

  if (!changed) {
    if (!sessionDone) outlineSyncSession.add(sessionKey);
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
      photos: state.photos,
    },
    merged,
  );

  if (!sessionDone) outlineSyncSession.add(sessionKey);
  return merged.length - existing.length;
}
