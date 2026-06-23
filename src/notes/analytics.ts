import type { App } from "obsidian";
import type { DailyNoteFallbackSettings } from "../settings";
import { getDailyNoteOccupiedLocalDaysSync } from "./dailyNotesCore";
import { normalizeLocalDay } from "../panel/dateUtils";

export type DailyAnalytics = {
  totalNotes: number;
  monthCount: number;
  streakDays: number;
};

function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function computeStreak(occupied: Set<string>, anchor: Date): number {
  let streak = 0;
  const cursor = normalizeLocalDay(anchor);
  while (occupied.has(localDayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function countMonth(occupied: Set<string>, anchor: Date): number {
  const y = anchor.getFullYear();
  const m = anchor.getMonth() + 1;
  const prefix = `${y}-${String(m).padStart(2, "0")}-`;
  let count = 0;
  for (const key of occupied) {
    if (key.startsWith(prefix)) count++;
  }
  return count;
}

export function computeDailyAnalytics(
  app: App,
  fallback: DailyNoteFallbackSettings,
  anchor: Date,
  dailyNotesFolder?: string,
): DailyAnalytics {
  const occupied = getDailyNoteOccupiedLocalDaysSync(app, fallback, dailyNotesFolder);
  return {
    totalNotes: occupied.size,
    monthCount: countMonth(occupied, anchor),
    streakDays: computeStreak(occupied, anchor),
  };
}
