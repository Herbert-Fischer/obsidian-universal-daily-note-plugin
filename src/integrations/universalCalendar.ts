import type { App, TFile } from "obsidian";
import type { CalendarSyncContext } from "./calendarRange";
import { dateKeyFromDailyNoteBasename } from "../notes/dailyNoteFallbackPaths";
import type { DailyNoteFallbackSettings, TagebuchVerweiseSettings } from "../settings";

/** View type registered by Universal Calendar (`MonthView`). */
export const VIEW_TYPE_UNICAL = "universal-calendar-view";

export const UNIVERSAL_CALENDAR_PLUGIN_ID = "universal-calendar";

type MonthViewLike = {
  getSelectedDate: () => Date;
  getMonthCursor?: () => Date;
  setCalendarContext?: (ctx: CalendarSyncContext) => void;
  setSelectedDate?: (date: Date) => void;
};

type UniversalCalendarPluginLike = {
  settings?: { syncDailyNotePanel?: boolean };
};

export function isUniversalCalendarPanelSyncEnabled(app: App): boolean {
  const plug = app.plugins.plugins[UNIVERSAL_CALENDAR_PLUGIN_ID] as UniversalCalendarPluginLike | undefined;
  return Boolean(plug?.settings?.syncDailyNotePanel);
}

/** True while the calendar is applying a grid click (ignore stale editor echo). */
export function isUniversalCalendarSuppressingEcho(app: App): boolean {
  for (const leaf of app.workspace.getLeavesOfType(VIEW_TYPE_UNICAL)) {
    const view = leaf.view as { isSuppressingExternalSync?: () => boolean } | null;
    if (view?.isSuppressingExternalSync?.()) return true;
  }
  return false;
}

export function getUniversalCalendarContext(app: App): CalendarSyncContext | null {
  for (const leaf of app.workspace.getLeavesOfType(VIEW_TYPE_UNICAL)) {
    const view = leaf.view as MonthViewLike | null;
    if (view && typeof view.getSelectedDate === "function") {
      const selectedDate = view.getSelectedDate();
      const monthCursor =
        typeof view.getMonthCursor === "function"
          ? view.getMonthCursor()
          : new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
      return { selectedDate, monthCursor };
    }
  }
  return null;
}

/** @deprecated Use getUniversalCalendarContext */
export function getUniversalCalendarSelectedDate(app: App): Date | null {
  return getUniversalCalendarContext(app)?.selectedDate ?? null;
}

/** Push outline date + month to open Universal Calendar month views. */
export function syncUniversalCalendarFromContext(app: App, ctx: CalendarSyncContext): void {
  if (!isUniversalCalendarPanelSyncEnabled(app)) return;

  for (const leaf of app.workspace.getLeavesOfType(VIEW_TYPE_UNICAL)) {
    const view = leaf.view as MonthViewLike;
    if (view.setCalendarContext) {
      view.setCalendarContext(ctx);
    } else {
      view.setSelectedDate?.(ctx.selectedDate);
    }
  }
}

function isInDailyNotesFolder(path: string, folder: string): boolean {
  const f = folder.trim().replace(/\/+$/, "").replace(/^\/+/, "");
  if (!f) return true;
  const normalized = path.replace(/^\/+/, "");
  return normalized === f || normalized.startsWith(`${f}/`);
}

/** Parse calendar day from an open daily note file path/name. */
export function dateFromDailyNoteFile(
  file: TFile,
  fallback: DailyNoteFallbackSettings,
  tagebuch?: TagebuchVerweiseSettings,
): Date | null {
  const dateKey = dateKeyFromDailyNoteBasename(file.name, fallback.filenameFormat);
  if (!dateKey) return null;

  const folder = tagebuch?.dailyNotesFolder?.trim() || fallback.folder.trim();
  if (folder && !isInDailyNotesFolder(file.path, folder)) return null;

  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function formatUniversalCalendarDayLabel(date: Date): string {
  return date.toLocaleDateString("de-DE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
