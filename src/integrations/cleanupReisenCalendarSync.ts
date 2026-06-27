import type { App, TFile } from "obsidian";
import type { DailyNoteFallbackSettings, TagebuchVerweiseSettings } from "../settings";
import { CALENDAR_SYNC_JOURNAL_HEADING } from "./calendarAppointments";
import { parseCalendarSyncId, collectCalendarSyncIds } from "./calendarSyncMarker";
import { getExistingDailyNoteFile } from "../notes/dailyNotesCore";
import {
  extractJournalLines,
  extractJournalLinesFromCallout,
} from "../notes/dailyNoteTimeline";
import { rewriteJournalBullets } from "../notes/dailyComposer";
import { readCalloutTitleFromLines } from "../notes/journalCallout";
import { sortJournalEntryTexts } from "../notes/parseJournalEntryDisplay";
import { dateFromDailyNoteFile } from "./universalCalendar";

export type CleanupReisenCalendarResult = {
  removed: number;
  moved: number;
};

/** Remove udn-cal Termin lines from ## Reisen; copy missing ones into ## Tagebuch. */
export function cleanupReisenCalendarSyncInLines(
  lines: string[],
  date?: Date,
): { lines: string[]; result: CleanupReisenCalendarResult } {
  const reisenTexts = extractJournalLines(lines, "Reisen").map((e) => e.text);
  const calFromReisen = reisenTexts.filter((t) => parseCalendarSyncId(t));
  if (calFromReisen.length === 0) {
    return { lines, result: { removed: 0, moved: 0 } };
  }

  const keepReisen = reisenTexts.filter((t) => !parseCalendarSyncId(t));
  let tagebuchTexts = extractJournalLines(lines, CALENDAR_SYNC_JOURNAL_HEADING).map((e) => e.text);
  if (tagebuchTexts.length === 0) {
    tagebuchTexts = extractJournalLinesFromCallout(lines, CALENDAR_SYNC_JOURNAL_HEADING).map((e) => e.text);
  }

  const knownTagebuch = collectCalendarSyncIds(tagebuchTexts);
  let moved = 0;
  for (const text of calFromReisen) {
    const id = parseCalendarSyncId(text);
    if (id && !knownTagebuch.has(id)) {
      tagebuchTexts.push(text);
      knownTagebuch.add(id);
      moved++;
    }
  }
  tagebuchTexts = sortJournalEntryTexts(tagebuchTexts);

  const reisenTitle = readCalloutTitleFromLines(lines, "Reisen", date);
  let next = rewriteJournalBullets(lines, "Reisen", keepReisen, date, reisenTitle);
  const tagebuchTitle = readCalloutTitleFromLines(next, CALENDAR_SYNC_JOURNAL_HEADING, date);
  next = rewriteJournalBullets(
    next,
    CALENDAR_SYNC_JOURNAL_HEADING,
    tagebuchTexts,
    date,
    tagebuchTitle,
  );

  const content = next.join("\n");
  const normalized = content.endsWith("\n") || content.length === 0 ? content : `${content}\n`;
  return {
    lines: normalized.split("\n"),
    result: { removed: calFromReisen.length, moved },
  };
}

export async function cleanupReisenCalendarSyncInFile(
  app: App,
  file: TFile,
  fallback: DailyNoteFallbackSettings,
  tagebuch: TagebuchVerweiseSettings,
): Promise<CleanupReisenCalendarResult> {
  const date = dateFromDailyNoteFile(file, fallback, tagebuch) ?? undefined;

  let changed = false;
  let result: CleanupReisenCalendarResult = { removed: 0, moved: 0 };

  await app.vault.process(file, (data) => {
    const lines = data.split("\n");
    const out = cleanupReisenCalendarSyncInLines(lines, date);
    result = out.result;
    if (result.removed === 0) return data;
    changed = true;
    const content = out.lines.join("\n");
    return content.endsWith("\n") || content.length === 0 ? content : `${content}\n`;
  });

  return changed ? result : { removed: 0, moved: 0 };
}

export async function cleanupReisenCalendarSyncForRecentDays(
  app: App,
  fallback: DailyNoteFallbackSettings,
  tagebuch: TagebuchVerweiseSettings,
  days: number,
): Promise<{ files: number; removed: number; moved: number }> {
  const span = Math.max(1, days);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let files = 0;
  let removed = 0;
  let moved = 0;

  for (let delta = 0; delta < span; delta++) {
    const d = new Date(today);
    d.setDate(d.getDate() - delta);
    const file = getExistingDailyNoteFile(app, d, fallback);
    if (!file) continue;
    const r = await cleanupReisenCalendarSyncInFile(app, file, fallback, tagebuch);
    if (r.removed > 0) {
      files++;
      removed += r.removed;
      moved += r.moved;
    }
  }

  return { files, removed, moved };
}
