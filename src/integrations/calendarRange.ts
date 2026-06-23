import { addLocalDays, normalizeLocalDay } from "../panel/dateUtils";

export type OutlineRangeMode = "scroll" | "month" | "week";

export type CalendarSyncContext = {
  selectedDate: Date;
  monthCursor: Date;
};

export type OutlineDateBounds = {
  startDateKey: string;
  endDateKey: string;
};

export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function monthBoundsFromCursor(monthCursor: Date): { start: Date; end: Date } {
  const cursor = normalizeLocalDay(monthCursor);
  const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 0, 0, 0, 0);
  return { start, end };
}

/** ISO-style week (Mon–Sun), aligned with Universal Calendar month grid. */
export function isoWeekBounds(date: Date): { start: Date; end: Date } {
  const d = normalizeLocalDay(date);
  const mondayOffset = (d.getDay() + 6) % 7;
  const start = addLocalDays(d, -mondayOffset);
  const end = addLocalDays(start, 6);
  return { start, end };
}

export function resolveOutlineDateBounds(
  mode: OutlineRangeMode,
  ctx: CalendarSyncContext,
): OutlineDateBounds | null {
  if (mode === "scroll") return null;

  if (mode === "month") {
    const { start, end } = monthBoundsFromCursor(ctx.monthCursor);
    return { startDateKey: localDateKey(start), endDateKey: localDateKey(end) };
  }

  const { start, end } = isoWeekBounds(ctx.selectedDate);
  return { startDateKey: localDateKey(start), endDateKey: localDateKey(end) };
}

export function outlineRangeModeLabel(mode: OutlineRangeMode): string {
  switch (mode) {
    case "month":
      return "Monat";
    case "week":
      return "Woche";
    default:
      return "Alle";
  }
}
