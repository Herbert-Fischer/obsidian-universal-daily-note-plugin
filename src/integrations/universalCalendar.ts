import type { App } from "obsidian";
import type { CalendarSyncContext } from "./calendarRange";

/** View type registered by Universal Calendar (`MonthView`). */
export const VIEW_TYPE_UNICAL = "universal-calendar-view";

type MonthViewLike = {
  getSelectedDate: () => Date;
  getMonthCursor?: () => Date;
};

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

export function formatUniversalCalendarDayLabel(date: Date): string {
  return date.toLocaleDateString("de-DE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
